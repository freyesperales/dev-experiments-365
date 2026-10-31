'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { audit } = require('../gatehouse.js');
const CLI = path.join(__dirname, '..', 'gatehouse.js');
const rules = (y) => audit(y, 't.yml').map(f => f.rule);

test('GH001 pwn request: pull_request_target + head checkout', () => {
  const y = 'on: pull_request_target\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n';
  assert.ok(rules(y).includes('GH001'));
});
test('GH001 not raised for unprivileged pull_request', () => {
  const y = 'on: pull_request\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n';
  assert.ok(!rules(y).includes('GH001'));
});
test('GH002 flags untrusted expression in multi-line run, ignores env usage', () => {
  const bad = 'on: issues\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo "${{ github.event.issue.title }}"\n';
  assert.ok(rules(bad).includes('GH002'));
  const good = 'on: issues\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - env:\n          T: ${{ github.event.issue.title }}\n        run: |\n          echo "$T"\n';
  assert.ok(!rules(good).includes('GH002'));
});
test('GH002 ignores safe expressions like github.sha', () => {
  const y = 'on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ${{ github.sha }}\n';
  assert.deepStrictEqual(rules(y), []);
});
test('GH003/GH004 pinning: SHA ok, tag flagged, local and digest handled', () => {
  const y = 'on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: foo/bar@v1\n      - uses: actions/checkout@v4\n      - uses: foo/baz@0123456789abcdef0123456789abcdef01234567\n      - uses: ./local\n';
  const r = rules(y);
  assert.deepStrictEqual(r.filter(x => x === 'GH003').length, 1);
  assert.deepStrictEqual(r.filter(x => x === 'GH004').length, 1);
});
test('GH005 missing permissions, satisfied by top-level or job-level', () => {
  const body = 'jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n';
  assert.ok(rules('on: push\n' + body).includes('GH005'));
  assert.ok(!rules('on: push\npermissions:\n  contents: read\n' + body).includes('GH005'));
  assert.ok(!rules('on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n    steps:\n      - run: echo hi\n').includes('GH005'));
});
test('GH006/GH007/GH010 detected', () => {
  const y = 'on: pull_request\npermissions: write-all\njobs:\n  a:\n    runs-on: self-hosted\n    steps:\n      - run: echo ${{ toJSON(secrets) }}\n  b:\n    uses: o/r/.github/workflows/x.yml@0123456789abcdef0123456789abcdef01234567\n    secrets: inherit\n';
  const r = rules(y);
  for (const id of ['GH006', 'GH007', 'GH010']) assert.ok(r.includes(id), id);
});
test('GH008 and GH009', () => {
  const y = 'on: pull_request\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "X=${{ github.head_ref }}" >> "$GITHUB_ENV"\n      - run: curl -fsSL https://x.test/i.sh | sudo bash\n';
  const r = rules(y);
  assert.ok(r.includes('GH008') && r.includes('GH009'));
});
test('GH011 only when artifacts are uploaded', () => {
  const mk = (extra) => 'on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n' + extra;
  assert.ok(rules(mk('      - uses: actions/upload-artifact@11bd71901bbe5b1630ceea73d27597364c9af683\n')).includes('GH011'));
  assert.ok(!rules(mk('')).includes('GH011'));
});
test('inline suppression comment', () => {
  const y = 'on: push\npermissions: {}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      # gatehouse-ignore: GH003\n      - uses: foo/bar@v1\n';
  assert.deepStrictEqual(rules(y), []);
});
test('Windows line endings and on: [list] syntax', () => {
  const y = 'on: [pull_request_target]\r\npermissions: {}\r\njobs:\r\n  a:\r\n    runs-on: ubuntu-latest\r\n    steps:\r\n      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\r\n        with:\r\n          ref: ${{ github.head_ref }}\r\n';
  assert.ok(rules(y).includes('GH001'));
});

test('CLI: vulnerable fixtures fail (exit 1), fixed pass (exit 0)', () => {
  const bad = spawnSync('node', [CLI, path.join(__dirname, '..', 'fixtures', 'vulnerable')], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1); assert.match(bad.stdout, /CRITICAL GH001/);
  const good = spawnSync('node', [CLI, path.join(__dirname, '..', 'fixtures', 'fixed')], { encoding: 'utf8' });
  assert.strictEqual(good.status, 0, good.stdout); assert.match(good.stdout, /no findings/);
});
test('CLI: SARIF + JSON valid, errors exit 2', () => {
  const fx = path.join(__dirname, '..', 'fixtures', 'vulnerable');
  const s = JSON.parse(spawnSync('node', [CLI, fx, '--sarif', '--fail-on', 'never'], { encoding: 'utf8' }).stdout);
  assert.strictEqual(s.version, '2.1.0'); assert.ok(s.runs[0].results.length >= 10);
  const j = JSON.parse(spawnSync('node', [CLI, fx, '--json', '--fail-on', 'never'], { encoding: 'utf8' }).stdout);
  assert.ok(Array.isArray(j) && j[0].severity === 'critical');
  assert.strictEqual(spawnSync('node', [CLI, '/nonexistent/x']).status, 2);
  assert.strictEqual(spawnSync('node', [CLI, fx, '--fail-on', 'bogus']).status, 2);
});
test('every rule has an explanation', () => {
  const { RULES } = require('../gatehouse.js');
  for (const r of Object.values(RULES)) assert.ok(r.why && r.fix && r.title);
});
