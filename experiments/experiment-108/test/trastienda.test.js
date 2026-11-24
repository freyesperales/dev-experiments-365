'use strict';
// All pages here are invented: example.com / example.net / example.org, a made-up
// tienda-ejemplo.myshopify.com and made-up app names. The only real-world strings are
// the published indicators the tool must recognise (they are text, never requested).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const T = require('../trastienda.js');

const CLI = path.join(__dirname, '..', 'trastienda.js');
const FIX = path.join(__dirname, '..', 'fixtures');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
const page = (body) => '<!doctype html><html><head><link rel="canonical" href="https://www.example.com/">\n<script>Shopify.shop = "tienda-ejemplo.myshopify.com";</script>\n' + body + '\n</head><body></body></html>';
const find = (res, key) => res.entities.find((e) => e.key === key);
const flags = (e) => (e ? e.flags.map((f) => f.id) : []);

test('registrable domain: plain, country suffix, shared hosting', () => {
  assert.strictEqual(T._regDomain('cdn.judge.me'), 'judge.me');
  assert.strictEqual(T._regDomain('www.example.co.uk'), 'example.co.uk');
  assert.strictEqual(T._regDomain('d1abc.cloudfront.net'), 'd1abc.cloudfront.net');
  assert.strictEqual(T._regDomain('bucket.s3.eu-west-1.amazonaws.com'), 'eu-west-1.amazonaws.com');
  assert.strictEqual(T._regDomain('203.0.113.9'), '203.0.113.9');
});

test('edit distance counts one for a missing letter and for a swap', () => {
  assert.strictEqual(T._editDistance('jsdeliver', 'jsdelivr'), 1);
  assert.strictEqual(T._editDistance('shopfiy', 'shopify'), 1);
  assert.strictEqual(T._editDistance('spotify', 'shopify'), 2);
});

test('lookalike: imitation, real name, real name with another ending, and no false alarm', () => {
  assert.deepStrictEqual(T._lookalike('shopify.jsdeliver.cloud'), { brand: 'jsdelivr', real: 'jsdelivr.net', kind: 'typo' });
  assert.strictEqual(T._lookalike('cdn.jsdelivr.net'), null);
  assert.strictEqual(T._lookalike('cdn.shopify.com'), null);
  assert.strictEqual(T._lookalike('cdn.shopify.top').kind, 'ending');
  assert.strictEqual(T._lookalike('open.spotify.com'), null);
  assert.strictEqual(T._lookalike('shopify-apps-files.s3.amazonaws.com'), null);
  assert.strictEqual(T._lookalike('cdn.shopfiy.com').kind, 'typo');
});

test('reads the script tag list the way Shopify prints it (escaped slashes and \\u0026)', () => {
  const code = '(function() { function asyncLoad() { var urls = ["https:\\/\\/cdn.example.net\\/a.js?v=1.5\\u0026shop=tienda-ejemplo.myshopify.com","https:\\/\\/app.example.org\\/b.js?shop=tienda-ejemplo.myshopify.com"]; for (var i = 0; i < urls.length; i++) {} }; })();';
  assert.deepStrictEqual(T._parseAsyncLoad(code), ['https://cdn.example.net/a.js?v=1.5&shop=tienda-ejemplo.myshopify.com', 'https://app.example.org/b.js?shop=tienda-ejemplo.myshopify.com']);
  assert.deepStrictEqual(T._parseAsyncLoad('var x = 1;'), []);
});

test('sample shop: the imitation is the first thing shown and the verdict says so', () => {
  const res = T.analyze(T.demo('shop'));
  assert.strictEqual(res.verdict, 'fix');
  assert.strictEqual(res.entities[0].key, 'host:jsdeliver.cloud');
  assert.deepStrictEqual(flags(res.entities[0]), ['bad-jsdeliver']);
  assert.strictEqual(res.store.ownHost, 'www.example.com');
  assert.strictEqual(res.store.shop, 'tienda-ejemplo.myshopify.com');
  assert.strictEqual(res.store.theme.schema, 'Dawn');
  assert.strictEqual(res.scriptTags, 3);
});

test('legacy script tags: a known service is information, an unknown or rented address needs an owner', () => {
  const res = T.analyze(T.demo('shop'));
  assert.strictEqual(find(res, 'tag:judge.me').level, 'info');
  assert.strictEqual(find(res, 'tag:judge.me').name, 'Judge.me');
  const cf = find(res, 'tag:d1example2abc.cloudfront.net');
  assert.strictEqual(cf.level, 'check');
  assert.strictEqual(cf.shared, 'cloudfront.net');
  assert.strictEqual(find(res, 'tag:example.net').level, 'check');
});

