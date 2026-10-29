'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const D = require('../lib.js');

const U = list => list.map(url => ({ url, title: '' }));
const root = path.join(__dirname, '..');

test('parseUrl strips host/fragment and keeps query', () => {
  const u = D.parseUrl('https://Shop.Example.com/a//b?x=1#top');
  assert.deepStrictEqual([u.host, u.path, u.query], ['shop.example.com', '/a/b', 'x=1']);
  assert.strictEqual(D.parseUrl('about').path, '/about');
});

test('normKey ignores case, trailing slash, extension and index files', () => {
  const k = s => D.normKey(D.parseUrl(s), { ignoreQuery: true });
  assert.strictEqual(k('/About-Us.HTML'.toLowerCase()), '/about-us');
  assert.strictEqual(k('/Shop/Widget/'), '/shop/widget');
  assert.strictEqual(k('/docs/index.php'), '/docs');
  assert.strictEqual(k('/'), '/');
});

test('parseList handles plain lists, Screaming Frog CSV, sitemap XML and 4xx rows', () => {
  assert.strictEqual(D.parseList('/a\n/b\n# c\n\n/d').items.length, 3);
  const sf = D.parseList('Address,Status Code,Title 1\nhttps://x.io/a,200,Alpha\nhttps://x.io/b,404,Beta\n', 'old');
  assert.deepStrictEqual(sf.items, [{ url: 'https://x.io/a', title: 'Alpha' }]);
  assert.match(sf.notes[0], /Skipped 1/);
  const xml = D.parseList('<urlset><url><loc>https://x.io/a?x=1&amp;y=2</loc></url><url><loc><![CDATA[https://x.io/b]]></loc></url></urlset>');
  assert.deepStrictEqual(xml.items.map(i => i.url), ['https://x.io/a?x=1&y=2', 'https://x.io/b']);
  assert.match(D.parseList('<sitemapindex></sitemapindex>').notes[0], /INDEX/);
});

test('exact and normalized matches score ~1; slug and fuzzy matches are found', () => {
  const m = D.matchLists(U(['/Shop/Widget-Pro', '/about-us.html', '/blog/2019/how-to-bake-bread', '/zzz-nothing']),
    U(['/shop/widget-pro', '/about-us', '/recipes/bake-bread', '/contact']));
  const by = s => m.rules.find(r => r.src === s);
  assert.strictEqual(by('/Shop/Widget-Pro').how, 'exact');
  assert.strictEqual(by('/about-us.html').dst, '/about-us');
  assert.strictEqual(by('/blog/2019/how-to-bake-bread').dstRaw, '/recipes/bake-bread');
  assert.strictEqual(by('/zzz-nothing').dst, null);
  assert.ok(m.orphans.includes('/contact'));
});

test('titles rescue matches whose URLs share nothing', () => {
  const m = D.matchLists([{ url: '/p/1234', title: 'Organic Rye Flour 1kg' }, { url: '/p/9', title: 'Oat Milk' }],
    [{ url: '/flour/rye', title: 'Organic rye flour 1kg' }, { url: '/drinks/oat', title: 'Oat milk' }]);
  assert.strictEqual(m.rules[0].dst, '/flour/rye');
  assert.strictEqual(m.rules[1].dst, '/drinks/oat');
});

test('threshold and fallback control what is exported', () => {
  const o = U(['/blog/2019/how-to-bake-bread']), n = U(['/recipes/bake-bread-at-home']);
  assert.strictEqual(D.matchLists(o, n, { threshold: 0.99 }).rules[0].dst, null);
  const f = D.matchLists(U(['/nothing-like-it']), U(['/x/y']), { fallback: '/blog/' }).rules[0];
  assert.deepStrictEqual([f.dst, f.how], ['/blog/', 'fallback']);
});

test('duplicate old URLs are reported once', () => {
  const m = D.matchLists(U(['/a', '/a/', '/A']), U(['/a']));
  assert.strictEqual(m.rules.filter(r => r.how === 'duplicate').length, 2);
});

