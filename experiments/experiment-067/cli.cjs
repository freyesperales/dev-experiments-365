#!/usr/bin/env node
// usage: node cli.cjs <chat.txt> <prices.txt> [--seller "Name"] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--csv]
const fs = require('fs'), core = require('./core.cjs');
const a = process.argv.slice(2), pos = a.filter((x, i) => !x.startsWith('--') && !(i && a[i - 1].startsWith('--') && a[i - 1] !== '--csv'));
const opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
if (pos.length < 2) { console.error('usage: node cli.cjs <chat.txt> <prices.txt> [--seller NAME] [--from D] [--to D] [--csv]'); process.exit(2); }
let chat, prices;
try { chat = fs.readFileSync(pos[0], 'utf8'); prices = fs.readFileSync(pos[1], 'utf8'); } catch (e) { console.error('error: ' + e.message); process.exit(1); }
const cat = core.parsePriceList(prices);
cat.errors.forEach(e => console.error(`price list line ${e.line} unreadable: ${e.text}`));
if (!cat.items.length) { console.error('error: price list has no items'); process.exit(1); }
const parsed = core.parseChat(chat);
if (!parsed.messages.length) { console.error('error: no WhatsApp messages recognised in ' + pos[0]); process.exit(1); }
const res = core.buildOrders(parsed.messages, cat, {ignore: [opt('seller') || ''], from: opt('from'), to: opt('to')});
if (a.includes('--csv')) { process.stdout.write(core.toCSV(res.customers)); process.exit(0); }
const f = n => n.toFixed(2).padStart(8);
let grand = 0;
for (const c of res.customers) {
  console.log(`\n${c.name}`);
  for (const l of c.lines) console.log(`  ${String(l.qty).padStart(4)} × ${l.item.padEnd(22)} @ ${f(l.price)} = ${f(l.qty * l.price)}`);
  const t = core.customerTotals(c); grand += t.total; console.log(`  ${''.padEnd(40)}total ${f(t.total)}`);
}
console.log('\nPICK LIST'); for (const p of core.pickList(res.customers)) console.log(`  ${String(p.qty).padStart(4)} × ${p.item}  (${p.orders} order${p.orders > 1 ? 's' : ''})`);
if (res.events.length) { console.log('\nCANCELLATIONS'); res.events.forEach(e => console.log(`  ${e.customer}: ${e.text}`)); }
if (res.unmatched.length) { console.log('\nNEEDS REVIEW'); res.unmatched.forEach(u => console.log(`  ${u.customer}: ${u.qty} × "${u.raw}"  [${u.reason}]`)); }
console.log(`\n${res.customers.length} customers · grand total ${grand.toFixed(2)} · date order ${parsed.dateOrder}`);
