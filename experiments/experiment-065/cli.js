#!/usr/bin/env node
'use strict';
// usage: node cli.js _chat.txt [--owner "Name"] [--csv out.csv]   (or --sample)
const fs = require('fs');
const L = require('./src/core.js');
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const file = a.find((x) => !x.startsWith('--') && x !== opt('--owner') && x !== opt('--csv'));
if (!file && !a.includes('--sample')) { console.error('usage: node cli.js <_chat.txt|--sample> [--owner NAME] [--csv out.csv]'); process.exit(2); }
let text;
try { text = a.includes('--sample') ? L.SAMPLE : fs.readFileSync(file, 'utf8'); }
catch (e) { console.error('cannot read ' + file + ': ' + e.message); process.exit(1); }
const { messages } = L.parseChat(text);
if (!messages.length) { console.error('no WhatsApp messages recognised'); process.exit(1); }
const owner = opt('--owner') || L.guessOwner(messages);
const entries = L.buildEntries(messages, owner);
console.log('owner: ' + owner + '   messages: ' + messages.length + '   money lines: ' + entries.length);
console.log('\ncustomer'.padEnd(22) + 'charged'.padStart(10) + 'paid'.padStart(10) + 'balance'.padStart(10));
for (const c of L.ledger(entries)) console.log(c.customer.padEnd(21) + String(c.charged).padStart(10) + String(c.paid).padStart(10) + String(c.balance).padStart(10));
const review = entries.filter((e) => e.kind === 'review').length;
if (review) console.log('\n' + review + ' line(s) need review (ambiguous) — use index.html to resolve them.');
if (opt('--csv')) { fs.writeFileSync(opt('--csv'), L.toCSV(entries)); console.log('wrote ' + opt('--csv')); }
