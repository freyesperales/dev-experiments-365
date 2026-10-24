const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const H = require('../src/core.js');
const S = f => fs.readFileSync(path.join(__dirname, '../samples', f), 'utf8');
const base = () => H.parseHar(S('baseline.har')), rel = () => H.parseHar(S('release.har'));
const CLI = path.join(__dirname, '../cli.js');
const run = (...a) => cp.spawnSync('node', [CLI, ...a], { encoding: 'utf8' });

test('parseHar rejects garbage with clear messages', () => {
  assert.throws(() => H.parseHar('nope'), /Not valid JSON/);
  assert.throws(() => H.parseHar('{"foo":1}'), /missing top-level "log"/);
  assert.throws(() => H.parseHar('{"log":{"entries":5}}'), /not an array/);
  assert.equal(H.parseHar('﻿{"log":{"entries":[]}}').entries.length, 0);
});
test('parseHar normalizes entries and tolerates missing fields', () => {
  const h = H.parseHar(JSON.stringify({ log: { entries: [{}, { startedDateTime: 'bad', request: { url: 'not a url' }, response: { status: 0 } }] } }));
  assert.equal(h.entries.length, 2); assert.equal(h.entries[1].failed, true); assert.ok(h.entries[1].error);
});
test('sample parses: counts, types, relative start, phases', () => {
  const h = base(); assert.equal(h.entries.length, 11);
  assert.equal(h.entries[0].start, 0); assert.equal(h.entries[0].type, 'html');
  assert.equal(h.entries[0].host, 'shop.example.com');
  assert.equal(h.entries[0].phases.ssl, 30); assert.equal(h.entries[0].phases.connect, 10, 'connect excludes ssl');
  assert.equal(h.entries.find(e => e.url.includes('app.js')).type, 'js');
});
test('phases with -1 become 0 and time falls back to the sum', () => {
  const h = H.parseHar(JSON.stringify({ log: { entries: [{ startedDateTime: '2026-01-01T00:00:00Z', request: { url: 'https://a.test/' }, response: { status: 200 }, timings: { dns: -1, wait: 10, receive: 5 } }] } }));
  assert.equal(h.entries[0].time, 15); assert.equal(h.entries[0].phases.dns, 0);
});
test('filter: fields, ranges, negation, quotes', () => {
  const e = base().entries, n = q => H.filter(e, q).length;
  assert.equal(n(''), 11); assert.equal(n('status:404'), 1); assert.equal(n('status:2xx'), 10);
  assert.equal(n('method:post'), 1); assert.equal(n('type:json'), 6); assert.equal(n('-type:json'), 5);
  assert.equal(n('host:analytics'), 1); assert.equal(n('slower:300'), 1); assert.equal(n('larger:100k'), 1);
  assert.equal(n('status:failed'), 1); assert.equal(n('header:authorization'), 4); assert.equal(n('body:hunter2'), 1);
  assert.equal(n('api cart'), 1); assert.equal(n('"api/me"'), 1); assert.equal(n('post'), 1);
});
test('summarize', () => {
  const s = H.summarize(rel().entries);
  assert.equal(s.count, 11); assert.equal(s.failed, 2);
  assert.equal(s.slowest[0].url, 'https://shop.example.com/api/checkout');
  assert.equal(s.duplicates.length, 1); assert.equal(s.duplicates[0].count, 2);
});
test('toCurl quotes safely and skips pseudo headers', () => {
  const e = { method: 'POST', url: "https://a.test/x?q=it's", reqHeaders: [{ name: ':authority', value: 'a.test' }, { name: 'x-a', value: "o'brien" }, { name: 'accept-encoding', value: 'gzip' }, { name: 'content-length', value: '3' }], reqBody: { text: '{"a":"b\'c"}' } };
  const c = H.toCurl(e);
  assert.ok(c.includes(`'https://a.test/x?q=it'\\''s'`)); assert.ok(!c.includes(':authority')); assert.ok(!c.includes('content-length'));
  assert.ok(c.includes('--compressed')); assert.ok(c.includes('-X POST')); assert.ok(c.includes(`--data-raw '{"a":"b'\\''c"}'`));
});
test('redact masks headers, cookies, query keys, body fields, JWTs and leaves structure', () => {
  const { har, counts } = H.redact(JSON.parse(S('release.har')), {});
  const t = JSON.stringify(har);
  for (const secret of ['hunter2', '4242424242424242', 'tok_live_abc123', 'pk_live_51Habcdef0123456789', 'eyJhbGciOiJIUzI1NiIs', '9f8a7b6c5d4e3f']) assert.ok(!t.includes(secret), secret + ' leaked');
  assert.ok(t.includes('ana@example.com'), 'emails kept unless asked'); // emails inside a JWT payload are gone; plain ones stay
  assert.ok(counts.total > 15); assert.deepEqual(H.scan(t), []);
  assert.equal(H.parseHar(t).entries.length, 11, 'still a valid HAR');
});
test('redact --emails masks emails; bodies:false drops payloads', () => {
  const r = H.redact(JSON.parse(S('baseline.har')), { emails: true, bodies: false });
  assert.ok(!JSON.stringify(r.har).includes('ana@example.com')); assert.ok(r.counts.bodiesDropped > 0);
});
test('redact does not mutate its input and handles form bodies', () => {
  const har = { log: { entries: [{ request: { url: 'https://u:p@a.test/?a=1&token=zzz', headers: [{ name: 'Authorization', value: 'x' }], postData: { mimeType: 'application/x-www-form-urlencoded', text: 'user=a&password=secret1&n=2' } }, response: { content: { mimeType: 'image/png', encoding: 'base64', text: 'AAAA' } } }] } };
  const copy = JSON.stringify(har), r = H.redact(har);
  assert.equal(JSON.stringify(har), copy);
  const e = r.har.log.entries[0];
  assert.ok(!e.request.url.includes('zzz') && !e.request.url.includes('u:p')); assert.ok(!e.request.postData.text.includes('secret1'));
  assert.ok(e.request.postData.text.includes('user=a')); assert.equal(e.response.content.text, undefined);
});
test('diff finds regression, ignores cache-busters, flags new failures', () => {
  const d = H.diff(base().entries, rel().entries);
  assert.equal(d.removed.length, 1); assert.ok(d.removed[0].url.endsWith('/recommendations'));
  assert.equal(d.added.length, 1); assert.ok(d.added[0].url.includes('shipping-options'));
  const by = u => d.changed.find(c => c.b.url.includes(u));
  assert.ok(by('/api/checkout').why.some(w => w.kind === 'status' && w.bad));
  assert.ok(by('/api/me').why.some(w => w.kind === 'slower'));
  assert.ok(by('app.js').why.some(w => w.kind === 'larger'));
  assert.ok(!by('/api/cart'), 'cart matched despite _= cache buster and unchanged'); assert.ok(d.same.some(c => c.b.url.includes('/api/cart')));
  assert.ok(d.regressions >= 3);
});
test('diff of a file with itself is empty', () => {
  const d = H.diff(base().entries, base().entries);
  assert.equal(d.changed.length + d.added.length + d.removed.length, 0); assert.equal(d.regressions, 0);
});
test('cli: summary, ls, curl, diff exit code, errors', () => {
  const b = path.join(__dirname, '../samples/baseline.har'), r = path.join(__dirname, '../samples/release.har');
  let o = run('summary', b); assert.equal(o.status, 0); assert.match(o.stdout, /11 requests/);
  o = run('ls', r, 'status:5xx'); assert.equal(o.status, 0); assert.match(o.stdout, /api\/checkout/);
  o = run('curl', r, 'method:post'); assert.match(o.stdout, /^curl 'https:\/\/shop\.example\.com\/api\/checkout'/);
  o = run('curl', r, 'nothing-matches-this'); assert.equal(o.status, 1);
  o = run('diff', b, r); assert.equal(o.status, 0); assert.match(o.stdout, /regressions/);
  o = run('diff', b, r, '--fail-on-regression'); assert.equal(o.status, 1);
  o = run('diff', b, b, '--fail-on-regression'); assert.equal(o.status, 0);
  o = run('summary', '/nonexistent.har'); assert.equal(o.status, 2); assert.match(o.stderr, /cannot read/);
  o = run('bogus'); assert.equal(o.status, 2);
});
test('cli: redact writes a clean file', () => {
  const out = path.join(require('os').tmpdir(), 'harbor-test-' + process.pid + '.har');
  const o = run('redact', path.join(__dirname, '../samples/release.har'), '-o', out);
  assert.equal(o.status, 0, o.stderr); const t = fs.readFileSync(out, 'utf8'); fs.unlinkSync(out);
  assert.ok(!t.includes('hunter2')); assert.match(o.stderr, /masked \d+ values/);
});