function mapRules(pairs) { return D.loadMapping(pairs.map(p => p.join(',')).join('\n')).rules; }

test('analyze flags loops, self redirects, conflicts and flattens chains', () => {
  const rules = mapRules([['/a', '/b'], ['/b', '/c'], ['/c', '/d'], ['/x', '/y'], ['/y', '/x'], ['/s', '/s/'], ['/k', '/one'], ['/k', '/two']]);
  const sum = D.analyze(rules);
  const by = s => rules.filter(r => r.src === s);
  assert.ok(by('/a')[0].flags.includes('chain'));
  assert.strictEqual(by('/a')[0].final, '/d');
  assert.strictEqual(by('/a')[0].hops, 2);
  assert.ok(by('/x')[0].flags.includes('loop') && by('/y')[0].flags.includes('loop'));
  assert.ok(by('/s')[0].flags.includes('self'));
  assert.ok(by('/k')[0].flags.includes('conflict') && by('/k')[1].flags.includes('conflict'));
  assert.deepStrictEqual([sum.loop, sum.self, sum.conflict], [2, 1, 2]);
  const ex = D.exportable(rules, { flatten: true });
  assert.ok(!ex.some(e => e.path === '/x' || e.path === '/s'));
  assert.strictEqual(ex.find(e => e.path === '/a').dst, '/d');
  assert.strictEqual(D.exportable(rules, { flatten: false }).find(e => e.path === '/a').dst, '/b');
});

test('three-way loop is detected', () => {
  const rules = mapRules([['/a', '/b'], ['/b', '/c'], ['/c', '/a']]);
  D.analyze(rules);
  assert.ok(rules.every(r => r.flags.includes('loop')));
  assert.strictEqual(D.exportable(rules).length, 0);
});

test('case/slash variants of the same source are flagged as collisions', () => {
  const rules = mapRules([['/About', '/new'], ['/about/', '/new']]);
  D.analyze(rules);
  assert.ok(rules.every(r => r.flags.includes('collision')));
});

test('loadMapping checks targets against the new site list', () => {
  const m = D.loadMapping('old,new\n/a,/exists\n/b,/ghost\n', '/exists\n');
  assert.ok(!m.rules[0].flags.includes('target-missing'));
  assert.ok(m.rules[1].flags.includes('target-missing'));
});

const sample = () => {
  const rules = mapRules([['/old page', '/new'], ['/about.html', '/about'], ['/p?id=7', '/prod/7'], ['/q/(x)', 'https://other.io/z']]);
  D.analyze(rules);
  return rules;
};

test('netlify and cloudflare-pages output', () => {
  const n = D.toFormat('netlify', sample()).content.split('\n');
  assert.ok(n.includes('/old%20page /new 301'));
  assert.ok(n.includes('/p id=7 /prod/7 301'));
  const c = D.toFormat('cloudflare-pages', sample()).content;
  assert.match(c, /# skipped \(query rule\)/);
});

test('apache output uses anchored RedirectMatch and RewriteCond for queries', () => {
  const a = D.toFormat('apache', sample()).content;
  assert.match(a, /RedirectMatch 301 "\^\/about\\\.html\/\?\$" "\/about"/);
  assert.match(a, /RewriteCond %\{QUERY_STRING\} \^id=7\$/);
  assert.match(a, /RewriteRule \^\/p\/\?\$ \/prod\/7\? \[R=301,L\]/);
});

test('nginx output is a map on $request_uri, with trailing-slash variants', () => {
  const n = D.toFormat('nginx', sample()).content;
  assert.match(n, /map \$request_uri \$detour_target/);
  assert.match(n, /"\/about\.html" "\/about";/);
  assert.match(n, /"\/about\.html\/" "\/about";/);
  assert.match(n, /"\/p\?id=7" "\/prod\/7";/);
});

test('vercel output is valid JSON with query conditions and escaped pattern chars', () => {
  const j = JSON.parse(D.toFormat('vercel', sample()).content);
  assert.strictEqual(j.redirects.length, 4);
  assert.deepStrictEqual(j.redirects.find(r => r.destination === '/prod/7').has, [{ type: 'query', key: 'id', value: '7' }]);
  assert.ok(j.redirects.find(r => r.destination === 'https://other.io/z').source.includes('\\(x\\)'));
});

test('cloudflare-bulk prefixes origins and quotes CSV safely', () => {
  const c = D.toFormat('cloudflare-bulk', sample(), { oldHost: 'https://o.io', newHost: 'https://n.io' }).content.split('\n');
  assert.ok(c.includes('https://o.io/about.html,https://n.io/about,301'));
  assert.ok(c.includes('https://o.io/q/(x),https://other.io/z,301'));
});

test('qa.csv marks problems and verify.sh is syntactically valid bash', () => {
  const rules = mapRules([['/x', '/y'], ['/y', '/x'], ['/a', '/b']]);
  D.analyze(rules);
  const qa = D.qaCsv(rules).split('\n');
  assert.match(qa[1], /PROBLEM/);
  assert.match(qa[3], /,ok,/);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'detour-')), 'v.sh');
  fs.writeFileSync(f, D.verifyScript(rules));
  assert.strictEqual(spawnSync('bash', ['-n', f]).status, 0);
});