test('a script loaded inside an app block belongs to that app, not to "unknown service"', () => {
  const res = T.analyze(T.demo('shop'));
  const app = find(res, 'app:opciones-ejemplo');
  assert.deepStrictEqual(app.hosts, ['opciones-ejemplo-b7hq.b01.azurefd.net']);
  assert.strictEqual(res.entities.some((e) => e.key.startsWith('host:') && e.key.includes('azurefd')), false);
  assert.match(T.render(res, 'en'), /It also brings code from: opciones-ejemplo-b7hq\.b01\.azurefd\.net/);
});

test('app extension files are attributed by their address even without the block comments', () => {
  const res = T.analyze(page('<script src="https://cdn.shopify.com/extensions/01a0f64c-0000-7cec-a0fb-2d0baaff2105/product-options-by-example-1-201/assets/code.js" defer></script>'));
  const app = find(res, 'app:product-options-by-example');
  assert.ok(app);
  assert.deepStrictEqual(app.ways, ['extension']);
  assert.strictEqual(res.verdict, 'clean');
});

test('clean sample: verdict clean, but the outside parties are still listed', () => {
  const res = T.analyze(T.demo('clean'));
  assert.strictEqual(res.verdict, 'clean');
  assert.strictEqual(res.parties, 2);
  assert.ok(find(res, 'host:googletagmanager.com'));
  assert.deepStrictEqual(find(res, 'host:googletagmanager.com').ways, ['inline']);
  assert.deepStrictEqual(res.pixels, { app: 1, custom: 1 });
});

test('published hijack indicators are found anywhere, even inside data', () => {
  const res = T.analyze(page('<script type="application/json">{"redirect":"https://www.biliing.top/check-out/"}</script>'));
  assert.strictEqual(res.verdict, 'attack');
  assert.deepStrictEqual(flags(find(res, 'ioc')), ['ioc-domain']);
  assert.match(T.render(res, 'en'), /biliing\[\.\]top/);
  const res2 = T.analyze(page('<script>if(!sessionStorage.getItem("__ctf_shim_handoff_done_v1")){go()}</script>'));
  assert.strictEqual(res2.verdict, 'attack');
});

test('Shopify and theme files are recognised on both address styles and never flagged', () => {
  const res = T.analyze(page([
    '<script src="//www.example.com/cdn/shop/t/12/assets/global.js?v=1" defer></script>',
    '<script src="https://cdn.shopify.com/s/files/1/0000/0001/t/5/assets/theme.js?v=2"></script>',
    '<script src="https://cdn.shopify.com/shopifycloud/storefront/assets/x.js"></script>',
    '<script src="/cdn/shopifycloud/portable-wallets/latest/portable-wallets.en.js" type="module"></script>',
    '<script>window.ShopifyAnalytics = window.ShopifyAnalytics || {}; window.ShopifyAnalytics.meta = {"page":{"pageType":"home"}};</script>',
  ].join('\n')));
  assert.strictEqual(find(res, 'theme').count, 2);
  assert.strictEqual(find(res, 'shopify').count, 4); // two files, one inline, plus the Shopify.shop line of the wrapper
  assert.strictEqual(res.verdict, 'clean');
  assert.strictEqual(res.parties, 0);
});

test('code that names Shopify objects but hides what it runs is not waved through', () => {
  const res = T.analyze(page('<script>window.ShopifyAnalytics = window.ShopifyAnalytics || {}; eval(atob("YWxlcnQoMSk="));</script>'));
  assert.deepStrictEqual(flags(find(res, 'inline')), ['hidden-eval']);
  assert.strictEqual(res.verdict, 'fix');
});

test('data blocks (JSON, JSON-LD, templates) are not counted as code', () => {
  const res = T.analyze(page('<script type="application/ld+json">{"@type":"Store","url":"https://other.example.org/x.js"}</script><script type="text/template"><script src="https://nope.example.net/a.js"></script>'));
  assert.strictEqual(res.stats.scripts, 1); // only the Shopify.shop line of the wrapper
  assert.strictEqual(res.stats.data, 2);
});

test('scrambled code and decode-then-run code are flagged; ordinary minified code is not', () => {
  const scrambled = '<script>var _0x3f2a=["\\x68\\x74"];(function(_0x1a2b,_0x4c5d){var _0x9e8f=function(_0x7a6b){while(--_0x7a6b){_0x1a2b.push(_0x1a2b.shift());}};_0x9e8f(++_0x4c5d);}(_0x3f2a,0x1f4));</script>';
  assert.deepStrictEqual(flags(find(T.analyze(page(scrambled)), 'inline')), ['obfuscated']);
  const hidden = '<script>var p="' + 'QUJD'.repeat(60) + '";(new Function(atob(p)))();</script>';
  const r2 = T.analyze(page(hidden));
  assert.deepStrictEqual(flags(find(r2, 'inline')), ['hidden-eval']);
  assert.strictEqual(r2.verdict, 'fix');
  const minified = '<script>!function(e,t){var n=e.querySelector(".cart");n&&n.addEventListener("click",function(){t.classList.toggle("open")})}(document,document.body);</script>';
  assert.deepStrictEqual(flags(find(T.analyze(page(minified)), 'inline')), []);
});

