'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/core.js');
const ex = (n) => fs.readFileSync(path.join(__dirname, '..', 'examples', n), 'utf8');

test('XML parser: entities, CDATA, self-closing, attributes, comments', () => {
  const { root } = F.parseXML('<?xml version="1.0"?><!-- c --><a x="1 &amp; 2" y=\'q\'><b/><c><![CDATA[<raw> & stuff]]></c>t&#65;&#x42;&lt;</a>');
  assert.equal(root.attrs.x, '1 & 2');
  assert.equal(root.attrs.y, 'q');
  assert.equal(root.children[1].children[0].text, '<raw> & stuff');
  assert.equal(root.children[2].text, 'tAB<');
});

test('XML parser: rejects malformed input with a line number', () => {
  assert.throws(() => F.parseXML('<a>\n<b>\n</a>'), /line 3.*closes <b>/);
  assert.throws(() => F.parseXML('<a><b></b>'), /never closed/);
  assert.throws(() => F.parseXML('<a></a><b></b>'), /more than one root/);
  assert.throws(() => F.parseXML('just text'), /text outside|no root/);
  assert.throws(() => F.parseXML('<a><!-- nope </a>'), /unterminated comment/);
  assert.throws(() => F.parseXML(''), /no root/);
});

test('XML parser: DOCTYPE with internal subset and ">" inside attribute values', () => {
  const { root } = F.parseXML('<!DOCTYPE r [<!ENTITY x "y">]><r a="1>2"/>');
  assert.equal(root.attrs.a, '1>2');
});

test('XSLT detection finds stylesheet PIs of every flavour', () => {
  assert.deepEqual(F.detectXslt(ex('podcast.xml')).stylesheets, [{ href: '/assets/rss.xsl', type: 'text/xsl' }]);
  assert.equal(F.detectXslt(ex('blog.atom')).stylesheets[0].href, '/pretty-feed-v3.xsl');
  assert.equal(F.detectXslt('<?xml-stylesheet href="x.xsl" type="application/xslt+xml"?><rss/>').usesXslt, true);
  assert.equal(F.detectXslt('<?xml-stylesheet href="#s" type="text/xsl"?><rss/>').inline, true);
  assert.equal(F.detectXslt('<?xml-stylesheet href="a.css" type="text/css"?><rss/>').usesXslt, false);
  assert.equal(F.detectXslt('<rss/>').usesXslt, false);
});

test('stripStylesheetPI removes only xml-stylesheet lines', () => {
  const out = F.stripStylesheetPI(ex('podcast.xml'));
  assert.ok(!/xml-stylesheet/.test(out));
  assert.ok(out.startsWith('<?xml version="1.0"'));
  assert.ok(/<rss version/.test(out));
});

test('RSS podcast model', () => {
  const m = F.parseFeed(ex('podcast.xml'));
  assert.equal(m.type, 'rss');
  assert.equal(m.title, 'The Cold Boot Podcast');
  assert.equal(m.link, 'https://coldboot.example.com/'); // not the atom:link self element
  assert.equal(m.image, 'https://coldboot.example.com/cover.jpg');
  assert.equal(m.podcast, true);
  assert.equal(m.items.length, 2);
  assert.equal(m.items[0].enclosure.type, 'audio/mpeg');
  assert.equal(m.items[0].duration, '00:42:17');
  assert.deepEqual(m.items[0].categories, ['Ops', 'War stories']);
  assert.equal(m.items[0].date.toISOString(), '2026-10-12T08:00:00.000Z');
  assert.equal(m.xslt.usesXslt, true);
});

test('Atom model: xhtml, html and text content types', () => {
  const m = F.parseFeed(ex('blog.atom'));
  assert.equal(m.type, 'atom');
  assert.equal(m.title, 'Notes from the Margin');
  assert.equal(m.link, 'https://margin.example.org/');
  assert.equal(m.author, 'Sam Whitlock');
  assert.equal(m.items[0].title, 'Why <em>every</em> table needs a caption');
  assert.match(m.items[0].content, /<p>Captions are <em>free<\/em>/);
  assert.equal(m.items[1].contentIsText, true);
});

