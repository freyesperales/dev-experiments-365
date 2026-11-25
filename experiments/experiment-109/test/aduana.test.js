'use strict';
// All pages here are invented (example.com / example.net / example.org). Vendor
// addresses are the ones the vendors document; nothing is ever requested.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const A = require('../aduana.js');

const CLI = path.join(__dirname, '..', 'aduana.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
const page = (head, body, origin) => '<!doctype html><html><head><link rel="canonical" href="' + (origin || 'https://www.example.com/') + '">' + (head || '') + '</head><body>' + (body || '') + '</body></html>';
const ids = (res) => res.findings.map((f) => f.id);
const find = (res, id) => res.findings.find((f) => f.id === id);
const shop = () => A.analyze(fs.readFileSync(path.join(FIX, 'shop.html'), 'utf8'));

test('sha256 matches node:crypto, including non-ASCII text', () => {
  for (const s of ['', 'abc', "console.log('hola, señor 👋');", 'x'.repeat(1000)]) {
    assert.strictEqual(A.sha256Base64(s), crypto.createHash('sha256').update(s, 'utf8').digest('base64'));
  }
});

test('tokenizer skips comments and keeps script text whole', () => {
  const tags = A._tokenize('<!-- <script src="https://evil.example.net/x.js"></script> --><script>if (a < b) { x = "</div>"; }</script><img src=/a.png>');
  assert.deepStrictEqual(tags.map((t) => t.name), ['script', 'img']);
  assert.match(tags[0].text, /a < b/);
  assert.strictEqual(tags[1].attrs.src, '/a.png');
});

test('page origin comes from canonical, then og:url, then --origin wins', () => {
  assert.strictEqual(A.analyze(page()).self, 'https://www.example.com');
  assert.strictEqual(A.analyze('<meta property="og:url" content="https://shop.example.org/x">').self, 'https://shop.example.org');
  assert.strictEqual(A.analyze(page(), { origin: 'store.example.net' }).self, 'https://store.example.net');
});

test('mixed content: scripts and srcset are blocked, plain images are upgraded', () => {
  const r = A.analyze(page('<script src="http://cdn.example.net/a.js"></script>', '<img src="http://img.example.org/a.png"><img srcset="http://img.example.org/b.png 2x">'));
  const blocked = find(r, 'mixed-blocked').items.join('\n');
  assert.match(blocked, /cdn\.example\.net\/a\.js/);
  assert.match(blocked, /b\.png/);
  assert.doesNotMatch(blocked, /a\.png/);
  assert.match(find(r, 'mixed-upgraded').items[0], /a\.png/);
  assert.strictEqual(r.verdict, 'fix');
});

test('an http image on a bare IP address is blocked, not upgraded (MDN)', () => {
  const r = A.analyze(page('', '<img src="http://203.0.113.7/logo.png">'));
  assert.ok(ids(r).includes('mixed-blocked'));
  assert.ok(!ids(r).includes('mixed-upgraded'));
});

test('a page served over http gets the Chrome 154 warning instead of mixed content', () => {
  const r = A.analyze(page('', '<img src="http://www.example.com/a.png">', 'http://www.example.com/'));
  assert.ok(ids(r).includes('http-page'));
  assert.ok(!ids(r).includes('mixed-upgraded'));
});

test('http form action is a FIX even on the same site', () => {
  const r = A.analyze(page('', '<form action="http://www.example.com/login"></form>'));
  assert.strictEqual(find(r, 'form-http').level, 'fix');
});

test('http links to your own domain (apex or www) are flagged; other sites are only counted', () => {
  const r = A.analyze(page('', '<a href="http://example.com/a">a</a><a href="http://www.example.com/b">b</a><a href="http://other.example.org/">c</a><a href="https://www.example.com/c">d</a>'));
  const f = find(r, 'own-http-links');
  assert.strictEqual(f.items.length, 2);
  assert.strictEqual(r.counts.otherHttpLinks, 1);
});

test('http canonical or og:url is flagged', () => {
  const r = A.analyze('<link rel="canonical" href="https://www.example.com/"><meta property="og:url" content="http://www.example.com/">');
  assert.ok(ids(r).includes('meta-http'));
});

test('polyfill.io is a FIX and never enters the generated policy', () => {
  const r = A.analyze(page('<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>'));
  assert.strictEqual(find(r, 'dead-host').level, 'fix');
  assert.doesNotMatch(r.policy.value, /polyfill/);
  assert.ok(!ids(r).includes('script-other'));
});

test('SRI: pinned CDN file without integrity, unpinned @latest, integrity without crossorigin, weak algorithm, all good', () => {
  const r = A.analyze(page(
    '<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>' +
    '<script src="https://cdn.jsdelivr.net/npm/lib@latest/x.js"></script>' +
    '<script src="https://unpkg.com/lib"></script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/a/1.2.3/a.js" integrity="sha384-abc"></script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/b/1.2.3/b.js" integrity="md5-abc" crossorigin="anonymous"></script>' +
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/c/1.2.3/c.js" integrity="sha384-abc" crossorigin="anonymous"></script>'));
  assert.match(find(r, 'sri-missing').items.join(), /jquery-3\.7\.1/);
  assert.strictEqual(find(r, 'sri-unpinned').items.length, 2);
  assert.match(find(r, 'sri-nocors').items.join(), /\/a\.js/);
  assert.match(find(r, 'sri-weak').items.join(), /\/b\.js/);
  assert.match(find(r, 'sri-ok').items.join(), /\/c\.js/);
});

test('Integrity-Policy is suggested only when every outside script carries integrity', () => {
  const ok = A.analyze(fs.readFileSync(path.join(FIX, 'clean.html'), 'utf8'));
  assert.ok(ids(ok).includes('integrity-policy'));
  assert.ok(!ids(shop()).includes('integrity-policy'));
});

test('scripts that change by design are grouped by vendor, not asked for integrity', () => {
  const r = A.analyze(page('<script src="https://www.googletagmanager.com/gtag/js?id=G-X1"></script><script src="https://cdn.optimizely.com/js/1.js"></script>'));
  const live = find(r, 'script-live');
  assert.ok(live.items.some((x) => /Optimizely/.test(x)));
  assert.ok(!ids(r).includes('script-other'));
});

test('unknown outside script without integrity is a CHECK', () => {
  const r = A.analyze(page('<script src="https://widgets.example.net/w.js"></script>'));
  assert.strictEqual(find(r, 'script-other').level, 'check');
  assert.strictEqual(r.verdict, 'check');
});

test('inline code: blocks, handlers and javascript: links are counted; JSON-LD is not code', () => {
  const r = A.analyze(page('<script>a()</script><script type="application/ld+json">{"a":1}</script>', '<button onclick="go()">x</button><a href="javascript:openChat()">c</a><a href="javascript:void(0)">n</a>'));
  assert.strictEqual(r.counts.inline, 1);
  assert.strictEqual(r.counts.handlers, 1);
  assert.match(find(r, 'inline').items.join(), /1 javascript:/);
});

test('starter policy: only report-only, needed directives, vendor origins from their guides, object-src none', () => {
  const r = shop();
  const p = r.policy.directives;
  assert.ok(p['script-src'].includes("'unsafe-inline'"));
  assert.ok(p['script-src'].includes('https://www.googletagmanager.com'));
  assert.ok(p['connect-src'].includes('https://*.google-analytics.com'));
  assert.ok(p['script-src'].includes('https://www.google.com/recaptcha/'));
  assert.ok(!p['script-src'].includes('https://www.google.com'), 'vendor path, not the whole google.com origin');
  assert.ok(p['frame-src'].includes('https://hooks.stripe.com'));
  assert.ok(p['font-src'].includes('https://fonts.gstatic.com'));
  assert.ok(p['frame-src'].includes('https://www.youtube-nocookie.com'));
  assert.deepStrictEqual(p['object-src'], ["'none'"]);
  assert.ok(p['img-src'].includes('https://img.example.org'), 'http image written as https in the policy');
});

test('--google-tld adds the country domains Google asks for', () => {
  const r = A.analyze(page('<script src="https://www.googletagmanager.com/gtag/js?id=G-X1"></script>'), { googleTld: 'cl, es' });
  assert.ok(r.policy.directives['connect-src'].includes('https://*.google.cl'));
  assert.ok(r.policy.directives['img-src'].includes('https://*.google.es'));
});

test('GA4 is recognised from gtag config inside inline code too', () => {
  const r = A.analyze(page("<script>gtag('config', 'G-ABC123');</script>"));
  assert.ok(r.vendors.some((v) => v.id === 'ga4'));
});

test('stricter policy uses hashes when only static inline blocks exist, and falls back otherwise', () => {
  const s = '<script>console.log(1)</script>';
  const r = A.analyze(page(s));
  const h = "'sha256-" + crypto.createHash('sha256').update('console.log(1)').digest('base64') + "'";
  assert.ok(r.strictPolicy.directives['script-src'].includes(h));
  assert.ok(!r.strictPolicy.directives['script-src'].includes("'unsafe-inline'"));
  const dyn = A.analyze(page('<script>var d={"_wpnonce":"a1b2c3d4e5"};</script>'));
  assert.ok(dyn.strictPolicy.directives['script-src'].includes("'unsafe-inline'"));
  assert.ok(ids(dyn).includes('inline-dynamic'));
});

test('CSP source matching: wildcards, paths, schemes, self, ports', () => {
  const u = (s) => A._parseUrl(s);
  const self = u('https://www.example.com/');
  assert.ok(A._matchSource('https://*.google-analytics.com', u('https://region1.google-analytics.com/g/collect'), self));
  assert.ok(!A._matchSource('https://*.google-analytics.com', u('https://google-analytics.com/'), self));
  assert.ok(A._matchSource('https://www.google.com/recaptcha/', u('https://www.google.com/recaptcha/api.js'), self));
  assert.ok(!A._matchSource('https://www.google.com/recaptcha/', u('https://www.google.com/maps/x.js'), self));
  assert.ok(A._matchSource('https:', u('https://anything.example.net/'), self));
  assert.ok(A._matchSource("'self'", u('https://www.example.com/a.js'), self));
  assert.ok(!A._matchSource("'self'", u('https://example.com/a.js'), self));
  assert.ok(A._matchSource('cdn.example.net', u('https://cdn.example.net/a.js'), self));
  assert.ok(!A._matchSource('cdn.example.net', u('https://cdn.example.net:8443/a.js'), self));
  assert.ok(A._matchSource('http://cdn.example.net', u('https://cdn.example.net/a.js'), self), 'http source also allows https');
});

test('current CSP: nonce allows, unsafe-inline is ignored next to a nonce, strict-dynamic ignores the host list', () => {
  const pol = A.parseCsp("script-src 'self' 'nonce-abc' 'unsafe-inline' https://www.googletagmanager.com");
  assert.ok(A._allowsInline(pol, 'script-src-elem', 'x()', { nonce: 'abc' }).ok);
  const r = A._allowsInline(pol, 'script-src-elem', 'x()', {});
  assert.ok(!r.ok && r.ignoredInline);
  const sd = A.parseCsp("script-src 'nonce-abc' 'strict-dynamic' https://www.googletagmanager.com");
  assert.ok(!A._allowsUrl(sd, 'script-src-elem', A._parseUrl('https://www.googletagmanager.com/gtm.js'), null, {}).ok);
  assert.ok(A._allowsUrl(sd, 'script-src-elem', A._parseUrl('https://www.googletagmanager.com/gtm.js'), null, { nonce: 'abc' }).ok);
});

test('current CSP from <meta> lists what it blocks and the vendor origins it is missing', () => {
  const r = A.analyze(fs.readFileSync(path.join(FIX, 'strict.html'), 'utf8'));
  const blocked = find(r, 'csp-blocks').items.join('\n');
  assert.match(blocked, /gtag\/js/);
  assert.match(blocked, /hero\.webp/);
  assert.match(blocked, /onclick/);
  assert.doesNotMatch(blocked, /console\.log\('ok'\)/);
  assert.ok(ids(r).includes('csp-vendor'));
  assert.ok(ids(r).includes('meta-csp'));
  assert.ok(r.current.lint.some((n) => /unsafe-inline/.test(n.text)));
});

test('a CSP passed with --csp that allows everything gives no block finding', () => {
  const html = page('<script src="https://cdn.example.net/a.js" integrity="sha384-x" crossorigin="anonymous"></script>');
  const r = A.analyze(html, { csp: "default-src 'self'; script-src 'self' https://cdn.example.net; object-src 'none'; base-uri 'self'" });
  assert.ok(!ids(r).includes('csp-blocks'));
  assert.strictEqual(r.current.blocked.length, 0);
});

test('lint: wildcard, unsafe-eval, data: and missing object-src/base-uri', () => {
  const notes = A.lintCsp(A.parseCsp("script-src * 'unsafe-eval' data:"), A.T.en).map((n) => n.text).join('\n');
  assert.match(notes, /any site/);
  assert.match(notes, /unsafe-eval/);
  assert.match(notes, /data:/);
  assert.match(notes, /object-src/);
  assert.match(notes, /base-uri/);
});

test('server snippets escape quotes for nginx and Apache', () => {
  const s = A.serverSnippets("default-src 'self'");
  assert.strictEqual(s.nginx, "add_header Content-Security-Policy-Report-Only \"default-src 'self'\" always;");
  assert.match(s.apache, /^Header always set Content-Security-Policy-Report-Only "/);
});

test('clean page is clean; empty input is empty', () => {
  assert.strictEqual(A.analyze(fs.readFileSync(path.join(FIX, 'clean.html'), 'utf8')).verdict, 'clean');
  assert.strictEqual(A.analyze('').verdict, 'empty');
});

test('Spanish output', () => {
  const txt = A.toText(A.analyze(fs.readFileSync(path.join(FIX, 'shop.html'), 'utf8'), { lang: 'es' }));
  assert.match(txt, /CORRIGE ESTO PRIMERO/);
  assert.match(txt, /línea/);
  assert.doesNotMatch(txt, /\(line /);
});

test('CLI: exit codes, JSON, policy, server snippet, stdin and SRI hash of a file', () => {
  assert.strictEqual(run(['--demo', 'shop']).status, 2);
  assert.strictEqual(run(['--demo', 'clean']).status, 0);
  const j = JSON.parse(run(['--demo', 'shop', '--json']).stdout);
  assert.strictEqual(j.verdict, 'fix');
  assert.match(run(['--demo', 'clean', '--policy']).stdout, /^Content-Security-Policy-Report-Only: default-src 'self'/);
  assert.match(run(['--demo', 'clean', '--server', 'nginx']).stdout, /^add_header /);
  const viaStdin = run(['-'], fs.readFileSync(path.join(FIX, 'clean.html'), 'utf8'));
  assert.strictEqual(viaStdin.status, 0);
  const tmp = path.join(os.tmpdir(), 'aduana-sri-test.js');
  fs.writeFileSync(tmp, 'alert(1)');
  const want = crypto.createHash('sha384').update('alert(1)').digest('base64');
  assert.strictEqual(run(['--sri', tmp]).stdout.trim(), 'integrity="sha384-' + want + '" crossorigin="anonymous"');
  fs.unlinkSync(tmp);
  assert.strictEqual(run([path.join(FIX, 'does-not-exist.html')]).status, 3);
});
