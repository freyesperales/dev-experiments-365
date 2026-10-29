#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const D = require('./lib.js');

const HELP = `detour - match old URLs to new URLs, catch chains/loops, export redirect rules

  node cli.js match OLD NEW [options]   fuzzy-match two URL lists (txt / csv / sitemap.xml)
  node cli.js check MAP [--new NEW]     analyse an existing old,new redirect map

options:
  --out DIR          output directory (default ./detour-out)
  --formats a,b      ${D.FORMATS.join(', ')} (default: all)
  --threshold N      auto-accept matches scoring >= N, 0..1 (default 0.55)
  --fallback URL     redirect unmatched URLs here (e.g. /blog/) instead of leaving them out
  --keep-query       treat ?query strings as part of the URL when matching
  --no-flatten       keep redirect chains instead of collapsing them to the final target
  --old-host URL     origin used by cloudflare-bulk and verify.sh (default https://old.example.com)
  --new-host URL     origin used by cloudflare-bulk for relative targets
  --strict           exit 1 if any loop, conflict, chain or unmatched URL remains
`;

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  const withVal = new Set(['out', 'formats', 'threshold', 'fallback', 'old-host', 'new-host', 'new']);
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x.startsWith('--')) {
      const k = x.slice(2);
      if (withVal.has(k)) { if (i + 1 >= argv.length) throw new Error(`--${k} needs a value`); a.flags[k] = argv[++i]; } else a.flags[k] = true;
    } else a._.push(x);
  }
  return a;
}
function read(f) {
  try { return fs.readFileSync(f, 'utf8'); } catch (e) { throw new Error(`cannot read ${f}: ${e.code || e.message}`); }
}

function report(rules, sum, notes, orphans) {
  const L = [];
  L.push(`detour: ${sum.total} old URLs - ${sum.active} get a redirect (${sum.exact} exact), ${sum.review} need review, ${sum.unmatched} unmatched`);
  const probs = [['loop', 'redirect LOOPS (dropped from output)'], ['conflict', 'CONFLICTS: same source, different targets'], ['chain', 'chains collapsed to the final target'], ['self', 'unchanged URLs (no redirect needed)'], ['collision', 'sources that differ only by case/slash/extension'], ['target-missing', 'targets missing from the new site']];
  for (const [f, label] of probs) {
    const hit = rules.filter(r => r.flags.includes(f));
    if (!hit.length) continue;
    L.push(`\n${hit.length} ${label}:`);
    for (const r of hit.slice(0, 8)) L.push(`  ${r.src}  ->  ${r.dst}${f === 'chain' ? '  =>  ' + r.final + ` (${r.hops} extra hop${r.hops > 1 ? 's' : ''})` : ''}`);
    if (hit.length > 8) L.push(`  ... and ${hit.length - 8} more (see qa.csv)`);
  }
  const rev = rules.filter(r => r.flags.includes('ambiguous') || r.flags.includes('low-confidence'));
  if (rev.length) {
    L.push(`\n${rev.length} to review (low confidence or a close runner-up):`);
    for (const r of rev.slice(0, 8)) L.push(`  ${r.src}  ->  ${r.dstRaw || r.dst}  (${r.score})${r.dst ? '' : '  [not exported]'}`);
    if (rev.length > 8) L.push(`  ... and ${rev.length - 8} more`);
  }
  const un = rules.filter(r => !r.dst && r.how !== 'duplicate' && !(r.flags.includes('low-confidence')));
  if (un.length) { L.push(`\n${un.length} unmatched:`); for (const r of un.slice(0, 8)) L.push('  ' + r.src); if (un.length > 8) L.push(`  ... and ${un.length - 8} more`); }
  if (orphans && orphans.length) L.push(`\n${orphans.length} new-site URLs receive no redirect (fine for brand-new pages, suspicious otherwise).`);
  for (const n of notes) L.push('note: ' + n);
  return L.join('\n') + '\n';
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!cmd || cmd === 'help' || args.flags.help || args.flags.h) { process.stdout.write(HELP); return 0; }
  const f = args.flags;
  const opts = { threshold: f.threshold !== undefined ? Number(f.threshold) : 0.55, fallback: f.fallback || '', ignoreQuery: !f['keep-query'], flatten: !f['no-flatten'], oldHost: f['old-host'] || 'https://old.example.com', newHost: f['new-host'] || 'https://new.example.com' };
  if (!(opts.threshold >= 0 && opts.threshold <= 1)) throw new Error('--threshold must be between 0 and 1');
  let rules, notes = [], orphans = [];
  if (cmd === 'match') {
    if (args._.length < 3) throw new Error('match needs OLD and NEW files');
    const o = D.parseList(read(args._[1]), 'old'), n = D.parseList(read(args._[2]), 'new');
    notes = o.notes.concat(n.notes);
    if (!o.items.length) throw new Error('no URLs found in ' + args._[1]);
    if (!n.items.length) throw new Error('no URLs found in ' + args._[2]);
    const m = D.matchLists(o.items, n.items, opts);
    rules = m.rules; orphans = m.orphans;
  } else if (cmd === 'check') {
    if (args._.length < 2) throw new Error('check needs a MAP file');
    const m = D.loadMapping(read(args._[1]), f.new ? read(f.new) : '');
    rules = m.rules; notes = m.notes;
    if (!rules.length) throw new Error('no old,new pairs found in ' + args._[1]);
  } else throw new Error('unknown command: ' + cmd);

  const sum = D.analyze(rules);
  const out = f.out || 'detour-out';
  fs.mkdirSync(out, { recursive: true });
  const formats = f.formats ? String(f.formats).split(',').map(s => s.trim()).filter(Boolean) : D.FORMATS;
  for (const x of formats) if (!D.FORMATS.includes(x)) throw new Error(`unknown format "${x}" (have: ${D.FORMATS.join(', ')})`);
  const written = [];
  for (const fmt of formats) {
    const r = D.toFormat(fmt, rules, opts);
    const dir = path.join(out, fmt); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, r.filename), r.content); written.push(`${fmt}/${r.filename} (${r.count} rules)`);
  }
  fs.writeFileSync(path.join(out, 'qa.csv'), D.qaCsv(rules));
  fs.writeFileSync(path.join(out, 'verify.sh'), D.verifyScript(rules, opts), { mode: 0o755 });
  const text = report(rules, sum, notes, orphans);
  fs.writeFileSync(path.join(out, 'report.txt'), text);
  process.stdout.write(text + `\nwrote ${out}/: ${written.join(', ')}, qa.csv, verify.sh, report.txt\n`);
  if (f.strict && (sum.loop || sum.conflict || sum.chain || sum.unmatched || sum.review)) return 1;
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { process.stderr.write('detour: ' + e.message + '\n'); process.exitCode = 2; }
}
module.exports = { main };
