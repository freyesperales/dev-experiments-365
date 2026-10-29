'use strict';
// detour core: parse URL lists, match old -> new, analyse redirect maps, export rules.
// Zero dependencies; runs unchanged in Node and in the browser (inlined into index.html).

const STOP = new Set(['index', 'html', 'htm', 'php', 'aspx', 'asp', 'jsp', 'www', 'en', 'es', 'de', 'fr', 'the', 'a', 'an', 'of', 'and', 'to', 'for', 'in', 'page', 'pages', 'default', 'home']);
const ASSET_RE = /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|map|pdf|zip|xml|txt)$/i;

function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

// ---- URL handling -------------------------------------------------------
function parseUrl(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/#.*$/, '');
  let host = '', proto = '';
  const m = /^(https?:)?\/\/([^\/?#]+)(.*)$/i.exec(s);
  if (m) { proto = (m[1] || 'https:').toLowerCase(); host = m[2].toLowerCase(); s = m[3] || '/'; }
  if (!s.startsWith('/') && !s.startsWith('?')) s = '/' + s;
  if (s.startsWith('?')) s = '/' + s;
  const qi = s.indexOf('?');
  let path = qi < 0 ? s : s.slice(0, qi);
  const query = qi < 0 ? '' : s.slice(qi + 1);
  path = path.replace(/\/{2,}/g, '/');
  return { host, proto, path, query };
}

function normKey(u, opts) {
  const o = opts || {};
  let p = safeDecode(u.path).toLowerCase();
  p = p.replace(/\/index\.(html?|php|aspx?)$/, '/').replace(/\.(html?|php|aspx?|jsp)$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p) p = '/';
  let q = '';
  if (u.query && !o.ignoreQuery) q = '?' + u.query.split('&').filter(Boolean).map(safeDecode).sort().join('&').toLowerCase();
  return p + q;
}

function encPath(p) {
  return p.split('/').map(seg => encodeURIComponent(safeDecode(seg)).replace(/%40/g, '@').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%2B/gi, '+').replace(/%3D/gi, '=')).join('/');
}

function tokens(path) {
  const out = [];
  const segs = safeDecode(path).split('/').filter(Boolean);
  for (const seg of segs) {
    const parts = seg.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(Boolean);
    for (let t of parts) {
      if (STOP.has(t)) continue;
      if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
      out.push(t);
    }
  }
  const meaningful = out.filter(t => !/^\d{1,4}$/.test(t));
  return meaningful.length ? meaningful : out;
}

function titleTokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/).filter(t => t.length > 2 && !STOP.has(t)).map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

function lastSlug(path) {
  const segs = safeDecode(path).split('/').filter(Boolean);
  let s = (segs.pop() || '').toLowerCase().replace(/\.(html?|php|aspx?|jsp)$/, '');
  if (s === 'index' && segs.length) s = segs.pop().toLowerCase();
  return s;
}

