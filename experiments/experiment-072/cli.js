#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('./src/core.js');

const HELP = `FeedFrock — render XSLT-styled RSS/Atom/sitemap feeds as static HTML (no XSLT, no JS)

Usage:
  feedfrock <feed.xml | https://url | -> [more inputs] [options]

Options:
  --out FILE        write the HTML page here (single input; default: <name>.html next to input)
  --out-dir DIR     write <name>.html (and <name>.clean.xml with --strip-pi) into DIR
  --feed-url URL    public URL of the feed (shown in the subscribe box + <link rel=alternate>)
  --base-url URL    resolve relative links in entries against this URL
  --strip-pi        also write a copy of the XML without the <?xml-stylesheet?> line
  --check           audit only: report XSLT usage, write nothing; exit 1 if any input uses XSLT
  --snippets        print nginx / Apache / Vercel / Cloudflare content-negotiation snippets
  --xml-path PATH   public path of the XML (default /feed.xml)   --html-path PATH (default /feed.html)
  -h, --help
`;

async function load(input) {
  if (input === '-') return fs.readFileSync(0, 'utf8');
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + input);
    return res.text();
  }
  return fs.readFileSync(input, 'utf8');
}

function parseArgs(argv) {
  const o = { inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = () => { if (i + 1 >= argv.length) throw new Error(a + ' needs a value'); return argv[++i]; };
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--out') o.out = need();
    else if (a === '--out-dir') o.outDir = need();
    else if (a === '--feed-url') o.feedUrl = need();
    else if (a === '--base-url') o.baseUrl = need();
    else if (a === '--xml-path') o.xmlPath = need();
    else if (a === '--html-path') o.htmlPath = need();
    else if (a === '--strip-pi') o.stripPi = true;
    else if (a === '--check') o.check = true;
    else if (a === '--snippets') o.snippets = true;
    else if (a.length > 1 && a[0] === '-') throw new Error('unknown option ' + a);
    else o.inputs.push(a);
  }
  return o;
}

function baseName(input) {
  if (input === '-') return 'feed';
  let n;
  try { n = /^https?:/i.test(input) ? new URL(input).pathname : input; } catch (_) { n = input; }
  n = path.basename(n).replace(/\.(xml|rss|atom)$/i, '');
  return n || 'feed';
}

async function main(argv, io) {
  io = io || { out: (s) => process.stdout.write(s + '\n'), err: (s) => process.stderr.write(s + '\n') };
  let o;
  try { o = parseArgs(argv); } catch (e) { io.err('feedfrock: ' + e.message); return 2; }
  if (o.help || (!o.inputs.length && !o.snippets)) { io.out(HELP); return o.help ? 0 : 2; }
  if (o.out && o.inputs.length > 1) { io.err('feedfrock: --out takes a single input; use --out-dir'); return 2; }
  if (o.snippets) {
    const s = F.snippets({ xmlPath: o.xmlPath, htmlPath: o.htmlPath });
    io.out('# nginx\n' + s.nginx + '\n\n# Apache (.htaccess)\n' + s.apache + '\n\n# Vercel (vercel.json)\n' + s.vercel + '\n\n# Cloudflare Worker\n' + s.cloudflare + '\n\n# Add to your site <head>\n' + s.link);
    if (!o.inputs.length) return 0;
  }
  let code = 0;
  for (const input of o.inputs) {
    let src;
    try { src = await load(input); } catch (e) { io.err(input + ': ' + e.message); code = 2; continue; }
    let model;
    try { model = F.parseFeed(src); } catch (e) { io.err(input + ': ' + e.message); code = 2; continue; }
    const x = model.xslt;
    const kind = model.type === 'rss' ? 'RSS' : model.type === 'atom' ? 'Atom' : model.type;
    const what = model.type === 'sitemap' ? model.urls.length + ' URLs' : model.type === 'sitemapindex' ? model.maps.length + ' sitemaps' : model.items.length + ' entries';
    if (x.usesXslt) {
      io.out(input + ': ' + kind + ', ' + what + ' — XSLT stylesheet: ' + x.stylesheets.map((s) => s.href || '(none)').join(', ') + '  → will render as raw XML in Chrome after removal');
      if (o.check) code = Math.max(code, 1);
    } else io.out(input + ': ' + kind + ', ' + what + ' — no XSLT stylesheet (a styled page is still useful for browsers)');
    if (o.check) continue;
    const html = F.renderHtml(model, { feedUrl: o.feedUrl, baseUrl: o.baseUrl });
    const name = baseName(input);
    const dir = o.outDir || (input !== '-' && !/^https?:/i.test(input) ? path.dirname(input) : '.');
    const target = o.out || path.join(dir, name + '.html');
    fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
    fs.writeFileSync(target, html);
    io.out('  wrote ' + target + ' (' + html.length + ' chars)');
    if (o.stripPi) {
      const cleanPath = path.join(o.outDir || dir, name + '.clean.xml');
      fs.writeFileSync(cleanPath, F.stripStylesheetPI(src));
      io.out('  wrote ' + cleanPath + ' (xml-stylesheet line removed)');
    }
  }
  return code;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error('feedfrock: ' + e.message); process.exit(2); });
module.exports = { main, parseArgs };
