#!/usr/bin/env node
'use strict';
// Blindspot — offline checker for Next.js GHSA-2xp9-vwfh-vxw4 (Image Optimization API RCE).
// Zero dependencies. Defensive: reads lockfiles/config only, never touches the network.
const fs = require('fs');
const path = require('path');

const ADVISORY = {
  id: 'GHSA-2xp9-vwfh-vxw4',
  url: 'https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4',
  upstream: 'https://github.com/strukturag/libheif/security/advisories/GHSA-g89c-p67h-r497',
  fixed: ['15.5.24', '16.3.3'],
};

function parseVer(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(s).trim());
  if (!m) return null;
  return { maj: +m[1], min: +m[2], pat: +m[3], pre: m[4] ? m[4].split('.') : [] };
}
function cmp(a, b) {
  for (const k of ['maj', 'min', 'pat']) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1;
  if (!a.pre.length && !b.pre.length) return 0;
  if (!a.pre.length) return 1;   // release > prerelease
  if (!b.pre.length) return -1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x), ny = /^\d+$/.test(y);
    if (nx && ny) { if (+x !== +y) return +x < +y ? -1 : 1; }
    else if (nx !== ny) return nx ? -1 : 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
// Affected: >=10.0.0 <15.5.24, and 16.x <16.3.3 (advisory lists "< 16.3.3"; 10.0.0 floor applies to all).
function classify(version) {
  const v = parseVer(version);
  if (!v) return { status: 'unknown', reason: 'unparseable version' };
  const lo = parseVer('10.0.0');
  if (cmp(v, lo) < 0) return { status: 'unknown', reason: 'below advisory range floor (10.0.0); not listed as affected' };
  const line = v.maj <= 15 ? '15.5.24' : '16.3.3';
  if (v.maj > 16) return { status: 'ok', reason: 'major above 16' };
  if (v.maj <= 15 && !(v.maj === 15 && v.min >= 6) && cmp(v, parseVer('15.5.24')) < 0) return { status: 'vulnerable', fix: '15.5.24' };
  if (v.maj === 15 && cmp(v, parseVer('15.5.24')) < 0) return { status: 'vulnerable', fix: '15.5.24' };
  if (v.maj === 16 && cmp(v, parseVer('16.3.3')) < 0) return { status: 'vulnerable', fix: '16.3.3' };
  return { status: 'ok', reason: `>= ${line}` };
}