test('prefixed Atom root (<atom:feed>) is understood', () => {
  const m = F.parseFeed('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:title>T</atom:title><atom:entry><atom:title>E</atom:title><atom:link href="https://x.test/e"/></atom:entry></atom:feed>');
  assert.equal(m.title, 'T');
  assert.equal(m.items[0].link, 'https://x.test/e');
});

test('RSS 1.0 / RDF feeds', () => {
  const m = F.parseFeed('<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>R</title><link>https://r.test</link></channel><item><title>I</title><link>https://r.test/i</link><dc:date>2026-01-02T00:00:00Z</dc:date><dc:creator>Zed</dc:creator></item></rdf:RDF>');
  assert.equal(m.items[0].author, 'Zed');
  assert.equal(m.items[0].date.getUTCFullYear(), 2026);
});

test('sitemap and sitemap index', () => {
  const s = F.parseFeed(ex('sitemap.xml'));
  assert.equal(s.type, 'sitemap');
  assert.equal(s.urls.length, 5);
  assert.equal(s.urls[3].lastmod, '');
  const i = F.parseFeed('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://a.test/s1.xml</loc><lastmod>2026-01-01</lastmod></sitemap></sitemapindex>');
  assert.equal(i.type, 'sitemapindex');
  assert.equal(i.maps[0].loc, 'https://a.test/s1.xml');
});

test('non-feed XML and bad RSS give a clear error', () => {
  assert.throws(() => F.parseFeed('<html></html>'), /Not a recognized feed.*<html>/);
  assert.throws(() => F.parseFeed('<rss version="2.0"></rss>'), /no <channel>/);
  assert.throws(() => F.parseFeed('<rss><channel><title>x</title>'), /never closed/);
});

test('sanitizer strips scripts, handlers, javascript: URLs, iframes and style', () => {
  const dirty = '<p onclick="x()">Hi<script>alert(1)</script><iframe src="//evil"></iframe><style>*{}</style>' +
    '<a href="javascript:alert(1)">a</a><a href=" JaVa\tScRiPt:alert(1)">b</a><a href="data:text/html,<script>">c</a>' +
    '<img src="x" onerror="alert(1)"><svg onload=alert(1)><circle/></svg><a href="https://ok.test/?a=1&b=2">ok</a>';
  const out = F.sanitizeHtml(dirty);
  assert.ok(!/script|alert|onclick|onerror|onload|iframe|<style|javascript|data:|svg/i.test(out), out);
  assert.match(out, /<a href="https:\/\/ok\.test\/\?a=1&amp;b=2" rel="noopener noreferrer nofollow">ok<\/a>/);
  assert.match(out, /<img src="x" loading="lazy"/);
});

test('sanitizer balances tags, drops comments, escapes stray < and keeps entities', () => {
  assert.equal(F.sanitizeHtml('<p><b>x'), '<p><b>x</b></p>');
  assert.equal(F.sanitizeHtml('a<!-- hidden -->b'), 'ab');
  assert.equal(F.sanitizeHtml('1 < 2 &amp; 3'), '1 &lt; 2 &amp; 3');
  assert.equal(F.sanitizeHtml('<unknown>kept text</unknown>'), 'kept text');
  assert.equal(F.sanitizeHtml('<img onerror=1>'), '');
  assert.equal(F.sanitizeHtml('<a href="/p">x</a>', { baseUrl: 'https://s.test/blog/' }), '<a href="https://s.test/p" rel="noopener noreferrer nofollow">x</a>');
});

