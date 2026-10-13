/* FeedFrock core — zero dependencies. Browser (window.FeedFrock) and Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FeedFrock = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class FeedError extends Error {}

  // ---------------------------------------------------------------- XML ----
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decode(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (_) { return m; }
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
    });
  }

  // Minimal well-formedness-checking XML parser. Returns {root, pis[], doctype}.
  function parseXML(src) {
    src = String(src).replace(/^﻿/, '');
    let i = 0;
    const n = src.length;
    const pis = [];
    const stack = [];
    let rootEl = null;
    const lineAt = (p) => src.slice(0, p).split('\n').length;
    const fail = (msg, p) => { throw new FeedError('XML error on line ' + lineAt(p == null ? i : p) + ': ' + msg); };

    while (i < n) {
      if (src[i] !== '<') {
        const j = src.indexOf('<', i);
        const end = j < 0 ? n : j;
        const text = src.slice(i, end);
        if (stack.length) stack[stack.length - 1].children.push({ text: decode(text) });
        else if (text.trim()) fail('text outside the root element', i);
        i = end;
        continue;
      }
      if (src.startsWith('<!--', i)) {
        const j = src.indexOf('-->', i + 4);
        if (j < 0) fail('unterminated comment');
        i = j + 3;
      } else if (src.startsWith('<![CDATA[', i)) {
        const j = src.indexOf(']]>', i + 9);
        if (j < 0) fail('unterminated CDATA section');
        if (!stack.length) fail('CDATA outside the root element');
        stack[stack.length - 1].children.push({ text: src.slice(i + 9, j), cdata: true });
        i = j + 3;
      } else if (src.startsWith('<?', i)) {
        const j = src.indexOf('?>', i + 2);
        if (j < 0) fail('unterminated processing instruction');
        const body = src.slice(i + 2, j);
        const m = body.match(/^([^\s?]+)\s*([\s\S]*)$/);
        if (m) pis.push({ target: m[1], data: m[2], attrs: pseudoAttrs(m[2]) });
        i = j + 2;
      } else if (src.startsWith('<!', i)) {
        // DOCTYPE (possibly with an internal subset in [...])
        let depth = 0, j = i + 2;
        for (; j < n; j++) {
          if (src[j] === '[') depth++;
          else if (src[j] === ']') depth--;
          else if (src[j] === '>' && depth <= 0) break;
        }
        if (j >= n) fail('unterminated DOCTYPE');
        i = j + 1;
      } else if (src[i + 1] === '/') {
        const j = src.indexOf('>', i);
        if (j < 0) fail('unterminated end tag');
        const name = src.slice(i + 2, j).trim();
        const top = stack.pop();
        if (!top) fail('unexpected end tag </' + name + '>', i);
        if (top.name !== name) fail('</' + name + '> closes <' + top.name + '> (opened on line ' + top.line + ')', i);
        i = j + 1;
      } else {
        // start tag
        let j = i + 1;
        let q = null;
        for (; j < n; j++) {
          const c = src[j];
          if (q) { if (c === q) q = null; }
          else if (c === '"' || c === "'") q = c;
          else if (c === '>') break;
        }
        if (j >= n) fail('unterminated start tag', i);
        let inner = src.slice(i + 1, j);
        const selfClose = inner.endsWith('/');
        if (selfClose) inner = inner.slice(0, -1);
        const m = inner.match(/^([^\s/>]+)([\s\S]*)$/);
        if (!m) fail('empty tag name', i);
        const el = { name: m[1], attrs: {}, children: [], line: lineAt(i) };
        const ar = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
        let a, consumed = 0;
        while ((a = ar.exec(m[2]))) { el.attrs[a[1]] = decode(a[3] != null ? a[3] : a[4]); consumed++; }
        if (!consumed && m[2].trim()) fail('malformed attributes on <' + el.name + '>', i);
        if (stack.length) stack[stack.length - 1].children.push(el);
        else if (rootEl) fail('more than one root element', i);
        else rootEl = el;
        if (!selfClose) stack.push(el);
        i = j + 1;
      }
    }
    if (stack.length) fail('<' + stack[stack.length - 1].name + '> is never closed', n);
    if (!rootEl) throw new FeedError('XML error: no root element found');
    return { root: rootEl, pis };
  }

  function pseudoAttrs(data) {
    const out = {};
    const re = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(data))) out[m[1]] = decode(m[3] != null ? m[3] : m[4]);
    return out;
  }

  // ----------------------------------------------------------- DOM helpers --
  const local = (name) => name.slice(name.indexOf(':') + 1);
  const kids = (el, name) => (el ? el.children.filter((c) => c.name === name) : []);
  const kid = (el, name) => (el ? kids(el, name)[0] : undefined);
  // Exact-qualified lookup (e.g. 'itunes:image') falls back to local-name match.
  const exact = (el, qname) => (el ? el.children.find((c) => c.name === qname) : undefined);
  function text(el) {
    if (!el) return '';
    return el.children.map((c) => (c.name ? text(c) : c.text)).join('').trim();
  }
  const val = (el, name) => text(kid(el, name));
  const pval = (el, qname) => text(exact(el, qname));

  // ------------------------------------------------------- XSLT detection --
  function detectXslt(src) {
    const out = { usesXslt: false, stylesheets: [], inline: false };
    let parsed;
    try { parsed = parseXML(src); } catch (e) { out.error = e.message; return out; }
    for (const pi of parsed.pis) {
      if (pi.target === 'xml-stylesheet') {
        const type = (pi.attrs.type || '').toLowerCase();
        if (!type || /xsl|xml/.test(type) || /\.xslt?$/i.test(pi.attrs.href || '')) {
          out.stylesheets.push({ href: pi.attrs.href || '', type: pi.attrs.type || '' });
        }
      }
    }
    // an embedded (inline) stylesheet referenced as href="#id"
    out.inline = out.stylesheets.some((s) => s.href[0] === '#');
    out.usesXslt = out.stylesheets.length > 0;
    return out;
  }

  function stripStylesheetPI(src) {
    return src.replace(/<\?xml-stylesheet\b[\s\S]*?\?>\s*\n?/g, '');
  }

  // ---------------------------------------------------------------- dates --
  function parseDate(s) {
    if (!s) return null;
    s = String(s).trim();
    let d = new Date(s);
    if (isNaN(d)) {
      // RFC 822 with a stray weekday mismatch or odd zone — retry without the weekday
      d = new Date(s.replace(/^[A-Za-z]{3,9},\s*/, ''));
    }
    return isNaN(d) ? null : d;
  }
  const pad = (x) => String(x).padStart(2, '0');
  const ymd = (d) => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());

  // ------------------------------------------------------------ feed model --
  function parseFeed(src, opts) {
    opts = opts || {};
    const parsed = parseXML(src);
    const r = parsed.root;
    const rn = local(r.name);
    if (r.name.indexOf(':') > 0) unprefix(r, r.name.slice(0, r.name.indexOf(':') + 1));
    const xslt = detectXslt(src);
    let model;
    if (rn === 'rss') model = fromRss(kid(r, 'channel') || fail('RSS feed has no <channel>'), r);
    else if (rn === 'feed') model = fromAtom(r);
    else if (rn === 'RDF') model = fromRdf(r);
    else if (rn === 'urlset') model = fromUrlset(r);
    else if (rn === 'sitemapindex') model = fromSitemapIndex(r);
    else throw new FeedError('Not a recognized feed: root element is <' + r.name + '> (expected rss, feed, RDF, urlset or sitemapindex)');
    model.xslt = xslt;
    return model;
    function fail(m) { throw new FeedError(m); }
  }

  // <atom:feed> style documents: drop the root's own prefix so lookups work.
  function unprefix(el, pre) {
    if (el.name && el.name.startsWith(pre)) el.name = el.name.slice(pre.length);
    for (const c of el.children) if (c.name) unprefix(c, pre);
  }

  const AUDIO = /^(audio|video)\//i;
  function fromRss(ch, rssEl) {
    const itunesImg = exact(ch, 'itunes:image');
    const m = {
      type: 'rss', version: rssEl.attrs.version || '', title: val(ch, 'title'), description: val(ch, 'description') || val(ch, 'subtitle'),
      link: val(ch, 'link'), language: val(ch, 'language'),
      image: (itunesImg && itunesImg.attrs.href) || text(kid(kid(ch, 'image'), 'url')) || '',
      updated: parseDate(val(ch, 'lastBuildDate') || val(ch, 'pubDate')),
      author: val(ch, 'author') || val(ch, 'managingEditor'),
      podcast: false, items: []
    };
    for (const it of kids(ch, 'item')) {
      const enc = kid(it, 'enclosure');
      const content = exact(it, 'content:encoded');
      const thumb = exact(it, 'media:thumbnail') || exact(it, 'media:content');
      const ii = exact(it, 'itunes:image');
      const item = {
        title: val(it, 'title'), link: val(it, 'link'), guid: val(it, 'guid'),
        date: parseDate(val(it, 'pubDate') || pval(it, 'dc:date')),
        author: val(it, 'author') || pval(it, 'dc:creator'),
        summary: val(it, 'description'),
        content: content ? text(content) : '',
        enclosure: enc && enc.attrs.url ? { url: enc.attrs.url, type: enc.attrs.type || '', length: enc.attrs.length || '' } : null,
        image: (ii && ii.attrs.href) || (thumb && thumb.attrs.url) || '',
        duration: text(exact(it, 'itunes:duration')),
        episode: text(exact(it, 'itunes:episode')),
        categories: kids(it, 'category').map(text).filter(Boolean)
      };
      if (!item.title && !item.summary && !item.link) continue;
      if (item.enclosure && AUDIO.test(item.enclosure.type || guessType(item.enclosure.url))) m.podcast = true;
      m.items.push(item);
    }
    return m;
  }

  function guessType(url) {
    const m = /\.(mp3|m4a|aac|ogg|oga|opus|wav|mp4|m4v|webm)(?:\?|#|$)/i.exec(url || '');
    if (!m) return '';
    const e = m[1].toLowerCase();
    return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm' }[e];
  }

  function atomText(el) {
    if (!el) return { value: '', html: false };
    const t = (el.attrs.type || 'text').toLowerCase();
    if (t === 'html') return { value: text(el), html: true };
    if (t === 'xhtml') return { value: el.children.map(serialize).join('').trim(), html: true };
    return { value: text(el), html: false };
  }
  function serialize(c) {
    if (!c.name) return c.cdata ? c.text : escapeHtml(c.text);
    const nm = local(c.name);
    const at = Object.keys(c.attrs).map((k) => ' ' + k + '="' + escapeHtml(c.attrs[k]) + '"').join('');
    return '<' + nm + at + '>' + c.children.map(serialize).join('') + '</' + nm + '>';
  }

  function fromAtom(f) {
    const links = kids(f, 'link');
    const alt = links.find((l) => !l.attrs.rel || l.attrs.rel === 'alternate');
    const sub = atomText(kid(f, 'subtitle'));
    const a = kid(f, 'author');
    const m = {
      type: 'atom', version: '', title: atomText(kid(f, 'title')).value, description: sub.html ? stripTags(sub.value) : sub.value,
      link: alt ? alt.attrs.href || '' : '', language: f.attrs['xml:lang'] || '',
      image: val(f, 'logo') || val(f, 'icon'), updated: parseDate(val(f, 'updated')), author: a ? val(a, 'name') : '',
      podcast: false, items: []
    };
    for (const e of kids(f, 'entry')) {
      const ls = kids(e, 'link');
      const altL = ls.find((l) => !l.attrs.rel || l.attrs.rel === 'alternate');
      const encL = ls.find((l) => l.attrs.rel === 'enclosure');
      const sum = atomText(kid(e, 'summary'));
      const con = atomText(kid(e, 'content'));
      const ea = kid(e, 'author');
      const item = {
        title: atomText(kid(e, 'title')).value, link: altL ? altL.attrs.href || '' : '', guid: val(e, 'id'),
        date: parseDate(val(e, 'published') || val(e, 'updated')),
        author: ea ? val(ea, 'name') : '',
        summary: sum.value, summaryIsText: sum.value && !sum.html,
        content: con.value, contentIsText: con.value && !con.html,
        enclosure: encL && encL.attrs.href ? { url: encL.attrs.href, type: encL.attrs.type || '', length: encL.attrs.length || '' } : null,
        image: '', duration: '', episode: '',
        categories: kids(e, 'category').map((c) => c.attrs.term || c.attrs.label || '').filter(Boolean)
      };
      if (item.enclosure && AUDIO.test(item.enclosure.type || guessType(item.enclosure.url))) m.podcast = true;
      m.items.push(item);
    }
    return m;
  }

  function fromRdf(r) {
    const ch = kid(r, 'channel');
    const m = { type: 'rss', version: '1.0', title: val(ch, 'title'), description: val(ch, 'description'), link: val(ch, 'link'), language: val(ch, 'language'), image: '', updated: parseDate(pval(ch, 'dc:date')), author: '', podcast: false, items: [] };
    for (const it of kids(r, 'item')) m.items.push({ title: val(it, 'title'), link: val(it, 'link'), guid: '', date: parseDate(pval(it, 'dc:date')), author: pval(it, 'dc:creator'), summary: val(it, 'description'), content: '', enclosure: null, image: '', duration: '', episode: '', categories: [] });
    return m;
  }

  function fromUrlset(r) {
    const urls = kids(r, 'url').map((u) => ({ loc: val(u, 'loc'), lastmod: val(u, 'lastmod'), changefreq: val(u, 'changefreq'), priority: val(u, 'priority') })).filter((u) => u.loc);
    return { type: 'sitemap', title: 'Sitemap', description: urls.length + ' URL' + (urls.length === 1 ? '' : 's'), link: '', language: '', image: '', updated: null, author: '', podcast: false, items: [], urls };
  }
  function fromSitemapIndex(r) {
    const maps = kids(r, 'sitemap').map((s) => ({ loc: val(s, 'loc'), lastmod: val(s, 'lastmod') })).filter((s) => s.loc);
    return { type: 'sitemapindex', title: 'Sitemap index', description: maps.length + ' sitemap' + (maps.length === 1 ? '' : 's'), link: '', language: '', image: '', updated: null, author: '', podcast: false, items: [], maps };
  }

  // ------------------------------------------------------------- escaping --
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function stripTags(s) { return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

  // ----------------------------------------------------------- sanitizer --
  const ALLOWED = new Set('a abbr b blockquote br caption cite code dd del div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre q s samp small span strong sub sup table tbody td tfoot th thead time tr u ul'.split(' '));
  const VOID = new Set(['br', 'hr', 'img']);
  const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'title', 'head']);
  const ATTRS = { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], q: ['cite'], blockquote: ['cite'], time: ['datetime'] };

  function safeUrl(u, allowMail) {
    const v = decode(String(u)).replace(/[\u0000-\u001f\u007f\s]+/g, '');
    if (/^(https?:)?\/\//i.test(v) || /^https?:/i.test(v)) return v;
    if (allowMail && /^mailto:/i.test(v)) return v;
    if (/^[#/.?]/.test(v) || !/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // relative or fragment
    return null;
  }

  // Allowlist HTML sanitizer: tokenizes, never reparses output, drops everything unknown.
  function sanitizeHtml(html, opts) {
    opts = opts || {};
    const base = opts.baseUrl || '';
    const s = String(html);
    const out = [];
    const open = [];
    let i = 0, skipUntil = null;
    const resolve = (u) => {
      if (!base || /^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(u)) return u;
      try { return new URL(u, base).href; } catch (_) { return u; }
    };
    while (i < s.length) {
      const lt = s.indexOf('<', i);
      if (lt < 0) { if (!skipUntil) out.push(cleanText(s.slice(i))); break; }
      if (lt > i && !skipUntil) out.push(cleanText(s.slice(i, lt)));
      if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? s.length : e + 3; continue; }
      const gt = findTagEnd(s, lt);
      if (gt < 0) { if (!skipUntil) out.push('&lt;'); i = lt + 1; continue; }
      const raw = s.slice(lt + 1, gt);
      i = gt + 1;
      const m = raw.match(/^(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)([\s\S]*)$/);
      if (!m) { continue; } // <! ... >, <? ... ?> and junk are dropped
      const closing = !!m[1];
      const tag = m[2].toLowerCase();
      if (skipUntil) { if (closing && tag === skipUntil) skipUntil = null; continue; }
      if (DROP_WITH_CONTENT.has(tag)) { if (!closing && !/\/\s*$/.test(m[3])) skipUntil = tag; continue; }
      if (!ALLOWED.has(tag)) continue; // unwrap unknown tags, keep their text
      if (closing) {
        const idx = open.lastIndexOf(tag);
        if (idx >= 0) { while (open.length > idx) out.push('</' + open.pop() + '>'); }
        continue;
      }
      const attrs = [];
      const allowed = ATTRS[tag] || [];
      const ar = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let a;
      while ((a = ar.exec(m[3]))) {
        const name = a[1].toLowerCase();
        if (!allowed.includes(name)) continue;
        let v = a[2] != null ? a[2] : a[3] != null ? a[3] : a[4] != null ? a[4] : '';
        if (name === 'href' || name === 'src' || name === 'cite') {
          const safe = safeUrl(v, name === 'href');
          if (safe == null) continue;
          v = resolve(safe);
        } else v = decode(v);
        attrs.push(' ' + name + '="' + escapeHtml(v) + '"');
      }
      if (tag === 'img' && !attrs.some((x) => x.startsWith(' src='))) continue;
      if (tag === 'a') attrs.push(' rel="noopener noreferrer nofollow"');
      if (tag === 'img') attrs.push(' loading="lazy" referrerpolicy="no-referrer"');
      out.push('<' + tag + attrs.join('') + '>');
      if (!VOID.has(tag)) open.push(tag);
    }
    while (open.length) out.push('</' + open.pop() + '>');
    return out.join('');
  }
  function cleanText(t) { return escapeHtml(decode(t)); }
  function findTagEnd(s, lt) {
    let q = null;
    for (let j = lt + 1; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') return j;
    }
    return -1;
  }

  // ------------------------------------------------------------ rendering --
  function fmtDate(d) { return d ? ymd(d) : ''; }
  function plainToHtml(t) {
    return t.split(/\n{2,}/).map((p) => '<p>' + escapeHtml(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
  }
  function bodyHtml(item, base) {
    if (item.content) return item.contentIsText ? plainToHtml(item.content) : sanitizeHtml(item.content, { baseUrl: base });
    if (item.summary) return item.summaryIsText ? plainToHtml(item.summary) : sanitizeHtml(item.summary, { baseUrl: base });
    return '';
  }
  function hostOf(u) { try { return new URL(u).host; } catch (_) { return u; } }
  function linkOk(u) { const s = safeUrl(u || '', false); return s ? escapeHtml(s) : ''; }

  const CSS = ':root{--bg:#fbfaf7;--fg:#1d1d1f;--mut:#6b6b73;--card:#fff;--line:#e4e2dc;--acc:#c2410c;--accfg:#fff}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ecebe8;--mut:#9b9aa3;--card:#1c1c1f;--line:#2e2e33;--acc:#fb923c;--accfg:#1a1206}}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    'a{color:var(--acc)}main{max-width:760px;margin:0 auto;padding:24px 16px 64px}' +
    'header.top{display:flex;gap:16px;align-items:flex-start;margin-bottom:20px}header.top img{width:96px;height:96px;border-radius:12px;object-fit:cover;flex:none;background:var(--line)}' +
    'h1{margin:0 0 4px;font-size:1.7rem;line-height:1.2}.desc{margin:0;color:var(--mut)}' +
    '.sub{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 24px;font-size:.92rem}' +
    '.sub b{display:block;margin-bottom:6px}.sub input{user-select:all;width:100%;font:inherit;font-family:ui-monospace,Menlo,monospace;font-size:.85rem;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg)}' +
    'article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 14px}' +
    'article h2{margin:0 0 2px;font-size:1.15rem;line-height:1.3}article h2 a{text-decoration:none}article h2 a:hover{text-decoration:underline}' +
    '.meta{color:var(--mut);font-size:.85rem;margin:0 0 8px}.body{overflow-wrap:anywhere}.body img{max-width:100%;height:auto}.body pre{overflow:auto;background:var(--bg);padding:10px;border-radius:8px}' +
    'audio{width:100%;margin:8px 0}.tag{display:inline-block;font-size:.75rem;border:1px solid var(--line);border-radius:99px;padding:0 8px;margin-right:4px;color:var(--mut)}' +
    'table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}th{color:var(--mut);font-weight:600}' +
    'details{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:0 0 12px;padding:8px 14px}summary{cursor:pointer;font-weight:600}' +
    'footer{margin-top:28px;color:var(--mut);font-size:.8rem;text-align:center}';

  function renderHtml(model, opts) {
    opts = opts || {};
    const feedUrl = opts.feedUrl || '';
    const base = opts.baseUrl || model.link || feedUrl || '';
    const title = model.title || (model.type === 'sitemap' ? 'Sitemap' : 'Feed');
    const lang = /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(model.language || '') ? model.language : 'en';
    const h = [];
    h.push('<!doctype html><html lang="' + escapeHtml(lang) + '"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<meta name="color-scheme" content="light dark">',
      '<meta name="referrer" content="no-referrer">',
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: http: data:; media-src https: http:; style-src \'unsafe-inline\'">',
      '<title>' + escapeHtml(title) + '</title>');
    if (feedUrl) h.push('<link rel="alternate" type="' + (model.type === 'atom' ? 'application/atom+xml' : 'application/rss+xml') + '" title="' + escapeHtml(title) + '" href="' + escapeHtml(feedUrl) + '">');
    h.push('<style>' + CSS + '</style></head><body><main>');
    h.push('<header class="top">');
    const img = linkOk(model.image);
    if (img) h.push('<img src="' + img + '" alt="" width="96" height="96" referrerpolicy="no-referrer">');
    h.push('<div><h1>' + escapeHtml(title) + '</h1>');
    if (model.description) h.push('<p class="desc">' + escapeHtml(stripTags(model.description)) + '</p>');
    const metaBits = [];
    if (model.author) metaBits.push(escapeHtml(model.author));
    if (model.updated) metaBits.push('Updated ' + fmtDate(model.updated));
    if (metaBits.length) h.push('<p class="meta">' + metaBits.join(' · ') + '</p>');
    const home = linkOk(model.link);
    if (home) h.push('<p class="meta"><a href="' + home + '" rel="noopener">' + escapeHtml(hostOf(model.link)) + '</a></p>');
    h.push('</div></header>');

    if (model.type === 'rss' || model.type === 'atom') {
      h.push('<section class="sub" aria-label="How to subscribe"><b>This is a feed, not a web page.</b>');
      if (feedUrl) h.push('Copy this address into your feed reader or podcast app:<br><input readonly value="' + escapeHtml(feedUrl) + '" aria-label="Feed address">');
      else h.push('Copy the address of this feed into your feed reader or podcast app.');
      h.push('</section>');
      if (!model.items.length) h.push('<p class="desc">This feed has no entries yet.</p>');
      for (const it of model.items) {
        h.push('<article>');
        const lk = linkOk(it.link);
        const t = escapeHtml(it.title || it.link || 'Untitled');
        h.push('<h2>' + (lk ? '<a href="' + lk + '" rel="noopener">' + t + '</a>' : t) + '</h2>');
        const mb = [];
        if (it.date) mb.push('<time datetime="' + it.date.toISOString() + '">' + fmtDate(it.date) + '</time>');
        if (it.author) mb.push(escapeHtml(it.author));
        if (it.episode) mb.push('Episode ' + escapeHtml(it.episode));
        if (it.duration) mb.push(escapeHtml(it.duration));
        if (mb.length) h.push('<p class="meta">' + mb.join(' · ') + '</p>');
        const ii = linkOk(it.image);
        if (ii) h.push('<img src="' + ii + '" alt="" loading="lazy" style="max-width:100%;border-radius:8px" referrerpolicy="no-referrer">');
        if (it.enclosure) {
          const ty = it.enclosure.type || guessType(it.enclosure.url) || '';
          const eu = linkOk(it.enclosure.url);
          if (eu && /^audio\//i.test(ty)) h.push('<audio controls preload="none" src="' + eu + '"></audio>');
          else if (eu && /^video\//i.test(ty)) h.push('<video controls preload="none" src="' + eu + '" style="max-width:100%"></video>');
          if (eu) h.push('<p class="meta"><a href="' + eu + '" rel="noopener">Download attachment' + (ty ? ' (' + escapeHtml(ty) + ')' : '') + '</a></p>');
        }
        const body = bodyHtml(it, base);
        if (body) h.push('<div class="body">' + body + '</div>');
        if (it.categories.length) h.push('<p class="meta">' + it.categories.slice(0, 8).map((c) => '<span class="tag">' + escapeHtml(c) + '</span>').join('') + '</p>');
        h.push('</article>');
      }
    } else if (model.type === 'sitemap') {
      const groups = new Map();
      for (const u of model.urls) {
        let seg = '/';
        try { const p = new URL(u.loc).pathname.split('/').filter(Boolean); seg = p.length > 1 ? '/' + p[0] + '/' : '/'; } catch (_) { /* keep '/' */ }
        if (!groups.has(seg)) groups.set(seg, []);
        groups.get(seg).push(u);
      }
      const keys = Array.from(groups.keys()).sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b));
      for (const k of keys) {
        const us = groups.get(k);
        h.push('<details' + (keys.length <= 3 || us.length >= 1 && k === keys[0] ? ' open' : '') + '><summary>' + escapeHtml(k) + ' <span class="meta">(' + us.length + ')</span></summary><table><thead><tr><th>URL</th><th>Last modified</th></tr></thead><tbody>');
        for (const u of us) { const lk = linkOk(u.loc); h.push('<tr><td>' + (lk ? '<a href="' + lk + '" rel="noopener">' + escapeHtml(u.loc) + '</a>' : escapeHtml(u.loc)) + '</td><td>' + escapeHtml(u.lastmod) + '</td></tr>'); }
        h.push('</tbody></table></details>');
      }
    } else if (model.type === 'sitemapindex') {
      h.push('<table><thead><tr><th>Sitemap</th><th>Last modified</th></tr></thead><tbody>');
      for (const s of model.maps) { const lk = linkOk(s.loc); h.push('<tr><td>' + (lk ? '<a href="' + lk + '" rel="noopener">' + escapeHtml(s.loc) + '</a>' : escapeHtml(s.loc)) + '</td><td>' + escapeHtml(s.lastmod) + '</td></tr>'); }
      h.push('</tbody></table>');
    }
    h.push('<footer>Rendered statically by <a href="https://github.com/freyesperales/dev-experiments-365/tree/main/experiments/experiment-072">FeedFrock</a> — no JavaScript, no XSLT.</footer></main></body></html>');
    return h.join('\n');
  }

  // -------------------------------------------------------------- snippets --
  function snippets(o) {
    const xmlPath = o.xmlPath || '/feed.xml', htmlPath = o.htmlPath || '/feed.html';
    const rx = xmlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      nginx: 'map $http_accept $feedfrock_html {\n  default 0;\n  "~*text/html" 1;\n}\nserver {\n  # ...\n  location = ' + xmlPath + ' {\n    add_header Vary Accept;\n    if ($feedfrock_html) { rewrite ^ ' + htmlPath + ' last; }\n  }\n}',
      apache: '<IfModule mod_rewrite.c>\nRewriteEngine On\nRewriteCond %{HTTP_ACCEPT} text/html\nRewriteRule ^' + rx.replace(/^\\\//, '').replace(/^\//, '') + '$ ' + htmlPath + ' [L]\n</IfModule>\n<IfModule mod_headers.c>\n<Files "' + xmlPath.split('/').pop() + '">\nHeader append Vary Accept\n</Files>\n</IfModule>',
      vercel: JSON.stringify({ rewrites: [{ source: xmlPath, has: [{ type: 'header', key: 'accept', value: '.*text/html.*' }], destination: htmlPath }] }, null, 2),
      cloudflare: 'export default {\n  async fetch(request, env) {\n    const url = new URL(request.url);\n    if (url.pathname === ' + JSON.stringify(xmlPath) + ' && (request.headers.get("accept") || "").includes("text/html")) {\n      url.pathname = ' + JSON.stringify(htmlPath) + ';\n      const res = await fetch(new Request(url, request));\n      const out = new Response(res.body, res);\n      out.headers.append("Vary", "Accept");\n      return out;\n    }\n    return fetch(request);\n  }\n};',
      link: '<link rel="alternate" type="text/html" title="Human-readable version" href="' + htmlPath + '">'
    };
  }

  return { FeedError, parseXML, parseFeed, detectXslt, stripStylesheetPI, sanitizeHtml, renderHtml, snippets, escapeHtml, parseDate, guessType };
});