test('unknown format throws', () => assert.throws(() => D.toFormat('htaccess2', []), /unknown format/));

test('CLI match writes every artifact and --strict fails on problems', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'detour-cli-'));
  const r = spawnSync('node', [path.join(root, 'cli.js'), 'match', path.join(root, 'examples/old.csv'), path.join(root, 'examples/new.csv'), '--out', out, '--formats', 'netlify,vercel'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /10 old URLs/);
  for (const f of ['netlify/_redirects', 'vercel/vercel.json', 'qa.csv', 'verify.sh', 'report.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(!fs.existsSync(path.join(out, 'nginx')));
  const strict = spawnSync('node', [path.join(root, 'cli.js'), 'match', path.join(root, 'examples/old.csv'), path.join(root, 'examples/new.csv'), '--out', out, '--strict'], { encoding: 'utf8' });
  assert.strictEqual(strict.status, 1);
});

test('CLI check reports a loop in an existing map and exits 2 on bad input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detour-chk-'));
  fs.writeFileSync(path.join(dir, 'map.csv'), 'old,new\n/a,/b\n/b,/a\n');
  const r = spawnSync('node', [path.join(root, 'cli.js'), 'check', path.join(dir, 'map.csv'), '--out', path.join(dir, 'o')], { encoding: 'utf8' });
  assert.match(r.stdout, /2 redirect LOOPS/);
  const bad = spawnSync('node', [path.join(root, 'cli.js'), 'match', '/nonexistent', '/nope'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 2);
  assert.match(bad.stderr, /cannot read/);
});

test('index.html is in sync with lib.js and template.html', () => {
  const tpl = fs.readFileSync(path.join(root, 'template.html'), 'utf8');
  const lib = fs.readFileSync(path.join(root, 'lib.js'), 'utf8');
  assert.strictEqual(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), tpl.replace('/*LIB*/', () => lib));
});

test('scales: 4000 x 4000 URLs match in a few seconds and stay correct', () => {
  const words = ['red', 'blue', 'green', 'shoe', 'boot', 'hat', 'coat', 'sock', 'scarf', 'belt', 'bag', 'glove'];
  const mk = i => `${words[i % 12]}-${words[(i * 7 + 3) % 12]}-${i}`;
  const old = [], nw = [];
  for (let i = 0; i < 4000; i++) { old.push({ url: `/shop/2019/${mk(i)}.html`, title: '' }); nw.push({ url: `/catalog/${words[i % 12]}/${mk(i)}`, title: '' }); }
  const t = Date.now();
  const m = D.matchLists(old, nw);
  assert.ok(Date.now() - t < 20000, 'too slow: ' + (Date.now() - t) + 'ms');
  const right = m.rules.filter((r, i) => r.dst === nw[i].url).length;
  assert.ok(right / 4000 > 0.97, 'accuracy ' + right / 4000);
});
