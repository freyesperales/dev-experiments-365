// HARbor core — HAR parsing, filtering, summary, curl export, redaction, diff. Zero dependencies, works in Node and the browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HARbor = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PHASES = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'];

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d); }
  function pos(v) { return num(v) > 0 ? v : 0; } // HAR uses -1 for "not applicable"

  function typeOf(mime, url) {
    const m = (mime || '').toLowerCase();
    if (m.includes('json')) return 'json';
    if (m.includes('html')) return 'html';
    if (m.includes('css')) return 'css';
    if (m.includes('javascript') || m.includes('ecmascript')) return 'js';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('font/') || m.includes('font')) return 'font';
    if (m.includes('xml')) return 'xml';
    if (m.startsWith('video/') || m.startsWith('audio/')) return 'media';
    if (m.includes('wasm')) return 'wasm';
    if (m.startsWith('text/')) return 'text';
    const ext = (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url || '') || [])[1];
    if (ext) {
      const e = ext.toLowerCase();
      if (['js', 'mjs'].includes(e)) return 'js';
      if (e === 'css') return 'css';
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(e)) return 'image';
      if (['woff', 'woff2', 'ttf', 'otf'].includes(e)) return 'font';
    }
    return 'other';
  }

  function parseUrl(u) {
    try { const x = new URL(u); return { host: x.host, path: x.pathname, search: x.search, origin: x.origin }; }
    catch (e) { return { host: '', path: String(u || ''), search: '', origin: '' }; }
  }

  function parseHar(text) {
    if (typeof text !== 'string') throw new Error('HAR input must be text');
    text = text.replace(/^﻿/, '');
    let har;
    try { har = JSON.parse(text); } catch (e) { throw new Error('Not valid JSON: ' + e.message); }
    if (!har || typeof har !== 'object' || !har.log) throw new Error('Not a HAR file: missing top-level "log" object');
    if (!Array.isArray(har.log.entries)) throw new Error('Not a HAR file: "log.entries" is not an array');
    const raw = har.log.entries;
    const times = raw.map(e => Date.parse(e && e.startedDateTime)).filter(t => !isNaN(t));
    const t0 = times.length ? Math.min.apply(null, times) : 0;
    const entries = raw.map((e, i) => normalize(e || {}, i, t0));
    entries.sort((a, b) => a.start - b.start || a.index - b.index);
    const end = entries.reduce((m, e) => Math.max(m, e.start + e.time), 0);
    return {
      har, entries,
      meta: {
        creator: (har.log.creator && [har.log.creator.name, har.log.creator.version].filter(Boolean).join(' ')) || 'unknown',
        version: har.log.version || '',
        pages: (har.log.pages || []).map(p => ({ id: p.id, title: p.title, onLoad: num(p.pageTimings && p.pageTimings.onLoad, -1), onContentLoad: num(p.pageTimings && p.pageTimings.onContentLoad, -1) })),
        t0, wall: end, started: t0 ? new Date(t0).toISOString() : ''
      }
    };
  }

  function normalize(e, i, t0) {
    const req = e.request || {}, res = e.response || {}, t = e.timings || {};
    const u = parseUrl(req.url);
    const st = Date.parse(e.startedDateTime);
    const phases = {};
    PHASES.forEach(p => { phases[p] = pos(t[p]); });
    if (t.ssl > 0 && t.connect >= t.ssl) phases.connect = t.connect - t.ssl; // connect includes ssl in HAR 1.2
    const sum = PHASES.reduce((s, p) => s + phases[p], 0);
    const time = num(e.time, -1) >= 0 ? e.time : sum;
    const mime = (res.content && res.content.mimeType) || '';
    const hdr = h => (Array.isArray(h) ? h : []).filter(x => x && x.name).map(x => ({ name: String(x.name), value: String(x.value == null ? '' : x.value) }));
    const status = num(res.status, 0);
    let body = res.content && res.content.text;
    if (typeof body === 'string' && res.content.encoding === 'base64') body = { base64: true, length: body.length };
    const bodySize = res.bodySize >= 0 ? res.bodySize : -1;
    const contentSize = num(res.content && res.content.size, -1);
    const transfer = num(res._transferSize, -1) >= 0 ? res._transferSize : (bodySize >= 0 ? bodySize + Math.max(0, num(res.headersSize, 0)) : (contentSize >= 0 ? contentSize : 0));
    return {
      index: i, method: String(req.method || 'GET').toUpperCase(), url: String(req.url || ''), host: u.host, path: u.path, search: u.search, origin: u.origin,
      status, statusText: res.statusText || '', httpVersion: res.httpVersion || req.httpVersion || '',
      mime, type: typeOf(mime, req.url), start: isNaN(st) ? 0 : st - t0, time, phases,
      size: transfer, contentSize: contentSize < 0 ? 0 : contentSize,
      reqHeaders: hdr(req.headers), resHeaders: hdr(res.headers),
      query: (req.queryString || []).map(q => ({ name: q.name, value: q.value })),
      reqBody: req.postData ? { mime: req.postData.mimeType || '', text: req.postData.text || '' } : null,
      resBody: body === undefined ? null : body,
      serverIP: e.serverIPAddress || '', connection: e.connection || '', page: e.pageref || '',
      failed: status === 0 || status >= 400, error: res._error || (status === 0 ? 'no response (blocked, aborted or failed)' : ''),
      redirect: res.redirectURL || '', cached: !!(e.cache && (e.cache.beforeRequest || e.cache.afterRequest)) || status === 304
    };
  }

  // ---- filter: free text + field:value tokens, "-" negates, quotes group ----
  function tokenize(q) {
    const out = []; const re = /(-?)(?:([a-z]+):)?("([^"]*)"|\S+)/gi; let m;
    while ((m = re.exec(q || ''))) out.push({ neg: !!m[1], field: m[2] ? m[2].toLowerCase() : '', val: (m[4] !== undefined ? m[4] : m[3]) });
    return out;
  }
  function parseSize(s) {
    const m = /^(\d+(?:\.\d+)?)\s*(b|k|kb|m|mb)?$/i.exec(String(s).trim());
    if (!m) return NaN;
    const u = (m[2] || 'b').toLowerCase();
    return parseFloat(m[1]) * (u[0] === 'k' ? 1024 : u[0] === 'm' ? 1048576 : 1);
  }
  function matchToken(e, t) {
    const v = t.val.toLowerCase();
    switch (t.field) {
      case 'status': return /^[1-5]xx$/.test(v) ? Math.floor(e.status / 100) === +v[0] : v === 'failed' ? e.failed : String(e.status) === v;
      case 'method': return e.method.toLowerCase() === v;
      case 'host': return e.host.toLowerCase().includes(v);
      case 'type': return e.type === v || e.mime.toLowerCase().includes(v);
      case 'slower': { const n = parseFloat(v); return !isNaN(n) && e.time > n; }
      case 'larger': { const n = parseSize(v); return !isNaN(n) && e.size > n; }
      case 'header': { const i = v.indexOf('='); const hay = e.reqHeaders.concat(e.resHeaders);
        return hay.some(h => i < 0 ? h.name.toLowerCase() === v : h.name.toLowerCase() === v.slice(0, i) && h.value.toLowerCase().includes(v.slice(i + 1))); }
      case 'body': return [e.reqBody && e.reqBody.text, typeof e.resBody === 'string' ? e.resBody : ''].some(s => s && s.toLowerCase().includes(v));
      case 'cached': return e.cached === (v !== 'false');
      case 'url': case '': return e.url.toLowerCase().includes(v) || (t.field === '' && e.method.toLowerCase() === v);
      default: return e.url.toLowerCase().includes((t.field + ':' + t.val).toLowerCase());
    }
  }
  function filter(entries, q) {
    const toks = tokenize(q);
    if (!toks.length) return entries.slice();
    return entries.filter(e => toks.every(t => matchToken(e, t) !== t.neg));
  }

  // ---- summary ----
  function summarize(entries) {
    const by = (key) => { const m = {}; entries.forEach(e => { const k = key(e); const o = m[k] || (m[k] = { key: k, count: 0, bytes: 0, time: 0 }); o.count++; o.bytes += e.size; o.time += e.time; }); return Object.values(m).sort((a, b) => b.bytes - a.bytes); };
    const end = entries.reduce((m, e) => Math.max(m, e.start + e.time), 0);
    const hosts = by(e => e.host || '(unknown)');
    const slowest = entries.slice().sort((a, b) => b.time - a.time).slice(0, 5);
    const failed = entries.filter(e => e.failed);
    const dupes = {}; entries.forEach(e => { if (e.method === 'GET') { const k = e.url; (dupes[k] = dupes[k] || []).push(e); } });
    const duplicates = Object.values(dupes).filter(a => a.length > 1 && a[0].type !== 'image').map(a => ({ url: a[0].url, count: a.length, bytes: a.reduce((s, e) => s + e.size, 0) })).sort((a, b) => b.count - a.count);
    const slowPhase = {}; PHASES.forEach(p => { slowPhase[p] = entries.reduce((s, e) => s + e.phases[p], 0); });
    return {
      count: entries.length, bytes: entries.reduce((s, e) => s + e.size, 0), wall: end,
      failed: failed.length, cached: entries.filter(e => e.cached).length,
      byType: by(e => e.type), byHost: hosts, slowest, failedList: failed, duplicates, phaseTotals: slowPhase,
      statusClasses: [2, 3, 4, 5].map(c => ({ cls: c + 'xx', count: entries.filter(e => Math.floor(e.status / 100) === c).length })).concat([{ cls: 'none', count: entries.filter(e => e.status === 0).length }])
    };
  }

  // ---- copy as curl ----
  function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function toCurl(e) {
    const skip = new Set(['content-length', 'host', 'connection', 'accept-encoding']);
    const parts = ['curl', shq(e.url)];
    if (e.method !== 'GET') parts.push('-X', e.method);
    e.reqHeaders.forEach(h => { if (h.name.startsWith(':') || skip.has(h.name.toLowerCase())) return; parts.push('-H', shq(h.name + ': ' + h.value)); });
    if (e.reqHeaders.some(h => h.name.toLowerCase() === 'accept-encoding')) parts.push('--compressed');
    if (e.reqBody && e.reqBody.text) parts.push(/^[\x20-\x7e\n\r\t]*$/.test(e.reqBody.text) ? '--data-raw' : '--data-binary', shq(e.reqBody.text));
    return parts.join(' ');
  }

  // ---- redaction ----
  const SECRET_HEADERS = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token|x-amz-security-token|x-goog-api-key|api-key|apikey|x-access-token|x-session-id|x-forwarded-for|x-real-ip)$/i;
  const SECRET_KEYS = /(^|[_\-.])(token|access_?token|refresh_?token|id_?token|secret|client_?secret|password|passwd|pwd|api_?key|apikey|key|cvc|cvv|card_?number|auth|authorization|session|sid|sig|signature|code|jwt|csrf|xsrf|credential|otp|pin|ssn)($|[_\-.])|token$|secret$|password$|apikey$|api_key$/i;
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
  const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]{8,}/g;
  const AWS = /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g;
  const GH = /\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
  const STRIPE = /\b(?:sk|pk|rk|tok|whsec)_(?:live|test)_[A-Za-z0-9]{4,}\b/g;
  const CARDISH = /^(card|cards|payment|payment_?method|credit_?card|billing|bank|account_?number|iban)$/i;
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const MASK = '[REDACTED]';

  function luhn(d) { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return d.length >= 13 && d.length <= 19 && s % 10 === 0; }
  function redactString(s, c, opts) {
    let out = s;
    [JWT, BEARER, AWS, GH, STRIPE].forEach(re => { out = out.replace(re, () => { c.patterns++; return MASK; }); });
    out = out.replace(/\b\d(?:[ -]?\d){12,18}\b/g, m => luhn(m.replace(/\D/g, '')) ? (c.patterns++, MASK) : m);
    if (opts.emails) out = out.replace(EMAIL, () => { c.emails++; return MASK; });
    return out;
  }
  function redactJson(v, c, opts, key, forced) {
    if (Array.isArray(v)) return v.map(x => redactJson(x, c, opts, key, forced));
    if (v && typeof v === 'object') { const f = forced || (key && CARDISH.test(key)); const o = {}; Object.keys(v).forEach(k => { o[k] = redactJson(v[k], c, opts, k, f); }); return o; }
    if (forced && v != null && v !== '') { c.fields++; return MASK; }
    if (typeof v === 'string') {
      if (key && SECRET_KEYS.test(key) && v) { c.fields++; return MASK; }
      return redactString(v, c, opts);
    }
    if (key && SECRET_KEYS.test(key) && v != null && typeof v === 'number') { c.fields++; return MASK; }
    return v;
  }
  function redactText(text, mime, c, opts) {
    if (typeof text !== 'string' || !text) return text;
    if (/json/i.test(mime) || /^\s*[\[{]/.test(text)) { try { return JSON.stringify(redactJson(JSON.parse(text), c, opts)); } catch (e) { /* fall through */ } }
    if (/x-www-form-urlencoded/i.test(mime)) {
      return text.split('&').map(p => { const i = p.indexOf('='); if (i < 0) return p; const k = decodeURIComponent(p.slice(0, i).replace(/\+/g, ' ')); if (SECRET_KEYS.test(k) && p.slice(i + 1)) { c.fields++; return p.slice(0, i + 1) + MASK; } return p.slice(0, i + 1) + redactString(p.slice(i + 1), c, opts); }).join('&');
    }
    return redactString(text, c, opts);
  }
  function redactUrl(u, c, opts) {
    let x; try { x = new URL(u); } catch (e) { return redactString(u, c, opts); }
    if (x.username || x.password) { x.username = 'REDACTED'; x.password = ''; c.fields++; }
    for (const k of Array.from(x.searchParams.keys())) {
      if (SECRET_KEYS.test(k)) { x.searchParams.set(k, MASK); c.fields++; }
      else x.searchParams.set(k, redactString(x.searchParams.get(k), c, opts));
    }
    return x.toString().replace(/%5BREDACTED%5D/g, MASK);
  }
  function redact(har, opts) {
    opts = Object.assign({ emails: false, bodies: true }, opts || {});
    const c = { headers: 0, cookies: 0, fields: 0, patterns: 0, emails: 0, bodiesDropped: 0 };
    const out = JSON.parse(JSON.stringify(har));
    const hdrs = list => (list || []).forEach(h => {
      if (SECRET_HEADERS.test(h.name)) { if (h.value !== MASK) c.headers++; h.value = MASK; }
      else h.value = redactString(String(h.value), c, opts);
    });
    (out.log.entries || []).forEach(e => {
      const rq = e.request || {}, rs = e.response || {};
      if (rq.url) rq.url = redactUrl(rq.url, c, opts);
      if (rs.redirectURL) rs.redirectURL = redactUrl(rs.redirectURL, c, opts);
      hdrs(rq.headers); hdrs(rs.headers);
      (rq.queryString || []).forEach(q => { if (SECRET_KEYS.test(q.name) && q.value) { q.value = MASK; c.fields++; } else q.value = redactString(String(q.value), c, opts); });
      [rq.cookies, rs.cookies].forEach(cs => (cs || []).forEach(k => { if (k.value !== MASK) c.cookies++; k.value = MASK; }));
      if (rq.postData) {
        if (rq.postData.text) rq.postData.text = redactText(rq.postData.text, rq.postData.mimeType, c, opts);
        (rq.postData.params || []).forEach(p => { if (SECRET_KEYS.test(p.name) && p.value) { p.value = MASK; c.fields++; } });
      }
      if (rs.content && typeof rs.content.text === 'string') {
        if (rs.content.encoding === 'base64' && !opts.keepBinary) { delete rs.content.text; delete rs.content.encoding; c.bodiesDropped++; }
        else if (opts.bodies === false) { delete rs.content.text; c.bodiesDropped++; }
        else rs.content.text = redactText(rs.content.text, rs.content.mimeType, c, opts);
      }
    });
    if (out.log.pages) out.log.pages.forEach(p => { if (p.title) p.title = redactUrl(p.title, c, opts); });
    c.total = c.headers + c.cookies + c.fields + c.patterns + c.emails;
    return { har: out, counts: c };
  }
  // Re-scan a (supposedly) redacted HAR text for leftover secret-shaped strings.
  function scan(text) {
    const hits = [];
    [['JWT', JWT], ['Bearer/Basic token', BEARER], ['AWS key id', AWS], ['API key / PAT', GH], ['Stripe-style key', STRIPE]].forEach(([n, re]) => { const m = text.match(new RegExp(re.source, 'g')); if (m) hits.push({ kind: n, count: m.length }); });
    return hits;
  }

  // ---- diff two HARs ----
  const VOLATILE = /^(_|t|ts|timestamp|cb|cachebust|nocache|rnd|rand|random|nonce|v|ver|_t|_ts)$/i;
  function diffKey(e, strict) {
    let q = '';
    if (strict) { try { const p = new URL(e.url).searchParams; const ks = []; p.forEach((v, k) => { if (!VOLATILE.test(k)) ks.push(k + '=' + v); }); q = ks.sort().join('&'); } catch (x) { q = ''; } }
    return e.method + ' ' + e.host + e.path + (q ? '?' + q : '');
  }
  function diff(a, b, opts) {
    opts = Object.assign({ slowRatio: 1.5, slowMs: 100, sizeRatio: 1.5, sizeBytes: 1024 }, opts || {});
    const pool = new Map();
    a.forEach(e => { const k = diffKey(e, true); (pool.get(k) || pool.set(k, []).get(k)).push(e); });
    const loose = new Map();
    a.forEach(e => { const k = diffKey(e, false); (loose.get(k) || loose.set(k, []).get(k)).push(e); });
    const used = new Set(), pairs = [], added = [];
    const take = (map, k) => { const l = map.get(k); if (!l) return null; const x = l.find(e => !used.has(e)); if (x) used.add(x); return x || null; };
    b.forEach(e => {
      const m = take(pool, diffKey(e, true)) || take(loose, diffKey(e, false));
      if (m) pairs.push([m, e]); else added.push(e);
    });
    const removed = a.filter(e => !used.has(e));
    const changed = [], same = [];
    pairs.forEach(([x, y]) => {
      const why = [];
      if (x.status !== y.status) why.push({ kind: 'status', from: x.status, to: y.status, bad: (y.failed && !x.failed) });
      const dt = y.time - x.time;
      if (dt > opts.slowMs && y.time > x.time * opts.slowRatio) why.push({ kind: 'slower', from: x.time, to: y.time, bad: true });
      else if (-dt > opts.slowMs && x.time > y.time * opts.slowRatio) why.push({ kind: 'faster', from: x.time, to: y.time, bad: false });
      const ds = y.size - x.size;
      if (ds > opts.sizeBytes && y.size > x.size * opts.sizeRatio) why.push({ kind: 'larger', from: x.size, to: y.size, bad: true });
      else if (-ds > opts.sizeBytes && x.size > y.size * opts.sizeRatio) why.push({ kind: 'smaller', from: x.size, to: y.size, bad: false });
      if (x.type !== y.type && x.mime && y.mime) why.push({ kind: 'type', from: x.mime, to: y.mime, bad: true });
      (why.length ? changed : same).push({ a: x, b: y, why });
    });
    const regressions = changed.filter(c => c.why.some(w => w.bad)).length + added.filter(e => e.failed).length;
    return { added, removed, changed, same, regressions };
  }

  return { parseHar, filter, tokenize, summarize, toCurl, redact, scan, diff, typeOf, parseSize, PHASES, MASK };
});
