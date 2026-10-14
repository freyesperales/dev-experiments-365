#!/usr/bin/env node
'use strict';
const fs = require('fs');
const P = require('./core.js');

function usage() {
  console.error('usage: plainly <file|-> [--lang en|es|de] [--target easy|plain|standard] [--apply] [--checklist] [--json] [--fail]');
  process.exit(2);
}
const args = process.argv.slice(2);
if (!args.length || args.includes('-h') || args.includes('--help')) usage();
const opt = {};
let file = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lang') opt.lang = args[++i];
  else if (a === '--target') opt.target = args[++i];
  else if (a.startsWith('--')) opt[a.slice(2)] = true;
  else file = a;
}
if (!file) usage();
if (opt.lang && !P.LANGS.includes(opt.lang)) { console.error(`unknown --lang ${opt.lang}`); process.exit(2); }
if (opt.target && !P.TARGETS[opt.target]) { console.error(`unknown --target ${opt.target}`); process.exit(2); }
let text;
try { text = fs.readFileSync(file === '-' ? 0 : file, 'utf8'); }
catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
if (!text.trim()) { console.error('input is empty'); process.exit(2); }

if (opt.apply) {
  const lang = opt.lang || P.detectLang(text);
  const r = P.applySwaps(text, lang);
  process.stdout.write(r.text);
  console.error(`\n[plainly] applied ${r.count} plainer-wording swaps`);
  process.exit(0);
}
const a = P.analyze(text, opt);
if (opt.json) {
  console.log(JSON.stringify({ lang: a.lang, target: a.target, lix: a.lix, band: a.band, formula: a.formula, wstf: a.wstf,
    stats: a.stats, avgSentence: a.avgSentence, flagged: a.flaggedCount, passesTarget: a.passesTarget,
    sentences: a.sentences.map(s => ({ text: s.text, words: s.words, flags: s.flags.map(f => f.id) })) }, null, 2));
} else if (opt.checklist) {
  process.stdout.write(P.checklistMarkdown(text, a));
} else {
  console.log(`Language   ${P.LANG_NAMES[a.lang]}   Target ${a.targetInfo.label}`);
  console.log(`LIX        ${a.lix.toFixed(1)}  (${a.band})`);
  if (a.formula) console.log(`${a.formula.name.padEnd(10)} ${a.formula.value.toFixed(1)}`);
  if (a.wstf !== null) console.log(`Wiener Sachtext (WSTF1)  ${a.wstf.toFixed(1)}`);
  console.log(`Words ${a.stats.words}   Sentences ${a.stats.sentences}   Avg sentence ${a.avgSentence.toFixed(1)} words`);
  console.log(`Sentences within target length: ${(a.sentencesWithinTarget * 100).toFixed(0)}%   Flagged: ${a.flaggedCount}/${a.stats.sentences}`);
  console.log(`Verdict: ${a.passesTarget ? 'PASSES' : 'NEEDS WORK'} at "${a.target}"`);
  a.sentences.forEach((s, i) => {
    if (!s.flags.length) return;
    const ex = s.text.replace(/\s+/g, ' ');
    console.log(`\n#${i + 1} “${ex.length > 90 ? ex.slice(0, 87) + '…' : ex}”`);
    s.flags.forEach(f => console.log(`   • ${f.label}`));
  });
}
if (opt.fail && !a.passesTarget) process.exit(1);