test('a click handler that cancels the checkout click and leaves the site is flagged; a terms checkbox is not', () => {
  const hijackShape = '<script>document.addEventListener("click",function(e){var b=e.target.closest("[name=checkout]");if(!b||sessionStorage.getItem("done"))return;e.preventDefault();e.stopImmediatePropagation();sessionStorage.setItem("done","1");window.location.href="https://pay.example.net/check-out/";},true);</script>';
  const res = T.analyze(page(hijackShape));
  assert.deepStrictEqual(flags(find(res, 'inline')), ['checkout-click']);
  assert.strictEqual(res.verdict, 'check');
  const terms = '<script>document.querySelector("[name=checkout]").addEventListener("click",function(e){if(!document.getElementById("agree").checked){e.preventDefault();alert("Please accept the terms");}else{window.location.href="/checkout";}});</script>';
  assert.deepStrictEqual(flags(find(T.analyze(page(terms)), 'inline')), []);
});

test('polyfill.io is reported with the reason', () => {
  const res = T.analyze(page('<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>'));
  assert.deepStrictEqual(flags(find(res, 'host:polyfill.io')), ['bad-polyfill']);
  assert.match(T.render(res, 'es'), /Cloudflare dijo en junio de 2024/);
});

test('plain http and bare IP addresses are flagged', () => {
  const res = T.analyze(page('<script src="http://widgets.example.net/a.js"></script><script src="https://203.0.113.9/b.js"></script>'));
  assert.deepStrictEqual(flags(find(res, 'host:example.net')), ['http']);
  assert.deepStrictEqual(flags(find(res, 'host:203.0.113.9')), ['ip-host']);
});

test('forms that post to another site and frames are part of the inventory', () => {
  const res = T.analyze(page('<form action="https://collect.example.net/subscribe" method="post"></form><iframe src="https://www.youtube.com/embed/abc"></iframe><form action="/cart" method="post"></form>'));
  assert.deepStrictEqual(flags(find(res, 'host:example.net')), ['form-out']);
  assert.strictEqual(find(res, 'host:youtube.com').level, 'info');
  assert.strictEqual(res.stats.forms, 2);
});

test('a script uploaded to the Files area is called out', () => {
  const res = T.analyze(page('<script src="https://cdn.shopify.com/s/files/1/0000/0001/files/custom-tracker.js?v=3"></script>'));
  assert.strictEqual(find(res, 'files').level, 'check');
  assert.deepStrictEqual(find(res, 'files').files, ['custom-tracker.js']);
});

test('theme source: edited content_for_header, snippets, and Liquid asset tags', () => {
  const res = T.analyze(T.demo('liquid'));
  assert.ok(res.notes.includes('liquid'));
  assert.deepStrictEqual(flags(find(res, 'header')), ['header-edited']);
  assert.deepStrictEqual(res.liquid.snippets, ['meta-tags', 'old-popup-app']);
  assert.strictEqual(find(res, 'theme').count, 1);
  assert.strictEqual(find(res, 'host:example.org').level, 'check');
  const plain = T.analyze('<head>{{ content_for_header }}<script src="{{ "a.js" | asset_url }}"></script></head>{{ content_for_layout }}');
  assert.strictEqual(plain.liquid.headerEdited, false);
  assert.strictEqual(plain.verdict, 'clean');
});

test('the list of installed apps names the owners and shows what has no trace', () => {
  const res = T.analyze(T.demo('shop'), { apps: ['Judge.me Product Reviews', 'Resenas Ejemplo', 'Stock Sync (admin only)'] });
  assert.strictEqual(find(res, 'tag:judge.me').matched, 'Judge.me Product Reviews');
  assert.strictEqual(find(res, 'app:resenas-ejemplo').matched, 'Resenas Ejemplo');
  assert.strictEqual(find(res, 'app:opciones-ejemplo').matched, null);
  assert.deepStrictEqual(res.unusedApps, ['Stock Sync (admin only)']);
  const out = T.render(res, 'en');
  assert.match(out, /Ask Judge\.me Product Reviews whether they have already moved/);
  assert.match(out, /Not on the list of apps you gave\./);
});

