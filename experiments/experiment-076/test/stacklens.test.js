'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const { repo } = require('./helpers');
const { analyze, planScript } = require('../lib/analyze');
const { renderText } = require('../lib/render-text');
const { renderHtml } = require('../lib/render-html');

const BIN = path.join(__dirname, '..', 'bin', 'stacklens.js');

function stack() {
  const r = repo();
  r.g('checkout', '-q', '-b', 'feat-a'); r.commit('a1'); r.commit('a2');
  r.g('checkout', '-q', '-b', 'feat-b'); r.commit('b1');
  r.g('checkout', '-q', '-b', 'feat-c'); r.commit('c1'); r.commit('c2');
  return r;
}

test('clean linear stack is reconstructed from ancestry alone', () => {
  const r = stack();
  const rep = analyze(r.dir);
  assert.equal(rep.trunk, 'main');
  assert.equal(rep.nodes['feat-a'].parent, 'main');
  assert.equal(rep.nodes['feat-b'].parent, 'feat-a');
  assert.equal(rep.nodes['feat-c'].parent, 'feat-b');
  assert.deepEqual([rep.nodes['feat-a'].ahead, rep.nodes['feat-b'].ahead, rep.nodes['feat-c'].ahead], [2, 1, 2]);
  assert.equal(rep.plan.length, 0);
  assert.match(renderText(rep), /feat-c.*✓/);
});

test('fan-out: two branches stacked on one parent', () => {
  const r = repo();
  r.g('checkout', '-q', '-b', 'base'); r.commit('x1');
  r.g('checkout', '-q', '-b', 'left'); r.commit('l1');
  r.g('checkout', '-q', 'base'); r.g('checkout', '-q', '-b', 'right'); r.commit('r1');
  const rep = analyze(r.dir);
  assert.deepEqual(rep.nodes.base.children, ['left', 'right']);
  assert.equal(rep.plan.length, 0);
});

test('trunk moving ahead flags the bottom branch and cascades up the stack', () => {
  const r = stack();
  r.g('checkout', '-q', 'main'); r.commit('main-moves');
  const rep = analyze(r.dir);
  assert.deepEqual(rep.plan.map((s) => s.branch), ['feat-a', 'feat-b', 'feat-c']);
  assert.equal(rep.nodes['feat-a'].behind, 1);
  assert.equal(rep.nodes['feat-b'].reason, 'parent "feat-a" will be rebased first');
});

test('amended parent is detected via reflog fork-point and plan restacks the children', () => {
  const r = stack();
  r.g('checkout', '-q', 'feat-a');
  fs.writeFileSync(path.join(r.dir, 'extra.txt'), 'x');
  r.g('add', '-A'); r.g('commit', '-q', '--amend', '-m', 'a2 amended');
  const rep = analyze(r.dir);
  assert.equal(rep.nodes['feat-b'].parent, 'feat-a', 'still attached to its rewritten parent');
  assert.equal(rep.nodes['feat-b'].ownDrift, true);
  assert.deepEqual(rep.plan.map((s) => s.branch), ['feat-b', 'feat-c']);
});

test('running the generated plan really restacks: re-analysis is clean and history is linear', () => {
  const r = stack();
  r.g('checkout', '-q', 'feat-a');
  fs.writeFileSync(path.join(r.dir, 'extra.txt'), 'x');
  r.g('add', '-A'); r.g('commit', '-q', '--amend', '-m', 'a2 amended');
  r.g('checkout', '-q', 'main'); r.commit('main-moves');
  const script = planScript(analyze(r.dir));
  const file = path.join(r.dir, '..', path.basename(r.dir) + '-plan.sh');
  fs.writeFileSync(file, script);
  const out = spawnSync('sh', [file], { cwd: r.dir, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const after = analyze(r.dir);
  assert.equal(after.plan.length, 0, JSON.stringify(after.plan));
  assert.equal(after.nodes['feat-c'].parent, 'feat-b');
  assert.equal(r.g('rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'returns to the starting branch');
  assert.equal(r.g('rev-list', '--merges', '--count', 'feat-c'), '0');
  assert.equal(r.g('rev-list', '--count', 'main..feat-c'), '5');
});

test('merged branches are hidden: fast-forward merge and rebase-merge', () => {
  const r = stack();
  r.g('checkout', '-q', 'main'); r.g('merge', '-q', '--ff-only', 'feat-a');
  const rep = analyze(r.dir);
  assert.deepEqual(rep.merged.map((m) => m.name), ['feat-a']);
  assert.equal(rep.nodes['feat-b'].parent, 'main');
  assert.equal(rep.nodes['feat-b'].ahead, 1 + 0);
  assert.equal(rep.plan.length, 0);

  const q = repo();
  q.g('checkout', '-q', '-b', 'topic'); q.commit('t1');
  q.g('checkout', '-q', 'main'); q.commit('m1');
  q.g('cherry-pick', 'topic');
  const rq = analyze(q.dir);
  assert.match(rq.merged[0].why, /already in trunk/);
});

test('no stack at all and unknown trunk produce clear errors', () => {
  const r = repo();
  assert.equal(Object.keys(analyze(r.dir).nodes).length, 1);
  assert.throws(() => analyze(r.dir, { trunk: 'nope' }), /does not resolve/);
  assert.throws(() => analyze(require('os').tmpdir() + '/definitely-not-a-repo-xyz'), /./);
});

test('CLI: --check exits 1 on drift, 0 when clean; --html writes a self-contained file', () => {
  const r = stack();
  let res = spawnSync('node', [BIN, '-C', r.dir, '--check'], { encoding: 'utf8' });
  assert.equal(res.status, 0); assert.match(res.stdout, /Stack is in order/);
  r.g('checkout', '-q', 'main'); r.commit('moves');
  const html = path.join(r.dir, '..', path.basename(r.dir) + '.html');
  res = spawnSync('node', [BIN, '-C', r.dir, '--check', '--html', html], { encoding: 'utf8' });
  assert.equal(res.status, 1); assert.match(res.stdout, /needs rebase/);
  const doc = fs.readFileSync(html, 'utf8');
  assert.match(doc, /<svg/); assert.match(doc, /git rebase --onto/);
  assert.doesNotMatch(doc, /https?:\/\/(?!www\.w3\.org)/);
  res = spawnSync('node', [BIN, '--bogus'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  res = spawnSync('node', [BIN, '-C', r.dir, '--json'], { encoding: 'utf8' });
  assert.equal(JSON.parse(res.stdout).plan.length, 3);
});

test('branch names with quotes are shell-quoted in the plan and escaped in HTML', () => {
  const r = repo();
  r.g('checkout', '-q', '-b', "it's<b>"); r.commit('q1');
  r.g('checkout', '-q', 'main'); r.commit('m');
  const rep = analyze(r.dir);
  assert.match(planScript(rep), /'it'\\''s<b>'/);
  assert.doesNotMatch(renderHtml(rep), /<b>/);
});