function trigrams(s) {
  const t = '  ' + s + ' ';
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

// ---- list parsing -------------------------------------------------------
function splitCsvLine(line, d) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim());
}
function pickDelim(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(';') && !/https?:\/\/[^\s;]*;/.test(line) && line.split(';').length > 1 && !line.includes(',')) return ';';
  if (line.includes(',')) return ',';
  return null;
}
function looksUrl(s) { return /^(https?:)?\/\//i.test(s) || s.startsWith('/') || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s) || s.includes('/'); }
function findCol(header, names) {
  const h = header.map(x => x.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const n of names) { const i = h.indexOf(n); if (i >= 0) return i; }
  return -1;
}

// Returns {items:[{url,title}], notes:[...]}
function parseList(text, kind) {
  const notes = [];
  const t = String(text || '').replace(/^\uFEFF/, '');
  if (/<sitemapindex/i.test(t)) notes.push('This is a sitemap INDEX: paste the child sitemaps (detour never fetches anything).');
  if (/<urlset|<loc>/i.test(t)) {
    const items = [];
    const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi; let m;
    while ((m = re.exec(t))) items.push({ url: m[1].replace(/&amp;/g, '&'), title: '' });
    return { items, notes };
  }
  const lines = t.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return { items: [], notes };
  const delim = pickDelim(lines[0]);
  let urlCol = 0, titleCol = -1, statusCol = -1, start = 0;
  if (delim) {
    const first = splitCsvLine(lines[0], delim);
    if (!looksUrl(first[0]) || first.some(c => /^(address|url|old url|loc)$/i.test(c))) {
      start = 1;
      const names = kind === 'old' ? ['oldurl', 'old', 'oldpath', 'url', 'address', 'loc', 'source', 'from', 'path', 'page'] : ['newurl', 'new', 'newpath', 'url', 'address', 'loc', 'destination', 'target', 'to', 'path', 'page'];
      urlCol = findCol(first, names); if (urlCol < 0) urlCol = 0;
      titleCol = findCol(first, ['title', 'title1', 'h1', 'h11', 'name', 'pagetitle']);
      statusCol = findCol(first, ['statuscode', 'status']);
    }
  }
  const items = []; let dropped = 0;
  for (let i = start; i < lines.length; i++) {
    const cells = delim ? splitCsvLine(lines[i], delim) : [lines[i].trim()];
    const url = cells[urlCol];
    if (!url || !looksUrl(url)) continue;
    if (statusCol >= 0 && /^[45]\d\d$/.test(cells[statusCol] || '')) { dropped++; continue; }
    items.push({ url, title: titleCol >= 0 ? cells[titleCol] || '' : '' });
  }
  if (dropped) notes.push(`Skipped ${dropped} row(s) with a 4xx/5xx status code.`);
  return { items, notes };
}

function parseMapping(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  const lines = t.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  const rows = [];
  if (!lines.length) return rows;
  let delim = pickDelim(lines[0]);
  if (!delim && /\s{2,}|\s->\s|\s/.test(lines[0])) delim = ' ';
  let a = 0, b = 1, start = 0;
  const split = l => (delim === ' ' ? l.trim().split(/\s*(?:->|=>|\s)\s*/).filter(Boolean) : splitCsvLine(l, delim));
  const first = split(lines[0]);
  if (first.length >= 2 && (!looksUrl(first[0]) || !looksUrl(first[1]))) {
    start = 1;
    a = findCol(first, ['old', 'oldurl', 'source', 'from', 'src', 'url']); if (a < 0) a = 0;
    b = findCol(first, ['new', 'newurl', 'target', 'to', 'destination', 'dst']); if (b < 0) b = 1;
  }
  for (let i = start; i < lines.length; i++) {
    const c = split(lines[i]);
    if (c[a] && c[b] !== undefined && c[b] !== '') rows.push({ src: c[a], dst: c[b] });
  }
  return rows;
}

// ---- matching -----------------------------------------------------------
function prepare(items, opts) {
  return items.map(it => {
    const u = parseUrl(it.url);
    return { raw: it.url, host: u.host, path: u.path, query: u.query, key: normKey(u, opts), pathKey: normKey(u, { ignoreQuery: true }),
      tok: tokens(u.path), stok: new Set(tokens('/' + lastSlug(u.path))), slug: lastSlug(u.path), tt: titleTokens(it.title), title: it.title || '' };
  });
}

function matchLists(oldItems, newItems, options) {
  const o = Object.assign({ threshold: 0.55, ignoreQuery: true, fallback: '', margin: 0.04 }, options);
  const olds = prepare(oldItems, { ignoreQuery: o.ignoreQuery });
  const news = prepare(newItems, { ignoreQuery: o.ignoreQuery });
  // de-duplicate the new site by key
  const newByKey = new Map(), uniqNews = [];
  for (const n of news) if (!newByKey.has(n.key)) { newByKey.set(n.key, uniqNews.length); uniqNews.push(n); }
  // idf over both lists
  const df = new Map();
  for (const n of uniqNews.concat(olds)) for (const t of new Set(n.tok)) df.set(t, (df.get(t) || 0) + 1);
  const total = uniqNews.length + olds.length;
  const w = t => Math.log(1 + total / (df.get(t) || 1));
  const inv = new Map();
  uniqNews.forEach((n, i) => { n.tgram = trigrams(n.slug); n.tset = new Set(n.tok); n.ttset = new Set(n.tt); for (const t of new Set([...n.tset, ...n.ttset])) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push(i); } });
  const slugIdx = new Map();
  uniqNews.forEach((n, i) => { if (n.slug) { if (!slugIdx.has(n.slug)) slugIdx.set(n.slug, []); slugIdx.get(n.slug).push(i); } });
  const maxPost = Math.max(25, Math.floor(uniqNews.length * 0.25));

  function score(a, b) {
    const A = new Set(a.tok), B = b.tset;
    let inter = 0, sa = 0, sb = 0;
    for (const t of A) { const x = w(t) * (a.stok.has(t) ? 2 : 1); sa += x; if (B.has(t)) inter += Math.min(x, w(t) * (b.stok.has(t) ? 2 : 1)); }
    for (const t of B) sb += w(t) * (b.stok.has(t) ? 2 : 1);
    const union = sa + sb - inter;
    const J = union ? inter / union : 0, Ca = sa ? inter / sa : 0, Cb = sb ? inter / sb : 0;
    let p = 0.4 * J + 0.3 * Ca + 0.3 * Cb;
    p = 0.78 * p + 0.22 * dice(trigrams(a.slug), b.tgram);
    if (a.tt.length && b.tt.length) {
      let ti = 0; const bs = b.ttset;
      for (const t of new Set(a.tt)) if (bs.has(t)) ti++;
      const tu = new Set(a.tt).size + bs.size - ti;
      const T = tu ? ti / tu : 0;
      p = Math.max(0.6 * p + 0.4 * T, T >= 0.8 ? T * 0.95 : 0);
    }
    return Math.min(p, 0.97);
  }

  const seenOld = new Map();
  const rules = [];
  for (const a of olds) {
    const dup = seenOld.get(a.key);
    if (dup !== undefined) { rules.push({ src: a.raw, srcPath: a.path, srcQuery: a.query, dst: null, score: 0, how: 'duplicate', candidates: [], flags: ['duplicate-input'] }); continue; }
    seenOld.set(a.key, rules.length);
    const rule = { src: a.raw, srcPath: a.path, srcQuery: a.query, dst: null, dstRaw: null, score: 0, how: 'none', candidates: [], flags: [], asset: ASSET_RE.test(a.path) };
    rules.push(rule);
    let cands = [];
    const ex = newByKey.get(a.key);
    if (ex !== undefined) cands.push({ i: ex, s: 1, how: 'exact' });
    else {
      const ex2 = newByKey.get(normKey({ path: a.path, query: '' }, { ignoreQuery: true }));
      if (ex2 !== undefined && !a.query) cands.push({ i: ex2, s: 0.99, how: 'normalized' });
    }
    if (!cands.length) {
      const pool = new Set();
      for (const t of new Set([...a.tok, ...a.tt])) { const l = inv.get(t); if (l && l.length <= maxPost) for (const i of l) pool.add(i); }
      const sl = slugIdx.get(a.slug); if (sl && a.slug.length > 2) for (const i of sl) pool.add(i);
      const list = [];
      for (const i of pool) {
        let s = score(a, uniqNews[i]);
        let how = 'fuzzy';
        if (a.slug && a.slug === uniqNews[i].slug && a.slug.length > 2) { s = Math.max(s, 0.9 - (sl && sl.length > 1 ? 0.12 : 0)); how = 'slug'; }
        list.push({ i, s, how });
      }
      list.sort((x, y) => y.s - x.s);
      cands = list.filter(c => c.s >= 0.12).slice(0, 5);
    }
    rule.candidates = cands.map(c => ({ dst: uniqNews[c.i].raw, score: round(c.s), how: c.how, title: uniqNews[c.i].title }));
    if (cands.length) {
      const best = cands[0];
      rule.score = round(best.s); rule.how = best.how;
      rule.dstRaw = uniqNews[best.i].raw;
      if (best.how === 'fuzzy' && best.s >= 0.3 && (!cands[1] || best.s - cands[1].s > 0.25)) { best.s = Math.min(0.97, best.s + 0.1); rule.score = round(best.s); rule.candidates[0].score = rule.score; }
      if (best.s >= o.threshold) rule.dst = rule.dstRaw;
      else rule.flags.push('low-confidence');
      if (cands[1] && best.how !== 'exact' && best.how !== 'normalized' && best.s - cands[1].s < o.margin) rule.flags.push('ambiguous');
    }
    if (!rule.dst && o.fallback) { rule.dst = o.fallback; rule.how = 'fallback'; rule.flags.push('fallback'); }
  }
  const used = new Set(rules.filter(r => r.dst).map(r => normKey(parseUrl(r.dst), { ignoreQuery: true })));
  const orphans = uniqNews.filter(n => !used.has(normKey({ path: n.path, query: '' }, { ignoreQuery: true }))).map(n => n.raw);
  return { rules, orphans };
}
function round(x) { return Math.round(x * 1000) / 1000; }