function fromPackageLock(txt) {
  const j = JSON.parse(txt), out = [];
  if (j.packages) for (const [k, v] of Object.entries(j.packages))
    if (/(^|\/)node_modules\/next$/.test(k) && v.version) out.push({ version: v.version, where: k });
  (function walk(deps, p) {
    for (const [n, v] of Object.entries(deps || {})) {
      if (n === 'next' && v.version && !j.packages) out.push({ version: v.version, where: p + n });
      walk(v.dependencies, p + n + '>');
    }
  })(j.dependencies, '');
  return out;
}
function fromYarnLock(txt) {
  const out = [];
  for (const block of txt.split(/\n\s*\n/)) {
    const head = block.split('\n').find(l => l.trim() && !l.startsWith('#'));
    if (!head || !/^"?next@/.test(head)) continue;
    const m = /^\s+version:?\s+"?([^"\s]+)"?/m.exec(block);
    if (m) out.push({ version: m[1], where: head.replace(/:$/, '').trim() });
  }
  return out;
}
function fromPnpmLock(txt) {
  const out = [], seen = new Set();
  const re = /(?:^|\n)\s*['"]?\/?next@(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)(?:\([^)\n]*\))*['"]?:/g;
  let m;
  while ((m = re.exec(txt))) if (!seen.has(m[1])) { seen.add(m[1]); out.push({ version: m[1], where: 'next@' + m[1] }); }
  return out;
}
function fromInstalled(dir) {
  const f = path.join(dir, 'node_modules', 'next', 'package.json');
  if (!fs.existsSync(f)) return [];
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return j.version ? [{ version: j.version, where: 'node_modules/next (installed)' }] : [];
}

function configHints(dir) {
  const hints = [];
  for (const n of ['next.config.js', 'next.config.mjs', 'next.config.cjs', 'next.config.ts']) {
    const f = path.join(dir, n);
    if (!fs.existsSync(f)) continue;
    const t = fs.readFileSync(f, 'utf8');
    if (/output\s*:\s*['"]export['"]/.test(t)) hints.push({ file: n, note: "output:'export' detected — static export has no runtime image optimizer (heuristic, verify)" });
    if (/unoptimized\s*:\s*true/.test(t)) hints.push({ file: n, note: 'images.unoptimized:true detected — built-in optimizer disabled (heuristic, verify)' });
    if (/loader\s*:|loaderFile\s*:/.test(t)) hints.push({ file: n, note: 'custom image loader configured — optimizer may not be in use (heuristic, verify)' });
    if (/remotePatterns|domains\s*:/.test(t)) hints.push({ file: n, note: 'remote image sources allowed — wider attacker-reachable input surface for the optimizer' });
  }
  return hints;
}

function scan(dir) {
  const found = [];
  const add = (src, list) => list.forEach(x => found.push({ source: src, ...x }));
  const tryRead = (name, fn) => {
    const f = path.join(dir, name);
    if (!fs.existsSync(f)) return;
    try { add(name, fn(fs.readFileSync(f, 'utf8'))); }
    catch (e) { found.push({ source: name, error: `cannot parse: ${e.message}` }); }
  };
  tryRead('package-lock.json', fromPackageLock);
  tryRead('npm-shrinkwrap.json', fromPackageLock);
  tryRead('yarn.lock', fromYarnLock);
  tryRead('pnpm-lock.yaml', fromPnpmLock);
  try { add('node_modules', fromInstalled(dir)); } catch (e) { found.push({ source: 'node_modules', error: e.message }); }
  const findings = found.map(f => f.error ? f : { ...f, ...classify(f.version) });
  const hasNext = findings.some(f => f.version);
  const vulnerable = findings.some(f => f.status === 'vulnerable');
  return { advisory: ADVISORY, dir, hasNext, vulnerable, findings, hints: vulnerable ? configHints(dir) : [] };
}

function render(r) {
  const L = [];
  L.push(`Blindspot — ${ADVISORY.id} (Next.js Image Optimization API RCE)`);
  L.push(`target: ${r.dir}`);
  if (!r.findings.length) L.push('No lockfile or installed next found: nothing to assess (not a clean bill of health).');
  for (const f of r.findings) {
    if (f.error) { L.push(`  ?  ${f.source}: ${f.error}`); continue; }
    const tag = f.status === 'vulnerable' ? 'VULN' : f.status === 'ok' ? ' ok ' : ' ?? ';
    L.push(`  ${tag} next@${f.version}  [${f.source}] ${f.status === 'vulnerable' ? '→ upgrade to >= ' + f.fix : (f.reason || '')}`);
  }
  for (const h of r.hints) L.push(`  hint (${h.file}): ${h.note}`);
  if (r.vulnerable) {
    L.push('', `Advisory: ${ADVISORY.url}`, `Upstream: ${ADVISORY.upstream}`,
      'Remediate: upgrade next to 15.5.24 (15.x line) or 16.3.3+ (16.x line), then redeploy.',
      'Note: no CVE and (as of 2026-09-03) not in the global GitHub Advisory DB/OSV — npm audit may stay silent.');
  } else if (r.hasNext) L.push('', 'No vulnerable next version found in the inspected files.');
  return L.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const dirs = args.filter(a => !a.startsWith('--'));
  if (args.includes('--help')) { console.log('usage: blindspot [--json] [dir ...]   exit 1 = vulnerable, 0 = ok, 2 = error'); return 0; }
  if (!dirs.length) dirs.push('.');
  let code = 0; const results = [];
  for (const d of dirs) {
    if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) { console.error(`error: not a directory: ${d}`); return 2; }
    const r = scan(d); results.push(r);
    if (r.vulnerable) code = Math.max(code, 1);
    if (r.findings.some(f => f.error)) code = Math.max(code, 2);
  }
  console.log(json ? JSON.stringify(results, null, 2) : results.map(render).join('\n\n'));
  return code;
}

module.exports = { classify, parseVer, cmp, scan, render, fromPackageLock, fromYarnLock, fromPnpmLock };
if (require.main === module) process.exit(main(process.argv));
