#!/usr/bin/env node
/*
 * Candado 1.0.0 — will your site's certificate keep renewing, and can your domain be trusted?
 * Checks CAA (RFC 8659/8657), DNSSEC (DS/DNSKEY + validation via DNS-over-HTTPS),
 * the current certificate from Certificate Transparency (crt.sh) and security.txt (RFC 9116).
 * Cross-checks the CA that issued your current certificate against your CAA records.
 * Works in the browser (index.html) and as a zero-dependency Node 18+ CLI.
 * Defensive and passive: only public DNS, public CT logs and one GET of /.well-known/security.txt.
 * MIT License. Daily Security Lab · Experiment 102 of dev-experiments-365.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Candado = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
  const DAY = 86400000;

  // CA/Browser Forum Baseline Requirements v2.3.1, section 1.2.2 / 6.3.2 (ballot SC-081v3).
  const LIFETIME_SCHEDULE = [
    { from: '2026-03-15', days: 200 },
    { from: '2027-03-15', days: 100 },
    { from: '2029-03-15', days: 47 }
  ];

  // CAA issuer domains per CA owner, from the CCADB "All CAA Identifiers" report (snapshot 2026-11-18).
  // `match` recognises the issuer as written in the certificate (crt.sh issuer_name).
  const CAS = [
    { name: "Let's Encrypt", ids: ['letsencrypt.org'], match: /O=Let's Encrypt/i },
    { name: 'Google Trust Services', ids: ['pki.goog'], match: /O=Google Trust Services/i },
    { name: 'DigiCert', ids: ['digicert.com', 'www.digicert.com', 'thawte.com', 'geotrust.com', 'rapidssl.com', 'symantec.com', 'digicert.ne.jp', 'cybertrust.ne.jp', 'quovadisglobal.com', 'digitalcertvalidation.com'], match: /O=(DigiCert|Thawte|GeoTrust|RapidSSL|QuoVadis)/i },
    { name: 'Sectigo (also ZeroSSL)', ids: ['sectigo.com', 'comodo.com', 'comodoca.com', 'usertrust.com', 'trust-provider.com'], match: /O=(Sectigo|COMODO|ZeroSSL|The USERTRUST)/i },
    { name: 'SSL.com', ids: ['ssl.com'], match: /O=SSL Corp/i },
    { name: 'Amazon Trust Services', ids: ['amazon.com', 'amazontrust.com', 'awstrust.com', 'amazonaws.com', 'aws.amazon.com'], match: /O=Amazon/i },
    { name: 'GoDaddy', ids: ['godaddy.com', 'starfieldtech.com'], match: /O=(GoDaddy|Starfield)/i },
    { name: 'GlobalSign', ids: ['globalsign.com'], match: /O=GlobalSign/i },
    { name: 'Entrust', ids: ['entrust.net', 'affirmtrust.com'], match: /O=(Entrust|AffirmTrust)/i },
    { name: 'Microsoft', ids: ['microsoft.com'], match: /O=Microsoft Corporation/i },
    { name: 'Buypass', ids: ['buypass.com', 'buypass.no'], match: /O=Buypass/i },
    { name: 'Actalis', ids: ['actalis.it'], match: /O=Actalis/i },
    { name: 'Certum (Asseco)', ids: ['certum.pl', 'certum.eu'], match: /O=(Asseco|Unizeto|Certum)/i },
    { name: 'HARICA', ids: ['harica.gr'], match: /HARICA|Hellenic Academic/i },
    { name: 'IdenTrust', ids: ['identrust.com', 'www.identrust.com'], match: /O=IdenTrust/i },
    { name: 'Certainly (Fastly)', ids: ['certainly.com'], match: /O=Certainly/i },
    { name: 'TrustAsia', ids: ['trustasia.com'], match: /O=TrustAsia/i },
    { name: 'FNMT', ids: ['fnmt.es'], match: /FNMT/i },
    { name: 'ACCV', ids: ['accv.es'], match: /O=ACCV/i },
    { name: 'Firmaprofesional', ids: ['firmaprofesional.com'], match: /Firmaprofesional/i },
    { name: 'Camerfirma', ids: ['camerfirma.com'], match: /Camerfirma/i },
    { name: 'SwissSign', ids: ['swisssign.com'], match: /O=SwissSign/i },
    { name: 'Telia', ids: ['telia.com', 'telia.fi', 'telia.se', 'trust.telia.com'], match: /O=Telia/i },
    { name: 'Certigna', ids: ['certigna.fr', 'certigna.com'], match: /Certigna|Dhimyotis/i },
    { name: 'D-Trust', ids: ['d-trust.net', 'dtrust.de', 'd-trust.de'], match: /O=D-Trust/i },
    { name: 'Deutsche Telekom', ids: ['telesec.de', 'pki.dfn.de', 'dfn.de'], match: /T-Systems|Telekom|DFN/i },
    { name: 'SECOM', ids: ['secomtrust.net'], match: /SECOM/i },
    { name: 'eMudhra', ids: ['emsign.com'], match: /eMudhra/i },
    { name: 'Izenpe', ids: ['izenpe.com', 'izenpe.eus'], match: /IZENPE/i }
  ];
  // Every issuer domain recognised in the CCADB report (for typo detection).
  const KNOWN_IDS = new Set([].concat(...CAS.map(c => c.ids), [
    'tuntrust.tn', 'atos.net', 'pki.eviden.com', 'anf.es', 'bjca.cn', 'certicamara.com', 'certsign.ro', 'cfca.com.cn',
    'pki.hinet.net', 'tls.hinet.net', 'eca.hinet.net', 'epki.com.tw', 'publicca.hinet.net', 'comsign.co.il', 'comsign.co.uk',
    'comsigneurope.com', 'aoc.cat', 'cybertrust.co.jp', 'disig.sk', 'www.certinomis.com', 'www.certinomis.fr', 'globaltrust.eu',
    'e-tugra.com', 'edicomgroup.com', 'fina.hr', 'gdca.com.cn', 'dvv.fi', 'fineid.fi', 'ecert.gov.hk', 'hongkongpost.gov.hk',
    'cca.gov.in', 'ssl.gpki.go.kr', 'myndighetsca.se', 'efos.se', 'kamusm.gov.tr', 'itrus.cn', 'elektronicznypodpis.pl',
    'e-szigno.hu', 'multicert.com', 'navercloudtrust.com', 'netlock.hu', 'netlock.net', 'netlock.eu', 'netlock.com',
    'wisekey.com', 'hightrusted.com', 'certifyid.com', 'oiste.org', 'oaticerts.com', 'postsignum.cz', 'sheca.com', 'admin.ch',
    'twca.com.tw', 'acme.trust.telia.com', 'nrca.go.th', 'trustfactory.net', 'visa.com', 'amazontrustservices.eu', 'amazonaws.eu', 'amznts.eu',
    'volusion.digitalcertvalidation.com', 'stratossl.digitalcertvalidation.com', 'intermediatecertificate.digitalcertvalidation.com', '1and1.digitalcertvalidation.com'
  ]));

  const TYPES = { A: 1, CNAME: 5, TXT: 16, AAAA: 28, DS: 43, DNSKEY: 48, CAA: 257 };

  // ---------------------------------------------------------------- helpers
  function t(en, es) { return { en, es }; }
  function finding(ctx, sev, area, id, msg, fix) { ctx.findings.push({ sev, area, id, msg, fix: fix || null }); }

  function normalizeDomain(input) {
    let s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    if (s.includes('@') && !s.includes('/')) s = s.split('@').pop();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
    if (s.startsWith('*.')) s = s.slice(2);
    if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(s)) return null;
    return s;
  }

  function lifetimeLimitOn(date) {
    let limit = 398;
    for (const s of LIFETIME_SCHEDULE) if (date >= new Date(s.from + 'T00:00:00Z')) limit = s.days;
    return limit;
  }

  function nextLifetimeStep(now) {
    return LIFETIME_SCHEDULE.find(s => new Date(s.from + 'T00:00:00Z') > now) || null;
  }

  function lev(a, b) {
    const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  function suggestId(id) {
    const label = id.split('.')[0];
    let best = null, bestD = 3;
    for (const k of KNOWN_IDS) {
      const dd = k.split('.')[0] === label ? 1 : lev(id, k);
      if (dd < bestD) { best = k; bestD = dd; }
    }
    return best;
  }

  function caForIssuer(issuerName) {
    const probe = 'O=' + orgOf(issuerName) + ', ' + String(issuerName || ''); // crt.sh quotes O= values with commas: O="DigiCert, Inc."
    return CAS.find(c => c.match.test(probe)) || null;
  }

  // Certificates in CT that are not website (TLS server) certificates: BIMI mark certificates (VMC/CMC), S/MIME, code signing.
  const NON_TLS_ISSUER = /Verified Mark|Common Mark|VMC|CMC|S\/MIME|SMIME|Code Signing|Client Auth/i;

  function orgOf(issuerName) {
    const m = /O=("([^"]+)"|[^,]+)/.exec(issuerName || '');
    return m ? (m[2] || m[1]).trim() : String(issuerName || '?');
  }

  // ---------------------------------------------------------------- CAA parsing (RFC 8659 section 4)
  /** Parses "0 issue \"letsencrypt.org; accounturi=...\"" as returned by DNS-over-HTTPS JSON. */
  function parseCaa(data) {
    const m = /^\s*(\d+)\s+([A-Za-z0-9]+)\s+([\s\S]*)$/.exec(String(data));
    if (!m) return { raw: data, invalid: true };
    const flags = Number(m[1]);
    const tag = m[2];
    let v = m[3].trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    v = v.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const extraQuotes = /^["']|["']$/.test(v.trim());
    const value = v.replace(/^["']+|["']+$/g, '').trim();
    const rec = { raw: data, flags, critical: (flags & 128) !== 0, tag: tag.toLowerCase(), tagRaw: tag, value, extraQuotes };
    if (rec.tag === 'issue' || rec.tag === 'issuewild' || rec.tag === 'issuemail') {
      const parts = value.split(';');
      rec.issuer = parts[0].trim().toLowerCase().replace(/\.$/, '');
      rec.params = {};
      for (const p of parts.slice(1)) {
        const eq = p.indexOf('=');
        if (eq > 0) rec.params[p.slice(0, eq).trim().toLowerCase()] = p.slice(eq + 1).trim();
      }
    }
    return rec;
  }

  // ---------------------------------------------------------------- security.txt (RFC 9116)
  function parseSecurityTxt(text) {
    let body = String(text || '').replace(/\r\n?/g, '\n');
    const signed = /-----BEGIN PGP SIGNED MESSAGE-----/.test(body);
    if (signed) {
      const start = body.indexOf('\n\n', body.indexOf('-----BEGIN PGP SIGNED MESSAGE-----'));
      const end = body.indexOf('-----BEGIN PGP SIGNATURE-----');
      body = body.slice(start >= 0 ? start + 2 : 0, end > 0 ? end : undefined).replace(/^- /gm, '');
    }
    const fields = [];
    for (const line of body.split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('#')) continue;
      const c = l.indexOf(':');
      if (c < 1) { fields.push({ name: null, value: l }); continue; }
      fields.push({ name: l.slice(0, c).trim().toLowerCase(), value: l.slice(c + 1).trim() });
    }
    return { signed, fields };
  }

  function checkSecurityTxt(ctx, text, domain, now, source) {
    const out = { present: true, source, contact: [], expires: null, signed: false };
    const p = parseSecurityTxt(text);
    out.signed = p.signed;
    if (/<html|<!doctype/i.test(text)) {
      finding(ctx, 'medium', 'security.txt', 'sectxt-html',
        t('/.well-known/security.txt returns a web page, not a security.txt file (often the site\'s 404 page served with status 200).',
          '/.well-known/security.txt devuelve una página web, no un archivo security.txt (a menudo es la página 404 del sitio servida con estado 200).'),
        t('Publish a plain text file at /.well-known/security.txt (see the template below).', 'Publica un archivo de texto plano en /.well-known/security.txt (mira la plantilla de abajo).'));
      out.present = false;
      return out;
    }
    const bad = p.fields.filter(f => f.name === null);
    if (bad.length) finding(ctx, 'low', 'security.txt', 'sectxt-syntax', t(`${bad.length} line(s) are not "Field: value": ${bad[0].value.slice(0, 60)}`, `${bad.length} línea(s) no tienen la forma «Campo: valor»: ${bad[0].value.slice(0, 60)}`));
    const get = n => p.fields.filter(f => f.name === n).map(f => f.value);
    out.contact = get('contact');
    const exp = get('expires');
    if (!out.contact.length) {
      finding(ctx, 'high', 'security.txt', 'sectxt-no-contact',
        t('security.txt has no Contact field. It is required (RFC 9116): without it nobody knows where to report a problem.', 'security.txt no tiene campo Contact. Es obligatorio (RFC 9116): sin él nadie sabe dónde avisar de un problema.'),
        t(`Add a line such as: Contact: mailto:security@${domain}`, `Agrega una línea como: Contact: mailto:security@${domain}`));
    }
    for (const c of out.contact) {
      if (!/^(mailto:|https:\/\/|tel:)/i.test(c)) finding(ctx, 'medium', 'security.txt', 'sectxt-contact-uri',
        t(`Contact "${c}" is not a URI. RFC 9116 needs mailto:, https:// or tel:.`, `Contact «${c}» no es una URI. RFC 9116 exige mailto:, https:// o tel:.`),
        t(`Write it as Contact: mailto:${c.replace(/^mailto:/i, '')}`, `Escríbelo como Contact: mailto:${c.replace(/^mailto:/i, '')}`));
      if (/^http:\/\//i.test(c)) finding(ctx, 'medium', 'security.txt', 'sectxt-contact-http', t('A Contact web address uses http://; RFC 9116 requires https:// for web URIs.', 'Una dirección web de Contact usa http://; RFC 9116 exige https:// para las direcciones web.'));
    }
    if (!exp.length) {
      finding(ctx, 'high', 'security.txt', 'sectxt-no-expires',
        t('security.txt has no Expires field. It is required since RFC 9116, so tools treat the file as stale.', 'security.txt no tiene campo Expires. Es obligatorio desde RFC 9116, así que las herramientas lo dan por obsoleto.'),
        t(`Add: Expires: ${new Date(now.getTime() + 330 * DAY).toISOString().slice(0, 10)}T00:00:00.000Z (less than a year ahead) and set a yearly reminder.`, `Agrega: Expires: ${new Date(now.getTime() + 330 * DAY).toISOString().slice(0, 10)}T00:00:00.000Z (a menos de un año) y pon un recordatorio anual.`));
    } else {
      if (exp.length > 1) finding(ctx, 'medium', 'security.txt', 'sectxt-expires-dup', t('Expires appears more than once; RFC 9116 allows it only once.', 'Expires aparece más de una vez; RFC 9116 solo lo permite una vez.'));
      const d = new Date(exp[0]);
      if (isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(exp[0])) {
        finding(ctx, 'medium', 'security.txt', 'sectxt-expires-format', t(`Expires "${exp[0]}" is not an ISO 8601 date-time (RFC 3339), e.g. 2027-10-01T00:00:00.000Z.`, `Expires «${exp[0]}» no es una fecha y hora ISO 8601 (RFC 3339), por ejemplo 2027-10-01T00:00:00.000Z.`));
      } else {
        out.expires = d.toISOString();
        const days = Math.floor((d - now) / DAY);
        if (days < 0) finding(ctx, 'high', 'security.txt', 'sectxt-expired',
          t(`security.txt expired ${-days} day(s) ago (${exp[0]}). An expired file must not be used, so it is as if you had none.`, `security.txt venció hace ${-days} día(s) (${exp[0]}). Un archivo vencido no se debe usar, así que es como no tenerlo.`),
          t('Check the contacts are still right and move Expires forward (less than a year).', 'Comprueba que los contactos siguen siendo correctos y adelanta Expires (a menos de un año).'));
        else if (days < 30) finding(ctx, 'medium', 'security.txt', 'sectxt-expiring', t(`security.txt expires in ${days} day(s).`, `security.txt vence en ${days} día(s).`), t('Review the contacts and move Expires forward now.', 'Revisa los contactos y adelanta Expires ahora.'));
        else if (days > 366) finding(ctx, 'low', 'security.txt', 'sectxt-expires-far', t(`Expires is ${days} days ahead. RFC 9116 recommends less than a year, so old contacts do not linger.`, `Expires está a ${days} días. RFC 9116 recomienda menos de un año, para que no queden contactos viejos.`));
      }
    }
    const canon = get('canonical');
    if (canon.length && domain && !canon.some(c => { try { const h = new URL(c).hostname.toLowerCase(); return h === domain || h === 'www.' + domain || 'www.' + h === domain; } catch (e) { return false; } })) {
      finding(ctx, 'low', 'security.txt', 'sectxt-canonical', t(`Canonical points to another site (${canon[0]}). Copied from another domain?`, `Canonical apunta a otro sitio (${canon[0]}). ¿Se copió de otro dominio?`));
    }
    return out;
  }

  function securityTxtTemplate(domain, now) {
    const exp = new Date(now.getTime() + 330 * DAY).toISOString().slice(0, 10);
    return `Contact: mailto:security@${domain}\nExpires: ${exp}T00:00:00.000Z\nPreferred-Languages: es, en\nCanonical: https://${domain}/.well-known/security.txt\n`;
  }

  // ---------------------------------------------------------------- resolvers
  /** DNS-over-HTTPS JSON resolver (Cloudflare, then Google). Both send CORS "*", the AD flag and EDE comments. */
  function dohResolver(opts) {
    const endpoints = (opts && opts.endpoints) || [
      (n, ty, cd) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${ty}${cd ? '&cd=true' : ''}`,
      (n, ty, cd) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${ty}${cd ? '&cd=true' : ''}`
    ];
    const fetchFn = (opts && opts.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch() is not available: use Node 18+ or a modern browser');
    return async function resolve(name, type, o) {
      const cd = !!(o && o.cd);
      let lastErr;
      for (const ep of endpoints) {
        try {
          const res = await fetchFn(ep(name, type, cd), { headers: { accept: 'application/dns-json' } });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const j = await res.json();
          const status = j.Status === 0 ? 'NOERROR' : j.Status === 3 ? 'NXDOMAIN' : 'SERVFAIL';
          const want = TYPES[type];
          const answers = (j.Answer || []).filter(a => a.type === want).map(a => String(a.data));
          const ede = [].concat(j.Comment || [], (j.extended_dns_errors || []).map(e => `EDE(${e.info_code}): ${e.extra_text || ''}`)).join(' ');
          return { status, answers, ad: !!j.AD, ede };
        } catch (e) { lastErr = e && e.cause && e.cause.code ? new Error(e.message + ' (' + e.cause.code + ')') : e; }
      }
      return { status: 'ERROR', answers: [], ad: false, ede: '', error: String(lastErr && lastErr.message || lastErr) };
    };
  }

  /**
   * Offline resolver for tests: { "name": { "CAA": [..], "DS": [..], "DNSKEY": [..], "A": [..],
   *   "_signed": true, "_bogus": "EDE(9): ..." } | "NXDOMAIN" }.
   * `_signed` sets AD on every answer; `_bogus` makes every non-cd query SERVFAIL (broken DNSSEC).
   */
  function fixtureResolver(zone) {
    const z = {};
    for (const k of Object.keys(zone)) z[k.toLowerCase().replace(/\.$/, '')] = zone[k];
    const lookup = name => {
      if (z[name] !== undefined) return z[name];
      // inherit _bogus / _signed from the closest parent that defines it (a broken zone breaks its children too)
      const labels = name.split('.');
      for (let i = 1; i < labels.length - 1; i++) { const p = z[labels.slice(i).join('.')]; if (p && typeof p === 'object' && (p._bogus || p._signed)) return { _bogus: p._bogus, _signed: p._signed }; }
      return undefined;
    };
    return async function resolve(name, type, o) {
      const e = lookup(name.toLowerCase());
      if (e === undefined) return { status: 'NOERROR', answers: [], ad: false, ede: '' };
      if (e === 'NXDOMAIN') return { status: 'NXDOMAIN', answers: [], ad: false, ede: '' };
      if (e._bogus && !(o && o.cd) && type !== 'DS') return { status: 'SERVFAIL', answers: [], ad: false, ede: e._bogus };
      return { status: 'NOERROR', answers: (e[type] || []).slice(), ad: !!e._signed && !(o && o.cd), ede: e._bogus || '' };
    };
  }

  /** crt.sh JSON lookup (CORS "*"). Returns the raw entries array. */
  function crtshSource(opts) {
    const fetchFn = (opts && opts.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    const timeoutMs = (opts && opts.timeoutMs) || 30000;
    return async function ct(domain) {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), timeoutMs) : null;
        try {
          const res = await fetchFn(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`, ac ? { signal: ac.signal } : undefined);
          if (!res.ok) throw new Error('crt.sh HTTP ' + res.status);
          return await res.json();
        } catch (e) { lastErr = e; } finally { if (timer) clearTimeout(timer); }
      }
      throw lastErr;
    };
  }

  // ---------------------------------------------------------------- CAA
  async function checkCaa(ctx, domain) {
    const out = { checked: [], records: [], foundAt: null, wwwRecords: null, wwwFoundAt: null };
    async function climb(name) {
      const labels = name.split('.');
      for (let i = 0; i < labels.length - 1; i++) {
        const n = labels.slice(i).join('.');
        const r = await ctx.q(n, 'CAA');
        out.checked.push(n);
        if (r.status === 'SERVFAIL' || r.status === 'ERROR') return { error: r, at: n, records: [] };
        if (r.answers.length) return { at: n, records: r.answers.map(parseCaa) };
      }
      return { at: null, records: [] };
    }
    const main = await climb(domain);
    if (main.error) {
      finding(ctx, 'high', 'CAA', 'caa-lookup-fail',
        t(`The CAA lookup for ${main.at} failed (${main.error.status}). CAs must refuse to issue when this lookup fails, so renewals will fail until it is fixed.`, `La consulta CAA de ${main.at} falló (${main.error.status}). Las CA deben negarse a emitir si esta consulta falla, así que las renovaciones fallarán hasta arreglarlo.`),
        t('Fix the DNS problem first (see the DNSSEC finding); a DNS provider that does not answer CAA queries must be replaced or reported.', 'Arregla primero el problema de DNS (mira el hallazgo de DNSSEC); un proveedor de DNS que no responde consultas CAA hay que reemplazarlo o reportarlo.'));
      out.error = true;
      return out;
    }
    out.records = main.records; out.foundAt = main.at;
    if (!domain.startsWith('www.')) {
      const w = await ctx.q('www.' + domain, 'CAA');
      if (w.answers.length) { out.wwwRecords = w.answers.map(parseCaa); out.wwwFoundAt = 'www.' + domain; }
    }
    const sets = [{ at: out.foundAt, recs: out.records }];
    if (out.wwwRecords) sets.push({ at: out.wwwFoundAt, recs: out.wwwRecords });
    for (const s of sets) {
      for (const r of s.recs) {
        if (r.invalid) { finding(ctx, 'medium', 'CAA', 'caa-unparsable', t(`CAA record at ${s.at} could not be read: ${r.raw}`, `No se pudo leer un registro CAA en ${s.at}: ${r.raw}`)); continue; }
        if (r.extraQuotes) finding(ctx, 'high', 'CAA', 'caa-extra-quotes',
          t(`CAA at ${s.at} has extra quotes inside the value: ${r.raw}. CAs compare the text literally and will not recognise themselves.`, `El CAA de ${s.at} tiene comillas de más dentro del valor: ${r.raw}. Las CA comparan el texto tal cual y no se van a reconocer.`),
          t(`Recreate it so the zone shows exactly: 0 ${r.tag} "${r.value}" (most DNS panels add the outer quotes themselves; type only ${r.value}).`, `Vuelve a crearlo para que la zona muestre exactamente: 0 ${r.tag} "${r.value}" (la mayoría de los paneles de DNS ponen las comillas exteriores solos; escribe solo ${r.value}).`));
        if (['issue', 'issuewild', 'iodef', 'issuemail', 'issuevmc', 'contactemail', 'contactphone'].indexOf(r.tag) < 0) {
          if (r.critical) finding(ctx, 'high', 'CAA', 'caa-critical-unknown',
            t(`CAA at ${s.at} has an unknown tag "${r.tagRaw}" marked critical (flag 128). RFC 8659 says CAs must then refuse to issue at all.`, `El CAA de ${s.at} tiene una etiqueta desconocida «${r.tagRaw}» marcada como crítica (flag 128). RFC 8659 dice que entonces las CA deben negarse a emitir.`),
            t('Delete that record or set its flag to 0.', 'Borra ese registro o pon su flag en 0.'));
          else finding(ctx, 'low', 'CAA', 'caa-unknown-tag', t(`CAA at ${s.at} has an unknown tag "${r.tagRaw}" (typo for issue/issuewild/iodef?). It is ignored.`, `El CAA de ${s.at} tiene una etiqueta desconocida «${r.tagRaw}» (¿error al escribir issue/issuewild/iodef?). Se ignora.`));
        }
        if (r.tag === 'issue' || r.tag === 'issuewild') {
          if (r.issuer && !KNOWN_IDS.has(r.issuer)) {
            const sug = suggestId(r.issuer);
            finding(ctx, 'high', 'CAA', 'caa-unknown-issuer',
              t(`CAA at ${s.at} authorises "${r.issuer}", which no publicly trusted CA uses as its CAA name (CCADB list). Probably a typo: that line allows nobody.`, `El CAA de ${s.at} autoriza «${r.issuer}», que ninguna CA de confianza pública usa como nombre CAA (lista CCADB). Probablemente es un error: esa línea no autoriza a nadie.`),
              sug ? t(`Did you mean "${sug}"? Use: 0 ${r.tag} "${sug}"`, `¿Querías decir «${sug}»? Usa: 0 ${r.tag} "${sug}"`) : t('Check the exact CAA name in your CA\'s documentation.', 'Revisa el nombre CAA exacto en la documentación de tu CA.'));
          }
          if (r.params && r.params.validationmethods) {
            const ok = ['http-01', 'dns-01', 'tls-alpn-01', 'dns-account-01', 'dns-persist-01'];
            const unk = r.params.validationmethods.split(',').map(x => x.trim().toLowerCase()).filter(x => x && ok.indexOf(x) < 0 && !/^ca-/.test(x));
            if (unk.length) finding(ctx, 'medium', 'CAA', 'caa-validationmethods', t(`validationmethods lists unknown method(s): ${unk.join(', ')}. The CA may refuse to issue.`, `validationmethods incluye método(s) desconocido(s): ${unk.join(', ')}. La CA podría negarse a emitir.`));
          }
        }
        if (r.tag === 'iodef' && !/^(mailto:|https?:\/\/)/i.test(r.value)) finding(ctx, 'low', 'CAA', 'caa-iodef', t(`iodef "${r.value}" must be a mailto: or https:// address.`, `iodef «${r.value}» debe ser una dirección mailto: o https://.`), t(`Use: 0 iodef "mailto:security@${domain}"`, `Usa: 0 iodef "mailto:security@${domain}"`));
      }
    }
    if (!out.records.length) {
      finding(ctx, 'low', 'CAA', 'caa-none',
        t('No CAA records: any of the ~70 public CAs may issue a certificate for your domain. A CAA record limits that to the CAs you actually use.', 'No hay registros CAA: cualquiera de las ~70 CA públicas puede emitir un certificado para tu dominio. Un registro CAA lo limita a las CA que de verdad usas.'),
        t('Add the CAA records suggested below (built from the CAs that issued your recent certificates).', 'Agrega los registros CAA sugeridos abajo (armados con las CA que emitieron tus certificados recientes).'));
    } else if (!out.records.some(r => r.tag === 'iodef')) {
      finding(ctx, 'info', 'CAA', 'caa-no-iodef', t('No iodef record: CAs have no address to warn you about a refused certificate request.', 'No hay registro iodef: las CA no tienen dónde avisarte de una solicitud de certificado rechazada.'), t(`Optional: 0 iodef "mailto:security@${domain}"`, `Opcional: 0 iodef "mailto:security@${domain}"`));
    }
    return out;
  }

  /** Which CA identifiers may issue for a name (non-wildcard or wildcard) under a CAA set. null = anyone. */
  function allowedIssuers(records, wildcard) {
    if (!records || !records.length) return null;
    const issue = records.filter(r => r.tag === 'issue');
    const wild = records.filter(r => r.tag === 'issuewild');
    const use = wildcard && wild.length ? wild : issue;
    if (!use.length) return null; // only iodef/issuemail: no restriction for that kind (RFC 8659 4.2/4.3)
    // a value with extra quotes never matches a CA, and an empty issuer (";") allows nobody
    return use.filter(r => !r.extraQuotes && r.issuer).map(r => r.issuer);
  }

  // ---------------------------------------------------------------- DNSSEC
  async function checkDnssec(ctx, domain) {
    const out = { state: 'unknown', ds: [], dnskey: 0, ad: false, ede: '' };
    const a = await ctx.q(domain, 'A');
    const ds = await ctx.q(domain, 'DS', { cd: true });
    out.ds = ds.answers;
    if (a.status === 'ERROR') { out.state = 'error'; return out; }
    if (a.status === 'SERVFAIL') {
      const cd = await ctx.q(domain, 'A', { cd: true });
      out.ede = a.ede || cd.ede || '';
      if (cd.status === 'NOERROR') {
        out.state = 'bogus';
        finding(ctx, 'high', 'DNSSEC', 'dnssec-bogus',
          t(`DNSSEC is broken: validating resolvers (Google, Cloudflare, most mobile carriers) answer SERVFAIL for ${domain}, so for many visitors the site and email do not exist. With validation off the name resolves, which proves the signatures are the problem.${out.ede ? ' Resolver says: ' + out.ede : ''}`,
            `DNSSEC está roto: los resolutores que validan (Google, Cloudflare, la mayoría de las operadoras móviles) responden SERVFAIL para ${domain}, así que para muchos visitantes el sitio y el correo no existen. Sin validación el nombre sí resuelve, lo que prueba que el problema son las firmas.${out.ede ? ' El resolutor dice: ' + out.ede : ''}`),
          t('Most common cause: a DS record left at the registrar after moving DNS to another provider. Either turn DNSSEC on at the new DNS provider and copy its DS to the registrar, or delete the old DS at the registrar. Changes can take up to the DS TTL (often 1–2 days).',
            'Causa más común: un registro DS que quedó en el registrador después de cambiar de proveedor de DNS. O activas DNSSEC en el proveedor nuevo y copias su DS al registrador, o borras el DS viejo en el registrador. El cambio puede tardar lo que dure el TTL del DS (a menudo 1 o 2 días).'));
        return out;
      }
      out.state = 'servfail';
      finding(ctx, 'high', 'DNS', 'dns-servfail', t(`${domain} does not resolve even without DNSSEC validation (SERVFAIL). The DNS servers are not answering.`, `${domain} no resuelve ni siquiera sin validación DNSSEC (SERVFAIL). Los servidores DNS no están respondiendo.`), t('Check the nameservers at your registrar and that the DNS provider still hosts the zone.', 'Revisa los servidores de nombres en el registrador y que el proveedor de DNS siga teniendo la zona.'));
      return out;
    }
    if (a.status === 'NXDOMAIN') { out.state = 'nxdomain'; finding(ctx, 'high', 'DNS', 'dns-nxdomain', t(`${domain} does not exist in DNS (NXDOMAIN).`, `${domain} no existe en el DNS (NXDOMAIN).`)); return out; }
    const key = await ctx.q(domain, 'DNSKEY', { cd: true });
    out.dnskey = key.answers.length;
    out.ad = !!a.ad;
    if (out.ds.length && a.ad) out.state = 'signed';
    else if (out.ds.length && !a.ad) {
      out.state = 'insecure-ds';
      finding(ctx, 'medium', 'DNSSEC', 'dnssec-ds-not-validating', t('A DS record exists at the registrar but answers are not marked as validated. DNSSEC may be half-configured.', 'Hay un registro DS en el registrador, pero las respuestas no salen validadas. DNSSEC podría estar a medio configurar.'), t('Check the zone with dnsviz.net and your DNS provider\'s DNSSEC page.', 'Revisa la zona en dnsviz.net y en la página de DNSSEC de tu proveedor de DNS.'));
    } else if (!out.ds.length && out.dnskey) {
      out.state = 'unlinked';
      finding(ctx, 'low', 'DNSSEC', 'dnssec-no-ds',
        t('Your DNS provider signs the zone (DNSKEY published) but the registrar has no DS record, so DNSSEC protects nobody yet.', 'Tu proveedor de DNS firma la zona (hay DNSKEY), pero el registrador no tiene el registro DS, así que DNSSEC todavía no protege a nadie.'),
        t('Copy the DS record shown in your DNS provider\'s DNSSEC page into the registrar\'s DNSSEC section.', 'Copia el registro DS que muestra la página de DNSSEC de tu proveedor de DNS en la sección DNSSEC del registrador.'));
    } else {
      out.state = 'unsigned';
      finding(ctx, 'info', 'DNSSEC', 'dnssec-off',
        t('DNSSEC is off. It is optional; it stops forged DNS answers. If your DNS provider offers it with one click (Cloudflare, many registrars) it is worth turning on; if not, it is fine to leave it off.', 'DNSSEC está apagado. Es opcional; impide respuestas de DNS falsificadas. Si tu proveedor de DNS lo ofrece con un clic (Cloudflare, muchos registradores) vale la pena activarlo; si no, puedes dejarlo apagado.'));
    }
    return out;
  }

  // ---------------------------------------------------------------- certificates from CT
  function summarizeCt(entries, domain, now) {
    const names = new Set([domain, 'www.' + domain.replace(/^www\./, ''), '*.' + domain, domain.replace(/^www\./, '')]);
    const bySerial = new Map();
    for (const e of entries || []) {
      if (NON_TLS_ISSUER.test(e.issuer_name || '')) continue;
      const ns = String(e.name_value || e.common_name || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!ns.some(n => names.has(n))) continue;
      const key = (e.serial_number || e.id) + '|' + e.issuer_ca_id;
      if (bySerial.has(key)) continue;
      const nb = new Date(e.not_before + 'Z'), na = new Date(e.not_after + 'Z');
      if (isNaN(nb) || isNaN(na)) continue;
      bySerial.set(key, { id: e.id, issuer: e.issuer_name, org: orgOf(e.issuer_name), ca: caForIssuer(e.issuer_name), notBefore: nb, notAfter: na, names: ns, wildcard: ns.some(n => n.startsWith('*.')), lifetimeDays: Math.round((na - nb) / DAY) });
    }
    const certs = [...bySerial.values()].filter(c => c.notAfter > now && c.notBefore <= now).sort((a, b) => b.notBefore - a.notBefore);
    return certs;
  }

  function checkCerts(ctx, certs, domain, now, caa) {
    const out = { latest: null, daysLeft: null, issuers: [], certs: certs.length };
    if (!certs.length) {
      finding(ctx, 'high', 'Certificate', 'cert-none',
        t(`Certificate Transparency logs show no valid certificate for ${domain} today. Browsers will show a warning, unless the site uses a certificate under another name.`, `Los registros de Certificate Transparency no muestran ningún certificado vigente para ${domain} hoy. Los navegadores mostrarán una advertencia, salvo que el sitio use un certificado con otro nombre.`),
        t('Open the site in a browser and check the padlock. If it fails, renew the certificate in your hosting panel (look for "SSL" or "AutoSSL").', 'Abre el sitio en un navegador y revisa el candado. Si falla, renueva el certificado en el panel de tu hosting (busca «SSL» o «AutoSSL»).'));
      return out;
    }
    const newest = certs[0];
    const latestEnd = newest;
    out.latest = { notBefore: newest.notBefore.toISOString(), notAfter: newest.notAfter.toISOString(), issuer: newest.org, lifetimeDays: newest.lifetimeDays, id: newest.id };
    out.daysLeft = Math.floor((newest.notAfter - now) / DAY);
    const seen = new Map();
    for (const c of certs) if (!seen.has(c.org)) seen.set(c.org, c.ca);
    out.issuers = [...seen.entries()].map(([org, ca]) => ({ org, ca: ca ? ca.name : null, ids: ca ? ca.ids : [] }));

    // Expiry. Note: CT shows what was issued, not what the server serves.
    if (out.daysLeft < 7) finding(ctx, 'high', 'Certificate', 'cert-expiring',
      t(`The newest certificate expires in ${out.daysLeft} day(s) (${latestEnd.notAfter.toISOString().slice(0, 10)}) and no newer one has been issued. Automatic renewal has probably stopped.`, `El certificado más nuevo vence en ${out.daysLeft} día(s) (${latestEnd.notAfter.toISOString().slice(0, 10)}) y no se ha emitido uno más nuevo. La renovación automática probablemente se detuvo.`),
      t('Renew it today in your hosting panel and check why the automatic renewal failed (CAA, DNS, a blocked /.well-known/acme-challenge/ path, an expired hosting plan).', 'Renuévalo hoy en el panel del hosting y revisa por qué falló la renovación automática (CAA, DNS, la ruta /.well-known/acme-challenge/ bloqueada, un plan de hosting vencido).'));
    else if (out.daysLeft < 14) finding(ctx, 'medium', 'Certificate', 'cert-expiring-soon',
      t(`The newest certificate expires in ${out.daysLeft} days and no newer one exists yet. Automatic renewal normally happens when a third of the lifetime is left.`, `El certificado más nuevo vence en ${out.daysLeft} días y aún no existe uno más nuevo. La renovación automática suele ocurrir cuando queda un tercio de la vigencia.`),
      t('Check your renewal (hosting panel, certbot, Caddy, your CDN) this week.', 'Revisa tu renovación (panel del hosting, certbot, Caddy, tu CDN) esta semana.'));
    else {
      const elapsed = (now - newest.notBefore) / DAY;
      if (newest.lifetimeDays <= 100 && elapsed > newest.lifetimeDays * 0.75) finding(ctx, 'medium', 'Certificate', 'cert-renewal-late',
        t(`The newest certificate was issued ${Math.round(elapsed)} days ago out of ${newest.lifetimeDays}. Automatic clients renew at about two thirds; this one has not. Renewal may be failing silently.`, `El certificado más nuevo se emitió hace ${Math.round(elapsed)} días, de ${newest.lifetimeDays}. Los clientes automáticos renuevan cerca de los dos tercios y este no lo ha hecho. La renovación podría estar fallando sin avisar.`),
        t('Look at the renewal log of your hosting or ACME client before it expires.', 'Mira el registro de renovación de tu hosting o de tu cliente ACME antes de que venza.'));
    }

    // Lifetime schedule: manual renewals will become unmanageable.
    const next = nextLifetimeStep(now);
    const longest = certs.reduce((a, c) => (c.lifetimeDays > a.lifetimeDays ? c : a), certs[0]);
    if (longest.lifetimeDays > 100) {
      finding(ctx, next ? 'medium' : 'low', 'Certificate', 'cert-long-lifetime',
        t(`A certificate from ${longest.org} lasts ${longest.lifetimeDays} days, usually a sign it is bought and installed by hand. Public certificates are capped at ${lifetimeLimitOn(now)} days now${next ? `, ${next.days} days from ${next.from}` : ''} and 47 days from 2029-03-15 (CA/Browser Forum).`, `Un certificado de ${longest.org} dura ${longest.lifetimeDays} días, normalmente señal de que se compra e instala a mano. Los certificados públicos tienen un tope de ${lifetimeLimitOn(now)} días hoy${next ? `, ${next.days} días desde el ${next.from}` : ''} y 47 días desde el 2029-03-15 (CA/Browser Forum).`),
        t('Move to automatic renewal (ACME: AutoSSL, certbot, Caddy, your CDN) before the next step; renewing by hand every few weeks is not realistic.', 'Pasa a renovación automática (ACME: AutoSSL, certbot, Caddy, tu CDN) antes del próximo tramo; renovar a mano cada pocas semanas no es realista.'));
    }
    if (newest.ca && newest.ca.name === "Let's Encrypt") {
      finding(ctx, 'info', 'Certificate', 'cert-le-no-email',
        t("Let's Encrypt stopped sending expiry emails on 2025-06-04, and its default certificates drop from 90 to 64 days on 2027-02-10 and to 45 days on 2028-02-16. Nobody will warn you if renewal breaks.", 'Let\'s Encrypt dejó de enviar correos de vencimiento el 2025-06-04, y sus certificados por defecto bajan de 90 a 64 días el 2027-02-10 y a 45 días el 2028-02-16. Nadie te avisará si la renovación se rompe.'),
        t('Add an expiry check to your calendar (the .ics button) or run this tool monthly.', 'Agrega un aviso de vencimiento a tu calendario (botón .ics) o corre esta herramienta cada mes.'));
    }

    // Cross-check against CAA: the CA that renews today must be allowed tomorrow.
    if (caa && caa.records && caa.records.length && !caa.error) {
      const reported = new Set();
      for (const c of certs) {
        if (reported.has(c.wildcard)) continue;
        const recs = (c.names.some(n => n.startsWith('www.')) && caa.wwwRecords) ? caa.wwwRecords : caa.records;
        const allowed = allowedIssuers(recs, c.wildcard);
        if (allowed === null) continue;
        if (!c.ca) {
          finding(ctx, 'low', 'CAA', 'caa-unknown-current-ca', t(`Your current certificate comes from "${c.org}", which this tool cannot map to a CAA name. Check by hand that your CAA allows it.`, `Tu certificado actual viene de «${c.org}», que esta herramienta no sabe traducir a un nombre CAA. Revisa a mano que tu CAA lo permita.`));
          continue;
        }
        if (!allowed.some(a => c.ca.ids.indexOf(a) >= 0)) {
          reported.add(c.wildcard);
          finding(ctx, 'high', 'CAA', 'caa-blocks-current-ca',
            t(`Your current ${c.wildcard ? 'wildcard ' : ''}certificate was issued by ${c.ca.name}, but ${allowed.length ? 'your CAA records only allow ' + allowed.map(x => '"' + x + '"').join(', ') : 'your CAA records allow no CA'}${c.wildcard ? ' for wildcards' : ''}. The next renewal will be refused. (A certificate issued before the CAA change keeps working until ${c.notAfter.toISOString().slice(0, 10)}.)`,
              `Tu certificado ${c.wildcard ? 'comodín ' : ''}actual lo emitió ${c.ca.name}, pero ${allowed.length ? 'tus registros CAA solo permiten ' + allowed.map(x => '«' + x + '»').join(', ') : 'tus registros CAA no permiten ninguna CA'}${c.wildcard ? ' para comodines' : ''}. La próxima renovación será rechazada. (Un certificado emitido antes del cambio de CAA sigue funcionando hasta el ${c.notAfter.toISOString().slice(0, 10)}.)`),
            t(`Add: 0 ${c.wildcard && recs.some(r => r.tag === 'issuewild') ? 'issuewild' : 'issue'} "${c.ca.ids[0]}" (or switch the site to a CA you already allow).`, `Agrega: 0 ${c.wildcard && recs.some(r => r.tag === 'issuewild') ? 'issuewild' : 'issue'} "${c.ca.ids[0]}" (o cambia el sitio a una CA que ya permites).`));
        }
      }
    }
    return out;
  }

  function suggestCaa(domain, certInfo, caa) {
    const ids = [];
    for (const i of (certInfo && certInfo.issuers) || []) if (i.ids && i.ids[0] && ids.indexOf(i.ids[0]) < 0) ids.push(i.ids[0]);
    if (!ids.length) return null;
    const lines = ids.map(id => `${domain}. CAA 0 issue "${id}"`);
    lines.push(`${domain}. CAA 0 iodef "mailto:security@${domain}"`);
    const existing = caa && caa.records && caa.records.length;
    return { lines, note: existing ? 'merge' : 'new' };
  }

  // ---------------------------------------------------------------- calendar reminder
  function icsReminder(domain, notAfterIso, now) {
    const end = new Date(notAfterIso);
    const remind = new Date(Math.max(end.getTime() - 10 * DAY, now.getTime() + DAY));
    const d = x => x.toISOString().slice(0, 10).replace(/-/g, '');
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Candado//Daily Security Lab//EN', 'BEGIN:VEVENT',
      `UID:candado-${domain}-${d(end)}@dev-experiments-365`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(remind)}`, `DTEND;VALUE=DATE:${d(new Date(remind.getTime() + DAY))}`,
      `SUMMARY:Check certificate of ${domain} (expires ${end.toISOString().slice(0, 10)})`,
      `DESCRIPTION:If no newer certificate exists by now\\, automatic renewal failed. Re-run Candado: https://freyesperales.github.io/dev-experiments-365/experiments/experiment-102/?d=${domain}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Certificate check', 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  }

  // ---------------------------------------------------------------- main
  const SEV_W = { high: 25, medium: 10, low: 3, info: 0 };
  function grade(findings) {
    const score = Math.max(0, 100 - findings.reduce((s, f) => s + SEV_W[f.sev], 0));
    const g = findings.some(f => f.sev === 'high') ? (score >= 60 ? 'C' : score >= 40 ? 'D' : 'F') : score >= 97 ? 'A+' : score >= 90 ? 'A' : score >= 75 ? 'B' : 'C';
    return { score, grade: g };
  }

  /**
   * analyze(domain, { resolver, ct (async domain -> crt.sh entries) | ctEntries, securityTxt (string) | fetchSecurityTxt, now })
   */
  async function analyze(input, opts) {
    opts = opts || {};
    const domain = normalizeDomain(input);
    if (!domain) { const e = new Error('Not a valid domain: ' + input); e.code = 'BAD_DOMAIN'; throw e; }
    const now = opts.now ? new Date(opts.now) : new Date();
    const resolve = opts.resolver || dohResolver({ fetch: opts.fetch });
    const ctx = { findings: [], queries: 0, cache: new Map() };
    ctx.q = async (name, type, o) => {
      const key = name + '|' + type + '|' + !!(o && o.cd);
      if (ctx.cache.has(key)) return ctx.cache.get(key);
      ctx.queries++;
      const r = await resolve(name, type, o);
      ctx.cache.set(key, r);
      return r;
    };

    const dnssec = await checkDnssec(ctx, domain);
    if (dnssec.state === 'error') { const e = new Error('Could not reach public DNS'); e.code = 'DNS_FAILED'; throw e; }
    if (dnssec.state === 'nxdomain') {
      const g0 = grade(ctx.findings);
      return { tool: 'Candado', version: VERSION, domain, checkedAt: now.toISOString(), queries: ctx.queries, grade: g0.grade, score: g0.score, findings: ctx.findings,
        dnssec, caa: { foundAt: null, records: [], wwwFoundAt: null, wwwRecords: null, error: false }, certificate: null, ctAvailable: false, securityTxt: { present: false, source: null },
        suggestedCaa: null, securityTxtTemplate: securityTxtTemplate(domain, now), lifetime: { today: lifetimeLimitOn(now), next: nextLifetimeStep(now) } };
    }
    const caa = await checkCaa(ctx, domain);

    let ctEntries = opts.ctEntries, ctError = null;
    if (!ctEntries && opts.ct !== false) {
      try { ctEntries = await (opts.ct || crtshSource({ fetch: opts.fetch }))(domain); } catch (e) { ctError = String(e && e.message || e); }
    }
    let certs = null;
    if (ctEntries) certs = checkCerts(ctx, summarizeCt(ctEntries, domain, now), domain, now, caa);
    else if (opts.ct !== false) finding(ctx, 'info', 'Certificate', 'ct-unavailable', t(`Certificate Transparency (crt.sh) did not answer (${ctError}). It is often overloaded; try again in a few minutes. Certificate and CAA cross-checks were skipped.`, `Certificate Transparency (crt.sh) no respondió (${ctError}). Suele estar saturado; vuelve a intentarlo en unos minutos. Se omitieron las revisiones del certificado y el cruce con CAA.`));

    let sectxt = { present: false, source: null };
    let txt = opts.securityTxt, src = 'pasted';
    if (txt == null && opts.fetchSecurityTxt) {
      try { txt = await opts.fetchSecurityTxt(`https://${domain}/.well-known/security.txt`); src = 'fetched'; } catch (e) { txt = null; sectxt.fetchError = String(e && e.message || e); }
    }
    if (txt != null && String(txt).trim()) sectxt = checkSecurityTxt(ctx, String(txt), domain, now, src);
    if (!sectxt.present && !ctx.findings.some(f => f.id === 'sectxt-html')) {
      if (sectxt.fetchError === 'blocked') {
        finding(ctx, 'info', 'security.txt', 'sectxt-unchecked', t('The browser cannot read other sites\' files (CORS). Open the security.txt link in the summary table and paste the file to check it, or use the CLI.', 'El navegador no puede leer archivos de otros sitios (CORS). Abre el enlace de security.txt en la tabla de resumen y pega el archivo para revisarlo, o usa la versión de terminal.'));
      } else if (opts.fetchSecurityTxt || opts.securityTxt != null) {
        finding(ctx, 'low', 'security.txt', 'sectxt-missing',
          t('No security.txt: if someone finds a problem on your site (a hacked page, a leak) they have no clear way to tell you.', 'No hay security.txt: si alguien encuentra un problema en tu sitio (una página hackeada, una filtración) no tiene una forma clara de avisarte.'),
          t('Publish the template below at /.well-known/security.txt (2 minutes, plain text).', 'Publica la plantilla de abajo en /.well-known/security.txt (2 minutos, texto plano).'));
      }
    }

    const order = { high: 0, medium: 1, low: 2, info: 3 };
    ctx.findings.sort((a, b) => order[a.sev] - order[b.sev]);
    const g = grade(ctx.findings);
    return {
      tool: 'Candado', version: VERSION, domain, checkedAt: now.toISOString(), queries: ctx.queries,
      grade: g.grade, score: g.score, findings: ctx.findings,
      dnssec, caa: { foundAt: caa.foundAt, records: caa.records.map(r => r.raw), wwwFoundAt: caa.wwwFoundAt, wwwRecords: caa.wwwRecords && caa.wwwRecords.map(r => r.raw), error: !!caa.error },
      certificate: certs, ctAvailable: !!ctEntries, securityTxt: sectxt,
      suggestedCaa: suggestCaa(domain, certs, caa), securityTxtTemplate: securityTxtTemplate(domain, now),
      lifetime: { today: lifetimeLimitOn(now), next: nextLifetimeStep(now) }
    };
  }

  // ---------------------------------------------------------------- text report
  function toText(r, lang) {
    lang = lang === 'es' ? 'es' : 'en';
    const L = (en, es) => (lang === 'es' ? es : en);
    const out = [];
    out.push(`Candado ${r.version} — ${r.domain}   ${L('grade', 'nota')} ${r.grade} (${r.score}/100)   ${r.queries} ${L('DNS queries', 'consultas DNS')}`);
    out.push('');
    const ds = { signed: L('signed and validating', 'firmado y validando'), unsigned: L('off', 'apagado'), unlinked: L('signed, DS missing at registrar', 'firmado, falta el DS en el registrador'), bogus: L('BROKEN (SERVFAIL)', 'ROTO (SERVFAIL)'), 'insecure-ds': L('DS present, not validating', 'DS presente, sin validar'), servfail: 'SERVFAIL', nxdomain: 'NXDOMAIN' };
    out.push(`DNSSEC  ${ds[r.dnssec.state] || r.dnssec.state}${r.dnssec.ds.length ? '   DS: ' + r.dnssec.ds[0] : ''}`);
    out.push(`CAA     ${r.caa.records.length ? r.caa.records.join(' | ') + (r.caa.foundAt !== r.domain ? `  (${L('inherited from', 'heredado de')} ${r.caa.foundAt})` : '') : L('none (any CA may issue)', 'ninguno (cualquier CA puede emitir)')}`);
    if (r.caa.wwwRecords) out.push(`        www: ${r.caa.wwwRecords.join(' | ')}`);
    if (r.certificate && r.certificate.latest) {
      const c = r.certificate.latest;
      out.push(`${L('Cert   ', 'Certif.')} ${c.issuer}, ${L('issued', 'emitido')} ${c.notBefore.slice(0, 10)}, ${L('expires', 'vence')} ${c.notAfter.slice(0, 10)} (${L(`${r.certificate.daysLeft} days left, ${c.lifetimeDays}-day lifetime`, `quedan ${r.certificate.daysLeft} días, vigencia de ${c.lifetimeDays} días`)})`);
      out.push(`        ${L('CAs seen in CT', 'CA vistas en CT')}: ${r.certificate.issuers.map(i => i.org).join(', ')}`);
    } else if (!r.ctAvailable) out.push(`${L('Cert   ', 'Certif.')} ${L('not checked (Certificate Transparency skipped or unavailable)', 'no revisado (Certificate Transparency omitido o no disponible)')}`);
    out.push(`security.txt  ${r.securityTxt.present ? (r.securityTxt.contact.join(', ') || '-') + (r.securityTxt.expires ? '  Expires ' + r.securityTxt.expires.slice(0, 10) : '') : L('not found / not checked', 'no encontrado / no revisado')}`);
    out.push('');
    if (!r.findings.length) out.push(L('No findings.', 'Sin hallazgos.'));
    for (const f of r.findings) {
      out.push(`[${f.sev.toUpperCase().padEnd(6)}] ${f.area}: ${f.msg[lang]}`);
      if (f.fix) out.push(`         ${L('Fix', 'Arreglo')}: ${f.fix[lang]}`);
    }
    if (r.suggestedCaa) {
      out.push('');
      out.push(L(`Suggested CAA records (${r.suggestedCaa.note === 'merge' ? 'compare with yours' : 'add at your DNS provider'}):`, `Registros CAA sugeridos (${r.suggestedCaa.note === 'merge' ? 'compáralos con los tuyos' : 'agrégalos en tu proveedor de DNS'}):`));
      for (const l of r.suggestedCaa.lines) out.push('  ' + l);
    }
    return out.join('\n');
  }

  // ---------------------------------------------------------------- CLI
  async function cli(argv) {
    const fs = require('fs');
    const args = argv.slice(2);
    const opt = { lang: 'en', json: false, failOn: 'high' };
    let domain = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--json') opt.json = true;
      else if (a === '--lang') opt.lang = args[++i];
      else if (a === '--zone') opt.zone = args[++i];
      else if (a === '--ct') opt.ct = args[++i];
      else if (a === '--no-ct') opt.noCt = true;
      else if (a === '--security-txt') opt.sectxt = args[++i];
      else if (a === '--no-fetch') opt.noFetch = true;
      else if (a === '--now') opt.now = args[++i];
      else if (a === '--ics') opt.ics = args[++i];
      else if (a === '--fail-on') opt.failOn = args[++i];
      else if (a === '-h' || a === '--help') { domain = null; break; }
      else if (a === '-v' || a === '--version') { console.log(VERSION); return 0; }
      else if (!a.startsWith('-')) domain = a;
      else { console.error('Unknown option ' + a); return 2; }
    }
    if (!domain) {
      console.log(`Candado ${VERSION} — CAA, DNSSEC, certificate expiry (Certificate Transparency) and security.txt for one domain.
Usage: node candado.js yourbusiness.com [--lang es] [--json] [--ics reminder.ics] [--fail-on high|medium|low|never]
Offline: --zone zone.json --ct crtsh.json --security-txt file.txt --now 2026-11-18 --no-fetch --no-ct`);
      return 2;
    }
    const o = { now: opt.now };
    if (opt.zone) o.resolver = fixtureResolver(JSON.parse(fs.readFileSync(opt.zone, 'utf8')));
    if (opt.ct) o.ctEntries = JSON.parse(fs.readFileSync(opt.ct, 'utf8'));
    if (opt.noCt) o.ct = false;
    if (opt.sectxt) o.securityTxt = fs.readFileSync(opt.sectxt, 'utf8');
    else if (!opt.noFetch) o.fetchSecurityTxt = async (url) => {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 15000);
      try {
        const res = await fetch(url, { redirect: 'follow', signal: ac.signal, headers: { 'user-agent': 'Candado/' + VERSION + ' (+https://github.com/freyesperales/dev-experiments-365)' } });
        if (res.status === 404 || res.status === 410) return '';
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return (await res.text()).slice(0, 32768);
      } finally { clearTimeout(tm); }
    };
    let r;
    try { r = await analyze(domain, o); } catch (e) { console.error((e.code === 'DNS_FAILED' ? 'DNS error: ' : '') + e.message); return 2; }
    if (opt.ics && r.certificate && r.certificate.latest) fs.writeFileSync(opt.ics, icsReminder(r.domain, r.certificate.latest.notAfter, new Date(r.checkedAt)));
    console.log(opt.json ? JSON.stringify(r, null, 2) : toText(r, opt.lang));
    const rank = { high: 3, medium: 2, low: 1, never: 99 };
    const lvl = rank[opt.failOn] || 3;
    return r.findings.some(f => (rank[f.sev] || 0) >= lvl) ? 1 : 0;
  }

  const api = { VERSION, analyze, toText, normalizeDomain, parseCaa, parseSecurityTxt, allowedIssuers, summarizeCt, caForIssuer, suggestId, lifetimeLimitOn, nextLifetimeStep, icsReminder, dohResolver, fixtureResolver, crtshSource, CAS, KNOWN_IDS, cli };
  if (typeof module === 'object' && module.exports && typeof require === 'function' && require.main === module) {
    cli(process.argv).then(code => { process.exitCode = code; });
  }
  return api;
});
