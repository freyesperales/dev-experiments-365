#!/usr/bin/env node
/* Headerfix 1.1 - paste HTTP response headers, get a grade and copy-paste fixes.
   Zero dependencies. Works in Node 18+ (CLI) and in a browser (loaded by index.html).
   Pure analysis of text you provide: it never makes a network request. */
(function (root) {
  'use strict';

  const SEV = { high: 3, medium: 2, low: 1, info: 0 };
  const PENALTY = { high: 20, medium: 10, low: 4, info: 0 };

  // ---------- parsing ----------
  function parseHeaders(text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    // keep only the LAST response block (curl -IL prints one block per redirect hop)
    let blocks = [], cur = [];
    for (const l of lines) {
      if (/^HTTP\/\d/i.test(l.trim())) { if (cur.length) blocks.push(cur); cur = [l.trim()]; }
      else cur.push(l);
    }
    if (cur.length) blocks.push(cur);
    const block = blocks.length ? blocks[blocks.length - 1] : [];
    let status = null;
    const headers = []; // [{name, value}]
    for (const raw of block) {
      const l = raw.replace(/\s+$/, '');
      if (!l.trim()) continue;
      const sm = /^HTTP\/[\d.]+\s+(\d{3})/i.exec(l.trim());
      if (sm) { status = Number(sm[1]); continue; }
      if (/^[ \t]/.test(l) && headers.length) { headers[headers.length - 1].value += ' ' + l.trim(); continue; } // folded
      const i = l.indexOf(':');
      if (i < 1) continue;
      const name = l.slice(0, i).trim();
      if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) continue; // not a header name (skips "Request URL:" prose etc. loosely)
      headers.push({ name, value: l.slice(i + 1).trim() });
    }
    return { status, headers, redirectHops: Math.max(0, blocks.filter(b => /^HTTP\/\d/i.test(b[0] || '')).length - 1) };
  }

  function get(headers, name) {
    const n = name.toLowerCase();
    return headers.filter(h => h.name.toLowerCase() === n).map(h => h.value);
  }

  // ---------- CSP helpers ----------
  function parseCsp(value) {
    const d = {};
    for (const part of value.split(';')) {
      const t = part.trim();
      if (!t) continue;
      const [name, ...vals] = t.split(/\s+/);
      const k = name.toLowerCase();
      if (!(k in d)) d[k] = vals;
    }
    return d;
  }

  // ---------- messages (en / es) ----------
  const M = {
    hsts_missing: { en: 'No Strict-Transport-Security (HSTS): browsers may still reach your site over plain HTTP.', es: 'Falta Strict-Transport-Security (HSTS): los navegadores aún pueden entrar a tu sitio por HTTP sin cifrar.' },
    hsts_short: { en: 'HSTS max-age is below 180 days ({v}s); it protects visitors only for that long.', es: 'El max-age de HSTS es menor a 180 días ({v}s); protege a los visitantes solo ese tiempo.' },
    hsts_bad: { en: 'HSTS header has no valid max-age, so browsers ignore it.', es: 'El encabezado HSTS no tiene un max-age válido, así que los navegadores lo ignoran.' },
    hsts_sub: { en: 'HSTS lacks includeSubDomains. Add it only once every subdomain works over HTTPS.', es: 'HSTS no incluye includeSubDomains. Agrégalo solo cuando todos tus subdominios funcionen con HTTPS.' },
    csp_missing: { en: 'No Content-Security-Policy: injected scripts (for example from a hacked plugin) run without any browser-enforced limit.', es: 'Falta Content-Security-Policy: un script inyectado (por ejemplo desde un plugin comprometido) se ejecuta sin ningún límite del navegador.' },
    csp_ro_only: { en: 'Only Content-Security-Policy-Report-Only is set: it reports but blocks nothing. Fine as a first step, not as a finish line.', es: 'Solo existe Content-Security-Policy-Report-Only: informa pero no bloquea nada. Sirve como primer paso, no como meta.' },
    csp_unsafe_inline: { en: "CSP allows 'unsafe-inline' for scripts, which cancels most of its protection against injected code.", es: "La CSP permite 'unsafe-inline' en scripts, lo que anula casi toda su protección contra código inyectado." },
    csp_unsafe_eval: { en: "CSP allows 'unsafe-eval' for scripts (string-to-code execution).", es: "La CSP permite 'unsafe-eval' en scripts (ejecución de texto como código)." },
    csp_wild: { en: 'CSP script source is a wildcard or a whole scheme ({v}): any site on it can supply scripts.', es: 'La fuente de scripts de la CSP es un comodín o un esquema completo ({v}): cualquier sitio ahí puede aportar scripts.' },
    csp_no_script_fallback: { en: 'CSP has neither script-src nor default-src, so scripts are not restricted at all.', es: 'La CSP no tiene script-src ni default-src, así que los scripts no están restringidos.' },
    csp_no_object: { en: "CSP does not set object-src 'none' (legacy plugin content).", es: "La CSP no define object-src 'none' (contenido de plugins antiguos)." },
    csp_no_base: { en: 'CSP does not set base-uri; an injected <base> tag can redirect relative script URLs.', es: 'La CSP no define base-uri; una etiqueta <base> inyectada puede redirigir las URLs relativas de scripts.' },
    csp_no_frame: { en: 'CSP has no frame-ancestors, so others may embed your pages in a frame (clickjacking) unless X-Frame-Options covers it.', es: 'La CSP no tiene frame-ancestors; otros podrían incrustar tus páginas en un marco (clickjacking) salvo que X-Frame-Options lo cubra.' },
    xfo_missing: { en: 'Nothing prevents other sites from framing your pages (no X-Frame-Options and no CSP frame-ancestors): clickjacking risk.', es: 'Nada impide que otros sitios enmarquen tus páginas (sin X-Frame-Options ni frame-ancestors): riesgo de clickjacking.' },
    xfo_bad: { en: 'X-Frame-Options has an invalid or obsolete value ({v}); use DENY or SAMEORIGIN.', es: 'X-Frame-Options tiene un valor inválido u obsoleto ({v}); usa DENY o SAMEORIGIN.' },
    xcto_missing: { en: 'Missing X-Content-Type-Options: nosniff; browsers may guess file types and run uploads as scripts.', es: 'Falta X-Content-Type-Options: nosniff; los navegadores pueden adivinar el tipo de archivo y ejecutar una subida como script.' },
    xcto_bad: { en: 'X-Content-Type-Options must be exactly "nosniff" (found "{v}").', es: 'X-Content-Type-Options debe ser exactamente "nosniff" (se encontró "{v}").' },
    ref_missing: { en: 'No Referrer-Policy: full page URLs (which may contain tokens or order numbers) can leak to other sites.', es: 'Falta Referrer-Policy: las URLs completas (que pueden llevar tokens o números de pedido) pueden filtrarse a otros sitios.' },
    ref_bad: { en: 'Referrer-Policy "{v}" sends the full URL to other sites.', es: 'Referrer-Policy "{v}" envía la URL completa a otros sitios.' },
    pp_missing: { en: 'No Permissions-Policy: embedded content may request camera, microphone or location. Low priority.', es: 'Falta Permissions-Policy: el contenido incrustado podría pedir cámara, micrófono o ubicación. Prioridad baja.' },
    leak: { en: 'Header "{n}: {v}" tells attackers your software{ver}. Remove or hide it.', es: 'El encabezado "{n}: {v}" revela tu software{ver}. Quítalo u ocúltalo.' },
    cookie_secure: { en: 'Cookie "{c}" has no Secure flag: it can travel over plain HTTP.', es: 'La cookie "{c}" no tiene el atributo Secure: puede viajar por HTTP sin cifrar.' },
    cookie_httponly: { en: 'Cookie "{c}" looks like a session/login cookie but has no HttpOnly: page scripts can read it.', es: 'La cookie "{c}" parece de sesión pero no tiene HttpOnly: los scripts de la página pueden leerla.' },
    cookie_samesite: { en: 'Cookie "{c}" has no SameSite attribute (browsers default to Lax, but say it explicitly).', es: 'La cookie "{c}" no tiene SameSite (los navegadores usan Lax por defecto, pero conviene indicarlo).' },
    cookie_none_insecure: { en: 'Cookie "{c}" uses SameSite=None without Secure; browsers reject it.', es: 'La cookie "{c}" usa SameSite=None sin Secure; los navegadores la rechazan.' },
    cors_cred: { en: 'Access-Control-Allow-Origin: * together with Allow-Credentials: true. Browsers refuse it, and it shows a misconfigured CORS setup.', es: 'Access-Control-Allow-Origin: * junto con Allow-Credentials: true. Los navegadores lo rechazan y delata una configuración CORS errónea.' },
    cors_star: { en: 'Access-Control-Allow-Origin: * lets any website read these responses. Fine for public data, wrong for logged-in pages.', es: 'Access-Control-Allow-Origin: * permite que cualquier sitio lea estas respuestas. Está bien para datos públicos, mal para páginas con sesión.' },
    http_note: { en: 'You told Headerfix this site is served over plain HTTP: move it to HTTPS first; HSTS and Secure cookies need it.', es: 'Indicaste que el sitio se sirve por HTTP simple: pasa primero a HTTPS; HSTS y las cookies Secure lo necesitan.' },
    no_headers: { en: 'No response headers found in the input. Paste the output of `curl -I https://your-site` or the "Response Headers" panel from your browser DevTools.', es: 'No se encontraron encabezados en la entrada. Pega la salida de `curl -I https://tu-sitio` o el panel "Response Headers" de las herramientas de desarrollo del navegador.' },
    dup: { en: 'Header "{n}" appears {k} times; browsers may combine or ignore duplicates.', es: 'El encabezado "{n}" aparece {k} veces; los navegadores pueden combinarlo o ignorarlo.' },
    dup_hsts: { en: 'Strict-Transport-Security appears {k} times. Browsers use only the FIRST one (RFC 6797 section 8.1), which may not be the one you meant. Usually the server and the app (or a plugin) both set it: keep one.', es: 'Strict-Transport-Security aparece {k} veces. Los navegadores usan solo la PRIMERA (RFC 6797, sección 8.1), que quizá no es la que querías. Casi siempre la ponen a la vez el servidor y la aplicación (o un plugin): deja una sola.' },
    dup_csp: { en: 'Content-Security-Policy appears {k} times. Browsers enforce EVERY copy and block whatever any of them blocks (CSP Level 3), so a loose copy does not relax a strict one, and a strict copy can break the site. Merge them into one.', es: 'Content-Security-Policy aparece {k} veces. Los navegadores aplican TODAS las copias y bloquean lo que cualquiera bloquee (CSP nivel 3): una copia permisiva no relaja a la estricta, y una estricta puede romper el sitio. Únelas en una sola.' },
    hsts_preload: { en: 'HSTS says "preload" but does not meet the preload list rules (max-age of at least 31536000 and includeSubDomains, see hstspreload.org): {v}.', es: 'HSTS dice "preload" pero no cumple las reglas de la lista de precarga (max-age de al menos 31536000 e includeSubDomains, ver hstspreload.org): {v}.' },
    xxss: { en: 'X-XSS-Protection: {v}. This old filter is obsolete and its "1" / "mode=block" settings can create leaks on sites that were safe (MDN, OWASP). Set it to 0 or remove it; rely on CSP instead.', es: 'X-XSS-Protection: {v}. Este filtro antiguo está obsoleto y sus valores "1" o "mode=block" pueden abrir fugas en sitios que eran seguros (MDN, OWASP). Ponlo en 0 o quítalo; la protección real es la CSP.' },
    obsolete: { en: 'Header "{n}" is obsolete ({why}). Browsers ignore it; remove it so it does not give a false sense of protection.', es: 'El encabezado "{n}" está obsoleto ({why}). Los navegadores lo ignoran; quítalo para que no dé una falsa sensación de protección.' },
    feature_policy: { en: "Feature-Policy was renamed Permissions-Policy and the syntax changed (camera 'none' becomes camera=()). Browsers that dropped the old name ignore it.", es: "Feature-Policy pasó a llamarse Permissions-Policy y cambió la sintaxis (camera 'none' pasa a ser camera=()). Los navegadores que dejaron el nombre antiguo lo ignoran." },
    cookie_prefix: { en: 'Cookie "{c}" uses the {p} prefix but {why}; browsers silently reject it, so it is never stored.', es: 'La cookie "{c}" usa el prefijo {p} pero {why}; el navegador la rechaza en silencio y nunca se guarda.' },
    redirect: { en: 'Input has {k} redirect hop(s); only the final response was analysed. Redirect responses (301/302) are not graded.', es: 'La entrada tiene {k} redirección(es); solo se analizó la respuesta final. Las respuestas de redirección (301/302) no se califican.' },
  };

  function msg(id, lang, vars) {
    let s = (M[id] || {})[lang] || (M[id] || {}).en || id;
    for (const k in (vars || {})) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }

  // ---------- fixes ----------
  // Each fix: {header, value}. Server renderers below.
  const SAFE_CSP_START =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";

  function renderFixes(fixes, server) {
    if (!fixes.length) return '';
    const q = v => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    switch (server) {
      case 'nginx':
        return '# nginx: put inside the server { } block that serves HTTPS, then `nginx -t && nginx -s reload`\n' +
          '# If a location { } block has its own add_header, it DROPS these (nginx inheritance rule). On nginx 1.29.3+ add `add_header_inherit merge;` there.\n' +
          fixes.filter(f => !f.remove).map(f => `add_header ${f.header} "${q(f.value)}" always;`).concat(
            fixes.filter(f => f.remove).map(f => f.header.toLowerCase() === 'server' ? 'server_tokens off;   # in http { }: hides the nginx version' : `proxy_hide_header ${f.header};   # use fastcgi_hide_header for PHP-FPM`)).join('\n') + '\n';
      case 'apache':
        return '# Apache: needs mod_headers (`a2enmod headers`); put in the vhost or .htaccess, then reload.\n# `always` also covers errors and redirects. If PHP-FPM or a proxy sends the same header too, add `Header onsuccess unset <Name>` before the set to avoid duplicates.\n' +
          fixes.map(f => f.remove ? `Header always unset ${f.header}` : `Header always set ${f.header} "${q(f.value)}"`).join('\n') +
          (fixes.some(f => f.remove) ? '\n# Apache: ServerTokens Prod  and  ServerSignature Off   (main config) hide the version\n' : '\n');
      case 'netlify':
        return '# _headers file (Netlify): place it in your publish folder\n/*\n' +
          fixes.filter(f => !f.remove).map(f => `  ${f.header}: ${f.value}`).join('\n') + '\n' +
          fixes.filter(f => f.remove).map(f => `# ${f.header}: Netlify's _headers has no documented way to remove a header; hide it where it is set (your app or framework)`).join('\n') + (fixes.some(f => f.remove) ? '\n' : '');
      case 'cloudflare':
        return '# _headers file (Cloudflare Pages): place it in your build output folder (max 100 rules, 2000 characters per line)\n/*\n' +
          fixes.map(f => f.remove ? `  ! ${f.header}` : `  ${f.header}: ${f.value}`).join('\n') + '\n';
      case 'caddy':
        return '# Caddyfile: inside your site block, then `caddy reload`\nheader {\n' +
          fixes.map(f => f.remove ? `  -${f.header}` : `  ${f.header} "${q(f.value)}"`).join('\n') + '\n}\n';
      case 'php':
      case 'htaccess-php':
        return '<?php // WordPress / PHP: add near the top of your front controller or in a small must-use plugin\n' +
          fixes.map(f => f.remove ? `header_remove('${f.header}');` : `header('${f.header}: ${f.value.replace(/'/g, "\\'")}');`).join('\n') + '\n';
      default:
        return fixes.map(f => f.remove ? `remove ${f.header}` : `${f.header}: ${f.value}`).join('\n') + '\n';
    }
  }
  const SERVERS = ['nginx', 'apache', 'netlify', 'cloudflare', 'caddy', 'php', 'plain'];

  // ---------- analysis ----------
  const LEAKY = ['x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version', 'x-generator', 'x-cms', 'x-joomla-version', 'x-drupal-cache', 'x-drupal-dynamic-cache', 'x-framework', 'x-generated-by', 'x-litespeed-cache', 'x-cf-powered-by', 'x-redirect-by'];
  const SESSION_RE = /(sess|sid|auth|token|login|jwt|phpsessid|wordpress_logged_in|wp-?settings|laravel_session|connect\.sid)/i;

  function analyze(input, opts) {
    opts = opts || {};
    const lang = opts.lang === 'es' ? 'es' : 'en';
    const https = opts.https !== false;
    const parsed = typeof input === 'string' ? parseHeaders(input) : input;
    const headers = parsed.headers;
    const findings = [];
    const fixes = [];
    const add = (id, sev, vars, extra) => findings.push(Object.assign({ id, severity: sev, message: msg(id, lang, vars) }, extra || {}));

    if (!headers.length) {
      return { ok: false, status: parsed.status, score: 0, grade: '-', findings: [{ id: 'no_headers', severity: 'high', message: msg('no_headers', lang) }], fixes: [], passed: [], lang };
    }
    const passed = [];
    if (parsed.redirectHops) add('redirect', 'info', { k: parsed.redirectHops });
    if (parsed.status && parsed.status >= 300 && parsed.status < 400) add('redirect', 'info', { k: 1 });
    if (!https) add('http_note', 'high');

    // duplicates of security headers
    const counts = {};
    headers.forEach(h => { const k = h.name.toLowerCase(); counts[k] = (counts[k] || 0) + 1; });
    if (counts['strict-transport-security'] > 1) add('dup_hsts', 'low', { k: counts['strict-transport-security'] });
    if (counts['content-security-policy'] > 1) add('dup_csp', 'low', { k: counts['content-security-policy'] });
    ['x-frame-options', 'x-content-type-options', 'referrer-policy'].forEach(k => {
      if (counts[k] > 1) add('dup', 'low', { n: k, k: counts[k] });
    });

    // HSTS (only meaningful on HTTPS)
    const hsts = get(headers, 'strict-transport-security');
    if (https) {
      if (!hsts.length) { add('hsts_missing', 'high'); fixes.push({ header: 'Strict-Transport-Security', value: 'max-age=31536000' }); }
      else {
        const m = /max-age\s*=\s*"?(\d+)"?/i.exec(hsts[0]);
        if (!m) { add('hsts_bad', 'high'); fixes.push({ header: 'Strict-Transport-Security', value: 'max-age=31536000' }); }
        else {
          const age = Number(m[1]);
          if (age < 15552000) { add('hsts_short', age === 0 ? 'high' : 'medium', { v: age }); fixes.push({ header: 'Strict-Transport-Security', value: 'max-age=31536000' }); }
          else passed.push('hsts');
          if (!/includesubdomains/i.test(hsts[0])) add('hsts_sub', 'info');
          if (/(^|;)\s*preload\s*(;|$)/i.test(hsts[0])) {
            const miss = [];
            if (age < 31536000) miss.push('max-age=' + age);
            if (!/includesubdomains/i.test(hsts[0])) miss.push(lang === 'es' ? 'falta includeSubDomains' : 'no includeSubDomains');
            if (miss.length) add('hsts_preload', 'low', { v: miss.join(', ') });
          }
        }
      }
    }

    // CSP
    const cspEnf = get(headers, 'content-security-policy');
    const cspRo = get(headers, 'content-security-policy-report-only');
    let csp = null;
    if (!cspEnf.length) {
      if (cspRo.length) add('csp_ro_only', 'medium'); else add('csp_missing', 'high');
      // start in Report-Only: the most common pain is a CSP that breaks the site
      if (!cspRo.length) fixes.push({ header: 'Content-Security-Policy-Report-Only', value: SAFE_CSP_START });
    } else csp = parseCsp(cspEnf[0]);
    if (csp) {
      const scriptSrc = csp['script-src'] || csp['default-src'];
      if (!scriptSrc) add('csp_no_script_fallback', 'high');
      else {
        const low = scriptSrc.map(s => s.toLowerCase());
        const hasNonceOrHash = low.some(s => /^'(nonce-|sha(256|384|512)-)/.test(s));
        if (low.includes("'unsafe-inline'") && !(hasNonceOrHash && low.includes("'strict-dynamic'")) && !hasNonceOrHash) add('csp_unsafe_inline', 'high');
        if (low.includes("'unsafe-eval'")) add('csp_unsafe_eval', 'medium');
        const wild = low.filter(s => s === '*' || s === 'https:' || s === 'http:' || s === 'data:');
        if (wild.length) add('csp_wild', 'high', { v: wild.join(' ') });
      }
      if (!('object-src' in csp) && !(csp['default-src'] || []).includes("'none'")) add('csp_no_object', 'low');
      if (!('base-uri' in csp)) add('csp_no_base', 'low');
      if (!('frame-ancestors' in csp)) add('csp_no_frame', 'low');
      const strong = !findings.some(f => /^csp_(unsafe|wild|no_script)/.test(f.id));
      if (strong) passed.push('csp');
      else if (!cspRo.length) fixes.push({ header: 'Content-Security-Policy-Report-Only', value: SAFE_CSP_START });
    }

    // clickjacking
    const xfo = get(headers, 'x-frame-options');
    const fa = csp && 'frame-ancestors' in csp;
    if (!xfo.length && !fa) { add('xfo_missing', 'medium'); fixes.push({ header: 'X-Frame-Options', value: 'SAMEORIGIN' }); }
    else if (xfo.length && !/^(deny|sameorigin)$/i.test(xfo[0].trim())) { add('xfo_bad', 'medium', { v: xfo[0] }); fixes.push({ header: 'X-Frame-Options', value: 'SAMEORIGIN' }); }
    else passed.push('framing');

    // nosniff
    const xc = get(headers, 'x-content-type-options');
    if (!xc.length) { add('xcto_missing', 'medium'); fixes.push({ header: 'X-Content-Type-Options', value: 'nosniff' }); }
    else if (xc[0].trim().toLowerCase() !== 'nosniff') { add('xcto_bad', 'medium', { v: xc[0] }); fixes.push({ header: 'X-Content-Type-Options', value: 'nosniff' }); }
    else passed.push('nosniff');

    // Referrer-Policy
    const rp = get(headers, 'referrer-policy');
    if (!rp.length) { add('ref_missing', 'low'); fixes.push({ header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }); }
    else {
      const last = rp[0].split(',').pop().trim().toLowerCase();
      if (['unsafe-url', 'no-referrer-when-downgrade'].includes(last)) { add('ref_bad', 'low', { v: last }); fixes.push({ header: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }); }
      else passed.push('referrer');
    }

    // Permissions-Policy
    if (!get(headers, 'permissions-policy').length) { add('pp_missing', 'info'); fixes.push({ header: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }); }
    else passed.push('permissions');

    // obsolete headers (MDN + OWASP HTTP Headers Cheat Sheet)
    const xx = get(headers, 'x-xss-protection');
    if (xx.length && xx[0].trim() !== '0') { add('xxss', 'low', { v: xx[0] }); fixes.push({ header: 'X-XSS-Protection', value: '0' }); }
    const OBS = {
      'Expect-CT': { en: 'Certificate Transparency is enforced by default now', es: 'Certificate Transparency ya se exige por defecto' },
      'Public-Key-Pins': { en: 'HPKP was removed from browsers', es: 'HPKP se eliminó de los navegadores' },
      'Public-Key-Pins-Report-Only': { en: 'HPKP was removed from browsers', es: 'HPKP se eliminó de los navegadores' },
    };
    for (const k in OBS) if (get(headers, k).length) { add('obsolete', 'info', { n: k, why: OBS[k][lang] }); fixes.push({ header: k, remove: true }); }
    if (get(headers, 'feature-policy').length) { add('feature_policy', get(headers, 'permissions-policy').length ? 'info' : 'low'); fixes.push({ header: 'Feature-Policy', remove: true }); }

    // information leaks
    const seenLeak = new Set();
    for (const h of headers) {
      const k = h.name.toLowerCase();
      const isServerVer = k === 'server' && /\d+\.\d+/.test(h.value);
      if ((LEAKY.includes(k) || isServerVer) && !seenLeak.has(k)) {
        seenLeak.add(k);
        const ver = /\d+(\.\d+)+/.test(h.value) ? (lang === 'es' ? ' y su versión exacta' : ' and its exact version') : '';
        add('leak', /\d+(\.\d+)+/.test(h.value) ? 'low' : 'info', { n: h.name, v: h.value, ver });
        fixes.push({ header: h.name, remove: true });
      }
    }

    // cookies
    for (const raw of get(headers, 'set-cookie')) {
      const parts = raw.split(';').map(s => s.trim());
      const [nv, ...attrs] = parts;
      const cname = nv.split('=')[0];
      const a = attrs.map(s => s.toLowerCase());
      const hasSecure = a.includes('secure');
      const ss = a.find(s => s.startsWith('samesite='));
      if (https && !hasSecure) add('cookie_secure', 'medium', { c: cname }, { cookie: cname });
      if (SESSION_RE.test(cname) && !a.includes('httponly')) add('cookie_httponly', 'medium', { c: cname }, { cookie: cname });
      if (!ss) add('cookie_samesite', 'low', { c: cname }, { cookie: cname });
      else if (ss === 'samesite=none' && !hasSecure) add('cookie_none_insecure', 'medium', { c: cname }, { cookie: cname });
      // cookie prefixes (MDN Set-Cookie): __Secure- needs Secure; __Host- needs Secure, Path=/ and no Domain
      // newer prefixes (MDN): __Http- needs Secure + HttpOnly; __Host-Http- needs that plus the __Host- rules
      const pre = /^__host-http-/i.test(cname) ? '__Host-Http-' : /^__host-/i.test(cname) ? '__Host-' : /^__http-/i.test(cname) ? '__Http-' : /^__secure-/i.test(cname) ? '__Secure-' : null;
      if (pre) {
        const why = [];
        if (!hasSecure) why.push(lang === 'es' ? 'no tiene Secure' : 'it has no Secure flag');
        if (/Http-$/.test(pre) && !a.includes('httponly')) why.push(lang === 'es' ? 'no tiene HttpOnly' : 'it has no HttpOnly flag');
        if (pre.startsWith('__Host-')) {
          const pth = a.find(t => t.startsWith('path='));
          if (!pth || pth.slice(5).trim() !== '/') why.push(lang === 'es' ? 'no tiene Path=/' : 'it lacks Path=/');
          if (a.some(t => t.startsWith('domain='))) why.push(lang === 'es' ? 'tiene Domain' : 'it sets Domain');
        }
        if (why.length) add('cookie_prefix', 'medium', { c: cname, p: pre, why: why.join(', ') }, { cookie: cname });
      }
    }

    // CORS
    const acao = get(headers, 'access-control-allow-origin');
    const acac = get(headers, 'access-control-allow-credentials');
    if (acao.includes('*')) {
      if (acac.some(v => v.trim().toLowerCase() === 'true')) add('cors_cred', 'high');
      else add('cors_star', 'info');
    }

    // score
    let score = 100;
    for (const f of findings) score -= PENALTY[f.severity] || 0;
    score = Math.max(0, score);
    const grade = score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
    findings.sort((a, b) => SEV[b.severity] - SEV[a.severity]);
    // de-duplicate fixes by header name+remove
    const seen = new Set();
    const uniq = fixes.filter(f => { const k = f.header.toLowerCase() + (f.remove ? '-' : '+'); if (seen.has(k)) return false; seen.add(k); return true; });
    return { ok: true, status: parsed.status, score, grade, findings, fixes: uniq, passed, lang };
  }

  function formatText(res, server) {
    const lines = [];
    lines.push(`Headerfix grade ${res.grade}  (${res.score}/100)` + (res.status ? `   HTTP ${res.status}` : ''));
    if (!res.findings.length) lines.push('No findings.');
    for (const f of res.findings) lines.push(`[${f.severity.toUpperCase().padEnd(6)}] ${f.message}`);
    if (res.fixes.length) { lines.push(''); lines.push(renderFixes(res.fixes, server || 'nginx').trimEnd()); }
    return lines.join('\n');
  }

  const api = { parseHeaders, analyze, renderFixes, formatText, parseCsp, SERVERS, SAFE_CSP_START };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Headerfix = api;

  // ---------- CLI ----------
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    const fs = require('fs');
    const args = process.argv.slice(2);
    let file = null, server = 'nginx', json = false, lang = 'en', https = true, failOn = 'high';
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--server') server = args[++i];
      else if (a === '--json') json = true;
      else if (a === '--lang') lang = args[++i];
      else if (a === '--http') https = false;
      else if (a === '--fail-on') failOn = args[++i];
      else if (a === '-h' || a === '--help') { console.log('Usage: curl -sI https://example.com | node headerfix.js [--server nginx|apache|netlify|cloudflare|caddy|php|plain] [--lang en|es] [--json] [--http] [--fail-on high|medium|low|never]\n       node headerfix.js headers.txt'); process.exit(0); }
      else if (a.startsWith('-')) { console.error('headerfix: unknown option ' + a); process.exit(2); }
      else file = a;
    }
    if (!SERVERS.includes(server)) { console.error('headerfix: --server must be one of ' + SERVERS.join(', ')); process.exit(2); }
    if (!['high', 'medium', 'low', 'never'].includes(failOn)) { console.error('headerfix: bad --fail-on'); process.exit(2); }
    let text;
    try { text = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8'); }
    catch (e) { console.error('headerfix: cannot read input: ' + e.message); process.exit(2); }
    const res = analyze(text, { lang, https });
    if (json) console.log(JSON.stringify(res, null, 2)); else console.log(formatText(res, server));
    if (!res.ok) process.exit(2);
    const thr = failOn === 'never' ? 99 : SEV[failOn];
    process.exit(res.findings.some(f => SEV[f.severity] >= thr) ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
