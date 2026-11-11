'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const H = require('../headerfix.js');
const fx = n => fs.readFileSync(path.join(__dirname, '..', 'fixtures', n), 'utf8');
const ids = r => r.findings.map(f => f.id);
const CLI = path.join(__dirname, '..', 'headerfix.js');

test('parses curl -I output, status and lowercase names', () => {
  const p = H.parseHeaders(fx('bad.txt'));
  assert.strictEqual(p.status, 200);
  assert.ok(p.headers.some(h => h.name === 'x-powered-by'));
});
test('only the last response of a redirect chain is analysed', () => {
  const p = H.parseHeaders(fx('redirect.txt'));
  assert.strictEqual(p.status, 200); assert.strictEqual(p.redirectHops, 1);
  assert.ok(!p.headers.some(h => h.name.toLowerCase() === 'location'));
});
test('good fixture is A+ with no findings', () => {
  const r = H.analyze(fx('good.txt'));
  assert.strictEqual(r.grade, 'A+'); assert.deepStrictEqual(r.findings, []); assert.deepStrictEqual(r.fixes, []);
});
test('bad fixture flags the expected problems', () => {
  const r = H.analyze(fx('bad.txt'));
  for (const id of ['hsts_missing', 'csp_unsafe_inline', 'csp_unsafe_eval', 'csp_wild', 'cors_cred', 'xfo_missing', 'xcto_missing', 'cookie_secure', 'cookie_httponly', 'leak'])
    assert.ok(ids(r).includes(id), id);
  assert.strictEqual(r.grade, 'F');
});
test('empty input is reported, not graded', () => {
  const r = H.analyze('hello world');
  assert.strictEqual(r.ok, false); assert.strictEqual(r.findings[0].id, 'no_headers');
});
test('HSTS: short max-age, zero max-age, garbage', () => {
  assert.ok(ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=300')).includes('hsts_short'));
  assert.ok(ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=0')).includes('hsts_short'));
  assert.ok(ids(H.analyze('HTTP/2 200\nstrict-transport-security: includeSubDomains')).includes('hsts_bad'));
  assert.ok(!ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=31536000')).includes('hsts_short'));
});
test('--http mode skips HSTS and Secure cookie findings and says move to HTTPS', () => {
  const r = H.analyze('HTTP/1.1 200\nset-cookie: a=b', { https: false });
  assert.ok(!ids(r).includes('hsts_missing')); assert.ok(!ids(r).includes('cookie_secure')); assert.ok(ids(r).includes('http_note'));
});
test('CSP nonce/hash with unsafe-inline is not flagged (unsafe-inline ignored by browsers)', () => {
  const r = H.analyze("HTTP/2 200\ncontent-security-policy: default-src 'self'; script-src 'nonce-abc' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  assert.ok(!ids(r).includes('csp_unsafe_inline'));
});
test('CSP: report-only only is medium and not counted as protection', () => {
  const r = H.analyze("HTTP/2 200\ncontent-security-policy-report-only: default-src 'self'");
  assert.ok(ids(r).includes('csp_ro_only')); assert.ok(!ids(r).includes('csp_missing'));
});
test('CSP: frame-ancestors satisfies clickjacking protection', () => {
  const r = H.analyze("HTTP/2 200\ncontent-security-policy: default-src 'self'; frame-ancestors 'none'");
  assert.ok(!ids(r).includes('xfo_missing'));
});
test('X-Frame-Options ALLOW-FROM is rejected as obsolete', () => {
  assert.ok(ids(H.analyze('HTTP/2 200\nx-frame-options: ALLOW-FROM https://a.test')).includes('xfo_bad'));
});
test('cookies: SameSite=None without Secure; hardened cookie is clean', () => {
  const r = H.analyze('HTTP/2 200\nset-cookie: x=1; SameSite=None');
  assert.ok(ids(r).includes('cookie_none_insecure'));
  const ok = H.analyze('HTTP/2 200\nset-cookie: sid=1; Secure; HttpOnly; SameSite=Strict');
  assert.ok(!ids(ok).some(i => i.startsWith('cookie_')));
});
test('x-powered-by without a version is only info; with a version is low', () => {
  const a = H.analyze('HTTP/2 200\nx-powered-by: Express').findings.find(f => f.id === 'leak');
  assert.strictEqual(a.severity, 'info');
  const b = H.analyze('HTTP/2 200\nserver: Apache/2.4.41').findings.find(f => f.id === 'leak');
  assert.strictEqual(b.severity, 'low');
});
test('Spanish messages', () => {
  const r = H.analyze(fx('bad.txt'), { lang: 'es' });
  assert.ok(r.findings.some(f => /Falta Strict-Transport-Security/.test(f.message)));
});
test('fix renderers emit valid-looking blocks for every server', () => {
  const r = H.analyze('HTTP/2 200\nserver: nginx/1.2.3');
  for (const s of H.SERVERS) assert.ok(H.renderFixes(r.fixes, s).length > 10, s);
  assert.match(H.renderFixes(r.fixes, 'nginx'), /add_header X-Content-Type-Options "nosniff" always;/);
  assert.match(H.renderFixes(r.fixes, 'apache'), /Header always set X-Content-Type-Options "nosniff"/);
  assert.match(H.renderFixes(r.fixes, 'netlify'), /^\/\*\n/m);
  assert.match(H.renderFixes(r.fixes, 'caddy'), /header \{/);
});
test('fix values containing quotes are escaped for nginx', () => {
  const out = H.renderFixes([{ header: 'X-Test', value: 'a"b' }], 'nginx');
  assert.match(out, /a\\"b/);
});
test('generated fixes, once applied, raise the grade (round trip)', () => {
  const r = H.analyze(fx('bad.txt'));
  const applied = 'HTTP/2 200\n' + r.fixes.filter(f => !f.remove).map(f => `${f.header}: ${f.value}`).join('\n');
  const r2 = H.analyze(applied);
  assert.ok(r2.score > r.score);
  assert.ok(!ids(r2).includes('hsts_missing') && !ids(r2).includes('xcto_missing'));
});
test('CLI: stdin, exit codes and JSON', () => {
  const bad = spawnSync('node', [CLI, '--json'], { input: fx('bad.txt'), encoding: 'utf8' });
  assert.strictEqual(bad.status, 1); assert.strictEqual(JSON.parse(bad.stdout).grade, 'F');
  const good = spawnSync('node', [CLI], { input: fx('good.txt'), encoding: 'utf8' });
  assert.strictEqual(good.status, 0);
  assert.strictEqual(spawnSync('node', [CLI, '--fail-on', 'never'], { input: fx('bad.txt') }).status, 0);
  assert.strictEqual(spawnSync('node', [CLI, '--server', 'iis'], { input: '' }).status, 2);
  assert.strictEqual(spawnSync('node', [CLI, '/nonexistent/file']).status, 2);
  assert.strictEqual(spawnSync('node', [CLI], { input: 'nothing' }).status, 2);
});
test('index.html loads headerfix.js and has no external requests', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<script src="headerfix\.js"><\/script>/);
  assert.ok(!/(src|href)=["']https?:\/\//.test(html));
});
