#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const CB = require('./src/core.js');

function newestSession() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  let best = null;
  const walk = (d) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl')) { const m = fs.statSync(p).mtimeMs; if (!best || m > best.m) best = { p, m }; }
    }
  };
  walk(root);
  return best && best.p;
}

function main(argv) {
  const args = argv.slice(2), flags = new Set(args.filter(a => a.startsWith('--') && !a.includes('=')));
  const kv = Object.fromEntries(args.filter(a => a.startsWith('--') && a.includes('=')).map(a => a.slice(2).split(/=(.*)/s)));
  const files = args.filter(a => !a.startsWith('--'));
  if (flags.has('--help') || flags.has('-h')) {
    console.log('usage: cachebreak [session.jsonl] [--json|--md] [--min-lost=2000] [--prices=prices.json]\n' +
      'With no file, analyses your most recent Claude Code session in ~/.claude/projects.');
    return 0;
  }
  const file = files[0] || newestSession();
  if (!file) { console.error('cachebreak: no session file given and none found in ~/.claude/projects'); return 2; }
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { console.error('cachebreak: cannot read ' + file + ': ' + e.message); return 2; }
  const opts = {};
  if (kv['min-lost']) opts.minLost = Number(kv['min-lost']);
  if (kv.prices) {
    try { opts.prices = Object.assign({}, CB.DEFAULT_PRICES, JSON.parse(fs.readFileSync(kv.prices, 'utf8'))); }
    catch (e) { console.error('cachebreak: bad --prices file: ' + e.message); return 2; }
  }
  const { entries, bad } = CB.parseJsonl(text);
  const r = CB.analyze(entries, opts);
  if (!r.turns.length) { console.error('cachebreak: no assistant turns with usage data in ' + file + (bad ? ` (${bad} unparseable lines)` : '')); return 3; }
  if (flags.has('--json')) { console.log(JSON.stringify({ summary: r.summary, breaks: r.breaks, sidechain: r.sidechain }, null, 2)); return 0; }
  if (flags.has('--md')) { console.log(CB.toMarkdown(r)); return 0; }
  const s = r.summary;
  console.log(`cachebreak · ${path.basename(file)}`);
  console.log(`${s.turns} turns · hit rate ${(s.hitRate * 100).toFixed(1)}% · est. cost ${CB.money(s.cost)} · wasted on breaks ${CB.money(s.wasted)}` + (bad ? ` · ${bad} bad lines skipped` : ''));
  console.log('\n  █ cache read  ▒ cache write  ░ uncached input\n');
  console.log(CB.ascii(r));
  if (!r.breaks.length) console.log('\nNo cache breaks detected.');
  for (const b of r.breaks) {
    console.log(`\nBREAK at turn ${b.turn}: ${b.lost.toLocaleString('en-US')} of ${b.expected.toLocaleString('en-US')} prefix tokens re-billed (~${CB.money(b.waste)})`);
    console.log('  prefix diverged at ' + b.where);
    for (const c of b.causes) console.log(`  - [${c.confidence}] ${c.cause}: ${c.detail}`);
  }
  if (r.sidechain.turns) console.log(`\n(${r.sidechain.turns} sub-agent turns analysed separately, excluded above)`);
  return 0;
}
if (require.main === module) process.exitCode = main(process.argv);
module.exports = { main };
