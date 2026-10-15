#!/usr/bin/env node
'use strict';
// HexLens CLI — same engine as index.html.  Usage: node hexlens.js <file> [--find QUERY] [--natural] [--strings] [--map] [--at OFFSET]
const fs = require('fs');
const L = require('./core.js');

function main(argv) {
  const args = argv.slice(2);
  if (!args.length || args.includes('-h') || args.includes('--help')) {
    console.log('usage: hexlens <file> [--find QUERY] [--natural] [--strings] [--map] [--at OFFSET]\n' +
      '  QUERY: 1.7e9..1.8e9 | 37.77~0.05 | date:2020-01-01..2024-12-31 | hex:de ad be ef | text:foo');
    return 0;
  }
  const file = args[0];
  let data;
  try { data = fs.readFileSync(file); } catch (e) { console.error('hexlens: cannot read ' + file + ': ' + e.message); return 2; }
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.length);
  const opt = (n) => { const i = args.indexOf(n); return i > 0 ? args[i + 1] : undefined; };
  console.log(file + ' — ' + bytes.length + ' bytes — ' + (L.identify(bytes) || 'unknown type'));
  const q = opt('--find');
  if (q !== undefined) {
    let query;
    try { query = L.parseQuery(q); } catch (e) { console.error('hexlens: ' + e.message); return 2; }
    const r = L.search(bytes, query, {align: args.includes('--natural') ? 'natural' : 1, limit: 200});
    for (const h of r.hits) {
      console.log('0x' + h.offset.toString(16).padStart(8, '0') + '  ' + h.type + (h.size > 1 && h.value !== null ? (h.le ? ' LE' : ' BE') : '') + '  ' +
        (h.value === null ? h.size + ' bytes' : Number(h.value.toPrecision(12))) + (h.label && h.value !== null ? '  [' + h.label + ']' : ''));
    }
    console.log(r.hits.length + ' hit(s)' + (r.truncated ? ' (truncated)' : ''));
  }
  if (args.includes('--strings')) for (const s of L.findStrings(bytes, 5)) console.log('0x' + s.offset.toString(16).padStart(8, '0') + '  ' + s.kind.padEnd(16) + ' ' + s.text);
  if (args.includes('--map')) {
    const bl = L.analyzeBlocks(bytes, 256); let cur = null;
    for (const b of bl) { if (cur && cur.kind === b.kind) cur.end = b.end; else { if (cur) pr(cur); cur = {...b}; } } if (cur) pr(cur);
    function pr(c) { console.log('0x' + c.start.toString(16).padStart(8, '0') + '-0x' + c.end.toString(16).padStart(8, '0') + '  ' + c.kind); }
  }
  const at = opt('--at');
  if (at !== undefined) {
    const o = Number(at); if (!Number.isInteger(o) || o < 0 || o >= bytes.length) { console.error('hexlens: --at out of range'); return 2; }
    for (const r of L.interpretAt(bytes, o)) console.log(r.type.padEnd(8) + ' ' + r.text + (r.dates.length ? '   ' + r.dates.join(' | ') : ''));
  }
  if (q === undefined && !args.includes('--strings') && !args.includes('--map') && at === undefined) {
    for (let o = 0; o < Math.min(bytes.length, 256); o += 16) console.log(L.hexdumpLine(bytes, o));
  }
  return 0;
}
process.exitCode = main(process.argv);
