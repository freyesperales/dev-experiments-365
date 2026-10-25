#!/usr/bin/env node
// Caddify CLI — nginx.conf in, Caddyfile out, translation report on stderr.
const fs = require('fs'), path = require('path');
const C = require('./src/core.js');
const argv = process.argv.slice(2);
const USAGE = `caddify — translate an nginx config into a Caddyfile and say what could not be translated

Usage: caddify <nginx.conf | ->  [-o Caddyfile] [--json] [--quiet] [--strict]
  -o FILE    write the Caddyfile to FILE (default: stdout)
  --json     print {caddyfile, report, stats, sites} as JSON instead
  --quiet    do not print the translation report
  --strict   exit 2 if anything needs manual work (for CI)
  Includes are resolved relative to the config file (globs with * supported).`;
if (!argv.length || argv.includes('-h') || argv.includes('--help')) { console.log(USAGE); process.exit(argv.length ? 0 : 1); }
const o = { out: null, json: false, quiet: false, strict: false, file: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o') o.out = argv[++i]; else if (a === '--json') o.json = true; else if (a === '--quiet') o.quiet = true; else if (a === '--strict') o.strict = true;
  else if (a[0] === '-' && a !== '-') { console.error('caddify: unknown option ' + a + '\n' + USAGE); process.exit(1); } else o.file = a;
}
if (!o.file) { console.error(USAGE); process.exit(1); }
let text, base = process.cwd();
try { text = o.file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(o.file, 'utf8'); if (o.file !== '-') base = path.dirname(path.resolve(o.file)); }
catch (e) { console.error('caddify: cannot read ' + o.file + ': ' + e.message); process.exit(1); }

function globToRe(g) { return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$'); }
function readInclude(pat) {
  const full = path.isAbsolute(pat) ? pat : path.join(base, pat);
  const cands = [full]; if (path.isAbsolute(pat)) cands.push(path.join(base, path.basename(pat)));
  for (const c of cands) {
    const dir = path.dirname(c), re = globToRe(path.basename(c));
    let names; try { names = fs.readdirSync(dir).filter(n => re.test(n)).sort(); } catch (e) { continue; }
    const files = names.map(n => path.join(dir, n)).filter(f => fs.statSync(f).isFile()).map(f => ({ name: f, text: fs.readFileSync(f, 'utf8') }));
    if (files.length) return files;
  }
  return [];
}
let r;
try { r = C.convert(text, { readInclude }); } catch (e) { console.error('caddify: ' + e.message); process.exit(1); }
if (o.json) { delete r.ast; console.log(JSON.stringify(r, null, 2)); }
else if (o.out) fs.writeFileSync(o.out, r.caddyfile); else process.stdout.write(r.caddyfile);
if (!o.quiet && !o.json) {
  const s = r.stats, tag = { manual: 'MANUAL ', differs: 'DIFFERS', noop: 'no-op  ' };
  const rows = r.report.filter(x => x.kind !== 'ok');
  console.error('\n— caddify report: ' + s.ok + ' translated, ' + s.differs + ' approximate, ' + s.noop + ' no-op/handled by Caddy, ' + s.manual + ' need manual work —');
  ['manual', 'differs', 'noop'].forEach(k => rows.filter(x => x.kind === k).forEach(x => {
    console.error(tag[k] + ' line ' + x.line + '  ' + x.directive + '\n         ' + x.message + (x.hint ? '\n         → ' + x.hint : ''));
  }));
}
process.exit(o.strict && r.stats.manual ? 2 : 0);
