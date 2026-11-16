#!/usr/bin/env node
/*
 * Remitente — email authentication checker for small businesses.
 * SPF (recursive 10-lookup and void-lookup count, RFC 7208), DMARC (RFC 9989, May 2026),
 * DKIM (common selectors or the selector in a pasted DKIM-Signature), MX, MTA-STS (RFC 8461)
 * and TLS-RPT (RFC 8460), with fixes in English and Spanish.
 * Works in the browser (DNS-over-HTTPS, nothing else leaves your machine) and as a zero-dependency Node CLI.
 * Defensive and read-only: it only makes public DNS queries (and, on request, one GET of your MTA-STS policy).
 * MIT License. Daily Security Lab, experiment 100.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Remitente = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const MAX_QUERIES = 120;
  const SPF_LOOKUP_LIMIT = 10;   // RFC 7208 4.6.4
  const SPF_VOID_LIMIT = 2;      // RFC 7208 4.6.4 (SHOULD)
  const MTA_STS_MAX_AGE = 31557600; // RFC 8461 3.2
  const COMMON_SELECTORS = ['google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'default', 'dkim', 'mail', 'zoho', 'zmail', 'mandrill', 'smtp'];
  const TYPES = { A: 1, CNAME: 5, MX: 15, TXT: 16, AAAA: 28 };
  const SEV_WEIGHT = { high: 25, medium: 10, low: 3, info: 0 };
  const SEV_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

  // ---------------------------------------------------------------- helpers
  function normalizeDomain(input) {
    let d = String(input || '').trim().toLowerCase();
    if (d.includes('@')) d = d.slice(d.lastIndexOf('@') + 1);
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#:]/)[0].replace(/\.$/, '');
    if (!/^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9-]{2,63}$/.test(d)) return null;
    return d;
  }

  /** DoH JSON TXT data: '"part one" "part two"' -> 'part onepart two' (RFC 7208 3.3 concatenation). */
  function joinTxt(data) {
    const s = String(data);
    const parts = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(s))) parts.push(m[1].replace(/\\(\d{3})/g, (_, n) => String.fromCharCode(+n)).replace(/\\(.)/g, '$1'));
    return parts.length ? parts.join('') : s;
  }

  function b64ToBytes(b64) {
    const clean = String(b64).replace(/\s+/g, '');
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(clean, 'base64'));
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /** Minimal DER reader: returns RSA modulus size in bits from SubjectPublicKeyInfo or PKCS#1, or null. */
  function rsaBits(b64) {
    let bytes;
    try { bytes = b64ToBytes(b64); } catch (e) { return null; }
    function readTL(pos) {
      if (pos + 2 > bytes.length) throw new Error('short');
      const tag = bytes[pos];
      let len = bytes[pos + 1];
      let off = pos + 2;
      if (len & 0x80) {
        const n = len & 0x7f;
        if (n < 1 || n > 4) throw new Error('len');
        len = 0;
        for (let i = 0; i < n; i++) len = (len * 256) + bytes[off + i];
        off += n;
      }
      if (off + len > bytes.length) throw new Error('overflow');
      return { tag, len, off, end: off + len };
    }
    function modulusFromRsaSeq(pos) {
      const seq = readTL(pos);
      if (seq.tag !== 0x30) return null;
      const n = readTL(seq.off);
      if (n.tag !== 0x02) return null;
      let i = n.off; let len = n.len;
      while (len > 0 && bytes[i] === 0) { i++; len--; }
      if (!len) return null;
      let bits = len * 8; let b = bytes[i];
      while (!(b & 0x80)) { bits--; b <<= 1; }
      return bits;
    }
    try {
      const outer = readTL(0);
      if (outer.tag !== 0x30) return null;
      const first = readTL(outer.off);
      if (first.tag === 0x02) return modulusFromRsaSeq(0); // PKCS#1 RSAPublicKey
      if (first.tag !== 0x30) return null;
      const bit = readTL(first.end);
      if (bit.tag !== 0x03) return null;
      return modulusFromRsaSeq(bit.off + 1); // skip "unused bits" byte
    } catch (e) { return null; }
  }

  function parseTags(record) {
    const tags = []; const map = {};
    for (const raw of String(record).split(';')) {
      const part = raw.trim();
      if (!part) continue;
      const eq = part.indexOf('=');
      if (eq < 1) { tags.push({ key: part, value: null }); continue; }
      const key = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      tags.push({ key, value });
      if (!(key in map)) map[key] = value;
    }
    return { tags, map };
  }

  function mxMatches(pattern, host) {
    pattern = pattern.toLowerCase().replace(/\.$/, '');
    host = host.toLowerCase().replace(/\.$/, '');
    if (pattern.startsWith('*.')) {
      const rest = pattern.slice(2);
      const dot = host.indexOf('.');
      return dot > 0 && host.slice(dot + 1) === rest; // wildcard covers exactly one label (RFC 8461 4.1)
    }
    return pattern === host;
  }

  // ---------------------------------------------------------------- resolvers
  /** DNS-over-HTTPS JSON resolver (Cloudflare, then Google). Works in browsers (CORS *) and Node 18+. */
  function dohResolver(opts) {
    const endpoints = (opts && opts.endpoints) || [
      (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`,
      (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`
    ];
    const fetchFn = (opts && opts.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch() is not available: use Node 18+ or a modern browser');
    return async function resolve(name, type) {
      let lastErr;
      for (const ep of endpoints) {
        try {
          const res = await fetchFn(ep(name, type), { headers: { accept: 'application/dns-json' } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const j = await res.json();
          const status = j.Status === 0 ? 'NOERROR' : j.Status === 3 ? 'NXDOMAIN' : 'SERVFAIL';
          const want = TYPES[type];
          const answers = (j.Answer || []).filter(a => a.type === want).map(a => (type === 'TXT' ? joinTxt(a.data) : String(a.data).replace(/\.$/, '')));
          const cname = (j.Answer || []).filter(a => a.type === 5).map(a => String(a.data).replace(/\.$/, ''));
          return { status, answers, cname };
        } catch (e) { lastErr = e && e.cause && e.cause.code ? new Error(e.message + ' (' + e.cause.code + ')') : e; }
      }
      return { status: 'SERVFAIL', answers: [], cname: [], error: String(lastErr && lastErr.message || lastErr) };
    };
  }

  /** Offline resolver for tests and paste mode: { "name": { "TXT": [..], "MX": ["10 mx.example.com"] } | "NXDOMAIN" }. */
  function fixtureResolver(zone) {
    const z = {};
    for (const k of Object.keys(zone)) z[k.toLowerCase().replace(/\.$/, '')] = zone[k];
    return async function resolve(name, type) {
      const e = z[name.toLowerCase()];
      if (e === undefined || e === 'NXDOMAIN') return { status: 'NXDOMAIN', answers: [], cname: [] };
      if (e === 'SERVFAIL') return { status: 'SERVFAIL', answers: [], cname: [] };
      return { status: 'NOERROR', answers: (e[type] || []).slice(), cname: [] };
    };
  }

  // ---------------------------------------------------------------- context
  function makeCtx(resolve) {
    const ctx = { resolve, queries: 0, findings: [], budgetHit: false, cache: new Map() };
    ctx.q = async (name, type) => {
      const key = name.toLowerCase() + '|' + type;
      if (ctx.cache.has(key)) return ctx.cache.get(key);
      if (ctx.queries >= MAX_QUERIES) { ctx.budgetHit = true; return { status: 'SERVFAIL', answers: [], cname: [], error: 'query budget' }; }
      ctx.queries++;
      const r = await resolve(name, type);
      ctx.cache.set(key, r);
      return r;
    };
    ctx.add = (f) => { ctx.findings.push(f); };
    return ctx;
  }

  function F(id, sev, area, en, es, fixEn, fixEs) {
    const f = { id, sev, area, msg: { en, es } };
    if (fixEn) f.fix = { en: fixEn, es: fixEs || fixEn };
    return f;
  }

  // ---------------------------------------------------------------- SPF
  const MECH_RE = /^([+\-~?]?)(all|include|a|mx|ptr|ip4|ip6|exists)(?=$|[:/])(.*)$/i;
  const MOD_RE = /^([a-z][a-z0-9_.-]*)=(.*)$/i;
  const QUAL = { '+': 'pass', '-': 'fail', '~': 'softfail', '?': 'neutral', '': 'pass' };

  function validIp4(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(s);
    if (!m) return false;
    if ([1, 2, 3, 4].some(i => +m[i] > 255)) return false;
    return m[5] === undefined || +m[5] <= 32;
  }
  function validIp6(s) {
    const [addr, cidr] = s.split('/');
    if (cidr !== undefined && !(/^\d{1,3}$/.test(cidr) && +cidr <= 128)) return false;
    if (!/^[0-9a-f:.]+$/i.test(addr) || !addr.includes(':')) return false;
    const dbl = addr.split('::').length - 1;
    if (dbl > 1) return false;
    const groups = addr.split(':').filter(g => g !== '');
    return groups.every(g => /^[0-9a-f]{1,4}$/i.test(g) || validIp4(g)) && (dbl === 1 ? groups.length < 8 : groups.length === 8 || (groups.length === 7 && validIp4(groups[6])));
  }

  async function checkSpf(domain, ctx) {
    const st = { lookups: 0, voids: 0, permerror: [], tree: null };
    const visited = new Set();

    async function evalDomain(target, depth, via) {
      const node = { domain: target, via, record: null, cost: 0, children: [], notes: [] };
      if (visited.has(target)) { st.permerror.push('loop:' + target); node.notes.push('loop'); return node; }
      if (depth > 12) { node.notes.push('too-deep'); return node; }
      visited.add(target);
      const r = await ctx.q(target, 'TXT');
      if (r.status === 'SERVFAIL') { node.notes.push('dns-error'); visited.delete(target); return node; }
      const recs = r.answers.filter(t => /^v=spf1(\s|$)/i.test(t.trim()));
      if (r.status === 'NXDOMAIN' || r.answers.length === 0) { if (depth > 0) st.voids++; }
      if (recs.length === 0) {
        node.notes.push('no-spf');
        if (depth > 0) st.permerror.push('include-none:' + target);
        visited.delete(target);
        return node;
      }
      if (recs.length > 1) {
        node.notes.push('multiple');
        st.permerror.push('multiple:' + target);
        node.allRecords = recs;
      }
      node.record = recs[0].trim();
      const terms = node.record.split(/\s+/).slice(1).filter(Boolean);
      let allTerm = null; let redirect = null;
      const localIncludes = new Set();
      const before = st.lookups;
      for (const term of terms) {
        const mod = MOD_RE.exec(term);
        if (mod && !/^(ip4|ip6|a|mx|ptr|include|exists|all)$/i.test(mod[1])) {
          const name = mod[1].toLowerCase();
          if (name === 'redirect') redirect = mod[2];
          else if (name !== 'exp') node.notes.push('unknown-modifier:' + name);
          continue;
        }
        const m = MECH_RE.exec(term);
        if (!m) {
          if (/^[+\-~?]?ip:/i.test(term)) node.notes.push('ip-typo:' + term);
          else node.notes.push('bad-term:' + term);
          st.permerror.push('bad-term:' + term);
          continue;
        }
        const q = m[1]; const mech = m[2].toLowerCase(); const arg = m[3];
        if (mech === 'all') { allTerm = q || '+'; continue; }
        if (mech === 'ip4' || mech === 'ip6') {
          const v = arg.replace(/^:/, '');
          if (!arg.startsWith(':') || !(mech === 'ip4' ? validIp4(v) : validIp6(v))) { node.notes.push('bad-ip:' + term); st.permerror.push('bad-ip:' + term); }
          continue;
        }
        st.lookups++;
        const spec = arg.startsWith(':') ? arg.slice(1).split('/')[0] : '';
        const hasMacro = spec.includes('%{');
        if (mech === 'include') {
          if (!spec) { st.permerror.push('bad-term:' + term); continue; }
          const key = spec.toLowerCase();
          if (localIncludes.has(key)) { if (!node.notes.includes('dup-include:' + key)) node.notes.push('dup-include:' + key); visited.delete(key); }
          localIncludes.add(key);
          if (hasMacro) { node.children.push({ domain: spec, via: 'include', record: null, cost: 0, children: [], notes: ['macro'] }); continue; }
          node.children.push(await evalDomain(key, depth + 1, 'include'));
        } else if (mech === 'a') {
          const host = (spec || target).toLowerCase();
          if (!hasMacro) {
            const ra = await ctx.q(host, 'A'); const raaaa = await ctx.q(host, 'AAAA');
            if (!ra.answers.length && !raaaa.answers.length) { st.voids++; node.notes.push('void:a:' + host); }
          }
        } else if (mech === 'mx') {
          const host = (spec || target).toLowerCase();
          if (!hasMacro) {
            const rm = await ctx.q(host, 'MX');
            if (!rm.answers.length) { st.voids++; node.notes.push('void:mx:' + host); }
            if (rm.answers.length > 10) { st.permerror.push('mx-over-10:' + host); node.notes.push('mx-over-10:' + host); }
          }
        } else if (mech === 'ptr') {
          node.notes.push('ptr');
        }
        // exists: counted, never resolved (it is almost always a macro)
      }
      if (redirect && allTerm === null) {
        st.lookups++;
        if (redirect.includes('%{')) node.children.push({ domain: redirect, via: 'redirect', record: null, cost: 0, children: [], notes: ['macro'] });
        else {
          const child = await evalDomain(redirect.toLowerCase(), depth + 1, 'redirect');
          if (child.notes.includes('no-spf') && depth === 0) st.permerror.push('redirect-none:' + redirect);
          node.children.push(child);
        }
      } else if (redirect && allTerm !== null) node.notes.push('redirect-ignored');
      node.all = allTerm;
      node.cost = st.lookups - before;
      visited.delete(target);
      return node;
    }

    const tree = await evalDomain(domain, 0, 'root');
    st.tree = tree;
    return st;
  }

  function mergeSpf(records) {
    const seen = new Set(); const terms = []; let all = null;
    const rank = { '-': 0, '~': 1, '?': 2, '+': 3 };
    for (const rec of records) {
      for (let t of rec.trim().split(/\s+/).slice(1)) {
        const m = /^([+\-~?]?)all$/i.exec(t);
        if (m) { const q = m[1] || '+'; if (q !== '+' && (all === null || rank[q] > rank[all])) all = q; continue; }
        if (/^redirect=/i.test(t) || /^[+\-~?]?ptr(:|$)/i.test(t)) continue;
        t = t.replace(/^([+\-~?]?)ip:(?=\d+\.)/i, '$1ip4:').replace(/^([+\-~?]?)ip:(?=[0-9a-f]*:)/i, '$1ip6:');
        const key = t.toLowerCase().replace(/^\+/, '');
        if (!seen.has(key)) { seen.add(key); terms.push(t); }
      }
    }
    return 'v=spf1 ' + terms.join(' ') + ' ' + (all || '~') + 'all';
  }

  function spfFindings(domain, st, ctx, mxHosts) {
    const t = st.tree;
    const add = ctx.add;
    if (t.notes.includes('dns-error')) { add(F('spf_dns', 'medium', 'SPF', `Could not read the TXT records of ${domain} (DNS error).`, `No se pudieron leer los registros TXT de ${domain} (error de DNS).`)); return; }
    if (t.notes.includes('no-spf')) {
      const send = mxHosts.length ? `Publish one TXT record on ${domain} listing every service that sends mail as you, for example: v=spf1 include:<your provider> ~all` : `If this domain never sends mail, publish: v=spf1 -all`;
      const sendEs = mxHosts.length ? `Publica un único registro TXT en ${domain} con todos los servicios que envían correo en tu nombre, por ejemplo: v=spf1 include:<tu proveedor> ~all` : `Si este dominio nunca envía correo, publica: v=spf1 -all`;
      add(F('spf_missing', 'high', 'SPF', `No SPF record: anyone can claim to send mail from ${domain}, and Gmail, Yahoo and Outlook require SPF or DKIM from every sender.`, `Sin registro SPF: cualquiera puede decir que envía correo desde ${domain}, y Gmail, Yahoo y Outlook exigen SPF o DKIM a todo remitente.`, send, sendEs));
      return;
    }
    if (t.notes.includes('multiple')) {
      const merged = mergeSpf(t.allRecords);
      add(F('spf_multiple', 'high', 'SPF', `${t.allRecords.length} SPF records on ${domain}. RFC 7208 says that is a permanent error: receivers treat SPF as broken.`, `Hay ${t.allRecords.length} registros SPF en ${domain}. Según el RFC 7208 eso es un error permanente: los receptores tratan el SPF como roto.`, `Delete them and publish a single merged record (ptr removed, ip: corrected; check it before publishing): ${merged}`, `Bórralos y publica uno solo, fusionado (sin ptr y con ip: corregido; revísalo antes de publicar): ${merged}`));
    }
    if (t.allRecords) for (const rec of t.allRecords.slice(1)) for (const term of rec.split(/\s+/).slice(1)) if (/^[+\-~?]?ip:/i.test(term)) t.notes.push('ip-typo:' + term);
    if (st.lookups > SPF_LOOKUP_LIMIT) {
      const heavy = t.children.filter(c => c.via !== 'root').map(c => `${c.via}:${c.domain} (${1 + c.cost})`).sort((a, b) => +b.match(/\((\d+)\)$/)[1] - +a.match(/\((\d+)\)$/)[1]).filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 4).join(', ');
      add(F('spf_too_many', 'high', 'SPF', `SPF needs ${st.lookups} DNS lookups; the limit is ${SPF_LOOKUP_LIMIT}. Receivers stop at 10 and return "permerror", so SPF fails for all your mail. Heaviest: ${heavy}.`, `El SPF necesita ${st.lookups} consultas DNS y el límite es ${SPF_LOOKUP_LIMIT}. Los receptores se detienen en 10 y devuelven «permerror», así que el SPF falla para todo tu correo. Lo que más pesa: ${heavy}.`,
        'In this order: 1) remove include: entries for services you no longer use; 2) move newsletters/marketing tools to a subdomain (for example news.yourdomain) with its own SPF; 3) replace a and mx with ip4:/ip6: of your own servers; 4) only then consider flattening, and re-check it every month because providers change IPs without notice.',
        'En este orden: 1) quita los include: de servicios que ya no usas; 2) lleva el boletín o las herramientas de marketing a un subdominio (por ejemplo news.tudominio) con su propio SPF; 3) cambia a y mx por ip4:/ip6: de tus propios servidores; 4) solo después considera «aplanar», y revísalo cada mes porque los proveedores cambian sus IP sin avisar.'));
    } else if (st.lookups >= 9) {
      add(F('spf_near_limit', 'medium', 'SPF', `SPF uses ${st.lookups} of ${SPF_LOOKUP_LIMIT} DNS lookups: adding one more service will break it.`, `El SPF usa ${st.lookups} de ${SPF_LOOKUP_LIMIT} consultas DNS: si agregas un servicio más, se rompe.`, 'Before adding a new sending service, remove one you no longer use or send it from a subdomain.', 'Antes de sumar otro servicio de envío, quita uno que ya no uses o envíalo desde un subdominio.'));
    }
    if (st.voids > SPF_VOID_LIMIT) add(F('spf_voids', 'high', 'SPF', `${st.voids} "void" lookups (names that do not exist or have no records). RFC 7208 recommends failing after 2.`, `${st.voids} consultas «vacías» (nombres que no existen o no tienen registros). El RFC 7208 recomienda fallar a partir de 2.`, 'Remove include:, a or mx entries that point to names that no longer exist.', 'Quita los include:, a o mx que apuntan a nombres que ya no existen.'));
    const walk = (n, fn) => { fn(n); n.children.forEach(c => walk(c, fn)); };
    walk(t, (n) => {
      for (const note of n.notes) {
        if (note.startsWith('ip-typo:')) add(F('spf_ip_typo', 'high', 'SPF', `"${note.slice(8)}" in ${n.domain}: "ip:" is not a valid SPF mechanism; the whole record fails.`, `«${note.slice(8)}» en ${n.domain}: «ip:» no es un mecanismo SPF válido y hace fallar todo el registro.`, 'Use ip4: for IPv4 addresses and ip6: for IPv6.', 'Usa ip4: para direcciones IPv4 e ip6: para IPv6.'));
        else if (note.startsWith('bad-term:') || note.startsWith('bad-ip:')) add(F('spf_syntax', 'high', 'SPF', `Invalid SPF term "${note.split(':').slice(1).join(':')}" in ${n.domain}: receivers return permerror.`, `Término SPF inválido «${note.split(':').slice(1).join(':')}» en ${n.domain}: los receptores devuelven permerror.`, 'Fix the spelling (ip4:1.2.3.4, include:domain, ~all) or remove the term.', 'Corrige cómo está escrito (ip4:1.2.3.4, include:dominio, ~all) o quita el término.'));
        else if (note === 'ptr' && n === t) add(F('spf_ptr', 'medium', 'SPF', 'The "ptr" mechanism is slow and unreliable; RFC 7208 says it SHOULD NOT be used and some receivers ignore it.', 'El mecanismo «ptr» es lento y poco fiable; el RFC 7208 dice que no debería usarse y algunos receptores lo ignoran.', 'Replace ptr with ip4:/ip6: or include: of your provider.', 'Cambia ptr por ip4:/ip6: o por el include: de tu proveedor.'));
        else if (note === 'no-spf' && n !== t) add(F('spf_include_none', 'high', 'SPF', `include:${n.domain} has no SPF record: that is a permanent error for the whole SPF check.`, `include:${n.domain} no tiene registro SPF: eso es un error permanente para toda la verificación SPF.`, 'Remove that include (the service may have changed its address; check its current documentation).', 'Quita ese include (puede que el servicio haya cambiado su dirección; revisa su documentación actual).'));
        else if (note === 'loop') add(F('spf_loop', 'high', 'SPF', `SPF include loop at ${n.domain}.`, `Bucle de include en el SPF, en ${n.domain}.`, 'Remove the include that points back to a domain already included.', 'Quita el include que vuelve a un dominio ya incluido.'));
        else if (note.startsWith('mx-over-10:')) add(F('spf_mx_10', 'high', 'SPF', `The "mx" mechanism for ${note.slice(11)} returns more than 10 MX hosts: permerror.`, `El mecanismo «mx» de ${note.slice(11)} devuelve más de 10 servidores MX: permerror.`, 'Replace mx with ip4:/ip6: or the include: of your mail provider.', 'Cambia mx por ip4:/ip6: o por el include: de tu proveedor de correo.'));
        else if (note.startsWith('dup-include:')) add(F('spf_dup_include', 'low', 'SPF', `include:${note.slice(12)} appears more than once in ${n.domain}. Every copy counts again against the limit of 10.`, `include:${note.slice(12)} aparece más de una vez en ${n.domain}. Cada copia vuelve a contar contra el límite de 10.`, 'Keep one copy.', 'Deja una sola copia.'));
        else if (note === 'redirect-ignored' && n === t) add(F('spf_redirect_ignored', 'low', 'SPF', 'The record has both "all" and "redirect=": redirect is ignored.', 'El registro tiene «all» y «redirect=» a la vez: redirect se ignora.', 'Keep only one of them.', 'Deja solo uno de los dos.'));
      }
    });
    if (t.all === '+') add(F('spf_plus_all', 'high', 'SPF', '"+all" (or a bare "all") authorises every server on the internet to send as you.', '«+all» (o «all» a secas) autoriza a cualquier servidor de internet a enviar en tu nombre.', 'End the record with ~all (or -all once you are sure every sender is listed).', 'Termina el registro con ~all (o -all cuando estés seguro de que están todos los remitentes).'));
    else if (t.all === '?') add(F('spf_neutral_all', 'medium', 'SPF', '"?all" makes SPF say nothing about unlisted servers: it gives no protection.', '«?all» hace que el SPF no diga nada de los servidores no listados: no protege.', 'Use ~all (or -all once you are sure).', 'Usa ~all (o -all cuando estés seguro).'));
    else if (t.all === null && !t.children.some(c => c.via === 'redirect')) add(F('spf_no_all', 'medium', 'SPF', 'The record does not end with an "all" term, so unlisted servers get a neutral result.', 'El registro no termina con «all», así que los servidores no listados reciben un resultado neutro.', 'Add ~all at the end.', 'Agrega ~all al final.'));
  }

  // ---------------------------------------------------------------- MX
  async function checkMx(domain, ctx) {
    const r = await ctx.q(domain, 'MX');
    const hosts = r.answers.map(a => { const [pref, host] = a.trim().split(/\s+/); return { pref: +pref, host: (host || '').replace(/\.$/, '').toLowerCase() }; }).sort((a, b) => a.pref - b.pref);
    const nullMx = hosts.length === 1 && (hosts[0].host === '' || hosts[0].host === '.');
    return { status: r.status, hosts: nullMx ? [] : hosts, nullMx };
  }

  const PROVIDERS = [
    { re: /(^|\.)google\.com$|googlemail\.com$/, name: 'Google Workspace', include: '_spf.google.com', selector: 'google' },
    { re: /mail\.protection\.outlook\.com$/, name: 'Microsoft 365', include: 'spf.protection.outlook.com', selector: 'selector1' },
    { re: /(^|\.)zoho\.(com|eu|in|com\.au)$/, name: 'Zoho Mail', include: 'zohomail.com', selector: 'zmail' }
  ];

  // ---------------------------------------------------------------- DMARC
  async function checkDmarc(domain, ctx) {
    const out = { domain, record: null, map: null, inheritedFrom: null, suggested: null };
    let name = domain;
    for (let i = 0; i < 3; i++) {
      const r = await ctx.q('_dmarc.' + name, 'TXT');
      if (r.status === 'SERVFAIL') { out.dnsError = r.error || 'SERVFAIL'; break; }
      const recs = r.answers.filter(t => /^\s*v\s*=\s*DMARC1\b/i.test(t));
      if (recs.length) {
        out.records = recs; out.record = recs[0].trim(); if (name !== domain) out.inheritedFrom = name;
        break;
      }
      const labels = name.split('.');
      if (labels.length <= 2) break;
      name = labels.slice(1).join('.');
    }
    if (out.record) out.map = parseTags(out.record);
    return out;
  }

  async function dmarcFindings(domain, dm, ctx, ctxInfo) {
    const add = ctx.add;
    if (dm.dnsError) { add(F('dmarc_dns', 'medium', 'DMARC', `Could not read _dmarc.${domain} (DNS error), so DMARC was not checked.`, `No se pudo leer _dmarc.${domain} (error de DNS), así que DMARC no se revisó.`, 'Run the check again in a few minutes.', 'Vuelve a revisar en unos minutos.')); return; }
    if (!dm.record) {
      const ex = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`;
      add(F('dmarc_missing', 'high', 'DMARC', `No DMARC record at _dmarc.${domain}. Without it receivers do not know what to do with forged mail, you get no reports, and Gmail, Yahoo and Outlook require DMARC from bulk senders.`, `No hay registro DMARC en _dmarc.${domain}. Sin él, los receptores no saben qué hacer con el correo falsificado, no recibes informes, y Gmail, Yahoo y Outlook exigen DMARC a quien envía mucho.`,
        `Start in monitoring mode with a TXT record on _dmarc.${domain}: ${ex}  (create that mailbox first). Read the reports for 2-4 weeks, then move to p=quarantine and p=reject.`,
        `Empieza en modo observación con un TXT en _dmarc.${domain}: ${ex}  (crea antes ese buzón). Lee los informes 2 a 4 semanas y después sube a p=quarantine y a p=reject.`));
      dm.suggested = ex;
      return;
    }
    if (dm.inheritedFrom) add(F('dmarc_inherited', 'info', 'DMARC', `No DMARC record on ${domain} itself; the policy of ${dm.inheritedFrom} applies (via sp/np if set).`, `${domain} no tiene DMARC propio; se aplica la política de ${dm.inheritedFrom} (con sp/np si existen).`));
    if (dm.records.length > 1) add(F('dmarc_multiple', 'high', 'DMARC', `${dm.records.length} DMARC records: receivers ignore DMARC entirely when there is more than one.`, `Hay ${dm.records.length} registros DMARC: cuando hay más de uno, los receptores ignoran DMARC por completo.`, 'Keep a single record.', 'Deja un solo registro.'));
    const { tags, map } = dm.map;
    if (!tags.length || tags[0].key !== 'v' || tags[0].value !== 'DMARC1') add(F('dmarc_v_first', 'high', 'DMARC', 'The record must start exactly with "v=DMARC1;" (uppercase, first tag).', 'El registro debe empezar exactamente con «v=DMARC1;» (en mayúsculas y como primera etiqueta).', 'Rewrite it starting with v=DMARC1;', 'Reescríbelo empezando por v=DMARC1;'));
    const POL = ['none', 'quarantine', 'reject'];
    const p = map.p !== undefined ? map.p.toLowerCase() : undefined;
    if (p === undefined) add(F('dmarc_no_p', 'medium', 'DMARC', 'No "p=" tag. RFC 9989 treats that as p=none, but older receivers (RFC 7489) treat the record as invalid.', 'Falta la etiqueta «p=». El RFC 9989 lo trata como p=none, pero los receptores antiguos (RFC 7489) consideran inválido el registro.', 'Add p=none (or your real policy) right after v=DMARC1;', 'Agrega p=none (o tu política real) justo después de v=DMARC1;'));
    else if (!POL.includes(p)) add(F('dmarc_bad_p', 'high', 'DMARC', `p=${map.p} is not a valid policy.`, `p=${map.p} no es una política válida.`, 'Use none, quarantine or reject.', 'Usa none, quarantine o reject.'));
    const rua = map.rua ? map.rua.split(',').map(s => s.trim()).filter(Boolean) : [];
    if ((p === 'none' || p === undefined)) {
      if (!rua.length) add(F('dmarc_none_no_rua', 'high', 'DMARC', 'p=none without rua=: no protection and no reports, so you cannot see who sends as you. The record does nothing.', 'p=none sin rua=: no protege ni envía informes, así que no puedes ver quién envía en tu nombre. El registro no sirve para nada.', `Add rua=mailto:dmarc@${domain} (create the mailbox first).`, `Agrega rua=mailto:dmarc@${domain} (crea antes el buzón).`));
      else add(F('dmarc_none', 'medium', 'DMARC', 'p=none is monitoring only: forged mail using your domain is still delivered.', 'p=none solo observa: el correo falsificado con tu dominio se sigue entregando.', 'When the reports show all your real senders pass, move to p=quarantine, then p=reject.', 'Cuando los informes muestren que todos tus remitentes reales pasan, sube a p=quarantine y después a p=reject.'));
    } else if (p === 'quarantine') add(F('dmarc_quarantine', 'low', 'DMARC', 'p=quarantine sends forged mail to spam; p=reject blocks it.', 'p=quarantine manda el correo falsificado a spam; p=reject lo bloquea.', 'Move to p=reject once reports are clean for a few weeks.', 'Sube a p=reject cuando los informes lleven unas semanas limpios.'));
    const sp = map.sp && map.sp.toLowerCase();
    if (sp && !POL.includes(sp)) add(F('dmarc_bad_sp', 'medium', 'DMARC', `sp=${map.sp} is not valid.`, `sp=${map.sp} no es válido.`, 'Use none, quarantine or reject.', 'Usa none, quarantine o reject.'));
    else if (sp && p && POL.indexOf(sp) < POL.indexOf(p)) add(F('dmarc_weak_sp', 'medium', 'DMARC', `Subdomain policy sp=${sp} is weaker than p=${p}: attackers can forge any subdomain (billing.${domain}, etc.).`, `La política de subdominios sp=${sp} es más débil que p=${p}: se puede falsificar cualquier subdominio (facturacion.${domain}, etc.).`, 'Remove sp= (it inherits p) unless a subdomain really needs it.', 'Quita sp= (hereda p) salvo que un subdominio lo necesite de verdad.'));
    if (map.np && !POL.includes(map.np.toLowerCase())) add(F('dmarc_bad_np', 'medium', 'DMARC', `np=${map.np} is not valid.`, `np=${map.np} no es válido.`, 'Use none, quarantine or reject.', 'Usa none, quarantine o reject.'));
    // RFC 9989 C.5.2: pct, rf and ri were removed
    if (map.pct !== undefined) {
      const n = +map.pct;
      if (n === 0) add(F('dmarc_pct0', 'medium', 'DMARC', 'pct=0 was removed by RFC 9989 (May 2026). Its replacement is t=y (test mode: receivers apply one level below your policy).', 'pct=0 fue eliminado por el RFC 9989 (mayo de 2026). Su reemplazo es t=y (modo prueba: los receptores aplican un nivel por debajo de tu política).', 'Replace pct=0 with t=y. During the transition you can keep both.', 'Cambia pct=0 por t=y. Durante la transición puedes dejar los dos.'));
      else if (n > 0 && n < 100) add(F('dmarc_pct_partial', 'medium', 'DMARC', `pct=${map.pct}: receivers applied partial percentages inconsistently and RFC 9989 removed the tag. Treat your policy as all-or-nothing.`, `pct=${map.pct}: los receptores aplicaban los porcentajes parciales de forma dispar y el RFC 9989 eliminó la etiqueta. Toma tu política como todo o nada.`, 'Remove pct and use t=y while testing a stricter policy.', 'Quita pct y usa t=y mientras pruebas una política más estricta.'));
      else add(F('dmarc_pct', 'info', 'DMARC', 'pct is obsolete since RFC 9989; pct=100 was already the default.', 'pct está obsoleto desde el RFC 9989; pct=100 ya era el valor por defecto.', 'You can remove it.', 'Puedes quitarlo.'));
    }
    for (const k of ['rf', 'ri']) if (map[k] !== undefined) add(F('dmarc_obsolete_' + k, 'info', 'DMARC', `${k}= is obsolete since RFC 9989 and is ignored.`, `${k}= está obsoleto desde el RFC 9989 y se ignora.`, `Remove ${k}=.`, `Quita ${k}=.`));
    if (map.t !== undefined) {
      if (map.t.toLowerCase() === 'y') add(F('dmarc_test', 'info', 'DMARC', 't=y: test mode. Receivers apply one level below your policy (reject acts as quarantine, quarantine as none).', 't=y: modo prueba. Los receptores aplican un nivel por debajo de tu política (reject actúa como quarantine y quarantine como none).', 'Remove t=y when you are ready to enforce.', 'Quita t=y cuando estés listo para aplicar la política.'));
      else if (map.t.toLowerCase() !== 'n') add(F('dmarc_bad_t', 'low', 'DMARC', `t=${map.t} is not valid (y or n).`, `t=${map.t} no es válido (y o n).`));
    }
    for (const k of ['adkim', 'aspf']) if (map[k] !== undefined) {
      const v = map[k].toLowerCase();
      if (v === 's') add(F('dmarc_strict_' + k, 'info', 'DMARC', `${k}=s (strict alignment): mail sent by tools that use a subdomain (bounces.${domain}) will fail.`, `${k}=s (alineación estricta): fallará el correo de herramientas que usan un subdominio (rebotes.${domain}).`));
      else if (v !== 'r') add(F('dmarc_bad_' + k, 'low', 'DMARC', `${k}=${map[k]} is not valid (r or s).`, `${k}=${map[k]} no es válido (r o s).`));
    }
    if (map.psd !== undefined && !['y', 'n', 'u'].includes(map.psd.toLowerCase())) add(F('dmarc_bad_psd', 'low', 'DMARC', `psd=${map.psd} is not valid (y, n or u).`, `psd=${map.psd} no es válido (y, n o u).`));
    if (map.psd && map.psd.toLowerCase() === 'y') add(F('dmarc_psd_y', 'medium', 'DMARC', 'psd=y declares this domain a public suffix (like a registry). A business domain should not use it.', 'psd=y declara este dominio como sufijo público (como un registro de dominios). Un dominio de empresa no debería usarlo.', 'Remove psd=y.', 'Quita psd=y.'));
    const known = new Set(['v', 'p', 'sp', 'np', 'rua', 'ruf', 'fo', 'adkim', 'aspf', 'pct', 'rf', 'ri', 't', 'psd']);
    for (const tg of tags) if (!known.has(tg.key)) add(F('dmarc_unknown_tag', 'low', 'DMARC', `Unknown tag "${tg.key}" (typo?).`, `Etiqueta desconocida «${tg.key}» (¿error de tipeo?).`, 'Check the spelling; unknown tags are ignored.', 'Revisa cómo está escrita; las etiquetas desconocidas se ignoran.'));
    // rua / ruf destinations
    const org = dm.inheritedFrom || domain;
    for (const [tag, list] of [['rua', rua], ['ruf', map.ruf ? map.ruf.split(',').map(s => s.trim()).filter(Boolean) : []]]) {
      for (const uri of list) {
        const m = /^mailto:([^@\s!]+)@([^!\s]+)(![0-9]+[kmgt]?)?$/i.exec(uri);
        if (!m && !/^https:\/\/\S+$/i.test(uri)) { add(F('dmarc_bad_uri', 'medium', 'DMARC', `${tag}=${uri} is not a valid destination.`, `${tag}=${uri} no es un destino válido.`, `Use ${tag}=mailto:someone@${domain}`, `Usa ${tag}=mailto:alguien@${domain}`)); continue; }
        if (!m) continue;
        const dest = m[2].toLowerCase().replace(/\.$/, '');
        if (dest !== org && !dest.endsWith('.' + org) && !org.endsWith('.' + dest)) {
          const authName = `${org}._report._dmarc.${dest}`;
          const ra = await ctx.q(authName, 'TXT');
          if (ra.status === 'SERVFAIL') continue;
          if (!ra.answers.some(t => /^\s*v\s*=\s*DMARC1/i.test(t))) add(F('dmarc_ext_auth', 'high', 'DMARC', `Reports go to ${dest}, but ${dest} does not authorise it (no TXT at ${authName}). Receivers will not send those reports.`, `Los informes van a ${dest}, pero ${dest} no lo autoriza (no hay TXT en ${authName}). Los receptores no enviarán esos informes.`, `Ask the report service to publish v=DMARC1 at ${authName}, or use an address on your own domain.`, `Pide al servicio de informes que publique v=DMARC1 en ${authName}, o usa una dirección de tu propio dominio.`));
        }
      }
    }
    // Suggested clean record (RFC 9989): drop obsolete tags, pct=0 -> t=y
    const VALID = { p: POL, sp: POL, np: POL, adkim: ['r', 's'], aspf: ['r', 's'], t: ['y', 'n'], psd: ['y', 'n', 'u'] };
    const keep = tags.filter(tg => tg.value !== null && known.has(tg.key) && !['pct', 'rf', 'ri', 'v'].includes(tg.key) && (!VALID[tg.key] || VALID[tg.key].includes(tg.value.toLowerCase())));
    const parts = ['v=DMARC1'];
    if (!keep.some(tg => tg.key === 'p')) parts.push('p=none');
    for (const tg of keep) parts.push(`${tg.key}=${tg.value}`);
    if (map.pct !== undefined && +map.pct < 100 && !keep.some(tg => tg.key === 't')) parts.push('t=y');
    if (!keep.some(tg => tg.key === 'rua') && (p === 'none' || p === undefined)) parts.push(`rua=mailto:dmarc@${domain}`);
    const sug = parts.join('; ');
    if (sug.replace(/\s/g, '') !== dm.record.replace(/[\s;]+$/, '').replace(/\s/g, '')) dm.suggested = sug;
  }

  // ---------------------------------------------------------------- DKIM
  async function checkDkim(domain, ctx, selectors) {
    const found = [];
    for (const sel of selectors) {
      const name = `${sel}._domainkey.${domain}`;
      const r = await ctx.q(name, 'TXT');
      const recs = r.answers.filter(t => /(^|;)\s*(v\s*=\s*DKIM1|p\s*=)/i.test(t));
      if (!recs.length) continue;
      const { map } = parseTags(recs[0]);
      const k = (map.k || 'rsa').toLowerCase();
      const pval = (map.p || '').replace(/\s+/g, '');
      found.push({ selector: sel, name, k, revoked: pval === '', bits: k === 'rsa' && pval ? rsaBits(pval) : null, testing: /(^|:)y(:|$)/i.test(map.t || '') });
    }
    return found;
  }

  function dkimFindings(domain, found, ctx, selectors, userSelectors) {
    const add = ctx.add;
    if (!found.length) {
      const sevNotFound = userSelectors.length ? 'high' : 'info';
      add(F('dkim_not_found', sevNotFound, 'DKIM', userSelectors.length ? `No DKIM key at ${userSelectors.map(s => s + '._domainkey.' + domain).join(', ')}.` : `No DKIM key found on ${selectors.length} common selectors. It may still exist under another name: paste the "DKIM-Signature" header of an email you sent to find yours.`, userSelectors.length ? `No hay clave DKIM en ${userSelectors.map(s => s + '._domainkey.' + domain).join(', ')}.` : `No se encontró clave DKIM en ${selectors.length} selectores comunes. Puede existir con otro nombre: pega la cabecera «DKIM-Signature» de un correo que hayas enviado para encontrar la tuya.`,
        'Turn on DKIM signing in your mail provider (Google Workspace, Microsoft 365, Zoho...) and publish the record it gives you. Gmail requires DKIM from bulk senders.', 'Activa la firma DKIM en tu proveedor de correo (Google Workspace, Microsoft 365, Zoho...) y publica el registro que te entrega. Gmail exige DKIM a quien envía mucho.'));
      return;
    }
    for (const f of found) {
      if (f.revoked) add(F('dkim_revoked', 'info', 'DKIM', `Selector "${f.selector}" is published with an empty key (revoked).`, `El selector «${f.selector}» está publicado con la clave vacía (revocada).`));
      else if (f.k === 'rsa' && f.bits && f.bits < 1024) add(F('dkim_weak', 'high', 'DKIM', `Selector "${f.selector}" uses a ${f.bits}-bit RSA key. Gmail requires at least 1024 bits.`, `El selector «${f.selector}» usa una clave RSA de ${f.bits} bits. Gmail exige al menos 1024.`, 'Generate a new 2048-bit key in your mail provider and publish it.', 'Genera una clave nueva de 2048 bits en tu proveedor de correo y publícala.'));
      else if (f.k === 'rsa' && f.bits && f.bits < 2048) add(F('dkim_1024', 'low', 'DKIM', `Selector "${f.selector}" uses a ${f.bits}-bit RSA key; Google recommends 2048.`, `El selector «${f.selector}» usa una clave RSA de ${f.bits} bits; Google recomienda 2048.`, 'Rotate to a 2048-bit key when convenient.', 'Rótala a una clave de 2048 bits cuando puedas.'));
      else if (f.k === 'rsa' && !f.bits) add(F('dkim_unparsable', 'medium', 'DKIM', `Selector "${f.selector}": the public key could not be read (broken copy/paste?).`, `Selector «${f.selector}»: no se pudo leer la clave pública (¿se copió mal?).`, 'Copy the record again from your provider, as one TXT value.', 'Vuelve a copiar el registro desde tu proveedor, como un solo valor TXT.'));
      if (f.testing) add(F('dkim_testing', 'low', 'DKIM', `Selector "${f.selector}" has t=y (testing): some receivers treat its signatures as unsigned.`, `El selector «${f.selector}» tiene t=y (prueba): algunos receptores tratan sus firmas como si no existieran.`, 'Remove t=y once DKIM works.', 'Quita t=y cuando DKIM funcione.'));
    }
  }

  /** Extract d= and s= from pasted DKIM-Signature header(s). */
  function selectorsFromHeaders(text) {
    const out = [];
    const unfolded = String(text || '').replace(/\r?\n[ \t]+/g, ' ');
    const re = /^dkim-signature:\s*(.*)$/gim;
    let m;
    while ((m = re.exec(unfolded))) {
      const { map } = parseTags(m[1]);
      if (map.s && map.d) out.push({ selector: map.s.trim(), domain: map.d.trim().toLowerCase() });
    }
    if (!out.length && /\bs=/.test(unfolded) && /\bd=/.test(unfolded)) {
      const { map } = parseTags(unfolded.replace(/^dkim-signature:\s*/i, ''));
      if (map.s && map.d) out.push({ selector: map.s.trim(), domain: map.d.trim().toLowerCase() });
    }
    return out;
  }

  // ---------------------------------------------------------------- MTA-STS / TLS-RPT
  function parseStsPolicy(text) {
    const pol = { version: null, mode: null, mx: [], max_age: null, errors: [] };
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const i = line.indexOf(':');
      if (i < 1) { pol.errors.push('bad-line:' + line); continue; }
      const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
      if (k === 'version') pol.version = v;
      else if (k === 'mode') pol.mode = v.toLowerCase();
      else if (k === 'mx') pol.mx.push(v.toLowerCase());
      else if (k === 'max_age') pol.max_age = /^\d{1,10}$/.test(v) ? +v : NaN;
    }
    return pol;
  }

  async function checkMtaSts(domain, ctx, policyText, fetchPolicy) {
    const r = await ctx.q('_mta-sts.' + domain, 'TXT');
    const recs = r.answers.filter(t => /^\s*v=STSv1\b/.test(t));
    const out = { records: recs, policy: null, policySource: null, policyError: null };
    let text = policyText;
    if (!text && recs.length && fetchPolicy) {
      try { text = await fetchPolicy(`https://mta-sts.${domain}/.well-known/mta-sts.txt`); out.policySource = 'fetched'; }
      catch (e) { out.policyError = String(e && e.message || e); }
    } else if (text) out.policySource = 'pasted';
    if (text) out.policy = parseStsPolicy(text);
    const t = await ctx.q('_smtp._tls.' + domain, 'TXT');
    out.tlsrpt = t.answers.filter(x => /^\s*v=TLSRPTv1\b/.test(x));
    return out;
  }

  function stsFindings(domain, sts, mx, ctx) {
    const add = ctx.add;
    if (!mx.hosts.length) return;
    if (!sts.records.length) {
      add(F('mtasts_missing', 'low', 'MTA-STS', 'No MTA-STS: mail sent TO you can be downgraded to unencrypted by an attacker on the network.', 'Sin MTA-STS: un atacante en la red puede forzar que el correo que te envían viaje sin cifrar.', `Publish a policy file at https://mta-sts.${domain}/.well-known/mta-sts.txt (start with mode: testing) and a TXT at _mta-sts.${domain}: v=STSv1; id=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}01`, `Publica una política en https://mta-sts.${domain}/.well-known/mta-sts.txt (empieza con mode: testing) y un TXT en _mta-sts.${domain}: v=STSv1; id=${new Date().toISOString().slice(0, 10).replace(/-/g, '')}01`));
    } else {
      if (sts.records.length > 1) add(F('mtasts_multiple', 'high', 'MTA-STS', 'More than one _mta-sts TXT record: senders treat MTA-STS as not configured.', 'Hay más de un TXT en _mta-sts: los remitentes consideran que MTA-STS no está configurado.', 'Keep one record.', 'Deja un solo registro.'));
      const { map } = parseTags(sts.records[0]);
      if (!map.id || !/^[A-Za-z0-9]{1,32}$/.test(map.id)) add(F('mtasts_bad_id', 'high', 'MTA-STS', `The id= of _mta-sts.${domain} is missing or invalid (1-32 letters or digits).`, `Falta el id= de _mta-sts.${domain} o no es válido (1 a 32 letras o dígitos).`, 'Use something like id=2026111601 and change it every time you edit the policy.', 'Usa algo como id=2026111601 y cámbialo cada vez que edites la política.'));
      if (sts.policy) {
        const p = sts.policy;
        if (p.version !== 'STSv1') add(F('mtasts_version', 'high', 'MTA-STS', 'Policy file: "version: STSv1" is missing.', 'Archivo de política: falta «version: STSv1».'));
        if (!['enforce', 'testing', 'none'].includes(p.mode)) add(F('mtasts_mode', 'high', 'MTA-STS', `Policy mode "${p.mode}" is invalid.`, `El modo de la política «${p.mode}» no es válido.`, 'Use mode: testing, then mode: enforce.', 'Usa mode: testing y después mode: enforce.'));
        else if (p.mode === 'testing') add(F('mtasts_testing', 'info', 'MTA-STS', 'MTA-STS is in testing mode: failures are reported (if TLS-RPT is set) but mail is still delivered.', 'MTA-STS está en modo prueba: los fallos se informan (si hay TLS-RPT) pero el correo se sigue entregando.', 'Switch to mode: enforce after a few weeks of clean TLS reports.', 'Pasa a mode: enforce tras unas semanas de informes TLS limpios.'));
        else if (p.mode === 'none') add(F('mtasts_none', 'medium', 'MTA-STS', 'MTA-STS mode is "none": the policy is switched off.', 'El modo de MTA-STS es «none»: la política está apagada.'));
        if (p.max_age === null || Number.isNaN(p.max_age) || p.max_age > MTA_STS_MAX_AGE) add(F('mtasts_max_age', 'high', 'MTA-STS', `max_age is missing or out of range (0 to ${MTA_STS_MAX_AGE}).`, `max_age falta o está fuera de rango (0 a ${MTA_STS_MAX_AGE}).`, 'Use max_age: 604800 (one week) or more.', 'Usa max_age: 604800 (una semana) o más.'));
        else if (p.max_age < 86400) add(F('mtasts_short_age', 'low', 'MTA-STS', `max_age is ${p.max_age} seconds: senders forget the policy quickly, which weakens it.`, `max_age es de ${p.max_age} segundos: los remitentes olvidan la política muy rápido y eso la debilita.`, 'Use at least 604800 (one week) once it works.', 'Usa al menos 604800 (una semana) cuando funcione.'));
        const uncovered = mx.hosts.filter(h => !p.mx.some(pat => mxMatches(pat, h.host))).map(h => h.host);
        if (!p.mx.length) add(F('mtasts_no_mx', 'high', 'MTA-STS', 'The policy lists no "mx:" lines.', 'La política no tiene líneas «mx:».'));
        else if (uncovered.length) add(F('mtasts_mx_mismatch', p.mode === 'enforce' ? 'high' : 'medium', 'MTA-STS', `Your MX ${uncovered.join(', ')} ${uncovered.length > 1 ? 'are' : 'is'} not covered by the policy's mx: lines. With mode: enforce, senders will refuse to deliver to ${uncovered.length > 1 ? 'them' : 'it'}.`, (uncovered.length > 1 ? `Tus MX ${uncovered.join(', ')} no están cubiertos por las líneas mx: de la política. Con mode: enforce, los remitentes se negarán a entregarles correo.` : `Tu MX ${uncovered[0]} no está cubierto por las líneas mx: de la política. Con mode: enforce, los remitentes se negarán a entregarle correo.`), `Add mx: lines that match your MX hosts (a wildcard like *.${uncovered[0].split('.').slice(1).join('.')} covers exactly one label).`, `Agrega líneas mx: que coincidan con tus MX (un comodín como *.${uncovered[0].split('.').slice(1).join('.')} cubre exactamente un nivel).`));
      } else {
        add(F('mtasts_policy_unread', 'info', 'MTA-STS', `MTA-STS TXT found, but the policy file could not be read here${sts.policyError ? ' (' + sts.policyError + ')' : ''}. Browsers usually block it (CORS): paste its content to check it.`, `Se encontró el TXT de MTA-STS, pero aquí no se pudo leer el archivo de política${sts.policyError ? ' (' + sts.policyError + ')' : ''}. Los navegadores suelen bloquearlo (CORS): pega su contenido para revisarlo.`));
      }
      if (!sts.tlsrpt.length) add(F('tlsrpt_missing', 'low', 'TLS-RPT', 'MTA-STS without TLS-RPT: you will not hear about delivery failures caused by the policy.', 'MTA-STS sin TLS-RPT: no te enterarás de los fallos de entrega que cause la política.', `Add a TXT at _smtp._tls.${domain}: v=TLSRPTv1; rua=mailto:tls-reports@${domain}`, `Agrega un TXT en _smtp._tls.${domain}: v=TLSRPTv1; rua=mailto:tls-reports@${domain}`));
    }
    for (const rec of sts.tlsrpt) {
      const { map } = parseTags(rec);
      const dests = (map.rua || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!dests.length || dests.some(d => !/^(mailto:[^@\s]+@[^@\s]+|https:\/\/\S+)$/i.test(d))) add(F('tlsrpt_bad_rua', 'medium', 'TLS-RPT', `TLS-RPT rua= is missing or invalid: "${map.rua || ''}".`, `El rua= de TLS-RPT falta o no es válido: «${map.rua || ''}».`, 'Use rua=mailto:address or rua=https://url', 'Usa rua=mailto:direccion o rua=https://url'));
    }
  }

  // ---------------------------------------------------------------- main
  async function analyze(input, opts) {
    opts = opts || {};
    const domain = normalizeDomain(input);
    if (!domain) throw new Error('Invalid domain: ' + input);
    const resolve = opts.resolver || dohResolver({ fetch: opts.fetch });
    const ctx = makeCtx(resolve);
    const fromHeaders = selectorsFromHeaders(opts.headers || '');
    const userSelectors = [...new Set([...(opts.selectors || []), ...fromHeaders.filter(h => h.domain === domain || h.domain.endsWith('.' + domain)).map(h => h.selector)])];
    const selectors = userSelectors.length ? userSelectors : COMMON_SELECTORS;

    const mx = await checkMx(domain, ctx);
    const spf = await checkSpf(domain, ctx);
    if (mx.status === 'SERVFAIL' && spf.tree.notes.includes('dns-error')) {
      const why = (ctx.cache.get(domain + '|MX') || {}).error || 'SERVFAIL';
      const err = new Error(`DNS lookups for ${domain} failed (${why}). Nothing was checked.`);
      err.code = 'DNS_FAILED';
      throw err;
    }
    const dmarc = await checkDmarc(domain, ctx);
    const dkim = await checkDkim(domain, ctx, selectors);
    const sts = await checkMtaSts(domain, ctx, opts.policy, opts.fetchPolicy);

    if (mx.status === 'NXDOMAIN' && spf.tree.notes.includes('no-spf') && !dmarc.record) {
      ctx.add(F('nxdomain', 'high', 'DNS', `${domain} does not exist in DNS (check the spelling).`, `${domain} no existe en el DNS (revisa cómo está escrito).`));
    } else {
      if (mx.nullMx) ctx.add(F('null_mx', 'info', 'MX', `${domain} publishes a "null MX": it declares that it receives no mail.`, `${domain} publica un «MX nulo»: declara que no recibe correo.`));
      else if (!mx.hosts.length) ctx.add(F('no_mx', 'info', 'MX', `${domain} has no MX record: it does not receive mail. If it does not send either, lock it down with v=spf1 -all and p=reject.`, `${domain} no tiene registro MX: no recibe correo. Si tampoco envía, ciérralo con v=spf1 -all y p=reject.`));
      spfFindings(domain, spf, ctx, mx.hosts);
      await dmarcFindings(domain, dmarc, ctx);
      dkimFindings(domain, dkim, ctx, selectors, userSelectors);
      stsFindings(domain, sts, mx, ctx);
      // Provider hints: MX at a known provider whose include is absent from SPF
      if (spf.tree.record) {
        const flat = [];
        const walk = n => { if (n.record) flat.push(n.domain); n.children.forEach(walk); };
        walk(spf.tree);
        for (const pr of PROVIDERS) {
          if (mx.hosts.some(h => pr.re.test(h.host)) && !flat.includes(pr.include)) ctx.add(F('provider_hint', 'low', 'SPF', `Your mail is received by ${pr.name}, but SPF does not include ${pr.include}. If you also send through ${pr.name}, its mail fails SPF.`, `Tu correo lo recibe ${pr.name}, pero el SPF no incluye ${pr.include}. Si también envías con ${pr.name}, su correo falla SPF.`, `If you send with ${pr.name}, add include:${pr.include} to your SPF.`, `Si envías con ${pr.name}, agrega include:${pr.include} a tu SPF.`));
        }
      }
    }
    if (ctx.budgetHit) ctx.add(F('budget', 'info', 'DNS', `Stopped after ${MAX_QUERIES} DNS queries; some branches were not checked.`, `Se detuvo tras ${MAX_QUERIES} consultas DNS; algunas ramas no se revisaron.`));

    const findings = ctx.findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]);
    const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEV_WEIGHT[f.sev], 0));
    const grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
    const spfOk = !!spf.tree.record && !spf.permerror.length && spf.lookups <= SPF_LOOKUP_LIMIT && spf.voids <= SPF_VOID_LIMIT;
    const dkimOk = dkim.some(k => !k.revoked && (k.k !== 'rsa' || (k.bits || 0) >= 1024));
    const dmarcOk = !!dmarc.record && (!dmarc.records || dmarc.records.length === 1);
    const requirements = {
      allSenders: { ok: spfOk || dkimOk, spf: spfOk, dkim: dkimOk ? true : (userSelectors.length ? false : null) },
      bulkSenders: { ok: spfOk && dkimOk && dmarcOk, spf: spfOk, dkim: dkimOk ? true : (userSelectors.length ? false : null), dmarc: dmarcOk, rua: !!(dmarc.map && dmarc.map.map.rua) }
    };
    return {
      tool: 'remitente', version: VERSION, domain, grade, score, queries: ctx.queries,
      mx, spf: { record: spf.tree.record, lookups: spf.lookups, voids: spf.voids, permerror: spf.permerror, tree: spf.tree },
      dmarc: { record: dmarc.record, inheritedFrom: dmarc.inheritedFrom, suggested: dmarc.suggested },
      dkim, mtaSts: { records: sts.records, policy: sts.policy, policySource: sts.policySource, tlsrpt: sts.tlsrpt },
      requirements, findings
    };
  }

  // ---------------------------------------------------------------- text report
  function spfTreeLines(node, indent, lang) {
    const lines = [];
    const label = node.via === 'root' ? node.domain : `${node.via}:${node.domain}`;
    const cost = node.via === 'root' ? '' : `  [${1 + node.cost}]`;
    const flag = node.notes.includes('no-spf') ? (lang === 'es' ? '  (sin SPF)' : '  (no SPF)') : node.notes.includes('macro') ? '  (macro)' : '';
    lines.push(indent + label + cost + flag);
    for (const c of node.children) lines.push(...spfTreeLines(c, indent + '  ', lang));
    return lines;
  }

  function formatText(r, lang) {
    lang = lang === 'es' ? 'es' : 'en';
    const T = (en, es) => (lang === 'es' ? es : en);
    const yn = v => (v === true ? 'OK ' : v === false ? T('NO ', 'NO ') : '?  ');
    const out = [];
    out.push(`Remitente ${r.version} — ${r.domain}   ${T('grade', 'nota')} ${r.grade} (${r.score}/100)   ${r.queries} ${T('DNS queries', 'consultas DNS')}`);
    out.push('');
    out.push(`MX     ${r.mx.hosts.length ? r.mx.hosts.map(h => h.pref + ' ' + h.host).join(', ') : r.mx.nullMx ? 'null MX' : T('none', 'ninguno')}`);
    out.push(`SPF    ${r.spf.record || T('none', 'ninguno')}`);
    if (r.spf.record) {
      out.push(`       ${T('DNS lookups', 'consultas DNS')}: ${r.spf.lookups}/10   ${T('void', 'vacías')}: ${r.spf.voids}/2`);
      for (const l of spfTreeLines(r.spf.tree, '       ', lang).slice(1)) out.push(l);
    }
    out.push(`DMARC  ${r.dmarc.record || T('none', 'ninguno')}${r.dmarc.inheritedFrom ? T('  (from ', '  (de ') + r.dmarc.inheritedFrom + ')' : ''}`);
    out.push(`DKIM   ${r.dkim.length ? r.dkim.map(k => `${k.selector} (${k.revoked ? T('revoked', 'revocada') : k.k === 'rsa' ? (k.bits ? k.bits + '-bit RSA' : 'RSA ?') : k.k})`).join(', ') : T('not found on the selectors checked', 'no encontrado en los selectores revisados')}`);
    out.push(`MTA-STS ${r.mtaSts.records.length ? r.mtaSts.records[0] + (r.mtaSts.policy ? `  mode: ${r.mtaSts.policy.mode}` : '') : T('none', 'ninguno')}   TLS-RPT ${r.mtaSts.tlsrpt.length ? 'OK' : T('none', 'ninguno')}`);
    out.push('');
    const rq = r.requirements;
    out.push(T('Gmail / Yahoo / Outlook requirements', 'Requisitos de Gmail / Yahoo / Outlook'));
    out.push(`  ${T('Every sender (SPF or DKIM)', 'Todo remitente (SPF o DKIM)')}: ${rq.allSenders.ok ? 'OK' : 'NO'}`);
    out.push(`  ${T('Bulk senders (>5000/day): SPF', 'Envío masivo (>5000/día): SPF')} ${yn(rq.bulkSenders.spf)} DKIM ${yn(rq.bulkSenders.dkim)} DMARC ${yn(rq.bulkSenders.dmarc)} rua ${yn(rq.bulkSenders.rua)}`);
    out.push(T('  (alignment, one-click unsubscribe and spam rate cannot be seen in DNS)', '  (la alineación, la baja en un clic y la tasa de spam no se ven en el DNS)'));
    out.push('');
    if (!r.findings.length) out.push(T('No findings.', 'Sin hallazgos.'));
    for (const f of r.findings) {
      out.push(`[${f.sev.toUpperCase().padEnd(6)}] ${f.area}: ${f.msg[lang]}`);
      if (f.fix) out.push(`         ${T('Fix', 'Arreglo')}: ${f.fix[lang]}`);
    }
    if (r.dmarc.suggested) { out.push(''); out.push(`${T('Suggested DMARC record', 'Registro DMARC sugerido')} (_dmarc.${r.dmarc.inheritedFrom || r.domain}):`); out.push('  ' + r.dmarc.suggested); }
    return out.join('\n');
  }

  function exitCode(r, failOn) {
    const levels = { high: 0, medium: 1, low: 2, info: 3 };
    if (failOn === 'never') return 0;
    const lim = levels[failOn || 'high'];
    return r.findings.some(f => levels[f.sev] <= lim) ? 1 : 0;
  }

  return { VERSION, COMMON_SELECTORS, analyze, formatText, exitCode, normalizeDomain, joinTxt, rsaBits, parseTags, parseStsPolicy, mxMatches, mergeSpf, selectorsFromHeaders, dohResolver, fixtureResolver };
});

