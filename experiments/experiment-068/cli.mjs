#!/usr/bin/env node
// spoolslip CLI: node cli.mjs [--price 20] [--kwh 0.15] [--watts 120] [--csv|--json] files...
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadCore } from './tools/load-core.mjs';

const S = loadCore();
const st = S.defaultSettings();
const files = [];
let mode = 'receipt';
const num = { '--price': 'pricePerKg', '--kwh': 'kwh', '--watts': 'watts', '--machine': 'machineRate', '--waste': 'wastePct', '--markup': 'markupPct' };
const a = process.argv.slice(2);
for (let i = 0; i < a.length; i++) {
  const x = a[i];
  if (x === '--csv') mode = 'csv';
  else if (x === '--json') mode = 'json';
  else if (x === '--currency') st.currency = a[++i] ?? '$';
  else if (x === '--by-type') st.priceByType = S.parseByType(a[++i]);
  else if (num[x]) { const v = parseFloat(a[++i]); if (!(v >= 0)) { console.error(`${x} needs a non-negative number`); process.exit(2); } st[num[x]] = v; }
  else if (x === '-h' || x === '--help') { console.log('usage: node cli.mjs [--price N/kg] [--kwh N] [--watts N] [--machine N/h] [--waste %] [--markup %] [--currency C] [--by-type "PLA=18,PETG=22"] [--csv|--json] file...'); process.exit(0); }
  else if (x.startsWith('--')) { console.error(`unknown option ${x}`); process.exit(2); }
  else files.push(x);
}
if (!files.length) { console.error('no files given (try: node cli.mjs fixtures/benchy.gcode.3mf)'); process.exit(2); }

const rows = [];
let failed = 0;
for (const f of files) {
  try { rows.push({ job: await S.analyzeBytes(basename(f), new Uint8Array(readFileSync(f))) }); }
  catch (e) { failed++; console.error(`${f}: ${e.message}`); }
}
if (mode === 'csv') process.stdout.write(S.toCSV(rows, st));
else if (mode === 'json') console.log(JSON.stringify(rows.map(r => ({ ...r.job, cost: S.computeCost(r.job, st) })), null, 2));
else console.log(rows.map(r => S.receiptText(r.job, S.computeCost(r.job, st), st)).join('\n\n'));
process.exit(failed ? 1 : 0);
