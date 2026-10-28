#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { collect, render, hotspots, busFactorRisks } = require('./lib.js');

const HELP = `churnmap — git history as a treemap of where your repo's churn lives

Usage: churnmap [repo] [options]
  -o, --out <file>   output HTML (default: ./<repo>.churnmap.html)
  --since <when>     limit history, e.g. "6 months ago", "2026-01-01"
  --max <n>          only the last n commits
  --no-ignore        include lockfiles, minified files, vendor/, dist/
  --top <n>          hotspots to print (default 10)
  --json             print the data set as JSON instead of writing HTML
  -h, --help
`;

function parseArgs(argv) {
  const o = { repo: '.', top: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '-o' || a === '--out') o.out = need();
    else if (a === '--since') o.since = need();
    else if (a === '--max') { o.max = parseInt(need(), 10); if (!(o.max > 0)) throw new Error('--max must be a positive integer'); }
    else if (a === '--top') { o.top = parseInt(need(), 10); if (!(o.top >= 0)) throw new Error('--top must be >= 0'); }
    else if (a === '--no-ignore') o.noIgnore = true;
    else if (a === '--json') o.json = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.repo = a;
  }
  return o;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`churnmap: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  let data;
  try { data = collect(o.repo, o); } catch (e) { console.error(`churnmap: ${e.message}`); return 1; }
  if (o.json) { console.log(JSON.stringify(data)); return 0; }
  const out = o.out || `${data.name}.churnmap.html`;
  fs.writeFileSync(out, render(data));
  const active = data.files.filter((f) => f.c > 0).length;
  console.log(`churnmap: ${data.name}@${data.head} — ${data.files.length} files, ${active} touched in ${data.commits} commits${data.since ? ` (since ${data.since})` : ''}`);
  const hs = hotspots(data, o.top);
  if (hs.length) {
    console.log('\nTop hotspots (churn × size):');
    const w = Math.min(60, Math.max(...hs.map((h) => h.p.length)));
    for (const h of hs) console.log(`  ${h.p.padEnd(w)}  ${String(h.c).padStart(4)} commits  ${String(h.loc).padStart(6)} lines  ${h.au} author${h.au === 1 ? '' : 's'}`);
  }
  const bf = busFactorRisks(data).slice(0, 5);
  if (bf.length) {
    console.log('\nBus factor 1 (>=5 commits, one author):');
    for (const f of bf) console.log(`  ${f.p}  (${f.c} commits)`);
  }
  console.log(`\nWrote ${path.resolve(out)}`);
  return 0;
}
process.exitCode = main();
