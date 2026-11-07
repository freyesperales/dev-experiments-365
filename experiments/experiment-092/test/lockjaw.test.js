'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const L = require('../lockjaw.js');
const fx = f => path.join(__dirname, '..', 'fixtures', f);
const load = f => L.parseLock(fs.readFileSync(fx(f), 'utf8'));
const ids = (r, pkg) => r.findings.filter(f => !pkg || (f.package || '').startsWith(pkg + '@')).map(f => f.id);

test('clean lockfile has zero findings', () => assert.deepStrictEqual(L.audit(load('clean-lock.json')).findings, []));
test('flags unexpected registry (LJ001)', () => assert.ok(ids(L.audit(load('suspicious-lock.json')), 'internal-utils').includes('LJ001')));
test('--registry allowlist silences LJ001', () => assert.ok(!ids(L.audit(load('suspicious-lock.json'), { registries: ['packages.evil-mirror.example'] }), 'internal-utils').includes('LJ001')));
test('missing integrity (LJ002)', () => assert.ok(ids(L.audit(load('suspicious-lock.json')), 'left-pad').includes('LJ002')));
test('http (LJ003) and sha1 (LJ005)', () => { const i = ids(L.audit(load('suspicious-lock.json')), 'oldlib'); assert.ok(i.includes('LJ003') && i.includes('LJ005')); });
test('unpinned git (LJ004) but pinned git is fine', () => { const r = L.audit(load('suspicious-lock.json')); assert.ok(ids(r, 'gitdep').includes('LJ004')); assert.ok(!ids(r, 'pinned-git').includes('LJ004')); });
test('tarball name mismatch (LJ006)', () => assert.ok(ids(L.audit(load('suspicious-lock.json')), 'swapped').includes('LJ006')));
test('install script (LJ007)', () => assert.ok(ids(L.audit(load('suspicious-lock.json')), 'expresss').includes('LJ007')));
test('typosquat (LJ008) only for near-misses, not exact', () => { const r = L.audit(load('suspicious-lock.json')); assert.ok(ids(r, 'expresss').includes('LJ008')); assert.ok(!ids(r, 'lodash').includes('LJ008')); });
test('link dependency (LJ009)', () => assert.ok(ids(L.audit(load('suspicious-lock.json')), 'local-thing').includes('LJ009')));
test('package.json drift (LJ010)', () => {
  const r = L.audit(load('suspicious-lock.json'), { packageJson: JSON.parse(fs.readFileSync(fx('package.json'), 'utf8')) });
  const d = r.findings.filter(f => f.id === 'LJ010').map(f => f.package).sort();
  assert.deepStrictEqual(d, ['lodash', 'missing-dep']);
});
test('v1 lockfile with nested deps is flattened', () => { const r = L.audit(load('v1-lock.json')); assert.strictEqual(r.total, 2); assert.ok(ids(r).includes('LJ003')); });
test('editDistanceLeq1', () => {
  assert.ok(L.editDistanceLeq1('expresss', 'express')); assert.ok(L.editDistanceLeq1('lodahs', 'lodash')); assert.ok(L.editDistanceLeq1('reakt', 'react'));
  assert.ok(!L.editDistanceLeq1('react', 'react')); assert.ok(!L.editDistanceLeq1('abc', 'xyz'));
});
test('diff: same-version integrity change is critical', () => {
  const d = L.diff(load('old-lock.json'), load('new-lock.json'));
  assert.ok(d.notes.some(n => n.severity === 'critical' && n.package === 'a@1.0.0'));
  assert.strictEqual(d.added.length, 1); assert.strictEqual(d.removed.length, 1); assert.strictEqual(d.changed.length, 2);
  assert.ok(d.notes.some(n => /gained an install script/.test(n.detail)));
  assert.ok(d.findings.some(f => f.id === 'LJ001' && f.package.startsWith('newpkg')));
});
test('diff ignores pre-existing findings', () => { const l = load('suspicious-lock.json'); const d = L.diff(l, l); assert.deepStrictEqual(d.findings, []); assert.deepStrictEqual(d.notes, []); });
function run(args) { let out = '', err = ''; const code = L.main(args, { out: s => out += s + '\n', err: s => err += s + '\n' }); return { code, out, err }; }
test('CLI exit codes', () => {
  assert.strictEqual(run([fx('clean-lock.json')]).code, 0);
  assert.strictEqual(run([fx('suspicious-lock.json')]).code, 1);
  assert.strictEqual(run([fx('suspicious-lock.json'), '--fail-on', 'critical']).code, 0);
  assert.strictEqual(run(['diff', fx('old-lock.json'), fx('new-lock.json'), '--fail-on', 'critical']).code, 1);
  assert.strictEqual(run([fx('nope.json')]).code, 2);
  assert.match(run([fx('nope.json')]).err, /file not found/);
  assert.strictEqual(run([fx('package.json')]).code, 2);
  assert.strictEqual(run([fx('clean-lock.json'), '--fail-on', 'bogus']).code, 2);
});
test('SARIF output is valid JSON with results', () => { const j = JSON.parse(run([fx('suspicious-lock.json'), '--sarif']).out); assert.strictEqual(j.version, '2.1.0'); assert.ok(j.runs[0].results.length > 5); });