test('sanitizer defeats attribute-quote and nested-tag tricks', () => {
  for (const evil of ['<a href="x" "onmouseover="alert(1)">y</a>', '<<script>script>alert(1)<</script>/script>', '<img src="x"onerror="alert(1)">', '<a href=`javascript:alert(1)`>z</a>', '<scr<script>ipt>alert(1)</scr</script>ipt>']) {
    const out = F.sanitizeHtml(evil);
    // anything left must be an allowlisted tag with no event-handler attributes; the rest is inert escaped text
    const tags = [...out.matchAll(/<\/?([A-Za-z0-9]+)/g)].map((m) => m[1].toLowerCase());
    assert.ok(tags.every((t) => ['a', 'img', 'p', 'b'].includes(t)), evil + ' => ' + out);
    assert.ok(!/<[^>]*\son\w+\s*=/i.test(out) && !/<[^>]*javascript:/i.test(out), evil + ' => ' + out);
  }
});

test('renderHtml: static page has no script tags, escapes titles, shows audio and feed URL', () => {
  const m = F.parseFeed(ex('podcast.xml'));
  const html = F.renderHtml(m, { feedUrl: 'https://coldboot.example.com/feed.xml' });
  assert.ok(!/<script/i.test(html));
  assert.match(html, /<audio controls preload="none" src="https:\/\/cdn\.example\.com\/ep12\.mp3">/);
  assert.match(html, /value="https:\/\/coldboot\.example\.com\/feed\.xml"/);
  assert.match(html, /<time datetime="2026-10-12T08:00:00.000Z">2026-10-12<\/time>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /<link rel="alternate" type="application\/rss\+xml"/);
});

test('renderHtml: hostile feed metadata cannot inject markup', () => {
  const m = F.parseFeed('<rss version="2.0"><channel><title>&lt;img src=x onerror=alert(1)&gt;</title><link>javascript:alert(1)</link><language>&quot;&gt;&lt;script&gt;</language><item><title>t</title><link>javascript:alert(2)</link><enclosure url="javascript:alert(3)" type="audio/mpeg"/></item></channel></rss>');
  const html = F.renderHtml(m, {});
  assert.ok(!/<img src=x/i.test(html));
  assert.ok(!/href="javascript:/i.test(html));
  assert.ok(!/src="javascript:/i.test(html));
  assert.match(html, /<html lang="en">/);
});

test('renderHtml: Atom plain-text content is escaped into paragraphs', () => {
  const html = F.renderHtml(F.parseFeed(ex('blog.atom')), {});
  assert.match(html, /<p>First paragraph with &lt;b&gt;literal&lt;\/b&gt; angle brackets\.<\/p><p>Second paragraph\.<\/p>/);
  assert.match(html, /<li>Screen readers announce them<\/li>/);
});

test('renderHtml: sitemap groups by first path segment', () => {
  const html = F.renderHtml(F.parseFeed(ex('sitemap.xml')), {});
  assert.match(html, /<summary>\/blog\/ <span class="meta">\(2\)<\/span>/);
  assert.match(html, /https:\/\/example\.com\/docs\/install/);
});

test('empty feed renders a friendly message', () => {
  const html = F.renderHtml(F.parseFeed('<rss version="2.0"><channel><title>Empty</title></channel></rss>'), {});
  assert.match(html, /no entries yet/);
});

test('snippets embed the configured paths', () => {
  const s = F.snippets({ xmlPath: '/podcast/rss.xml', htmlPath: '/podcast/index.html' });
  assert.match(s.nginx, /location = \/podcast\/rss\.xml/);
  assert.match(s.nginx, /rewrite \^ \/podcast\/index\.html last/);
  assert.equal(JSON.parse(s.vercel).rewrites[0].destination, '/podcast/index.html');
  assert.match(s.apache, /RewriteRule \^podcast\/rss\\\.xml\$ \/podcast\/index\.html \[L\]/);
  assert.match(s.cloudflare, /text\/html/);
});

test('BOM and CRLF input parse fine', () => {
  const m = F.parseFeed('﻿<?xml version="1.0"?>\r\n<rss version="2.0"><channel>\r\n<title>B</title></channel></rss>');
  assert.equal(m.title, 'B');
});
