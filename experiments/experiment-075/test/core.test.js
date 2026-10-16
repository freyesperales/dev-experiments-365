'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const CB = require('../src/core.js');
const fx = (n) => fs.readFileSync(path.join(__dirname, '../fixtures', n), 'utf8');
const run = (n, o) => CB.analyze(CB.parseJsonl(fx(n)).entries, o);

test('dedupes one-line-per-content-block usage repeats by message.id', () => {
  assert.equal(run('healthy.jsonl').turns.length, 8);
  assert.equal(run('planted.jsonl').turns.length, 15);
});
test('healthy session has no breaks and a high hit rate', () => {
  const r = run('healthy.jsonl');
  assert.equal(r.breaks.length, 0);
  assert.ok(r.summary.hitRate > 0.85);
  assert.equal(r.summary.wasted, 0);
});
test('planted ground truth: each break found with its cause, and nothing else', () => {
  const r = run('planted.jsonl');
  const got = Object.fromEntries(r.breaks.map(b => [b.turn, b.primary]));
  assert.deepEqual(got, { 4: 'model-switch', 7: 'ttl-expiry', 9: 'compaction', 12: 'prefix-change', 14: 'unexplained' });
});
test('divergence point equals the cache-read length for partial breaks', () => {
  const b = run('planted.jsonl').breaks.find(x => x.turn === 12);
  assert.equal(b.divergedAt, 5000);
  assert.equal(b.lost, b.expected - 5000);
});
test('waste is positive and equals lost * (write - read) price', () => {
  const r = run('planted.jsonl'), b = r.breaks.find(x => x.turn === 14), p = CB.DEFAULT_PRICES.sonnet;
  assert.ok(Math.abs(b.waste - b.lost * (p.cacheWrite5m - p.cacheRead) / 1e6) < 1e-9);
  assert.ok(r.summary.wasted > 0);
});
test('1h cache writes extend the TTL so a 15-minute gap is not blamed on expiry', () => {
  const mk = (id, t, w1, rd) => JSON.stringify({ type: 'assistant', timestamp: t, message: { id, model: 'claude-sonnet-5-5', usage: { input_tokens: 1, output_tokens: 5, cache_read_input_tokens: rd, cache_creation_input_tokens: w1, cache_creation: { ephemeral_1h_input_tokens: w1, ephemeral_5m_input_tokens: 0 } } } });
  const text = [mk('a', '2026-10-01T10:00:00Z', 20000, 0), mk('b', '2026-10-01T10:15:00Z', 20000, 0)].join('\n');
  const r = CB.analyze(CB.parseJsonl(text).entries);
  assert.equal(r.breaks.length, 1);
  assert.equal(r.breaks[0].primary, 'unexplained');
});
test('sub-agent turns are excluded from the main thread and counted separately', () => {
  const e = CB.parseJsonl(fx('healthy.jsonl')).entries;
  const side = JSON.parse(JSON.stringify(e.find(x => x.type === 'assistant'))); side.isSidechain = true; side.message.id = 'side1';
  const r = CB.analyze([...e, side]);
  assert.equal(r.turns.length, 8); assert.equal(r.sidechain.turns, 1);
});
test('robust to garbage: bad lines, empty input, synthetic and usage-less messages', () => {
  assert.equal(CB.parseJsonl('not json\n{"a":1}\n[1]\n\n').bad, 2);
  assert.equal(CB.analyze([]).summary.turns, 0);
  const r = CB.analyze([{ type: 'assistant', message: { id: 'x', model: '<synthetic>', usage: { input_tokens: 0 } } }, { type: 'assistant', message: { id: 'y' } }]);
  assert.equal(r.turns.length, 0); assert.equal(r.skippedSynthetic, 1);
  const w = CB.analyze([{ type: 'assistant', message: { id: 'z', model: 'm', usage: { input_tokens: -5, cache_read_input_tokens: 'x' } } }]);
  assert.equal(w.turns[0].prompt, 0);
});
test('a single turn never reports a break; shrinking prompts still compare against previous', () => {
  const r = CB.analyze([{ type: 'assistant', message: { id: 'a', model: 'm', usage: { input_tokens: 5, cache_creation_input_tokens: 9000 } } }]);
  assert.equal(r.breaks.length, 0);
});
test('markdown and ascii renderers mention every break', () => {
  const r = run('planted.jsonl');
  const md = CB.toMarkdown(r), art = CB.ascii(r);
  for (const b of r.breaks) assert.ok(md.includes('| ' + b.turn + ' |'));
  assert.equal((art.match(/BREAK/g) || []).length, 5);
});
test('CLI: text, json, md, missing file and empty file exit codes', () => {
  const cli = path.join(__dirname, '../cachebreak.js'), f = path.join(__dirname, '../fixtures/planted.jsonl');
  const sh = (a) => cp.spawnSync('node', [cli, ...a], { encoding: 'utf8' });
  assert.equal(sh([f]).status, 0); assert.match(sh([f]).stdout, /BREAK at turn 4/);
  assert.equal(JSON.parse(sh([f, '--json']).stdout).summary.breaks, 5);
  assert.match(sh([f, '--md']).stdout, /# CacheBreak report/);
  assert.equal(sh(['/nonexistent.jsonl']).status, 2);
  const empty = path.join(require('os').tmpdir(), 'cb-empty.jsonl'); fs.writeFileSync(empty, '{}\n');
  assert.equal(sh([empty]).status, 3);
});
test('built index.html is self-contained and in sync with core.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8').slice(0, 200)));
  assert.ok(!/<script[^>]+src=/.test(html) && !/https?:\/\/[^"' )]+\.(js|css)/.test(html));
});