// --- 1.1: Yarn Classic (v1) support ---
const yload = f => L.parseLock(fs.readFileSync(fx(f), 'utf8'));
test('yarn: clean yarn.lock has zero findings and counts entries', () => { const r = L.audit(yload('yarn-clean.lock')); assert.deepStrictEqual(r.findings, []); assert.strictEqual(r.total, 2); });
test('yarn: scoped names with multiple specs parse', () => { const p = L.flatten(yload('yarn-clean.lock')).find(x => x.name === '@scope/util'); assert.strictEqual(p.version, '1.2.0'); assert.deepStrictEqual(p.specs, ['@scope/util@^1.0.0', '@scope/util@^1.1.0']); });
test('yarn: unexpected registry, http, name swap, unpinned git, typosquat', () => {
  const r = L.audit(yload('yarn-suspicious.lock'));
  assert.ok(ids(r, 'evil-mirror-dep').includes('LJ001'));
  assert.ok(ids(r, 'plain-http').includes('LJ003'));
  assert.ok(ids(r, 'swapped').includes('LJ006'));
  assert.ok(ids(r, 'gitdep').includes('LJ004'));
  assert.ok(!ids(r, 'pinned-git').includes('LJ004'));
  assert.ok(ids(r, 'expresss').includes('LJ008'));
});
test('yarn: legacy sha1-only entry is weak hash (LJ005), not "missing integrity"', () => { const i = ids(L.audit(yload('yarn-suspicious.lock')), 'oldyarn'); assert.ok(i.includes('LJ005')); assert.ok(!i.includes('LJ002')); });
test('yarn: package.json drift is spec-based (LJ010)', () => {
  const pj = JSON.parse(fs.readFileSync(fx('yarn-package.json'), 'utf8'));
  const d = L.audit(yload('yarn-clean.lock'), { packageJson: pj }).findings.filter(f => f.id === 'LJ010').map(f => f.package).sort();
  assert.deepStrictEqual(d, ['left-out', 'lodash-wrong']);
});
test('yarn: Yarn Berry lockfile gives a clear error, exit 2', () => { const r = run([fx('yarn-berry.lock')]); assert.strictEqual(r.code, 2); assert.match(r.err, /Yarn Berry/); });
test('yarn: garbage text is rejected', () => { assert.throws(() => L.parseLock('hello world\n'), /malformed yarn.lock/); assert.throws(() => L.parseLock('# only a comment\n'), /no entries/); });
test('yarn: diff catches same-version integrity change and new evil host', () => {
  const d = L.diff(yload('yarn-old.lock'), yload('yarn-new.lock'));
  assert.ok(d.notes.some(n => n.severity === 'critical' && n.package === 'a@1.0.0'));
  assert.ok(d.findings.some(f => f.id === 'LJ001' && f.package.startsWith('fresh@')));
});
test('yarn: CLI exit codes + --no-dup accepted', () => {
  assert.strictEqual(run([fx('yarn-clean.lock')]).code, 0);
  assert.strictEqual(run([fx('yarn-suspicious.lock')]).code, 1);
  assert.strictEqual(run([fx('yarn-clean.lock'), '--no-dup']).code, 0);
});
test('--no-dup suppresses LJ011', () => {
  const packages = {}; for (const v of ['1.0.0', '2.0.0', '3.0.0', '4.0.0']) packages[`node_modules/x${v}/node_modules/dupe`] = { version: v, resolved: `https://registry.npmjs.org/dupe/-/dupe-${v}.tgz`, integrity: 'sha512-AA==' };
  const lock = { lockfileVersion: 3, packages };
  assert.ok(L.audit(lock).findings.some(f => f.id === 'LJ011'));
  assert.ok(!L.audit(lock, { noDup: true }).findings.some(f => f.id === 'LJ011'));
});