// ---- analysis -----------------------------------------------------------
// Adds flags to every active rule (rules with a dst): self, loop, chain, conflict, collision.
// Sets rule.final (flattened destination) and rule.hops.
function analyze(rules) {
  // Server-level identity: case-insensitive, trailing slash ignored, extension KEPT (/about.html and /about are different URLs).
  const ck = (path, query, withQ) => {
    let p = safeDecode(path).toLowerCase(); if (p.length > 1) p = p.replace(/\/+$/, ''); if (!p) p = '/';
    return withQ && query ? p + '?' + query.split('&').filter(Boolean).map(safeDecode).sort().join('&').toLowerCase() : p;
  };
  const key = r => ck(r.srcPath, r.srcQuery, true);
  const dkey = d => { const u = parseUrl(d); return ck(u.path, u.query, true); };
  const dpath = d => { const u = parseUrl(d); return ck(u.path, '', false); };
  const active = rules.filter(r => r.dst);
  for (const r of rules) r.flags = (r.flags || []).filter(f => !['self', 'loop', 'chain', 'conflict', 'collision', 'external-chain'].includes(f));
  const map = new Map(), raws = new Map();
  for (const r of active) {
    const k = key(r);
    if (map.has(k) && map.get(k).dst !== r.dst) { r.flags.push('conflict'); map.get(k).flags.includes('conflict') || map.get(k).flags.push('conflict'); }
    else if (!map.has(k)) map.set(k, r);
    const rs = raws.get(k) || new Set(); rs.add(r.srcPath + '?' + r.srcQuery); raws.set(k, rs);
  }
  for (const r of active) if (raws.get(key(r)).size > 1 && !r.flags.includes('collision')) r.flags.push('collision');
  for (const r of active) {
    const start = key(r);
    const sameQ = !r.srcQuery || dkey(r.dst) === start;
    if (dpath(r.dst) === ck(r.srcPath, '', false) && sameQ) { r.flags.push('self'); r.final = r.dst; r.hops = 0; continue; }
    const seen = new Set([start]);
    let cur = r.dst, hops = 0, loop = false;
    for (;;) {
      const nxt = map.get(dkey(cur)) || map.get(dpath(cur));
      if (!nxt || nxt === r || !nxt.dst) break;
      seen.add(dpath(cur)); cur = nxt.dst; hops++;
      if (seen.has(dpath(cur)) || dkey(cur) === start || hops > 50) { loop = true; break; }
    }
    r.hops = hops; r.final = cur;
    if (loop) r.flags.push('loop'); else if (hops > 0) r.flags.push('chain');
  }
  return summarize(rules);
}