test('inventory and comparison: new party, new address inside a known app, and something gone', () => {
  const before = T.inventory(T.analyze(T.demo('clean')));
  const after = T.analyze(T.demo('clean')
    .replace('<!-- END app block -->', '<script src="https://extra.example.net/late.js"></script><!-- END app block -->')
    .replace('</head>', '<script src="https://cdn.example.org/new-widget.js"></script></head>')
    .replace(/<script>\(function\(w,d,s,l,i\)[\s\S]*?<\/script>/, ''));
  const d = T.diff(before, after);
  assert.deepStrictEqual(d.added, ['example.org']);
  assert.deepStrictEqual(d.newHosts, ['resenas-ejemplo → extra.example.net']);
  assert.deepStrictEqual(d.removed, ['Google Tag Manager']);
  assert.strictEqual(T.diff(before, T.analyze(T.demo('clean'))).changed, false);
});

test('empty or script-less input gets its own answer', () => {
  assert.strictEqual(T.analyze('').verdict, 'empty');
  assert.strictEqual(T.analyze('<html><body><p>Hello</p></body></html>').verdict, 'empty');
  assert.match(T.render(T.analyze(''), 'es'), /NO HAY SCRIPTS/);
});

test('a page that is not Shopify is still inventoried, with a note', () => {
  const res = T.analyze('<html><head><script src="https://cdn.example.org/app.js"></script></head></html>');
  assert.ok(res.notes.includes('not-shopify'));
  assert.strictEqual(res.verdict, 'check');
});

test('addresses written with // and &amp;, and lazy data-src scripts, are read', () => {
  const res = T.analyze(page('<script src="//widgets.example.net/a.js?x=1&amp;y=2" integrity="sha384-abc"></script><script type="text/lazyload" data-src="https://lazy.example.org/b.js"></script>'));
  assert.ok(find(res, 'host:example.net'));
  assert.ok(find(res, 'host:example.org'));
  assert.strictEqual(find(res, 'host:example.net').noSri, undefined);
  assert.strictEqual(find(res, 'host:example.org').noSri, 1);
});

test('English and Spanish have the same messages', () => {
  const keys = (o, p) => Object.keys(o).flatMap((k) => (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? keys(o[k], p + k + '.') : [p + k]));
  assert.deepStrictEqual(keys(T.T.en, '').sort(), keys(T.T.es, '').sort());
  assert.strictEqual(T.T.en.next.length, T.T.es.next.length);
  assert.strictEqual(T.T.en.blind.length, T.T.es.blind.length);
  for (const d of ['shop', 'clean', 'liquid']) for (const l of ['en', 'es']) assert.ok(T.render(T.analyze(T.demo(d)), l).length > 400);
});

test('the tool never talks to the network', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|require\(['"](https?|net|dns|tls)['"]\)|sendBeacon|WebSocket/);
});

test('command line: exit codes, JSON, Spanish, standard input', () => {
  const a = run([path.join(FIX, 'shop-with-leftovers.html')]);
  assert.strictEqual(a.status, 1);
  assert.match(a.stdout, /LOOK AT THIS TODAY/);
  const b = run([path.join(FIX, 'clean-shop.html'), '--lang', 'es']);
  assert.strictEqual(b.status, 0);
  assert.match(b.stdout, /NADA RARO EN LO QUE PEGASTE/);
  const c = run([path.join(FIX, 'theme.liquid'), '--json']);
  assert.strictEqual(JSON.parse(c.stdout).result.liquid.headerEdited, true);
  const d = run(['-'], T.demo('clean'));
  assert.strictEqual(d.status, 0);
  assert.strictEqual(run([]).status, 2);
  assert.strictEqual(run(['--nope']).status, 2);
  assert.strictEqual(run(['does-not-exist.html']).status, 2);
  assert.strictEqual(run(['-'], '<p>nothing</p>').status, 2);
});

test('command line: --apps, --save and --baseline work together', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trastienda-'));
  const inv = path.join(dir, 'inventory.json');
  const a = run([path.join(FIX, 'clean-shop.html'), '--save', inv]);
  assert.strictEqual(a.status, 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(inv, 'utf8')).items.length, 2);
  const b = run([path.join(FIX, 'shop-with-leftovers.html'), '--baseline', inv, '--apps', path.join(FIX, 'apps.txt')]);
  assert.strictEqual(b.status, 1);
  assert.match(b.stdout, /Compared with your saved inventory/);
  assert.match(b.stdout, /\+ New: jsdeliver\.cloud/);
  assert.match(b.stdout, /On your list but not seen in this page: Stock Sync/);
  const c = run([path.join(FIX, 'clean-shop.html'), '--baseline', inv]);
  assert.strictEqual(c.status, 0);
  assert.match(c.stdout, /No changes since the saved inventory/);
  fs.rmSync(dir, { recursive: true, force: true });
});
