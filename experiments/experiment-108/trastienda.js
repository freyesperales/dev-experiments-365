#!/usr/bin/env node
/* Trastienda 1.0.0 — who can run code in your Shopify store.
 * Paste the page source of a store (View page source) or a theme.liquid file.
 * Works offline: it reads text, it never fetches anything. MIT License.
 * Daily Security Lab, experiment 108 of dev-experiments-365. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Trastienda = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '1.0.0';

  // Dates from shopify.dev "Storefront script tags" (read 2026-11-24).
  const SCRIPT_TAG_NO_CREATE = '2026-10-01';
  const SCRIPT_TAG_STOP = '2027-03-01';

  // Indicators published by Roman Zipp (2026-10-10, updated 2026-10-22) for the
  // checkout hijack delivered through Shopify apps. Plain strings; never fetched.
  const IOC_DOMAINS = ['biliing.top', 'checkout-confirm.top', 'order-confirm.top', 'account-confirm.top', 'billing-confirm.top', 'checkout-guard.top'];
  const IOC_STRINGS = ['__ctf_shim_handoff_done_v1', '__ctf_checkout_txn_v1'];
  // Domains reported as not trustworthy: jsdeliver.cloud (Shopify Community, 2026-04 and 2026-10),
  // polyfill.io (Cloudflare, 2024-06-26: "can no longer be trusted and should be removed").
  const BAD_DOMAINS = { 'jsdeliver.cloud': 'jsdeliver', 'polyfill.io': 'polyfill' };

  // Names that get imitated, with the endings that really belong to them.
  const BRANDS = {
    jsdelivr: ['jsdelivr.net', 'jsdelivr.com'],
    shopify: ['shopify.com', 'shopify.dev', 'shopify.io'],
    shopifycdn: ['shopifycdn.com', 'shopifycdn.net'],
    myshopify: ['myshopify.com'],
    cloudflare: ['cloudflare.com', 'cloudflare.net'],
    googleapis: ['googleapis.com'],
    googletagmanager: ['googletagmanager.com'],
    gstatic: ['gstatic.com'],
    bootstrapcdn: ['bootstrapcdn.com'],
    klaviyo: ['klaviyo.com'],
    facebook: ['facebook.com', 'facebook.net'],
  };

  const SHOPIFY_DOMAINS = ['shopify.com', 'shopifycdn.com', 'shopifycdn.net', 'shopifysvc.com', 'shopifycloud.com', 'shop.app', 'shopifyapps.com', 'shopify.dev'];

  // Suffixes where the registrable name is one label further left.
  const MULTI = ['co.uk', 'com.au', 'com.br', 'com.mx', 'com.ar', 'com.co', 'com.pe', 'co.nz', 'co.za', 'co.jp', 'com.cn', 'co.in', 'com.es'];
  // Shared hosting: anybody can rent a name under these, so the name says nothing about who is behind it.
  const SHARED = ['cloudfront.net', 'amazonaws.com', 'azurefd.net', 'azureedge.net', 'azurewebsites.net', 'windows.net', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev', 'herokuapp.com', 'github.io', 'netlify.app', 'vercel.app', 'aliyuncs.com', 'r2.dev', 'digitaloceanspaces.com', 'appspot.com', 'onrender.com', 'b-cdn.net', 'glitch.me', 'storage.googleapis.com'];

  // Short list of common services, written into the tool (not checked against each vendor's documentation).
  const KNOWN = {
    'googletagmanager.com': 'Google Tag Manager', 'google-analytics.com': 'Google Analytics', 'googleadservices.com': 'Google Ads', 'doubleclick.net': 'Google Ads (DoubleClick)', 'google.com': 'Google', 'gstatic.com': 'Google', 'googleapis.com': 'Google APIs', 'googlesyndication.com': 'Google Ads',
    'facebook.net': 'Meta Pixel', 'facebook.com': 'Meta', 'tiktok.com': 'TikTok Pixel', 'pinimg.com': 'Pinterest Tag', 'clarity.ms': 'Microsoft Clarity', 'bing.com': 'Microsoft Ads', 'hotjar.com': 'Hotjar', 'klaviyo.com': 'Klaviyo', 'judge.me': 'Judge.me', 'yotpo.com': 'Yotpo', 'loox.io': 'Loox', 'stamped.io': 'Stamped', 'gorgias.chat': 'Gorgias', 'gorgias.com': 'Gorgias', 'tidio.co': 'Tidio', 'zdassets.com': 'Zendesk', 'intercom.io': 'Intercom', 'intercomcdn.com': 'Intercom', 'chimpstatic.com': 'Mailchimp', 'omnisrc.com': 'Omnisend', 'omnisnippet1.com': 'Omnisend', 'privy.com': 'Privy', 'rechargecdn.com': 'Recharge', 'afterpay.com': 'Afterpay', 'klarna.com': 'Klarna', 'klarnaservices.com': 'Klarna', 'paypal.com': 'PayPal', 'paypalobjects.com': 'PayPal', 'jsdelivr.net': 'jsDelivr (public CDN)', 'unpkg.com': 'unpkg (public CDN)', 'cdnjs.cloudflare.com': 'cdnjs (public CDN)', 'jquery.com': 'jQuery CDN', 'cloudflareinsights.com': 'Cloudflare Web Analytics', 'elfsight.com': 'Elfsight', 'reamaze.com': 'Re:amaze', 'trustpilot.com': 'Trustpilot', 'sc-static.net': 'Snap Pixel', 'ads-twitter.com': 'X (Twitter) Pixel', 'licdn.com': 'LinkedIn Insight', 'hs-scripts.com': 'HubSpot', 'stripe.com': 'Stripe', 'youtube.com': 'YouTube', 'vimeo.com': 'Vimeo', 'instagram.com': 'Instagram', 'routeapp.io': 'Route', 'rise-ai.com': 'Rise.ai', 'pushowl.com': 'PushOwl', 'searchanise.com': 'Searchanise', 'hulkapps.com': 'HulkApps', 'swymrelay.com': 'Swym', 'bugsnag.com': 'Bugsnag', 'sentry-cdn.com': 'Sentry',
  };

  const LEVELS = ['fix', 'check', 'info', 'ok'];

  // ---------- small helpers ----------
  function editDistance(a, b) { // optimal string alignment (insert, delete, substitute, swap)
    const m = a.length, n = b.length, d = [];
    for (let i = 0; i <= m; i++) { d[i] = [i]; }
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  const isIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
  function regDomain(host) {
    host = String(host || '').toLowerCase().replace(/\.$/, '');
    if (isIp(host)) return host;
    for (const s of SHARED.concat(MULTI)) if (host.endsWith('.' + s)) {
      const rest = host.slice(0, -s.length - 1).split('.');
      return rest[rest.length - 1] + '.' + s;
    }
    const p = host.split('.');
    return p.length <= 2 ? host : p.slice(-2).join('.');
  }
  const sharedSuffix = (host) => SHARED.find((s) => host === s || host.endsWith('.' + s)) || null;
  const under = (host, list) => list.some((d) => host === d || host.endsWith('.' + d));
  function knownName(host) {
    let h = host;
    while (h.includes('.')) { if (KNOWN[h]) return KNOWN[h]; h = h.slice(h.indexOf('.') + 1); }
    return null;
  }
  function lookalike(host) {
    if (isIp(host)) return null;
    const rd = regDomain(host);
    if (sharedSuffix(host)) return null;
    const label = rd.split('.')[0];
    for (const b of Object.keys(BRANDS)) {
      if (label === b) { if (!BRANDS[b].includes(rd)) return { brand: b, real: BRANDS[b][0], kind: 'ending' }; return null; }
    }
    for (const b of Object.keys(BRANDS)) {
      const dist = editDistance(label, b);
      if (dist === 1 || (dist === 2 && b.length >= 12)) return { brand: b, real: BRANDS[b][0], kind: 'typo' };
    }
    return null;
  }
  function attrs(s) {
    const o = {}; const re = /([^\s"'=<>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g; let m;
    while ((m = re.exec(s || ''))) { const k = m[1].toLowerCase(); if (!(k in o)) o[k] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : ''; }
    return o;
  }
  const decodeEnt = (s) => String(s).replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  function toUrl(src, ownHost) {
    src = decodeEnt(String(src || '').trim());
    if (!src || /^(data|blob|javascript|about|mailto|tel):/i.test(src) || src[0] === '#') return null;
    if (/\{\{|\{%/.test(src) && !/^(https?:)?\/\//i.test(src)) return null; // Liquid expression, not a literal address
    try {
      const u = new URL(src, 'https://' + (ownHost || 'own.invalid') + '/');
      if (!/^https?:$/.test(u.protocol)) return null;
      return { href: u.href, host: u.hostname.toLowerCase(), path: u.pathname, search: u.search, http: /^http:\/\//i.test(src), own: u.hostname === (ownHost || 'own.invalid') };
    } catch (e) { return null; }
  }
  const short = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  // ---------- reading the page ----------
  function detectStore(text) {
    const o = { ownHost: null, shop: null, theme: null, isLiquid: false, isShopify: false };
    o.isLiquid = /\{\{-?\s*content_for_(header|layout)\s*-?\}\}|\{%-?\s*(render|section|include|liquid|schema|if|assign|capture)\b/.test(text);
    let m = /<link\b[^>]*rel=["']?canonical["']?[^>]*>/i.exec(text);
    if (m) { const u = toUrl(attrs(m[0]).href, null); if (u && !u.own) o.ownHost = u.host; }
    if (!o.ownHost) { m = /<meta\b[^>]*property=["']og:url["'][^>]*>/i.exec(text); if (m) { const u = toUrl(attrs(m[0]).content, null); if (u && !u.own) o.ownHost = u.host; } }
    m = /Shopify\.shop\s*=\s*["']([a-z0-9-]+\.myshopify\.com)["']/i.exec(text) || /[?&\\u0026]shop=([a-z0-9-]+\.myshopify\.com)/i.exec(text);
    if (m) o.shop = m[1].toLowerCase();
    m = /Shopify\.theme\s*=\s*(\{[^;<]*\})/.exec(text);
    if (m) { try { const t = JSON.parse(m[1]); o.theme = { name: t.name || null, schema: t.schema_name || null, version: t.schema_version || null }; } catch (e) { /* shown only when readable */ } }
    o.isShopify = o.isLiquid || !!o.shop || /cdn\.shopify\.com|\/cdn\/shop\/|myshopify\.com|shopify:\/\/apps\//i.test(text);
    return o;
  }

  function classifyUrl(u, store) {
    const h = u.host, p = u.path;
    const shopifyHost = under(h, SHOPIFY_DOMAINS) || under(h, ['myshopify.com']);
    if (shopifyHost || u.own || (store.ownHost && h === store.ownHost)) {
      let m = /\/extensions\/([0-9a-f-]{8,})\/([^/]+)\/assets\//i.exec(p);
      if (m) return { kind: 'app', app: m[2].replace(/(-\d+)+$/, ''), via: 'extension' };
      if (/\/t\/\d+\/assets\//.test(p)) return { kind: 'theme' };
      if (/\/(s\/files\/[^?]*\/files|cdn\/shop\/files)\//.test(p) && /\.m?js$/i.test(p)) return { kind: 'files' };
      if (shopifyHost || /\/(shopifycloud|wpm|checkouts|s\/javascripts|s\/trekkie|s\/assets|cdn\/s|cdn\/shopifycloud|cdn\/wpm)\b/.test(p)) return { kind: 'shopify' };
      return { kind: 'own' };
    }
    return { kind: 'third' };
  }

  const SHOPIFY_INLINE = /\bwindow\.Shopify\b|\bShopify\.(shop|theme|locale|currency|routes|country|cdnHost|PaymentButton|analytics|modules|featureAssets|loadFeatures|customerPrivacy)\b|ShopifyAnalytics|trekkie|__st\s*=|webPixelsManager|web-pixels-manager|webPixelsConfigList|function asyncLoad\(\)|shopify-features|ShopifyPay|window\.ShopifyPaypal|__shopify|shop_pay|PerformanceObserver|boomerang|BOOMR/;
  const NON_CODE_TYPES = /json|template|html|x-tmpl|text\/plain|speculationrules|importmap|x-handlebars|x-shader|x-mustache/i;

  function inlineLoads(code, store) { // addresses that an inline snippet turns into a <script>
    const out = [];
    if (!/createElement\s*\(\s*["'`]script["'`]\s*\)|\.src\s*=|document\.write|import\s*\(|\$\.getScript|loadScript|appendChild/.test(code)) return out;
    const re = /["'`]((?:https?:)?\\?\/\\?\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[^"'`\s<>]*)?)["'`]/gi; let m;
    while ((m = re.exec(code))) {
      const u = toUrl(m[1].replace(/\\\//g, '/'), store.ownHost);
      if (!u || u.own) continue;
      if (/\.(png|jpe?g|gif|svg|webp|css|woff2?|ico)$/i.test(u.path)) continue;
      out.push(u);
    }
    return out;
  }

  function inspectInline(code) { // returns [{id, level, ev}]
    const f = [];
    const hexIds = (code.match(/\b_0x[0-9a-f]{3,}\b/gi) || []).length;
    const hexEsc = (code.match(/\\x[0-9a-f]{2}/gi) || []).length;
    const hasEval = /\beval\s*\(|new\s+Function\s*\(|\bsetTimeout\s*\(\s*["'`]/.test(code);
    const decoder = /\batob\s*\(|String\.fromCharCode|\bunescape\s*\(|decodeURIComponent\s*\(\s*escape/.test(code);
    const longBlob = /["'`][A-Za-z0-9+/=]{200,}["'`]/.test(code);
    if (hexIds >= 5 || hexEsc >= 30) f.push({ id: 'obfuscated', level: 'fix' });
    else if (hasEval && (decoder || longBlob)) f.push({ id: 'hidden-eval', level: 'fix' });
    else if (decoder && /createElement\s*\(\s*["'`]script|\.src\s*=|document\.write/.test(code)) f.push({ id: 'hidden-loader', level: 'check' });
    if (/document\.write\s*\(\s*(unescape|atob|decodeURIComponent)/.test(code)) f.push({ id: 'hidden-loader', level: 'check' });
    const click = /addEventListener\s*\(\s*["'`](click|mousedown|pointerdown|touchstart|submit)["'`]|\.on(click|submit)\s*=|\.on\s*\(\s*["'`](click|submit)/.test(code);
    const nav = /location\s*(\.href)?\s*=[^=]|location\.(assign|replace)\s*\(|window\.open\s*\(/.test(code);
    const stop = /preventDefault|stopImmediatePropagation|stopPropagation/.test(code);
    if (click && nav && stop && /checkout/i.test(code)) {
      const ext = /["'`](?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(code);
      const once = /sessionStorage|localStorage/.test(code);
      if (ext || once) f.push({ id: 'checkout-click', level: 'check' });
    }
    const seen = {}; return f.filter((x) => (seen[x.id] ? false : (seen[x.id] = true)));
  }

  function parseAsyncLoad(code) {
    const m = /var\s+urls\s*=\s*(\[[\s\S]*?\])\s*;/.exec(code);
    if (!m) return [];
    try { const a = JSON.parse(m[1]); if (Array.isArray(a)) return a.map(String); } catch (e) { /* fall through */ }
    const out = []; const re = /"((?:[^"\\]|\\.)*)"/g; let x;
    while ((x = re.exec(m[1]))) out.push(x[1].replace(/\\\//g, '/').replace(/\\u0026/gi, '&'));
    return out;
  }

  function analyze(text, opts) {
    opts = opts || {};
    text = String(text == null ? '' : text).replace(/^﻿/, '');
    const store = detectStore(text);
    const ents = new Map();
    const stats = { scripts: 0, external: 0, inline: 0, data: 0, iframes: 0, forms: 0, bytes: text.length };
    const notes = [];
    function ent(key, init) {
      if (!ents.has(key)) ents.set(key, Object.assign({ key, kind: '', name: '', level: 'info', hosts: new Set(), files: new Set(), ways: new Set(), flags: [], count: 0, matched: null }, init));
      return ents.get(key);
    }
    function raise(e, level) { if (LEVELS.indexOf(level) < LEVELS.indexOf(e.level)) e.level = level; }
    function flag(e, id, level, ev) { if (!e.flags.some((x) => x.id === id && x.ev === ev)) e.flags.push({ id, level, ev: ev || '' }); raise(e, level); }
    function hostChecks(e, u) {
      const rd = regDomain(u.host);
      if (IOC_DOMAINS.includes(rd)) flag(e, 'ioc-domain', 'fix', u.host);
      else if (BAD_DOMAINS[rd]) flag(e, 'bad-' + BAD_DOMAINS[rd], 'fix', u.host);
      else { const l = lookalike(u.host); if (l) flag(e, l.kind === 'typo' ? 'lookalike' : 'brand-ending', l.kind === 'typo' ? 'fix' : 'check', u.host + '|' + l.real); }
      if (isIp(u.host)) flag(e, 'ip-host', 'check', u.host);
      if (/(^|\.)xn--/.test(u.host)) flag(e, 'punycode', 'check', u.host);
      if (u.http) flag(e, 'http', 'check', u.host);
    }
    function third(u, way, ctx) {
      if (ctx) { // loaded from inside an app block: it belongs to that app
        const e = ent('app:' + ctx.app, { kind: 'app', name: ctx.app }); e.ways.add('block'); e.hosts.add(u.host); e.count++; hostChecks(e, u); return e;
      }
      const rd = regDomain(u.host), name = knownName(u.host), shared = sharedSuffix(u.host);
      const e = ent((way === 'scripttag' ? 'tag:' : 'host:') + rd, { kind: way === 'scripttag' ? 'scripttag' : 'third', name: name || rd, known: !!name, shared: shared });
      e.ways.add(way); e.hosts.add(u.host); e.count++;
      e.files.add(short(u.host + u.path, 90));
      if (!name) raise(e, 'check');
      hostChecks(e, u);
      return e;
    }
    function place(u, way, ctx) {
      const c = classifyUrl(u, store);
      if (c.kind === 'app') { const e = ent('app:' + c.app, { kind: 'app', name: c.app }); e.ways.add('extension'); e.count++; e.files.add(short(u.path.split('/').pop(), 60)); return e; }
      if (c.kind === 'theme') { const e = ent('theme', { kind: 'theme', name: 'theme', level: 'ok' }); e.count++; e.files.add(short(u.path.split('/').pop(), 60)); return e; }
      if (c.kind === 'shopify') { const e = ent('shopify', { kind: 'shopify', name: 'Shopify', level: 'ok' }); e.count++; return e; }
      if (c.kind === 'files') { const e = ent('files', { kind: 'files', name: 'files', level: 'check' }); e.count++; e.files.add(short(u.path.split('/').pop(), 60)); return e; }
      if (c.kind === 'own') { const e = ent('own', { kind: 'own', name: store.ownHost || 'own', level: 'info' }); e.count++; e.files.add(short(u.path, 70)); return e; }
      return third(u, way, ctx);
    }

    // indicators anywhere in the text, including inside data and comments
    const lower = text.toLowerCase();
    for (const d of IOC_DOMAINS) if (lower.includes(d)) flag(ent('ioc', { kind: 'ioc', name: 'ioc' }), 'ioc-domain', 'fix', d);
    for (const s of IOC_STRINGS) if (text.includes(s)) flag(ent('ioc', { kind: 'ioc', name: 'ioc' }), 'ioc-string', 'fix', s);

    const ctxStack = [];
    const re = /<!--([\s\S]*?)-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<(iframe|form)\b([^>]*)>/gi;
    let m, pixels = null;
    while ((m = re.exec(text))) {
      if (m[1] !== undefined) {
        const b = /^\s*BEGIN app (block|snippet):\s*shopify:\/\/apps\/([^\/\s]+)\/(?:blocks|snippets)\/([^\/\s]+)/i.exec(m[1]);
        if (b) { ctxStack.push({ app: b[2].toLowerCase(), block: b[3] }); const e = ent('app:' + b[2].toLowerCase(), { kind: 'app', name: b[2].toLowerCase() }); e.ways.add('block'); e.blocks = e.blocks || new Set(); e.blocks.add(b[3]); }
        else if (/^\s*END app (block|snippet)\s*$/i.test(m[1])) ctxStack.pop();
        continue;
      }
      const ctx = ctxStack.length ? ctxStack[ctxStack.length - 1] : null;
      if (m[4]) {
        const a = attrs(m[5]); const tag = m[4].toLowerCase();
        const u = toUrl(tag === 'iframe' ? a.src : a.action, store.ownHost);
        if (tag === 'iframe') stats.iframes++; else stats.forms++;
        if (u && !u.own && classifyUrl(u, store).kind === 'third') {
          const e = third(u, tag, ctx);
          if (tag === 'form') flag(e, 'form-out', 'check', u.host);
        }
        continue;
      }
      const a = attrs(m[2]); const body = m[3] || '';
      const type = (a.type || '').toLowerCase();
      if (type && NON_CODE_TYPES.test(type)) { stats.data++; continue; }
      stats.scripts++;
      const srcAttr = a.src || a['data-src'] || a['d-src'];
      if (srcAttr) {
        stats.external++;
        const liquidAsset = /\|\s*asset_url/.test(srcAttr);
        if (liquidAsset) { const e = ent('theme', { kind: 'theme', name: 'theme', level: 'ok' }); e.count++; continue; }
        const u = toUrl(srcAttr, store.ownHost);
        if (!u) continue;
        const e = place(u, 'src', ctx);
        if (e.kind === 'third' && !a.integrity) e.noSri = (e.noSri || 0) + 1;
        continue;
      }
      if (!body.trim()) continue;
      stats.inline++;
      // Shopify's own loader for legacy script tags
      if (/function asyncLoad\s*\(\)/.test(body)) {
        for (const raw of parseAsyncLoad(body)) {
          const u = toUrl(raw, store.ownHost); if (!u) continue;
          const c = classifyUrl(u, store);
          if (c.kind === 'third') { const e = third(u, 'scripttag', null); e.scriptTag = true; }
          else { const e = ent('tag:shopify-hosted', { kind: 'scripttag', name: 'cdn.shopify.com', level: 'check', scriptTag: true }); e.ways.add('scripttag'); e.count++; e.files.add(short(u.path.split('/').pop(), 60)); }
        }
        continue;
      }
      if (/webPixelsConfigList|web-pixels-manager|webPixelsManager/.test(body)) {
        pixels = pixels || { app: 0, custom: 0 };
        pixels.app += (body.match(/"type"\s*:\s*"APP"/g) || []).length;
        pixels.custom += (body.match(/"type"\s*:\s*"CUSTOM"/g) || []).length;
      }
      // Code that names Shopify's objects is taken as the platform's own only when it shows no warning sign.
      const found = inspectInline(body);
      const owner = ctx ? ent('app:' + ctx.app, { kind: 'app', name: ctx.app }) : SHOPIFY_INLINE.test(body) && !found.length ? ent('shopify', { kind: 'shopify', name: 'Shopify', level: 'ok' }) : ent('inline', { kind: 'inline', name: 'inline', level: 'ok' });
      if (ctx) owner.ways.add('block');
      owner.count++;
      if (owner.kind === 'inline') owner.snippets = (owner.snippets || 0) + 1;
      for (const u of inlineLoads(body, store)) {
        const c = classifyUrl(u, store);
        if (c.kind === 'third') third(u, 'inline', ctx);
        else if (c.kind === 'app') place(u, 'inline', ctx);
      }
      for (const f of found) flag(owner, f.id, f.level, short(body, 120));
    }

    // Liquid source: things that only exist before Shopify renders the page
    const liquid = { snippets: [], headerEdited: false };
    if (store.isLiquid) {
      const seen = new Set(); const r2 = /\{%-?\s*(?:render|include)\s+["']([^"']+)["']/g; let x;
      while ((x = r2.exec(text))) if (!seen.has(x[1])) { seen.add(x[1]); liquid.snippets.push(x[1]); }
      if (/content_for_header\s*\|\s*(remove|replace|split|truncate|strip|append|prepend)/.test(text) || /capture\s+(\w+)\s*-?%\}\s*\{\{-?\s*content_for_header[\s\S]{0,400}?\{\{-?\s*\1\s*\|/.test(text)) {
        liquid.headerEdited = true;
        flag(ent('header', { kind: 'header', name: 'content_for_header' }), 'header-edited', 'check', '');
      }
    }

    // compare with the list of apps the owner says are installed
    const apps = (opts.apps || []).map((s) => String(s).trim()).filter(Boolean);
    const STOP = new Set(['app', 'apps', 'shopify', 'product', 'products', 'reviews', 'review', 'store', 'shop', 'sales', 'email', 'marketing', 'page', 'cart', 'checkout', 'the', 'and', 'for', 'with', 'pro', 'plus', 'free', 'upsell', 'cross', 'sell', 'options', 'popup', 'pop', 'ups', 'chat', 'search', 'filter', 'bundle', 'bundles', 'pixel', 'tracking', 'order', 'orders']);
    const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !STOP.has(t));
    const unusedApps = [];
    if (apps.length) {
      const hit = new Set();
      for (const e of ents.values()) {
        if (!['app', 'scripttag', 'third'].includes(e.kind)) continue;
        const hay = (e.name + ' ' + Array.from(e.hosts).join(' ')).toLowerCase().replace(/[^a-z0-9]+/g, '');
        for (const a of apps) { const tk = tokens(a).slice(0, 2); if (tk.length && tk.every((t) => hay.includes(t))) { e.matched = a; hit.add(a); break; } }
      }
      for (const a of apps) if (!hit.has(a)) unusedApps.push(a);
    }

    const list = Array.from(ents.values()).filter((e) => e.count > 0 || e.flags.length || e.kind === 'app');
    const order = { ioc: 0, header: 1, third: 2, scripttag: 3, files: 4, inline: 5, app: 6, own: 7, theme: 8, shopify: 9 };
    list.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
    for (const e of list) { e.hosts = Array.from(e.hosts).sort(); e.files = Array.from(e.files); e.ways = Array.from(e.ways); if (e.blocks) e.blocks = Array.from(e.blocks); }

    const tags = list.filter((e) => e.scriptTag);
    const count = (lvl) => list.filter((e) => e.level === lvl).length;
    const parties = list.filter((e) => ['app', 'scripttag', 'third'].includes(e.kind)).length;
    let verdict = 'clean';
    if (!stats.scripts && !list.length) verdict = 'empty';
    else if (list.some((e) => e.flags.some((f) => f.id.startsWith('ioc')))) verdict = 'attack';
    else if (count('fix')) verdict = 'fix';
    else if (count('check')) verdict = 'check';
    if (!store.isShopify && verdict !== 'empty') notes.push('not-shopify');
    if (store.isLiquid) notes.push('liquid');
    return { version: VERSION, store, stats, verdict, entities: list, parties, scriptTags: tags.length, pixels, liquid, unusedApps, appsGiven: apps.length, notes, counts: { fix: count('fix'), check: count('check'), info: count('info'), ok: count('ok') } };
  }

  // ---------- inventory to keep and compare later ----------
  function inventory(res) {
    return { tool: 'trastienda', version: VERSION, shop: res.store.shop || res.store.ownHost || null, items: res.entities.filter((e) => !['shopify', 'theme', 'inline', 'own'].includes(e.kind)).map((e) => ({ key: e.key, name: e.name, hosts: e.hosts })) };
  }
  function diff(prev, res) {
    const now = inventory(res).items; const old = (prev && prev.items) || [];
    const oldMap = new Map(old.map((i) => [i.key, i])); const nowMap = new Map(now.map((i) => [i.key, i]));
    const added = now.filter((i) => !oldMap.has(i.key)).map((i) => i.name);
    const removed = old.filter((i) => !nowMap.has(i.key)).map((i) => i.name);
    const newHosts = [];
    for (const i of now) { const o = oldMap.get(i.key); if (o) for (const h of i.hosts) if (!(o.hosts || []).includes(h)) newHosts.push(i.name + ' → ' + h); }
    return { added, removed, newHosts, changed: !!(added.length || removed.length || newHosts.length) };
  }

  // ---------- words ----------
  const T = {
    en: {
      chip: { fix: 'FIX', check: 'CHECK', info: 'INFO', ok: 'OK' },
      verdict: {
        attack: ['SIGNS OF A KNOWN ATTACK', 'The text you pasted contains an address or a marker published for the checkout hijack of October 2026. Put the store behind its password, contact Shopify Support and the app developer, and do not delete anything yet.'],
        fix: ['LOOK AT THIS TODAY', (r) => 'Marked FIX below: ' + r.counts.fix + '. An address that imitates a known service, or code written to hide what it does.'],
        check: ['FIND THE OWNER OF EACH ONE', (r) => 'Marked CHECK below: ' + r.counts.check + '. No clear owner, or a decision you need to take. Nothing here proves an attack.'],
        clean: ['NOTHING ODD IN WHAT YOU PASTED', 'Every script has a recognisable owner. This is an inventory, not a clean bill of health: read "What this cannot see".'],
        empty: ['NO SCRIPTS FOUND', 'The text has no <script> tags. Paste the full page source (right click on your store, "View page source"), or your theme.liquid file.'],
      },
      summary: (r) => r.stats.scripts + ' scripts (' + r.stats.external + ' files, ' + r.stats.inline + ' written in the page) · ' + (r.parties === 1 ? '1 outside party' : r.parties + ' outside parties') + ' can run code here' + (r.scriptTags ? ' · ' + r.scriptTags + ' legacy script tag' + (r.scriptTags === 1 ? '' : 's') : ''),
      storeLine: (s) => 'Store: ' + (s.ownHost || s.shop || 'not named in the text') + (s.shop && s.ownHost ? ' (' + s.shop + ')' : '') + (s.theme && (s.theme.schema || s.theme.name) ? ' · theme ' + (s.theme.schema || s.theme.name) + (s.theme.version ? ' ' + s.theme.version : '') : ''),
      title: {
        shopify: () => 'Shopify itself',
        theme: () => 'Your theme\'s own files',
        inline: (e) => 'Code written straight into the theme (' + (e.snippets || e.count) + ' snippet' + ((e.snippets || e.count) === 1 ? '' : 's') + ')',
        own: (e) => 'Files served from your own domain',
        files: () => 'JavaScript uploaded to the store\'s Files area',
        app: (e) => 'App: ' + e.name,
        scripttag: (e) => 'Legacy script tag: ' + e.name,
        third: (e) => (e.known ? e.name : 'Unknown service: ' + e.name),
        ioc: () => 'Indicator of the October 2026 checkout hijack',
        header: () => 'The theme edits content_for_header',
      },
      what: {
        shopify: 'The platform\'s own code. Nothing to do.',
        theme: 'Files that are part of the theme. They change only when somebody edits the theme.',
        inline: 'Somebody typed or pasted this into theme.liquid, a snippet or a Custom Liquid section. It runs with full access to the page. Uninstalling an app does not remove it.',
        own: 'Served by your own store address.',
        files: 'A script file somebody uploaded in Content > Files and then linked from the theme. Check who uploaded it and why: it is an unusual place for code.',
        app: () => 'Added by an installed app through a theme app extension. You can switch it off in the theme editor (App embeds), and Shopify removes it when you uninstall the app.',
        appHosts: (e) => 'It also brings code from: ' + e.hosts.join(', ') + '. What those servers send can change at any time without Shopify or you seeing it. That is how the October 2026 hijack travelled.',
        scripttag: (e) => 'An app registered this through the old ScriptTag API, which stops on 1 March 2027. ' + (e.matched ? 'Ask ' + e.matched + ' whether they have already moved to an app embed.' : 'Work out which app it belongs to and ask its developer whether they have moved to an app embed. Shopify removes script tags when the app that created them is uninstalled, so an unknown one should belong to an app that is still installed.'),
        third: (e) => 'Not added through the app system of Shopify: it is in the theme code or was pasted by hand, so it stays when you uninstall apps. ' + (e.known ? 'A well-known service. Keep it only if you still use it.' : 'This tool does not recognise it. Find out who added it and what for.'),
        shared: (e) => 'The address is rented space on ' + e.shared + ': anybody can open a name there, so the address alone does not tell you who is behind it.',
        matched: (e) => 'Matches an app on your list: ' + e.matched + '.',
        unmatched: 'Not on the list of apps you gave.',
        noSri: 'Loaded without an integrity check (normal for services that update their own script).',
        ioc: 'An address or a marker from the published indicators appears in the text.',
        header: 'The theme captures content_for_header and removes or changes part of it. People do this to hide a script that an app injects. Shopify says not to modify it, and it hides the symptom instead of removing the cause.',
      },
      flag: {
        'ioc-domain': (ev) => 'Known hijack address: ' + ev.replace(/\./g, '[.]'),
        'ioc-string': (ev) => 'Marker used by the hijack script: ' + ev,
        'bad-jsdeliver': (ev) => ev + ' is not the jsDelivr CDN (that one is jsdelivr.net, with no second "e"). Shopify Support called this domain a red flag in a reported case.',
        'bad-polyfill': (ev) => ev + ': Cloudflare said in June 2024 that polyfill.io "can no longer be trusted and should be removed from websites".',
        lookalike: (ev) => { const p = ev.split('|'); return p[0] + ' looks like ' + p[1] + ' but is a different domain. Treat it as hostile until you know who put it there.'; },
        'brand-ending': (ev) => { const p = ev.split('|'); return p[0] + ' uses a well-known name with an ending that is not the usual one (' + p[1] + '). Confirm it is real.'; },
        'ip-host': (ev) => 'Loaded from a bare IP address (' + ev + '), which no serious service does.',
        punycode: (ev) => 'The address uses an encoded international name (' + ev + '), sometimes used to imitate another one.',
        http: (ev) => 'Loaded over http:// from ' + ev + ', without encryption.',
        'form-out': (ev) => 'A form on this page sends what the visitor types to ' + ev + '.',
        obfuscated: () => 'The code is scrambled on purpose (names like _0x3f2a, hex strings). Legitimate store code is minified, not scrambled.',
        'hidden-eval': () => 'The code decodes a hidden text and runs it (eval or new Function).',
        'hidden-loader': () => 'The code decodes a hidden address and loads a script from it.',
        'checkout-click': () => 'The code listens for clicks, mentions checkout, cancels the click and sends the browser somewhere else. Read it: some themes do this for a terms checkbox, and it is also the shape of the October 2026 hijack.',
        'header-edited': () => 'Find the script it is hiding, remove the app or the leftover behind it, then delete this workaround.',
      },
      ways: { src: 'script file', inline: 'loaded by code in the page', scripttag: 'legacy script tag', iframe: 'frame', form: 'form', block: 'app block or embed', extension: 'app extension' },
      seenAs: 'Seen as', files: 'Files', from: 'From', blocks: 'Blocks',
      pixels: (p) => 'Pixels: the page loads Shopify\'s pixel manager' + (p.app + p.custom ? ' (' + p.app + ' app pixel(s), ' + p.custom + ' custom)' : '') + '. Pixels run in a sandbox and cannot touch the page. Review them in the Customer events section of your admin.',
      tagsNote: (n) => (n === 1 ? '1 legacy script tag' : n + ' legacy script tags') + ' will stop loading on 1 March 2027 (apps cannot create or change them since 1 October 2026). If a feature of your store depends on one, it stops that day.',
      unused: (a) => 'On your list but not seen in this page: ' + a.join(', ') + '. Normal for apps that only work in the admin; otherwise it may only load on other pages.',
      liquidNote: 'You pasted theme source (Liquid), not a rendered page. Apps that load through app embeds or script tags are not visible here: paste the page source of the live store to see them.',
      snippets: (s) => 'This file pulls in ' + s.length + ' snippet(s): ' + s.slice(0, 12).join(', ') + (s.length > 12 ? '…' : '') + '. Code can live in any of them.',
      notShopify: 'This does not look like a Shopify page. The inventory is still valid, but the app and script tag rules are specific to Shopify.',
      nextTitle: 'What to do next',
      next: [
        'In Settings > Apps, uninstall what you no longer use. Open each remaining app\'s page and read "Activity and permissions": anything under "Unused access" is access the app has and does not use.',
        'In the theme editor, open App embeds and switch off the ones you do not recognise.',
        'In the Customer events section of your admin, review the pixels.',
        'Open your store in a private window, add a product and press Checkout. Look at the address bar before typing anything: if it shows a domain that is neither your store nor Shopify, stop and call Shopify Support.',
        'Save this inventory and run it again after installing an app or changing the theme. A new name you did not add is the thing to look at.',
      ],
      blindTitle: 'What this cannot see',
      blind: [
        'Code that an app downloads after the page loads. In October 2026 the files of the affected apps were clean; the attack arrived as settings from the app developers\' servers. No reading of the page source finds that. What you can control is how many parties are on this list.',
        'Pages you did not paste. Product, cart and collection pages can load different scripts.',
        'What a script does. This is a list of who is present and of a few clear warning signs, not an analysis of each file.',
        'Shopify\'s checkout. It is not part of the theme and has its own protections.',
      ],
      diffTitle: 'Compared with your saved inventory',
      diffNone: 'No changes since the saved inventory.',
      diffAdded: 'New', diffRemoved: 'Gone', diffHosts: 'New address inside something you already had',
    },
    es: {
      chip: { fix: 'ARREGLAR', check: 'REVISAR', info: 'INFO', ok: 'OK' },
      verdict: {
        attack: ['SEÑALES DE UN ATAQUE CONOCIDO', 'El texto que pegaste contiene una dirección o una marca publicada del secuestro de checkout de octubre de 2026. Protege la tienda con contraseña, contacta a Soporte de Shopify y al desarrollador de la app, y no borres nada todavía.'],
        fix: ['REVISA ESTO HOY', (r) => 'Marcados ARREGLAR abajo: ' + r.counts.fix + '. Una dirección que imita a un servicio conocido, o código escrito para ocultar lo que hace.'],
        check: ['BUSCA AL DUEÑO DE CADA UNO', (r) => 'Marcados REVISAR abajo: ' + r.counts.check + '. Sin dueño claro, o con una decisión que te toca tomar. Nada de esto prueba un ataque.'],
        clean: ['NADA RARO EN LO QUE PEGASTE', 'Cada script tiene un dueño reconocible. Esto es un inventario, no un certificado: lee «Lo que esto no puede ver».'],
        empty: ['NO HAY SCRIPTS', 'El texto no tiene etiquetas <script>. Pega el código fuente completo (clic derecho en tu tienda, «Ver código fuente de la página») o tu archivo theme.liquid.'],
      },
      summary: (r) => r.stats.scripts + ' scripts (' + r.stats.external + ' archivos, ' + r.stats.inline + ' escritos en la página) · ' + (r.parties === 1 ? '1 tercero puede' : r.parties + ' terceros pueden') + ' ejecutar código aquí' + (r.scriptTags ? ' · ' + r.scriptTags + (r.scriptTags === 1 ? ' script tag antiguo' : ' script tags antiguos') : ''),
      storeLine: (s) => 'Tienda: ' + (s.ownHost || s.shop || 'sin nombre en el texto') + (s.shop && s.ownHost ? ' (' + s.shop + ')' : '') + (s.theme && (s.theme.schema || s.theme.name) ? ' · tema ' + (s.theme.schema || s.theme.name) + (s.theme.version ? ' ' + s.theme.version : '') : ''),
      title: {
        shopify: () => 'Shopify',
        theme: () => 'Archivos propios de tu tema',
        inline: (e) => 'Código escrito directamente en el tema (' + (e.snippets || e.count) + ' fragmento' + ((e.snippets || e.count) === 1 ? '' : 's') + ')',
        own: () => 'Archivos servidos desde tu propio dominio',
        files: () => 'JavaScript subido a la sección Archivos de la tienda',
        app: (e) => 'App: ' + e.name,
        scripttag: (e) => 'Script tag antiguo: ' + e.name,
        third: (e) => (e.known ? e.name : 'Servicio desconocido: ' + e.name),
        ioc: () => 'Indicador del secuestro de checkout de octubre de 2026',
        header: () => 'El tema modifica content_for_header',
      },
      what: {
        shopify: 'Código de la propia plataforma. No hay nada que hacer.',
        theme: 'Archivos que forman parte del tema. Solo cambian cuando alguien edita el tema.',
        inline: 'Alguien escribió o pegó esto en theme.liquid, en un snippet o en una sección de Liquid personalizado. Se ejecuta con acceso completo a la página. Desinstalar una app no lo quita.',
        own: 'Servido desde la dirección de tu tienda.',
        files: 'Un archivo de script que alguien subió en Contenido > Archivos y luego enlazó desde el tema. Averigua quién lo subió y para qué: es un lugar poco habitual para código.',
        app: () => 'Lo agrega una app instalada mediante una extensión de tema. Puedes apagarla en el editor de temas (incrustaciones de aplicación, «App embeds») y Shopify la quita al desinstalar la app.',
        appHosts: (e) => 'Además trae código de: ' + e.hosts.join(', ') + '. Lo que envían esos servidores puede cambiar en cualquier momento sin que Shopify ni tú lo vean. Así viajó el secuestro de octubre de 2026.',
        scripttag: (e) => 'Una app registró esto con la antigua API ScriptTag, que se apaga el 1 de marzo de 2027. ' + (e.matched ? 'Pregunta a ' + e.matched + ' si ya se pasó a una incrustación de aplicación (app embed).' : 'Averigua de qué app es y pregunta a su desarrollador si ya se pasó a una incrustación de aplicación (app embed). Shopify borra los script tags al desinstalar la app que los creó, así que uno desconocido debería ser de una app que sigue instalada.'),
        third: (e) => 'No entró por el sistema de apps de Shopify: está en el código del tema o alguien lo pegó a mano, así que sigue ahí aunque desinstales apps. ' + (e.known ? 'Es un servicio conocido. Consérvalo solo si lo sigues usando.' : 'Esta herramienta no lo reconoce. Averigua quién lo agregó y para qué.'),
        shared: (e) => 'La dirección es espacio alquilado en ' + e.shared + ': cualquiera puede abrir un nombre ahí, así que la dirección sola no dice quién está detrás.',
        matched: (e) => 'Coincide con una app de tu lista: ' + e.matched + '.',
        unmatched: 'No está en la lista de apps que diste.',
        noSri: 'Se carga sin verificación de integridad (normal en servicios que actualizan su propio script).',
        ioc: 'En el texto aparece una dirección o una marca de los indicadores publicados.',
        header: 'El tema captura content_for_header y le quita o cambia una parte. Se hace para ocultar un script que inyecta una app. Shopify indica que no se modifique, y esto tapa el síntoma en vez de quitar la causa.',
      },
      flag: {
        'ioc-domain': (ev) => 'Dirección conocida del secuestro: ' + ev.replace(/\./g, '[.]'),
        'ioc-string': (ev) => 'Marca que usa el script del secuestro: ' + ev,
        'bad-jsdeliver': (ev) => ev + ' no es el CDN jsDelivr (ese es jsdelivr.net, sin la segunda «e»). Soporte de Shopify calificó este dominio como señal de alarma en un caso publicado.',
        'bad-polyfill': (ev) => ev + ': Cloudflare dijo en junio de 2024 que polyfill.io ya no es confiable y que hay que quitarlo de los sitios.',
        lookalike: (ev) => { const p = ev.split('|'); return p[0] + ' se parece a ' + p[1] + ' pero es otro dominio. Trátalo como hostil hasta saber quién lo puso.'; },
        'brand-ending': (ev) => { const p = ev.split('|'); return p[0] + ' usa un nombre conocido con una terminación que no es la habitual (' + p[1] + '). Confirma que es real.'; },
        'ip-host': (ev) => 'Se carga desde una dirección IP sin nombre (' + ev + '), algo que ningún servicio serio hace.',
        punycode: (ev) => 'La dirección usa un nombre internacional codificado (' + ev + '), que a veces se usa para imitar otro.',
        http: (ev) => 'Se carga por http:// desde ' + ev + ', sin cifrado.',
        'form-out': (ev) => 'Un formulario de esta página envía lo que escribe el visitante a ' + ev + '.',
        obfuscated: () => 'El código está enredado a propósito (nombres como _0x3f2a, cadenas en hexadecimal). El código legítimo de una tienda viene comprimido, no enredado.',
        'hidden-eval': () => 'El código descifra un texto oculto y lo ejecuta (eval o new Function).',
        'hidden-loader': () => 'El código descifra una dirección oculta y carga un script desde ella.',
        'checkout-click': () => 'El código escucha los clics, menciona el checkout, cancela el clic y manda el navegador a otra parte. Léelo: algunos temas lo hacen para la casilla de términos, y también es la forma del secuestro de octubre de 2026.',
        'header-edited': () => 'Encuentra el script que está ocultando, quita la app o el resto que lo causa y luego borra este parche.',
      },
      ways: { src: 'archivo de script', inline: 'cargado por código de la página', scripttag: 'script tag antiguo', iframe: 'marco', form: 'formulario', block: 'bloque o embed de app', extension: 'extensión de app' },
      seenAs: 'Aparece como', files: 'Archivos', from: 'Desde', blocks: 'Bloques',
      pixels: (p) => 'Píxeles: la página carga el gestor de píxeles de Shopify' + (p.app + p.custom ? ' (' + p.app + ' de apps, ' + p.custom + ' personalizados)' : '') + '. Los píxeles corren aislados y no pueden tocar la página. Revísalos en la sección de eventos del cliente («Customer events») del panel.',
      tagsNote: (n) => (n === 1 ? '1 script tag antiguo dejará' : n + ' script tags antiguos dejarán') + ' de cargarse el 1 de marzo de 2027 (desde el 1 de octubre de 2026 las apps no pueden crearlos ni cambiarlos). Si una función de tu tienda depende de uno, ese día deja de funcionar.',
      unused: (a) => 'En tu lista pero sin rastro en esta página: ' + a.join(', ') + '. Es normal en apps que solo trabajan en el panel; si no, puede que solo cargue en otras páginas.',
      liquidNote: 'Pegaste el código del tema (Liquid), no una página ya generada. Las apps que entran por app embeds o script tags no se ven aquí: pega el código fuente de la tienda publicada para verlas.',
      snippets: (s) => 'Este archivo incluye ' + s.length + ' snippet(s): ' + s.slice(0, 12).join(', ') + (s.length > 12 ? '…' : '') + '. Puede haber código en cualquiera de ellos.',
      notShopify: 'Esto no parece una página de Shopify. El inventario sigue siendo válido, pero las reglas de apps y script tags son propias de Shopify.',
      nextTitle: 'Qué hacer ahora',
      next: [
        'En Configuración > Apps, desinstala lo que ya no usas. Abre la página de información de cada app que quede y lee «Actividad y permisos»: lo que aparece en «Acceso sin usar» es acceso que la app tiene y no utiliza.',
        'En el editor de temas, abre las incrustaciones de aplicación («App embeds») y apaga las que no reconozcas.',
        'En la sección de eventos del cliente («Customer events») del panel, revisa los píxeles.',
        'Abre tu tienda en una ventana privada, agrega un producto y pulsa el botón de pago. Mira la barra de direcciones antes de escribir nada: si muestra un dominio que no es tu tienda ni Shopify, detente y llama a Soporte de Shopify.',
        'Guarda este inventario y vuelve a pasarlo después de instalar una app o cambiar el tema. Un nombre nuevo que tú no agregaste es lo que hay que mirar.',
      ],
      blindTitle: 'Lo que esto no puede ver',
      blind: [
        'El código que una app descarga después de cargar la página. En octubre de 2026 los archivos de las apps afectadas estaban limpios; el ataque llegó como configuración desde los servidores de sus desarrolladores. Ninguna lectura del código fuente encuentra eso. Lo que sí controlas es cuántos nombres hay en esta lista.',
        'Las páginas que no pegaste. Las de producto, carrito y colección pueden cargar otros scripts.',
        'Lo que hace cada script. Esto es una lista de quién está presente y de unas pocas señales claras, no un análisis de cada archivo.',
        'El checkout de Shopify. No forma parte del tema y tiene sus propias protecciones.',
      ],
      diffTitle: 'Comparado con tu inventario guardado',
      diffNone: 'Sin cambios desde el inventario guardado.',
      diffAdded: 'Nuevo', diffRemoved: 'Ya no está', diffHosts: 'Dirección nueva dentro de algo que ya tenías',
    },
  };

  // One description per entity, shared by the text report and the web page.
  function describe(e, lang, res) {
    const t = T[lang] || T.en; const lines = [];
    const w = t.what[e.kind];
    lines.push(typeof w === 'function' ? w(e) : w);
    if (e.kind === 'app' && e.hosts.length) lines.push(t.what.appHosts(e));
    if (e.shared && e.kind !== 'app') lines.push(t.what.shared(e));
    if (e.matched && e.kind !== 'scripttag') lines.push(t.what.matched(e));
    else if (!e.matched && res && res.appsGiven && ['app', 'scripttag'].includes(e.kind)) lines.push(t.what.unmatched);
    const flags = e.flags.map((f) => ({ level: f.level, text: t.flag[f.id](f.ev), code: ['obfuscated', 'hidden-eval', 'hidden-loader', 'checkout-click'].includes(f.id) ? f.ev : '' }));
    const detail = [];
    if (e.ways.length) detail.push(t.seenAs + ': ' + e.ways.map((x) => t.ways[x] || x).join(', '));
    if (e.blocks && e.blocks.length) detail.push(t.blocks + ': ' + e.blocks.join(', '));
    if (e.hosts.length && e.kind !== 'app') detail.push(t.from + ': ' + e.hosts.join(', '));
    if (e.files.length && ['third', 'scripttag', 'files', 'app', 'own'].includes(e.kind)) detail.push(t.files + ': ' + e.files.slice(0, 4).join(', ') + (e.files.length > 4 ? ' +' + (e.files.length - 4) : ''));
    return { title: t.title[e.kind](e), chip: t.chip[e.level], level: e.level, count: e.count, lines: lines.filter(Boolean), flags, detail };
  }

  function render(res, lang, extra) {
    const t = T[lang] || T.en; const out = [];
    const v = t.verdict[res.verdict];
    out.push('Trastienda ' + VERSION + '  ·  ' + t.storeLine(res.store));
    out.push('');
    out.push('>> ' + v[0]);
    out.push('   ' + (typeof v[1] === 'function' ? v[1](res) : v[1]));
    if (res.verdict === 'empty') return out.join('\n') + '\n';
    out.push('');
    out.push(t.summary(res));
    if (res.notes.includes('not-shopify')) out.push(t.notShopify);
    if (res.notes.includes('liquid')) out.push(t.liquidNote);
    out.push('');
    for (const e of res.entities) {
      const d = describe(e, lang, res);
      out.push(('[' + d.chip + ']').padEnd(11) + d.title + (d.count > 1 ? '  ×' + d.count : ''));
      for (const f of d.flags) { out.push('        ! ' + f.text); if (f.code) out.push('          ' + f.code); }
      for (const l of d.lines) out.push('        ' + l);
      for (const l of d.detail) out.push('        ' + l);
    }
    out.push('');
    if (res.scriptTags) out.push('- ' + t.tagsNote(res.scriptTags));
    if (res.pixels) out.push('- ' + t.pixels(res.pixels));
    if (res.liquid.snippets.length) out.push('- ' + t.snippets(res.liquid.snippets));
    if (res.unusedApps.length) out.push('- ' + t.unused(res.unusedApps));
    if (extra && extra.diff) {
      out.push(''); out.push(t.diffTitle);
      if (!extra.diff.changed) out.push('  ' + t.diffNone);
      for (const a of extra.diff.added) out.push('  + ' + t.diffAdded + ': ' + a);
      for (const a of extra.diff.newHosts) out.push('  + ' + t.diffHosts + ': ' + a);
      for (const a of extra.diff.removed) out.push('  - ' + t.diffRemoved + ': ' + a);
    }
    out.push(''); out.push(t.nextTitle);
    t.next.forEach((s, i) => out.push((i + 1) + '. ' + s));
    out.push(''); out.push(t.blindTitle);
    t.blind.forEach((s) => out.push('- ' + s));
    return out.join('\n') + '\n';
  }

  // ---------- invented sample (example.com, documentation names) ----------
  function demo(name) {
    const head = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tienda Ejemplo</title>\n<link rel="canonical" href="https://www.example.com/">\n';
    const shopify = '<script>window.Shopify = window.Shopify || {}; Shopify.shop = "tienda-ejemplo.myshopify.com"; Shopify.theme = {"name":"Dawn copy","id":1,"schema_name":"Dawn","schema_version":"15.2.0","theme_store_id":887,"role":"main"};</script>\n<script src="//www.example.com/cdn/shopifycloud/storefront/assets/shop_events_listener.js" defer></script>\n<script id="web-pixels-manager-setup">(function e(){window.Shopify.analytics=window.Shopify.analytics||{};var c={webPixelsConfigList:[{"id":"1","type":"APP","configuration":"{}"},{"id":"2","type":"CUSTOM"}]};webPixelsManager(c);})();</script>\n';
    const theme = '<script src="//www.example.com/cdn/shop/t/12/assets/global.js?v=1" defer></script>\n<script src="//www.example.com/cdn/shop/t/12/assets/cart.js?v=1" defer></script>\n';
    const tags = (urls) => '<script>(function() { function asyncLoad() { var urls = ' + JSON.stringify(urls).replace(/\//g, '\\/') + '; for (var i = 0; i < urls.length; i++) { var s = document.createElement(\'script\'); s.type = \'text/javascript\'; s.async = true; s.src = urls[i]; var x = document.getElementsByTagName(\'script\')[0]; x.parentNode.insertBefore(s, x); } }; if(window.attachEvent) { window.attachEvent(\'onload\', asyncLoad); } else { window.addEventListener(\'load\', asyncLoad, false); } })();</script>\n';
    const gtm = '<script>(function(w,d,s,l,i){w[l]=w[l]||[];var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src=\'https://www.googletagmanager.com/gtm.js?id=\'+i;f.parentNode.insertBefore(j,f);})(window,document,\'script\',\'dataLayer\',\'GTM-EXAMPLE\');</script>\n';
    const reviews = '<!-- BEGIN app block: shopify://apps/resenas-ejemplo/blocks/widget/11111111-2222-3333-4444-555555555555 -->\n<script src="https://cdn.shopify.com/extensions/11111111-2222-3333-4444-555555555555/resenas-ejemplo-42/assets/widget.js" defer></script>\n<!-- END app block -->\n';
    const options = '<!-- BEGIN app block: shopify://apps/opciones-ejemplo/blocks/embed/66666666-7777-8888-9999-000000000000 -->\n<script>(function(d){var s=d.createElement(\'script\');s.async=true;s.src="https://opciones-ejemplo-b7hq.b01.azurefd.net/loader.js";d.head.appendChild(s);})(document);</script>\n<!-- END app block -->\n';
    const end = '</head><body><h1>Tienda Ejemplo</h1></body></html>\n';
    if (name === 'clean') return head + shopify + theme + reviews + gtm + end;
    if (name === 'liquid') return '<!doctype html>\n<html>\n<head>\n  {% render \'meta-tags\' %}\n  {% render \'old-popup-app\' %}\n  {% capture header %}{{ content_for_header }}{% endcapture %}\n  {{ header | remove: \'"https:\\/\\/cdn.example.net\\/popup.js?shop=tienda-ejemplo.myshopify.com",\' }}\n  <script src="{{ \'global.js\' | asset_url }}" defer></script>\n  <script src="https://cdn.example.org/chat-widget.js" async></script>\n</head>\n<body>{{ content_for_layout }}</body>\n</html>\n';
    // default: a shop with leftovers and one imitation
    return head + shopify + theme
      + tags(['https://cdn.judge.me/assets/installed.js?shop=tienda-ejemplo.myshopify.com', 'https://d1example2abc.cloudfront.net/popup.js?shop=tienda-ejemplo.myshopify.com', 'https://app.example.net/widget/loader.js?shop=tienda-ejemplo.myshopify.com'])
      + reviews + options + gtm
      + '<script src="https://shopify.jsdeliver.cloud/npm/slider@2/dist/slider.min.js"></script>\n'
      + '<script src="https://cdn.example.org/chat-widget.js" async></script>\n'
      + end;
  }

  return { VERSION, analyze, render, describe, inventory, diff, demo, T, _regDomain: regDomain, _lookalike: lookalike, _editDistance: editDistance, _parseAsyncLoad: parseAsyncLoad, _inspectInline: inspectInline, SCRIPT_TAG_STOP, SCRIPT_TAG_NO_CREATE, IOC_DOMAINS };
});

// ---------- command line ----------
if (typeof require === 'function' && typeof module === 'object' && require.main === module) {
  const fs = require('fs'); const T = module.exports;
  const argv = process.argv.slice(2); const files = []; const o = { lang: 'en' };
  const usage = 'Usage: node trastienda.js <page.html | theme.liquid> [more files] [--apps apps.txt] [--save inventory.json] [--baseline inventory.json] [--lang es] [--json]\n       node trastienda.js --demo [shop|clean|liquid]\n       (use - to read from standard input)\n';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang') o.lang = argv[++i]; else if (a === '--json') o.json = true; else if (a === '--apps') o.apps = argv[++i];
    else if (a === '--save') o.save = argv[++i]; else if (a === '--baseline') o.baseline = argv[++i];
    else if (a === '--demo') { o.demo = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : 'shop'; }
    else if (a === '-h' || a === '--help') { process.stdout.write(usage); process.exit(0); }
    else if (a === '--version') { process.stdout.write(T.VERSION + '\n'); process.exit(0); }
    else if (a.startsWith('--')) { process.stderr.write('Unknown option: ' + a + '\n' + usage); process.exit(2); }
    else files.push(a);
  }
  if (!['en', 'es'].includes(o.lang)) { process.stderr.write('--lang must be en or es\n'); process.exit(2); }
  let text = '';
  try {
    if (o.demo) text = T.demo(o.demo);
    else if (!files.length) { process.stderr.write(usage); process.exit(2); }
    else text = files.map((f) => fs.readFileSync(f === '-' ? 0 : f, 'utf8')).join('\n');
    const apps = o.apps ? fs.readFileSync(o.apps, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')) : [];
    const res = T.analyze(text, { apps });
    const extra = {};
    if (o.baseline) extra.diff = T.diff(JSON.parse(fs.readFileSync(o.baseline, 'utf8')), res);
    if (o.save) fs.writeFileSync(o.save, JSON.stringify(T.inventory(res), null, 2) + '\n');
    if (o.json) process.stdout.write(JSON.stringify({ result: res, inventory: T.inventory(res), diff: extra.diff || null }, null, 2) + '\n');
    else process.stdout.write(T.render(res, o.lang, extra));
    process.exit(res.verdict === 'empty' ? 2 : res.verdict === 'clean' && !(extra.diff && extra.diff.changed) ? 0 : 1);
  } catch (e) {
    process.stderr.write('Error: ' + (e && e.message ? e.message : e) + '\n'); process.exit(2);
  }
}
