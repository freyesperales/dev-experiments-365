#!/usr/bin/env node
'use strict';
const fs = require('fs');
const core = require('./load-core');

const USAGE = `OrderPaste — WhatsApp chat export -> order sheet

usage: node cli.js <chat.txt|chat.zip> <catalog.txt> [options]
       node cli.js --demo

options:
  --gap <min>        merge messages from one person within N minutes (default 30)
  --ignore <name>    ignore a sender (the shop side); repeatable
  --dates dmy|mdy    force the date order (default: auto-detect)
  --out <dir>        also write orders.csv, lines.csv, pick-list.csv into <dir>
  --json             print JSON instead of tables
`;

function parseArgs(argv) {
  const o = { files: [], ignore: [], gap: 30, dates: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--gap') o.gap = Number(argv[++i]);
    else if (a === '--ignore') o.ignore.push(argv[++i]);
    else if (a === '--dates') o.dates = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--demo') o.demo = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else o.files.push(a);
  }
  if (!(o.gap > 0)) throw new Error('--gap must be a positive number');
  if (!['auto', 'dmy', 'mdy'].includes(o.dates)) throw new Error('--dates must be dmy or mdy');
  return o;
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || (!o.demo && o.files.length !== 2)) { process.stdout.write(USAGE); return o.help ? 0 : 2; }
  let chatText, catText;
  if (o.demo) { chatText = core.DEMO_CHAT; catText = core.DEMO_CATALOG; }
  else {
    const buf = fs.readFileSync(o.files[0]);
    chatText = /\.zip$/i.test(o.files[0]) ? await core.textFromZip(new Uint8Array(buf)) : buf.toString('utf8');
    catText = fs.readFileSync(o.files[1], 'utf8');
  }
  const chat = core.parseChat(chatText, o.dates);
  const cat = core.parseCatalog(catText);
  if (!cat.items.length) throw new Error('the catalog has no products');
  if (!chat.messages.length) throw new Error('no WhatsApp messages found in the chat file');
  const res = core.buildOrders(chat.messages, cat, { gapMinutes: o.gap, ignoreSenders: o.ignore.length ? o.ignore : (o.demo ? ['Panadería Dulce Hogar'] : []) });
  const pick = core.pickList(res.orders, cat);
  if (o.out) {
    fs.mkdirSync(o.out, { recursive: true });
    fs.writeFileSync(o.out + '/orders.csv', core.ordersCSV(res.orders));
    fs.writeFileSync(o.out + '/lines.csv', core.linesCSV(res.orders));
    fs.writeFileSync(o.out + '/pick-list.csv', core.pickCSV(pick));
  }
  if (o.json) { process.stdout.write(JSON.stringify({ orders: res.orders, pick, unmatched: res.unmatched, suggestions: res.suggestions }, null, 2) + '\n'); return 0; }
  const w = [...cat.warnings];
  if (chat.ambiguousDates) w.push('dates are ambiguous (DD/MM vs MM/DD) — assumed DD/MM, use --dates to override');
  w.forEach((x) => console.error('warning: ' + x));
  console.log(`ORDERS (${res.orders.length})`);
  for (const ord of res.orders) {
    const flag = ord.status === 'cancelled' ? ' [CANCELLED]' : '';
    console.log(`#${ord.id} ${ord.date} ${ord.time}  ${pad(ord.sender, 18)} ${pad(core.describe(ord), 52)} ${ord.unpriced ? '?' : ord.total.toFixed(2)}${flag}`);
    if (ord.address) console.log(`   -> ${ord.address}`);
    if (ord.phone) console.log(`   tel ${ord.phone}`);
  }
  console.log('\nPICK LIST');
  for (const p of pick) console.log(`${pad(p.item, 24)} ${String(p.qty).padStart(4)}  (${p.orders} order${p.orders > 1 ? 's' : ''})`);
  if (res.unmatched.length) {
    console.log(`\nCHECK THESE (${res.unmatched.length}) — had numbers but no known product`);
    for (const m of res.unmatched) console.log(`  ${m.date} ${m.time} ${m.sender}: ${m.text.replace(/\n/g, ' ')}`);
  }
  if (res.suggestions.length) console.log('\nMaybe add to your catalog: ' + res.suggestions.map((s) => `${s.word} (x${s.count})`).join(', '));
  return 0;
}

main().then((c) => { process.exitCode = c; }, (e) => { console.error('error: ' + e.message); process.exitCode = 1; });
