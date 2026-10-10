#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const L = require('../src/core.js');

const HELP = `logfold — collapse a log into its templates (and diff two logs)

usage:
  logfold <file|->                 templates of one log ('-' = stdin)
  logfold <good> <bad>             diff: new / gone / spiking / dropping templates
  logfold --demo                   run on a built-in synthetic incident

options:
  --top N          rows to print (default 25)
  --json           machine-readable output
  --md             Markdown output (paste into a PR/issue)
  --similarity X   template merge threshold 0..1 (default 0.5)
  --ratio X        spike factor for diff (default 3)
  --fail-on-new    exit 1 if diff finds a new ERROR/FATAL template (CI gate)
  -h, --help
`;

function parseArgs(argv) {
  const o = { files: [], top: 25, json: false, md: false, sim: 0.5, ratio: 3, failOnNew: false, demo: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--json') o.json = true;
    else if (a === '--md') o.md = true;
    else if (a === '--demo') o.demo = true;
    else if (a === '--demo-single') { o.demo = true; o.single = true; }
    else if (a === '--fail-on-new') o.failOnNew = true;
    else if (a === '--top' || a === '--similarity' || a === '--ratio') {
      const v = parseFloat(argv[++i]);
      if (!(v > 0)) throw new Error(a + ' needs a positive number');
      if (a === '--top') o.top = Math.floor(v); else if (a === '--ratio') o.ratio = v;
      else { if (v > 1) throw new Error('--similarity must be in (0,1]'); o.sim = v; }
    } else if (a === '-' || !a.startsWith('-')) o.files.push(a);
    else throw new Error('unknown option ' + a);
  }
  return o;
}

async function readInto(an, si, file) {
  const stream = file === '-' ? process.stdin : fs.createReadStream(file);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) an.addLine(si, line);
  an.endSource(si);
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { console.error('logfold: ' + e.message + '\n'); console.error(HELP); return 2; }
  if (o.help || (!o.files.length && !o.demo)) { process.stdout.write(HELP); return o.help ? 0 : 2; }
  if (o.files.length > 2) { console.error('logfold: at most two files (good bad)'); return 2; }
  const an = new L.Analyzer({ similarity: o.sim });
  if (o.demo) {
    const S = require('../src/sample.js');
    const names = ['demo-good.log', 'demo-bad.log'];
    (o.single ? ['bad'] : ['good', 'bad']).forEach((k, i) => {
      const si = an.addSource(o.single ? names[1] : names[i]);
      S.gen(k, 4000).split('\n').forEach(l => l && an.addLine(si, l));
      an.endSource(si);
    });
  } else {
    for (const f of o.files) {
      if (f !== '-' && !fs.existsSync(f)) { console.error('logfold: no such file: ' + f); return 2; }
      if (f !== '-' && fs.statSync(f).isDirectory()) { console.error('logfold: is a directory: ' + f); return 2; }
      const si = an.addSource(f === '-' ? 'stdin' : path.basename(f));
      await readInto(an, si, f);
    }
  }
  const res = an.result();
  if (!res.sources[0].events) { console.error('logfold: no log lines found in ' + res.sources[0].name); return 2; }
  const two = res.sources.length === 2;
  const d = two ? L.diff(res, { ratio: o.ratio }) : null;
  if (o.json) {
    process.stdout.write(JSON.stringify(two ? { sources: res.sources, diff: d } : { sources: res.sources, templates: res.templates.map(t => ({ template: t.template, count: t.total, level: t.level, first: t.first[0], last: t.last[0], variables: t.vars.map(v => ({ position: v.pos, distinct: v.distinct, top: v.top })) })) }, null, 2) + '\n');
  } else if (o.md) process.stdout.write(L.toMarkdown(res, { top: o.top }));
  else process.stdout.write(L.toText(res, { top: o.top, ratio: o.ratio }));
  if (o.failOnNew && d) {
    const bad = d.rows.filter(r => r.status === 'new' && /^(ERROR|FATAL)$/.test(r.level));
    if (bad.length) { console.error(`logfold: ${bad.length} new ERROR/FATAL template(s) in ${res.sources[1].name}`); return 1; }
  }
  return 0;
}
main().then(c => { process.exitCode = c; }, e => { console.error('logfold: ' + e.message); process.exitCode = 2; });
