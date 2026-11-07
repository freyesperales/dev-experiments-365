#!/usr/bin/env node
'use strict';
// Lockjaw — npm lockfile supply-chain auditor. Zero dependencies, fully offline.
const fs = require('fs');
const path = require('path');

const SEV = { critical: 4, high: 3, medium: 2, low: 1 };
const DEFAULT_REGISTRIES = ['registry.npmjs.org', 'registry.yarnpkg.com'];
const POPULAR = ['react', 'lodash', 'express', 'axios', 'chalk', 'commander', 'debug', 'moment', 'request', 'webpack',
  'typescript', 'eslint', 'prettier', 'jquery', 'vue', 'next', 'dotenv', 'uuid', 'yargs', 'inquirer', 'colors',
  'async', 'bluebird', 'underscore', 'minimist', 'mongoose', 'jest', 'mocha', 'rimraf', 'glob', 'semver', 'ws',
  'cross-env', 'node-fetch', 'body-parser', 'cors', 'jsonwebtoken', 'bcrypt', 'passport', 'socket.io', 'redux', 'rxjs'];

const RULES = {
  LJ001: ['high', 'Package resolved from an unexpected registry/host', 'Dependency confusion and tarball swapping both hide here. Pin to your registry or remove the override.'],
  LJ002: ['high', 'Package has no integrity hash', 'Without integrity, npm cannot verify the tarball. Regenerate the lockfile from a trusted registry (npm install --package-lock-only).'],
  LJ003: ['high', 'Dependency fetched over plain http://', 'Anyone on the path can swap the tarball. Use https and re-lock.'],
  LJ004: ['medium', 'Git/URL dependency not pinned to a commit', 'A branch or tag can move. Pin to a full commit SHA, or publish and depend on a registry version.'],
  LJ005: ['low', 'Weak sha1 integrity hash', 'sha1 is collision-prone. Re-lock with a current npm to get sha512.'],
  LJ006: ['high', 'Locked tarball URL names a different package than its key', 'The lockfile entry claims one package but downloads another — a classic substitution trick.'],
  LJ007: ['medium', 'Package runs install scripts', 'preinstall/install/postinstall run arbitrary code at install time. Review it, and consider npm ci --ignore-scripts with an allowlist.'],
  LJ008: ['medium', 'Name is one edit away from a popular package (possible typosquat)', 'Verify the name and publisher. Typosquats are a common malware vector.'],
  LJ009: ['medium', 'Local file:/link: dependency in lockfile', 'Works on one machine only and bypasses registry verification. Remove before release.'],
  LJ010: ['high', 'package.json dependency missing from or inconsistent with lockfile', 'Lockfile drift means CI may install something nobody reviewed. Run npm install and commit the result.'],
  LJ011: ['medium', 'Same package pinned at many versions', 'Duplicate versions widen the attack surface and hide stale vulnerable copies. Dedupe with npm dedupe.'],
};

function nameFromKey(key) {
  const i = key.lastIndexOf('node_modules/');
  return i === -1 ? key : key.slice(i + 'node_modules/'.length);
}

// Normalise v1 (nested "dependencies"), v2 and v3 ("packages") into a flat list.
function flatten(lock) {
  if (lock.__flat) return lock.__flat;
  const out = [];
  if (lock.packages && typeof lock.packages === 'object') {
    for (const [key, p] of Object.entries(lock.packages)) {
      if (key === '') continue;
      if (!p || typeof p !== 'object') continue;
      out.push({ key, name: p.name || nameFromKey(key), version: p.version, resolved: p.resolved, integrity: p.integrity, hasInstallScript: !!p.hasInstallScript, link: !!p.link, dev: !!p.dev, raw: p });
    }
    return out;
  }
  const walk = (deps, prefix) => {
    for (const [name, p] of Object.entries(deps || {})) {
      const key = prefix + 'node_modules/' + name;
      out.push({ key, name, version: p.version, resolved: p.resolved, integrity: p.integrity, hasInstallScript: false, link: false, dev: !!p.dev, raw: p });
      if (p.dependencies) walk(p.dependencies, key + '/');
    }
  };
  walk(lock.dependencies, '');
  return out;
}

