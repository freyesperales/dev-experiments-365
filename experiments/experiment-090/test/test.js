'use strict';
const assert = require('assert');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const b = require('../blindspot.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const st = v => b.classify(v).status;

t('15.x below fix is vulnerable', () => { assert.equal(st('15.5.23'), 'vulnerable'); assert.equal(st('13.4.0'), 'vulnerable'); assert.equal(st('10.0.0'), 'vulnerable'); });
t('15.5.24 and later 15.x are ok', () => { assert.equal(st('15.5.24'), 'ok'); assert.equal(st('15.6.0'), 'ok'); });
t('16.x boundary', () => { assert.equal(st('16.0.0'), 'vulnerable'); assert.equal(st('16.3.2'), 'vulnerable'); assert.equal(st('16.3.3'), 'ok'); assert.equal(st('16.4.1'), 'ok'); assert.equal(st('17.0.0'), 'ok'); });
t('prereleases sort below release', () => { assert.equal(st('15.5.24-canary.3'), 'vulnerable'); assert.equal(st('16.3.3-canary.1'), 'vulnerable'); });
t('below 10 and garbage are unknown, not ok', () => { assert.equal(st('9.5.5'), 'unknown'); assert.equal(st('latest'), 'unknown'); });
t('package-lock v3, v1 parsing', () => {
  assert.equal(b.fromPackageLock('{"packages":{"node_modules/next":{"version":"14.0.0"},"node_modules/a/node_modules/next":{"version":"15.5.24"}}}').length, 2);
  assert.equal(b.fromPackageLock('{"dependencies":{"next":{"version":"13.0.0"}}}')[0].version, '13.0.0');
});
t('yarn classic + berry parsing', () => {
  assert.equal(b.fromYarnLock('next@^14.0.0, next@^14.1.0:\n  version "14.2.1"\n  resolved "x"\n\nreact@^18:\n  version "18.0.0"\n')[0].version, '14.2.1');
  assert.equal(b.fromYarnLock('"next@npm:^15.0.0":\n  version: 15.5.10\n')[0].version, '15.5.10');
});
t('pnpm parsing (v6 and v9 keys)', () => {
  const v = b.fromPnpmLock("packages:\n  /next@15.5.2(react@18.2.0):\n    x: 1\n  next@16.3.3(react-dom@19.0.0)(react@19.0.0):\n    y: 1\n  /nextra@3.0.0:\n    z: 1\n").map(x => x.version);
  assert.deepEqual(v, ['15.5.2', '16.3.3']);
});
t('scan: vulnerable fixture flagged with hint', () => {
  const r = b.scan(path.join(__dirname, '../fixtures/vuln'));
  assert.ok(r.vulnerable); assert.ok(r.hints.length === 1);
});
t('scan: fixed fixture clean', () => assert.ok(!b.scan(path.join(__dirname, '../fixtures/fixed')).vulnerable));
t('CLI exit codes', () => {
  const run = d => spawnSync('node', [path.join(__dirname, '../blindspot.js'), d]).status;
  assert.equal(run(path.join(__dirname, '../fixtures/vuln')), 1);
  assert.equal(run(path.join(__dirname, '../fixtures/fixed')), 0);
  assert.equal(run('/nonexistent-dir'), 2);
});
t('empty dir is not reported as clean', () => {
  const r = b.render(b.scan(require('os').tmpdir() + '/__nope__' === '' ? '' : path.join(__dirname)));
  assert.ok(/nothing to assess/.test(r));
});
console.log(`${n} tests passed`);
