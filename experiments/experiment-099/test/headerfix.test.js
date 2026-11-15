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

// ---------- 1.1 ----------
test('1.1: --server php renders PHP code (1.0 printed plain text)', () => {
  const out = H.renderFixes([{ header: 'X-Content-Type-Options', value: 'nosniff' }, { header: 'X-Powered-By', remove: true }], 'php');
  assert.match(out, /^<\?php/); assert.match(out, /header\('X-Content-Type-Options: nosniff'\);/); assert.match(out, /header_remove\('X-Powered-By'\);/);
});
test('1.1: Netlify output never uses the undocumented "! Header" removal; Cloudflare Pages does', () => {
  const fx2 = [{ header: 'Referrer-Policy', value: 'no-referrer' }, { header: 'Server', remove: true }];
  const n = H.renderFixes(fx2, 'netlify'), c = H.renderFixes(fx2, 'cloudflare');
  assert.ok(!/^\s*!/m.test(n)); assert.match(n, /no documented way to remove/);
  assert.match(c, /^  ! Server$/m);
});
test('1.1: nginx output warns about add_header inheritance in location blocks', () => {
  assert.match(H.renderFixes([{ header: 'X-Frame-Options', value: 'DENY' }], 'nginx'), /add_header_inherit merge/);
});
test('1.1: duplicate HSTS says only the first one counts; duplicate CSP says all are enforced', () => {
  const r = H.analyze('HTTP/2 200\nstrict-transport-security: max-age=31536000\nstrict-transport-security: max-age=0\ncontent-security-policy: default-src \'self\'\ncontent-security-policy: default-src *');
  assert.ok(ids(r).includes('dup_hsts')); assert.ok(ids(r).includes('dup_csp')); assert.ok(!ids(r).includes('dup'));
  assert.ok(!ids(r).includes('hsts_short')); // the FIRST header is graded, as browsers do
});
test('1.1: HSTS preload requirements', () => {
  assert.ok(ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=15768000; preload')).includes('hsts_preload'));
  assert.ok(!ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=63072000; includeSubDomains; preload')).includes('hsts_preload'));
  assert.ok(!ids(H.analyze('HTTP/2 200\nstrict-transport-security: max-age=15768000')).includes('hsts_preload'));
});
test('1.1: X-XSS-Protection 1; mode=block is flagged and fixed to 0; 0 is fine', () => {
  const r = H.analyze('HTTP/2 200\nx-xss-protection: 1; mode=block');
  assert.ok(ids(r).includes('xxss')); assert.ok(r.fixes.some(f => f.header === 'X-XSS-Protection' && f.value === '0'));
  assert.ok(!ids(H.analyze('HTTP/2 200\nx-xss-protection: 0')).includes('xxss'));
});
test('1.1: Expect-CT, Public-Key-Pins and Feature-Policy are reported as obsolete', () => {
  const r = H.analyze('HTTP/2 200\nexpect-ct: max-age=86400, enforce\npublic-key-pins: pin-sha256="x"; max-age=10\nfeature-policy: camera \'none\'');
  assert.strictEqual(r.findings.filter(f => f.id === 'obsolete').length, 2);
  assert.ok(ids(r).includes('feature_policy'));
  assert.ok(r.fixes.some(f => f.header === 'Expect-CT' && f.remove));
});
test('1.1: cookie prefixes __Host- and __Secure- are validated', () => {
  const bad = H.analyze('HTTP/2 200\nset-cookie: __Host-sid=1; Secure; HttpOnly; Path=/app; Domain=example.com; SameSite=Lax\nset-cookie: __Secure-pref=1; SameSite=Lax');
  const pf = bad.findings.filter(f => f.id === 'cookie_prefix');
  assert.strictEqual(pf.length, 2); assert.match(pf.find(f => f.cookie === '__Host-sid').message, /Path=\/.*Domain/);
  const ok = H.analyze('HTTP/2 200\nset-cookie: __Host-sid=1; Secure; HttpOnly; Path=/; SameSite=Lax');
  assert.ok(!ids(ok).includes('cookie_prefix'));
});
test('1.1: Spanish messages for the new rules', () => {
  const r = H.analyze('HTTP/2 200\nx-xss-protection: 1\nset-cookie: __Host-a=1; Path=/', { lang: 'es' });
  assert.match(r.findings.find(f => f.id === 'cookie_prefix').message, /no tiene Secure/);
  assert.match(r.findings.find(f => f.id === 'xxss').message, /obsoleto/);
});
test('1.1: CLI --server php end to end', () => {
  const out = spawnSync(process.execPath, [CLI, '--server', 'php', path.join(__dirname, '..', 'fixtures', 'legacy.txt')], { encoding: 'utf8' });
  assert.strictEqual(out.status, 0); // default --fail-on high: no high findings here
  assert.match(out.stdout, /<\?php/); assert.match(out.stdout, /header_remove\('Feature-Policy'\);/); assert.match(out.stdout, /X-XSS-Protection: 0/);
});
test('1.1: __Http- and __Host-Http- prefixes also require HttpOnly (MDN examples)', () => {
  const r = H.analyze('HTTP/2 200\nset-cookie: __Host-Http-sid=1; Secure; Path=/; SameSite=Lax\nset-cookie: __Http-id=2; Secure; Domain=example.com; SameSite=Lax');
  const pf = r.findings.filter(f => f.id === 'cookie_prefix');
  assert.strictEqual(pf.length, 2); assert.ok(pf.every(f => /HttpOnly/.test(f.message)));
  // MDN's accepted examples, with SameSite added
  const ok = H.analyze('HTTP/2 200\nset-cookie: __Secure-ID=123; Secure; Domain=example.com; SameSite=Lax\nset-cookie: __Host-ID=123; Secure; Path=/; SameSite=Lax\nset-cookie: __Host-Http-ID=123; Secure; HttpOnly; Path=/; SameSite=Lax');
  assert.ok(!ids(ok).includes('cookie_prefix'));
  // MDN's rejected examples
  for (const c of ['__Secure-id=1', '__Host-id=1; Secure', '__Host-id=1; Secure; Path=/; Domain=example.com'])
    assert.ok(ids(H.analyze('HTTP/2 200\nset-cookie: ' + c)).includes('cookie_prefix'), c);
});