// ---------------------------------------------------------------- CLI
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  (async () => {
    const R = module.exports;
    const fs = require('fs');
    const args = process.argv.slice(2);
    const opt = { lang: 'en', json: false, failOn: 'high', selectors: [] };
    let domain = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--lang') opt.lang = args[++i];
      else if (a === '--es') opt.lang = 'es';
      else if (a === '--json') opt.json = true;
      else if (a === '--fail-on') opt.failOn = args[++i];
      else if (a === '--selector') opt.selectors.push(...String(args[++i] || '').split(',').filter(Boolean));
      else if (a === '--headers') opt.headers = fs.readFileSync(args[++i], 'utf8');
      else if (a === '--policy') opt.policy = fs.readFileSync(args[++i], 'utf8');
      else if (a === '--fetch-policy') opt.fetchPolicyOn = true;
      else if (a === '--zone') opt.zone = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
      else if (a === '-h' || a === '--help') { domain = null; break; }
      else if (a === '--version') { console.log(R.VERSION); process.exit(0); }
      else if (!a.startsWith('--')) domain = a;
      else { console.error('Unknown option ' + a); process.exit(2); }
    }
    if (!domain || !['high', 'medium', 'low', 'never'].includes(opt.failOn)) {
      console.error('Usage: node remitente.js <domain> [--lang es] [--json] [--selector s1,s2] [--headers email.txt]\n                     [--policy mta-sts.txt | --fetch-policy] [--zone fixture.json] [--fail-on high|medium|low|never]');
      process.exit(2);
    }
    const o = { lang: opt.lang, selectors: opt.selectors, headers: opt.headers, policy: opt.policy };
    if (opt.zone) o.resolver = R.fixtureResolver(opt.zone);
    if (opt.fetchPolicyOn) o.fetchPolicy = async (url) => { const res = await fetch(url, { redirect: 'error' }); if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); };
    try {
      const r = await R.analyze(domain, o);
      console.log(opt.json ? JSON.stringify(r, (k, v) => (k === 'cache' ? undefined : v), 2) : R.formatText(r, opt.lang));
      process.exit(R.exitCode(r, opt.failOn));
    } catch (e) {
      console.error(String(e.message || e));
      if (/CERT|certificate/i.test(String(e.message))) console.error('A proxy or antivirus is inspecting HTTPS on this machine. Run: node --use-system-ca remitente.js ' + domain);
      process.exit(2);
    }
  })();
}
