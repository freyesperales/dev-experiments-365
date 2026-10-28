'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { parseLog, collect, render, hotspots, busFactorRisks } = require('../lib.js');

function sh(cwd, ...a) { return execFileSync('git', a, { cwd, encoding: 'utf8' }); }
function mkRepo() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'churnmap-'));
  sh(d, 'init', '-q', '-b', 'main');
  sh(d, 'config', 'user.email', 'a@x.io'); sh(d, 'config', 'user.name', 'Ann');
  return d;
}
function commit(d, files, author = 'Ann') {
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); }
  sh(d, 'add', '-A');
  execFileSync('git', ['-c', `user.name=${author}`, '-c', `user.email=${author}@x.io`, 'commit', '-q', '-m', 'c'], { cwd: d });
}

test('parseLog aggregates commits, lines, authors, binary files', () => {
  const log = '@@1000|Ann\n3\t1\tsrc/a.js\n-\t-\timg.bin\n\n@@2000|Bob\n5\t0\tsrc/a.js\n';
  const { files, commits } = parseLog(log);
  assert.strictEqual(commits, 2);
  const a = files.get('src/a.js');
  assert.deepStrictEqual([a.commits, a.added, a.deleted, a.authors.size, a.last, a.first], [2, 8, 1, 2, 2000, 1000]);
  assert.strictEqual(files.get('img.bin').added, 0);
});

test('parseLog handles filenames with tabs-free odd chars and empty input', () => {
  assert.strictEqual(parseLog('').commits, 0);
  assert.ok(parseLog('@@1|A\n1\t1\tdir with space/f.txt\n').files.has('dir with space/f.txt'));
});

test('collect on a real repo: stats, deleted files excluded, lockfiles ignored', () => {
  const d = mkRepo();
  commit(d, { 'src/a.js': 'a\nb\nc\n', 'src/b.js': 'x\n', 'package-lock.json': '{}\n' });
  commit(d, { 'src/a.js': 'a\nb\nc\nd\n' }, 'Bob');
  fs.rmSync(path.join(d, 'src/b.js')); commit(d, {});
  const data = collect(d);
  const paths = data.files.map((f) => f.p).sort();
  assert.deepStrictEqual(paths, ['src/a.js']);
  const a = data.files[0];
  assert.strictEqual(a.c, 2); assert.strictEqual(a.au, 2); assert.strictEqual(a.loc, 4);
  assert.strictEqual(collect(d, { noIgnore: true }).files.length, 2);
});

test('hotspots rank churn x size; busFactorRisks finds single-owner churn', () => {
  const d = mkRepo();
  commit(d, { 'big.js': 'l\n'.repeat(200), 'small.js': 'x\n' });
  for (let i = 0; i < 6; i++) commit(d, { 'big.js': 'l\n'.repeat(200 + i + 1) });
  commit(d, { 'small.js': 'y\n' }, 'Bob');
  const data = collect(d);
  assert.strictEqual(hotspots(data)[0].p, 'big.js');
  assert.deepStrictEqual(busFactorRisks(data).map((f) => f.p), ['big.js']);
});

test('--max limits history; empty repo and non-repo give clear errors', () => {
  const d = mkRepo();
  assert.throws(() => collect(d), /no commits/);
  commit(d, { 'a.txt': '1\n' }); commit(d, { 'a.txt': '2\n' });
  assert.strictEqual(collect(d, { max: 1 }).files[0].c, 1);
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
  assert.throws(() => collect(plain), /not a git repository/);
});

test('render embeds data safely (no </script> breakout) and CLI works end to end', () => {
  const d = mkRepo();
  commit(d, { 'we</script>ird.js': 'a\n', 'ok.js': 'b\n' });
  const html = render(collect(d));
  assert.ok(!html.includes('we</script>ird'));
  assert.ok(html.includes('we\\u003c/script>ird'));
  assert.ok(!html.includes('/*__DATA__*/'));
  const out = path.join(d, 'o.html');
  const r = spawnSync('node', [path.join(__dirname, '..', 'cli.js'), d, '-o', out], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(out));
  assert.match(r.stdout, /Top hotspots/);
  const bad = spawnSync('node', [path.join(__dirname, '..', 'cli.js'), '--max', 'x'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 2);
});

test('generated HTML script parses as JavaScript', () => {
  const d = mkRepo(); commit(d, { 'a.js': 'x\n' });
  const html = render(collect(d));
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(js));
});
