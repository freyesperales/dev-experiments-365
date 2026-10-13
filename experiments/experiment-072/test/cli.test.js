'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { main } = require('../cli.js');
const { build } = require('../build.js');

const ex = (n) => path.join(__dirname, '..', 'examples', n);
const cap = () => { const o = { lines: [], errs: [] }; o.io = { out: (s) => o.lines.push(s), err: (s) => o.errs.push(s) }; return o; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ffrock-'));

test('--check exits 1 when XSLT is used and writes nothing', async () => {
  const d = tmp(); const c = cap();
  const code = await main([ex('podcast.xml'), '--check', '--out-dir', d], c.io);
  assert.equal(code, 1);
  assert.deepEqual(fs.readdirSync(d), []);
  assert.match(c.lines.join('\n'), /XSLT stylesheet: \/assets\/rss\.xsl/);
});

test('--check exits 0 when no XSLT', async () => {
  const d = tmp(); const f = path.join(d, 'f.xml');
  fs.writeFileSync(f, '<rss version="2.0"><channel><title>t</title></channel></rss>');
  const c = cap();
  assert.equal(await main([f, '--check'], c.io), 0);
  assert.match(c.lines[0], /no XSLT stylesheet/);
});

test('renders html + clean xml into --out-dir', async () => {
  const d = tmp(); const c = cap();
  const code = await main([ex('podcast.xml'), ex('sitemap.xml'), '--out-dir', d, '--strip-pi', '--feed-url', 'https://x.test/feed.xml'], c.io);
  assert.equal(code, 0);
  assert.deepEqual(fs.readdirSync(d).sort(), ['podcast.clean.xml', 'podcast.html', 'sitemap.clean.xml', 'sitemap.html']);
  assert.ok(!/xml-stylesheet/.test(fs.readFileSync(path.join(d, 'podcast.clean.xml'), 'utf8')));
  assert.match(fs.readFileSync(path.join(d, 'podcast.html'), 'utf8'), /https:\/\/x\.test\/feed\.xml/);
});

test('bad input: exit 2 and a readable message, other inputs still processed', async () => {
  const d = tmp(); const bad = path.join(d, 'bad.xml'); fs.writeFileSync(bad, '<rss><channel>');
  const c = cap();
  const code = await main([bad, path.join(d, 'missing.xml'), ex('blog.atom'), '--out-dir', d], c.io);
  assert.equal(code, 2);
  assert.ok(c.errs.some((e) => /never closed/.test(e)));
  assert.ok(c.errs.some((e) => /missing\.xml/.test(e)));
  assert.ok(fs.existsSync(path.join(d, 'blog.html')));
});

test('argument errors', async () => {
  let c = cap(); assert.equal(await main(['--nope'], c.io), 2); assert.match(c.errs[0], /unknown option/);
  c = cap(); assert.equal(await main([], c.io), 2);
  c = cap(); assert.equal(await main([ex('podcast.xml'), ex('blog.atom'), '--out', 'x.html'], c.io), 2);
  c = cap(); assert.equal(await main(['-h'], c.io), 0);
});

test('--snippets prints server config', async () => {
  const c = cap();
  assert.equal(await main(['--snippets', '--xml-path', '/a.xml', '--html-path', '/a.html'], c.io), 0);
  assert.match(c.lines.join('\n'), /location = \/a\.xml/);
});

test('index.html is up to date with src/ and examples/', () => {
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), build());
});