// Parse a Yarn Classic (v1) yarn.lock into a synthetic lock object with a pre-flattened package list.
function parseYarnLock(text) {
  if (/^__metadata:/m.test(text)) throw new Error('Yarn Berry (v2+) yarn.lock is not supported yet — only Yarn Classic (v1) and package-lock.json');
  const unq = s => s.trim().replace(/^"|"$/g, '');
  const entries = []; let cur = null; let section = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      if (!raw.endsWith(':')) throw new Error('malformed yarn.lock line: ' + raw.slice(0, 60));
      cur = { specs: raw.slice(0, -1).split(',').map(unq).filter(Boolean) };
      entries.push(cur); section = null; continue;
    }
    if (!cur) throw new Error('malformed yarn.lock: indented line before any entry');
    const indent = raw.match(/^ */)[0].length;
    const t = raw.trim();
    if (indent === 2) {
      if (t.endsWith(':')) { section = t.slice(0, -1); continue; }
      section = null;
      const m = t.match(/^(\S+)\s+(.*)$/);
      if (m) cur[m[1]] = unq(m[2]);
    }
  }
  if (!entries.length) throw new Error('no entries found — is this a yarn.lock?');
  const packages = [];
  for (const e of entries) {
    const spec = e.specs[0];
    const at = spec.lastIndexOf('@');
    const name = at > 0 ? spec.slice(0, at) : spec;
    if (!e.version) throw new Error(`yarn.lock entry "${spec}" has no version`);
    let integrity = e.integrity;
    // Older Yarn 1.x (< 1.10) recorded only a sha1 in the URL fragment of the registry tarball.
    if (!integrity && e.resolved) { const h = e.resolved.match(/^https?:\/\/[^#]*\.tgz#([0-9a-f]{40})$/); if (h) integrity = 'sha1-' + h[1]; }
    packages.push({ key: `${name}@${e.version}`, name, version: e.version, resolved: e.resolved, integrity, hasInstallScript: false, link: false, dev: false, specs: e.specs, yarn: true, raw: e });
  }
  return { lockfileVersion: 'yarn1', __flat: packages };
}

function parseLock(text) {
  if (!/^\s*[{[]/.test(text)) return parseYarnLock(text);
  let lock;
  try { lock = JSON.parse(text); } catch (e) { throw new Error('invalid JSON: ' + e.message); }
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) throw new Error('not an object');
  if (lock.lockfileVersion === undefined || (!lock.packages && !lock.dependencies)) throw new Error('no "packages" or "dependencies" field — is this a package-lock.json or yarn.lock?');
  return lock;
}

function editDistanceLeq1(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.slice(i) === l.slice(i + 1);
}

function urlInfo(resolved) {
  try { const u = new URL(resolved); return u; } catch { return null; }
}

// Package name implied by an npm registry tarball path: /@scope/name/-/name-1.0.0.tgz or /name/-/name-1.0.0.tgz
function tarballName(u) {
  const m = u.pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/-\/[^/]+\.tgz$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function audit(lock, opts = {}) {
  const allowed = new Set([...(opts.registries || []), ...DEFAULT_REGISTRIES]);
  const findings = [];
  const add = (id, p, detail) => findings.push({ id, severity: RULES[id][0], title: RULES[id][1], fix: RULES[id][2], package: p ? `${p.name}@${p.version || '?'}` : undefined, location: p ? p.key : undefined, detail });
  const pkgs = flatten(lock);
  const popular = new Set(POPULAR);
  const versions = new Map();

  for (const p of pkgs) {
    if (!versions.has(p.name)) versions.set(p.name, new Set());
    if (p.version) versions.get(p.name).add(p.version);
    const r = p.resolved;
    if (p.link || (r && /^(file|link):/.test(r)) || (p.version && /^(file|link):/.test(p.version))) { add('LJ009', p, r || p.version); continue; }
    if (r) {
      if (/^git(\+|:)|^github:|^git@/.test(r) || /\.git(#|$)/.test(r)) {
        if (!/#[0-9a-f]{40}$/.test(r)) add('LJ004', p, r);
        if (/^git\+http:|^http:/.test(r)) add('LJ003', p, r);
      } else {
        const u = urlInfo(r);
        if (!u) add('LJ001', p, 'unparseable resolved URL: ' + r);
        else {
          if (u.protocol === 'http:') add('LJ003', p, r);
          if (!allowed.has(u.host)) add('LJ001', p, `${u.host} (${r})`);
          else {
            const tn = tarballName(u);
            if (tn && tn !== p.name) add('LJ006', p, `key says "${p.name}" but URL downloads "${tn}"`);
          }
        }
        if (!p.integrity) add('LJ002', p, r);
      }
    }
    if (p.integrity && /(^|\s)sha1-/.test(p.integrity)) add('LJ005', p, p.integrity.slice(0, 20) + '…');
    if (p.hasInstallScript) add('LJ007', p);
    const bare = p.name.replace(/^@[^/]+\//, '');
    if (!popular.has(p.name)) for (const pop of popular) if (editDistanceLeq1(bare, pop)) { add('LJ008', p, `looks like "${pop}"`); break; }
  }
  for (const [name, set] of versions) if (set.size >= 4 && !opts.noDup) {
    findings.push({ id: 'LJ011', severity: 'medium', title: RULES.LJ011[1], fix: RULES.LJ011[2], package: name, detail: `${set.size} versions: ${[...set].slice(0, 6).join(', ')}` });
  }
  if (opts.packageJson) {
    for (const sec of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [n, range] of Object.entries(opts.packageJson[sec] || {})) {
        if (lock.__flat) {
          if (!/^(file|link|git|github|https?):/.test(range) && !pkgs.some(x => x.specs.includes(`${n}@${range}`)))
            findings.push({ id: 'LJ010', severity: 'high', title: RULES.LJ010[1], fix: 'Lockfile drift means CI may install something nobody reviewed. Run yarn install and commit the result.', package: n, detail: `${sec}: "${n}": "${range}" has no yarn.lock entry for "${n}@${range}"` });
          continue;
        }
        const p = pkgs.find(x => x.key === 'node_modules/' + n);
        if (!p) { if (sec !== 'optionalDependencies') findings.push({ id: 'LJ010', severity: 'high', title: RULES.LJ010[1], fix: RULES.LJ010[2], package: n, detail: `${sec}: "${n}": "${range}" has no lockfile entry` }); }
        else if (/^\d+\.\d+\.\d+$/.test(range) && p.version !== range) findings.push({ id: 'LJ010', severity: 'high', title: RULES.LJ010[1], fix: RULES.LJ010[2], package: n, detail: `package.json pins ${range} but lockfile has ${p.version}` });
      }
    }
  }
  findings.sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.id.localeCompare(b.id));
  return { findings, total: pkgs.length };
}

// PR review mode: what did this change introduce?
function diff(oldLock, newLock, opts = {}) {
  const idx = l => { const m = new Map(); for (const p of flatten(l)) m.set(p.key, p); return m; };
  const a = idx(oldLock), b = idx(newLock);
  const added = [], removed = [], changed = [];
  for (const [k, p] of b) { if (!a.has(k)) added.push(p); else { const o = a.get(k); if (o.version !== p.version || o.resolved !== p.resolved || o.integrity !== p.integrity) changed.push({ from: o, to: p }); } }
  for (const [k, p] of a) if (!b.has(k)) removed.push(p);
  const notes = [];
  for (const { from, to } of changed) {
    if (from.version === to.version && from.integrity && to.integrity && from.integrity !== to.integrity)
      notes.push({ severity: 'critical', package: `${to.name}@${to.version}`, detail: 'SAME VERSION, DIFFERENT INTEGRITY — tarball content changed without a version bump' });
    else if (from.version === to.version && from.resolved !== to.resolved)
      notes.push({ severity: 'high', package: `${to.name}@${to.version}`, detail: `resolved URL changed: ${from.resolved} -> ${to.resolved}` });
    if (!from.hasInstallScript && to.hasInstallScript)
      notes.push({ severity: 'high', package: `${to.name}@${to.version}`, detail: 'gained an install script' });
  }
  // audit only what the PR introduced
  const touched = new Set([...added, ...changed.map(c => c.to)].map(p => p.key));
  const res = audit(newLock, opts);
  const findings = res.findings.filter(f => !f.location || touched.has(f.location));
  for (const p of added) if (p.hasInstallScript && !findings.some(f => f.id === 'LJ007' && f.location === p.key)) findings.push({ id: 'LJ007', severity: 'medium', title: RULES.LJ007[1], fix: RULES.LJ007[2], package: `${p.name}@${p.version}`, location: p.key });
  findings.sort((x, y) => SEV[y.severity] - SEV[x.severity]);
  return { added, removed, changed, notes, findings };
}

function fmtFinding(f) {
  return `${f.severity.toUpperCase().padEnd(8)} ${f.id}  ${f.package || ''}\n         ${f.title}${f.detail ? '\n         > ' + f.detail : ''}\n         fix: ${f.fix}`;
}
function summary(findings) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity]++;
  return `${findings.length} finding(s): ${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low} low`;
}
function sarif(findings, file) {
  const lvl = { critical: 'error', high: 'error', medium: 'warning', low: 'note' };
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'lockjaw', rules: Object.entries(RULES).map(([id, r]) => ({ id, shortDescription: { text: r[1] }, help: { text: r[2] } })) } },
      results: findings.map(f => ({ ruleId: f.id, level: lvl[f.severity], message: { text: `${f.package || ''} ${f.title}${f.detail ? ' — ' + f.detail : ''}`.trim() }, locations: [{ physicalLocation: { artifactLocation: { uri: file }, region: { startLine: 1 } } }] })) }],
  };
}