function summarize(rules) {
  const s = { total: rules.length, active: 0, review: 0, unmatched: 0, chain: 0, loop: 0, self: 0, conflict: 0, collision: 0, fallback: 0, duplicate: 0, exact: 0 };
  for (const r of rules) {
    if (r.dst) s.active++;
    if (!r.dst && r.how !== 'duplicate') s.unmatched++;
    if (r.flags.includes('ambiguous') || r.flags.includes('low-confidence')) s.review++;
    if (r.how === 'exact' || r.how === 'normalized') s.exact++;
    for (const f of ['chain', 'loop', 'self', 'conflict', 'collision', 'fallback']) if (r.flags.includes(f)) s[f]++;
    if (r.how === 'duplicate') s.duplicate++;
  }
  return s;
}

// Rules ready for export: active, not loops/self, optionally flattened, de-duplicated by source.
function exportable(rules, opts) {
  const o = Object.assign({ flatten: true, skipAssets: false }, opts);
  const out = [], seen = new Set();
  for (const r of rules) {
    if (!r.dst || r.flags.includes('loop') || r.flags.includes('self')) continue;
    if (o.skipAssets && r.asset) continue;
    const k = r.srcPath + '?' + r.srcQuery;
    if (seen.has(k)) continue; seen.add(k);
    const d = parseUrl(o.flatten && r.final ? r.final : r.dst);
    out.push({ path: safeDecode(u0(r.srcPath)), query: r.srcQuery, dstUrl: d, dst: d.host && !o.sameHost ? d.proto + '//' + d.host + d.path + (d.query ? '?' + d.query : '') : d.path + (d.query ? '?' + d.query : '') });
  }
  return out;
}
function u0(p) { return p.length > 1 && p.endsWith('/') ? p.replace(/\/+$/, '') : p; }
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function encDst(d) { const u = parseUrl(d); const base = d.match(/^(https?:)?\/\/[^\/?#]+/i); return (base ? (u.proto + '//' + u.host) : '') + encPath(u.path) + (u.query ? '?' + u.query : ''); }

const FORMATS = ['netlify', 'apache', 'nginx', 'vercel', 'cloudflare-pages', 'cloudflare-bulk'];

function toFormat(fmt, rules, opts) {
  const o = Object.assign({ oldHost: 'https://old.example.com', newHost: 'https://new.example.com', slashVariants: true }, opts);
  const ex = exportable(rules, opts);
  const L = [];
  switch (fmt) {
    case 'netlify':
    case 'cloudflare-pages': {
      const cf = fmt === 'cloudflare-pages';
      if (cf) L.push('# Cloudflare Pages _redirects: query-string rules are not supported there and are skipped.');
      for (const r of ex) {
        if (r.query) {
          if (cf) { L.push('# skipped (query rule): ' + r.path + '?' + r.query + ' -> ' + r.dst); continue; }
          L.push(`${encPath(r.path)} ${r.query.split('&').filter(Boolean).join(' ')} ${encDst(r.dst)} 301`);
        } else L.push(`${encPath(r.path)} ${encDst(r.dst)} 301`);
      }
      return { filename: '_redirects', content: L.join('\n') + '\n', count: ex.length };
    }
    case 'apache': {
      const rw = [];
      L.push('# Generated by detour. Needs mod_alias (and mod_rewrite for query-string rules).');
      for (const r of ex) {
        if (r.query) {
          const conds = r.query.split('&').filter(Boolean);
          rw.push(`RewriteCond %{QUERY_STRING} ^${reEsc(conds.join('&'))}$`);
          rw.push(`RewriteRule ^${reEsc(r.path)}/?$ ${encDst(r.dst)}? [R=301,L]`);
        } else L.push(`RedirectMatch 301 "^${reEsc(encPath(r.path) === r.path ? r.path : safeDecode(r.path))}/?$" "${encDst(r.dst)}"`);
      }
      if (rw.length) { L.push('', '<IfModule mod_rewrite.c>', 'RewriteEngine On', ...rw, '</IfModule>'); }
      return { filename: 'redirects.htaccess', content: L.join('\n') + '\n', count: ex.length };
    }
    case 'nginx': {
      L.push('# Generated by detour. Put the map{} block in http{}, the if-block in server{}.');
      L.push('map $request_uri $detour_target {', '    default "";');
      for (const r of ex) {
        const src = encPath(r.path) + (r.query ? '?' + r.query : '');
        const q = s => '"' + s.replace(/(["\\$])/g, '\\$1') + '"';
        L.push(`    ${q(src)} ${q(encDst(r.dst))};`);
        if (o.slashVariants && !r.query && r.path !== '/') L.push(`    ${q(src + '/')} ${q(encDst(r.dst))};`);
      }
      L.push('}', '', '# inside server { ... }', 'if ($detour_target) { return 301 $detour_target; }');
      return { filename: 'redirects.nginx.conf', content: L.join('\n') + '\n', count: ex.length };
    }
    case 'vercel': {
      const esc = s => s.replace(/([:*()?+{}])/g, '\\$1');
      const redirects = ex.map(r => {
        const item = { source: esc(encPath(r.path)), destination: encDst(r.dst), permanent: true };
        if (r.query) item.has = r.query.split('&').filter(Boolean).map(p => { const i = p.indexOf('='); return i < 0 ? { type: 'query', key: p } : { type: 'query', key: p.slice(0, i), value: p.slice(i + 1) }; });
        return item;
      });
      return { filename: 'vercel.json', content: JSON.stringify({ redirects }, null, 2) + '\n', count: ex.length };
    }
    case 'cloudflare-bulk': {
      const csv = s => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      for (const r of ex) {
        const src = o.oldHost.replace(/\/$/, '') + encPath(r.path) + (r.query ? '?' + r.query : '');
        const dst = /^https?:/i.test(r.dst) ? encDst(r.dst) : o.newHost.replace(/\/$/, '') + encDst(r.dst);
        L.push([src, dst, 301].map(x => csv(String(x))).join(','));
      }
      return { filename: 'cloudflare-bulk-redirects.csv', content: L.join('\n') + '\n', count: ex.length };
    }
    default: throw new Error('unknown format: ' + fmt);
  }
}

function qaCsv(rules) {
  const csv = s => { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [['old_url', 'new_url', 'final_url', 'confidence', 'method', 'status', 'flags', 'runner_up']];
  for (const r of rules) {
    const status = !r.dst ? (r.how === 'duplicate' ? 'duplicate' : 'UNMATCHED') : r.flags.some(f => ['loop', 'self', 'conflict'].includes(f)) ? 'PROBLEM' : r.flags.some(f => ['ambiguous', 'low-confidence', 'chain', 'collision'].includes(f)) ? 'review' : 'ok';
    rows.push([r.src, r.dst || '', r.final && r.final !== r.dst ? r.final : '', r.score, r.how, status, r.flags.join(' '), r.candidates[1] ? r.candidates[1].dst : '']);
  }
  return rows.map(r => r.map(csv).join(',')).join('\n') + '\n';
}

function verifyScript(rules, opts) {
  const o = Object.assign({ oldHost: 'https://old.example.com' }, opts);
  const ex = exportable(rules, opts);
  const sh = s => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const L = ['#!/usr/bin/env bash', '# Generated by detour. Run AFTER the rules are live: checks each old URL answers 301 with the expected Location.', 'HOST=${1:-' + o.oldHost + '}', 'pass=0; fail=0', 'check() {',
    '  out=$(curl -s -o /dev/null --max-time 15 -w "%{http_code} %{redirect_url}" "$HOST$1")',
    '  code=${out%% *}; loc=${out#* }; loc=${loc#http*://*/}; loc="/${loc#/}"',
    '  want="$2"; want=${want#http*://*/}; want="/${want#/}"',
    '  if [ "$code" = "301" ] && [ "${loc%/}" = "${want%/}" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL $1 -> got $code $loc, want 301 $2"; fi',
    '}'];
  for (const r of ex) L.push(`check ${sh(encPath(r.path) + (r.query ? '?' + r.query : ''))} ${sh(encDst(r.dst))}`);
  L.push('echo "$pass ok, $fail failed"', '[ "$fail" -eq 0 ]');
  return L.join('\n') + '\n';
}

// Analyse an existing old->new map (no matching).
function loadMapping(text, newText) {
  const rows = parseMapping(text);
  const rules = rows.map(r => { const u = parseUrl(r.src); return { src: r.src, srcPath: u.path, srcQuery: u.query, dst: r.dst, score: 1, how: 'given', candidates: [], flags: [] }; });
  const notes = [];
  if (newText) {
    const known = new Set(parseList(newText, 'new').items.map(i => normKey(parseUrl(i.url), { ignoreQuery: true })));
    for (const r of rules) { const k = normKey(parseUrl(r.dst), { ignoreQuery: true }); if (!known.has(k) && !/^https?:\/\//i.test(r.dst)) r.flags.push('target-missing'); }
    if (known.size) notes.push(`Checked targets against ${known.size} URLs of the new site.`);
  }
  return { rules, notes };
}

const api = { parseUrl, normKey, tokens, parseList, parseMapping, matchLists, analyze, summarize, exportable, toFormat, qaCsv, verifyScript, loadMapping, FORMATS, encPath };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else if (typeof window !== 'undefined') window.Detour = api;
