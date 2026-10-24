#!/usr/bin/env node
// harbor CLI — inspect, filter, redact and diff HAR files. Zero dependencies.
const fs = require('fs'), path = require('path');
const H = require('./src/core.js');
function help() {
  console.log(`usage: harbor <command> [options]
  summary <file.har>                   overview: totals, slowest, failures, duplicate requests, weight by type/host
  ls <file.har> [filter...]            list requests (filter: text status:404 status:5xx method:post host:x type:json slower:500 larger:100k header:name=val body:text, -neg)
  curl <file.har> <filter...> [--all]  print curl for the first (or --all) matching request
  redact <in.har> [-o out.har] [--emails] [--no-bodies]   mask tokens, cookies, passwords, JWTs; verifies the result
  diff <a.har> <b.har> [--fail-on-regression]   what changed between two captures (exit 1 on regression)
  options: --json  machine-readable output   -h  help`);
}
function die(m, code) { console.error('harbor: ' + m); process.exit(code || 2); }
const args = process.argv.slice(2);
const flags = { json: false, all: false, emails: false, bodies: true, fail: false, out: null };
const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else if (a === '--json') flags.json = true;
  else if (a === '--all') flags.all = true;
  else if (a === '--emails') flags.emails = true;
  else if (a === '--no-bodies') flags.bodies = false;
  else if (a === '--fail-on-regression') flags.fail = true;
  else if (a === '-o') { if (i + 1 >= args.length) die('-o needs a value'); flags.out = args[++i]; }
  else pos.push(a);
}
const cmd = pos.shift();
if (!cmd) { help(); process.exit(2); }
function load(f) {
  if (!f) die('missing HAR file');
  let t; try { t = fs.readFileSync(f, 'utf8'); } catch (e) { die(`cannot read ${f}: ${e.code || e.message}`); }
  try { return H.parseHar(t); } catch (e) { die(`${f}: ${e.message}`); }
}
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' kB' : n + ' B';
const ms = n => n >= 1000 ? (n / 1000).toFixed(2) + ' s' : Math.round(n) + ' ms';
const pad = (s, n) => String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s).padEnd(n);
function row(e) { return `${String(e.index + 1).padStart(3)}  ${pad(e.method, 6)} ${String(e.status || 'ERR').padStart(3)}  ${ms(e.time).padStart(8)}  ${kb(e.size).padStart(9)}  ${pad(e.type, 5)} ${e.host}${e.path}${e.search ? e.search.slice(0, 40) : ''}`; }

if (cmd === 'summary') {
  const h = load(pos[0]), s = H.summarize(h.entries);
  if (flags.json) { console.log(JSON.stringify({ meta: h.meta, count: s.count, bytes: s.bytes, wall: s.wall, failed: s.failed, byType: s.byType, byHost: s.byHost, duplicates: s.duplicates, phaseTotals: s.phaseTotals })); process.exit(0); }
  console.log(`${pos[0]}  (${h.meta.creator})`);
  console.log(`${s.count} requests · ${kb(s.bytes)} transferred · ${ms(s.wall)} wall clock · ${s.failed} failed · ${s.cached} cached\n`);
  console.log('Slowest:'); s.slowest.forEach(e => console.log('  ' + row(e)));
  if (s.failedList.length) { console.log('\nFailed:'); s.failedList.forEach(e => console.log('  ' + row(e))); }
  if (s.duplicates.length) { console.log('\nRepeated identical GETs:'); s.duplicates.slice(0, 5).forEach(d => console.log(`  ${d.count}×  ${kb(d.bytes).padStart(9)}  ${d.url.slice(0, 90)}`)); }
  console.log('\nBy type:'); s.byType.forEach(t => console.log(`  ${pad(t.key, 8)} ${String(t.count).padStart(3)} req  ${kb(t.bytes).padStart(9)}`));
  console.log('\nBy host:'); s.byHost.forEach(t => console.log(`  ${pad(t.key, 28)} ${String(t.count).padStart(3)} req  ${kb(t.bytes).padStart(9)}`));
  process.exit(0);
}
if (cmd === 'ls') {
  const h = load(pos[0]), list = H.filter(h.entries, pos.slice(1).join(' '));
  if (flags.json) { console.log(JSON.stringify(list.map(e => ({ n: e.index + 1, method: e.method, status: e.status, time: e.time, size: e.size, type: e.type, url: e.url })))); process.exit(0); }
  list.forEach(e => console.log(row(e))); console.error(`${list.length} of ${h.entries.length} requests`);
  process.exit(0);
}
if (cmd === 'curl') {
  const h = load(pos[0]), list = H.filter(h.entries, pos.slice(1).join(' '));
  if (!list.length) die('no request matches that filter', 1);
  (flags.all ? list : list.slice(0, 1)).forEach(e => console.log(H.toCurl(e)));
  process.exit(0);
}
if (cmd === 'redact') {
  const h = load(pos[0]);
  const { har, counts } = H.redact(h.har, { emails: flags.emails, bodies: flags.bodies });
  const text = JSON.stringify(har, null, 1), left = H.scan(text);
  const out = flags.out || pos[0].replace(/(\.har)?$/i, '.redacted.har');
  if (left.length) { console.error('harbor: WARNING leftover secret-shaped strings: ' + left.map(l => `${l.kind} ×${l.count}`).join(', ')); }
  fs.writeFileSync(out, text);
  console.error(`masked ${counts.total} values (${counts.headers} headers, ${counts.cookies} cookies, ${counts.fields} fields/params, ${counts.patterns} token patterns${flags.emails ? ', ' + counts.emails + ' emails' : ''}); dropped ${counts.bodiesDropped} binary/body payloads -> ${out}`);
  process.exit(left.length ? 1 : 0);
}
if (cmd === 'diff') {
  const a = load(pos[0]), b = load(pos[1]), d = H.diff(a.entries, b.entries);
  if (flags.json) { console.log(JSON.stringify({ added: d.added.map(e => e.method + ' ' + e.url), removed: d.removed.map(e => e.method + ' ' + e.url), changed: d.changed.map(c => ({ url: c.b.url, method: c.b.method, why: c.why })), unchanged: d.same.length, regressions: d.regressions })); }
  else {
    console.log(`${a.entries.length} → ${b.entries.length} requests · ${d.same.length} unchanged, ${d.changed.length} changed, ${d.added.length} added, ${d.removed.length} removed\n`);
    d.changed.forEach(c => { console.log(`~ ${c.b.method} ${c.b.host}${c.b.path}`); c.why.forEach(w => console.log(`    ${w.bad ? '!' : ' '} ${w.kind}: ${['status', 'type'].includes(w.kind) ? w.from + ' → ' + w.to : (w.kind.match(/larger|smaller/) ? kb(w.from) + ' → ' + kb(w.to) : ms(w.from) + ' → ' + ms(w.to))}`)); });
    d.added.forEach(e => console.log(`+ ${e.method} ${e.host}${e.path}${e.search}  [${e.status || 'ERR'}]${e.failed ? ' !' : ''}`));
    d.removed.forEach(e => console.log(`- ${e.method} ${e.host}${e.path}${e.search}`));
    console.log(`\n${d.regressions} regression${d.regressions === 1 ? '' : 's'}`);
  }
  process.exit(flags.fail && d.regressions ? 1 : 0);
}
die(`unknown command "${cmd}" (try --help)`);