function usage() {
  return `lockjaw — npm/Yarn-classic lockfile supply-chain auditor (offline, zero deps)

  lockjaw <package-lock.json|yarn.lock> [--package-json package.json] [--registry host]... [--json|--sarif] [--no-dup] [--fail-on high]
  lockjaw diff <old-lock> <new-lock> [--json] [--fail-on high]

  git show main:package-lock.json > /tmp/old.json && lockjaw diff /tmp/old.json package-lock.json`;
}

function main(argv, io = { out: s => process.stdout.write(s + '\n'), err: s => process.stderr.write(s + '\n') }) {
  const args = argv.slice(); const flags = { registries: [] }; const pos = [];
  while (args.length) {
    const a = args.shift();
    if (a === '--json') flags.json = true;
    else if (a === '--sarif') flags.sarif = true;
    else if (a === '--fail-on') flags.failOn = args.shift();
    else if (a === '--registry') flags.registries.push(args.shift());
    else if (a === '--no-dup') flags.noDup = true;
    else if (a === '--package-json') flags.pj = args.shift();
    else if (a === '-h' || a === '--help') { io.out(usage()); return 0; }
    else pos.push(a);
  }
  const failOn = flags.failOn || 'high';
  if (!SEV[failOn]) { io.err(`error: --fail-on must be one of ${Object.keys(SEV).join(', ')}`); return 2; }
  const read = f => { try { return parseLock(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`${f}: ${e.code === 'ENOENT' ? 'file not found' : e.message}`); } };
  try {
    if (pos[0] === 'diff') {
      if (pos.length !== 3) { io.err(usage()); return 2; }
      const d = diff(read(pos[1]), read(pos[2]), { registries: flags.registries });
      if (flags.json) io.out(JSON.stringify({ added: d.added.length, removed: d.removed.length, changed: d.changed.length, notes: d.notes, findings: d.findings }, null, 2));
      else {
        io.out(`+${d.added.length} added, -${d.removed.length} removed, ~${d.changed.length} changed`);
        for (const n of d.notes) io.out(`${n.severity.toUpperCase().padEnd(8)} ${n.package}\n         ${n.detail}`);
        for (const f of d.findings) io.out(fmtFinding(f));
        io.out(summary([...d.notes.map(n => ({ severity: n.severity })), ...d.findings]));
      }
      const all = [...d.notes, ...d.findings];
      return all.some(f => SEV[f.severity] >= SEV[failOn]) ? 1 : 0;
    }
    if (pos.length !== 1) { io.err(usage()); return 2; }
    let pj; if (flags.pj) { try { pj = JSON.parse(fs.readFileSync(flags.pj, 'utf8')); } catch (e) { throw new Error(`${flags.pj}: ${e.message}`); } }
    const res = audit(read(pos[0]), { registries: flags.registries, packageJson: pj, noDup: flags.noDup });
    if (flags.sarif) io.out(JSON.stringify(sarif(res.findings, path.basename(pos[0])), null, 2));
    else if (flags.json) io.out(JSON.stringify(res, null, 2));
    else {
      io.out(`scanned ${res.total} packages in ${pos[0]}`);
      for (const f of res.findings) io.out(fmtFinding(f));
      io.out(summary(res.findings));
    }
    return res.findings.some(f => SEV[f.severity] >= SEV[failOn]) ? 1 : 0;
  } catch (e) { io.err('error: ' + e.message); return 2; }
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { audit, diff, flatten, parseLock, parseYarnLock, main, editDistanceLeq1, RULES };
