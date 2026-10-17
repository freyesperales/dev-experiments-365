#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { analyze, planScript } = require('../lib/analyze');
const { renderText } = require('../lib/render-text');
const { renderHtml } = require('../lib/render-html');

const HELP = `stacklens — see your stacked-PR branch chain, spot drift, get the rebase commands

Usage: stacklens [options]
  -C <dir>         repository directory (default: .)
  --trunk <ref>    trunk branch/ref (default: origin/HEAD, then main/master/trunk/develop)
  --html <file>    also write a self-contained interactive HTML view
  --json           print the analysis as JSON instead of the tree
  --plan           print a POSIX shell script that restacks drifted branches
  --check          exit 1 if any branch needs rebasing (CI / pre-push hook)
  --no-merged      do not list merged branches
  -h, --help       show this help
Read-only: stacklens never changes your repository.
`;

function parse(argv) {
  const o = { dir: '.' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '-C') o.dir = need();
    else if (a === '--trunk') o.trunk = need();
    else if (a === '--html') o.html = need();
    else if (a === '--json') o.json = true;
    else if (a === '--plan') o.plan = true;
    else if (a === '--check') o.check = true;
    else if (a === '--no-merged') o.noMerged = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else throw new Error(`unknown option: ${a}`);
  }
  return o;
}

function main(argv) {
  let o;
  try { o = parse(argv); } catch (e) { process.stderr.write(`stacklens: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { process.stdout.write(HELP); return 0; }
  let report;
  try { report = analyze(path.resolve(o.dir), { trunk: o.trunk }); }
  catch (e) { process.stderr.write(`stacklens: ${(e.stderr ? String(e.stderr).trim() : '') || e.message}\n`); return 2; }
  if (o.html) fs.writeFileSync(o.html, renderHtml(report));
  if (o.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else if (o.plan) process.stdout.write(planScript(report));
  else process.stdout.write(renderText(report, { hideMerged: o.noMerged }));
  if (o.html) process.stderr.write(`wrote ${o.html}\n`);
  return o.check && report.plan.length ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
