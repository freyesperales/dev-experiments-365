'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, createInternalService, FLAGS, isPrivateAddress } = require('../lab/app');
const x = require('../solutions/exploits');

const ALL = ['jwt', 'bola', 'ssrf', 'massassign'];
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${srv.address().port}`)));
async function boot(patched) {
  const internal = createInternalService(); const iurl = await listen(internal);
  const app = createApp({ patched }); const base = await listen(app);
  return { base, iurl, close: () => { app.close(); internal.close(); } };
}
const has = (r, flag) => JSON.stringify(r.body).includes(flag);

test('vulnerable lab: all four exploits work', async () => {
  const s = await boot([]);
  try {
    assert.ok(has(await x.jwtNone(s.base), FLAGS.jwt), 'alg=none forged admin');
    assert.ok(has(await x.bola(s.base), FLAGS.bola), 'BOLA read bob invoice');
    assert.ok(has(await x.ssrf(s.base, s.iurl + '/'), FLAGS.ssrf), 'SSRF reached internal service');
    assert.ok(has(await x.massAssign(s.base), FLAGS.massassign), 'mass assignment upgraded plan');
  } finally { s.close(); }
});

test('fixed lab: every exploit is blocked', async () => {
  const s = await boot(ALL);
  try {
    const a = await x.jwtNone(s.base); assert.equal(a.status, 401); assert.ok(!has(a, FLAGS.jwt));
    const b = await x.bola(s.base); assert.equal(b.status, 404); assert.ok(!has(b, FLAGS.bola));
    const c = await x.ssrf(s.base, s.iurl + '/'); assert.ok(c.status >= 400); assert.ok(!has(c, FLAGS.ssrf));
    const c2 = await x.ssrf(s.base, 'http://localhost:' + new URL(s.iurl).port + '/'); assert.ok(!has(c2, FLAGS.ssrf), 'hostname resolving to loopback is blocked too');
    const d = await x.massAssign(s.base); assert.equal(d.status, 402); assert.ok(!has(d, FLAGS.massassign));
  } finally { s.close(); }
});

test('each fix is independent (patching one does not hide the others)', async () => {
  const s = await boot(['jwt']);
  try {
    assert.ok(!has(await x.jwtNone(s.base), FLAGS.jwt));
    assert.ok(has(await x.bola(s.base), FLAGS.bola));
  } finally { s.close(); }
});

test('fixed lab still works for legitimate use', async () => {
  const s = await boot(ALL);
  try {
    const t = await x.login(s.base, 'alice', 'alice-pw');
    assert.equal((await x.call(s.base, 'GET', '/api/invoices/101', { token: t })).status, 200);
    assert.equal((await x.call(s.base, 'GET', '/api/invoices', { token: t })).body.length, 2);
    const p = await x.call(s.base, 'PATCH', '/api/profile', { token: t, body: { displayName: 'Ally' } });
    assert.equal(p.body.displayName, 'Ally');
    assert.equal((await x.call(s.base, 'GET', '/api/me', { token: t })).body.role, 'user');
    const bad = await x.call(s.base, 'GET', '/api/me', { token: t.slice(0, -2) + 'xx' });
    assert.equal(bad.status, 401, 'tampered signature rejected');
    assert.equal((await x.call(s.base, 'GET', '/api/preview?url=ftp://example.com', { token: t })).status, 400);
  } finally { s.close(); }
});

test('isPrivateAddress covers loopback, RFC1918, link-local, CGNAT, v6 and v4-mapped', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])
    assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:4700::1111']) assert.ok(!isPrivateAddress(ip), ip);
});
