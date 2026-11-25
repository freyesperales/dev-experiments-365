#!/usr/bin/env node
'use strict';
// Aduana — paste the page source of your website and see what crosses into it:
// every outside address that can load code, styles, frames or forms; mixed content;
// http:// links that Chrome now stops at; scripts without Subresource Integrity;
// a starter Content-Security-Policy-Report-Only built from what the page really
// uses (with the origins vendors document for Google tag, reCAPTCHA, Turnstile and
// Stripe); and what your current CSP would block. Offline, zero dependencies.
// Works in Node (CLI and module) and in the browser (window.Aduana).

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Aduana = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const VERSION = '1.0.0';

  // ---------------------------------------------------------------- vendors
  // Directives copied from the vendor's own CSP documentation (see RESEARCH.md).
  // `doc` is shown next to every finding so the owner can check the source.
  const VENDORS = [
    {
      id: 'gtm', name: 'Google Tag Manager',
      test: (u) => /(^|\.)googletagmanager\.com$/.test(u.host) && /\/gtm\.js/.test(u.path),
      doc: 'https://developers.google.com/tag-platform/security/guides/csp',
      official: true,
      dirs: { 'script-src': ['https://www.googletagmanager.com'], 'img-src': ['https://www.googletagmanager.com'], 'connect-src': ['https://www.googletagmanager.com', 'https://www.google.com'] }
    },
    {
      id: 'ga4', name: 'Google Analytics (Google tag)',
      test: (u) => /(^|\.)googletagmanager\.com$/.test(u.host) && /\/gtag\/js/.test(u.path) && /[?&]id=G-/i.test(u.query),
      doc: 'https://developers.google.com/tag-platform/security/guides/csp',
      official: true, googleTld: true,
      dirs: {
        'script-src': ['https://www.googletagmanager.com'],
        'img-src': ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.google.com', 'https://*.g.doubleclick.net'],
        'connect-src': ['https://www.googletagmanager.com', 'https://*.google-analytics.com', 'https://*.google.com', 'https://*.g.doubleclick.net', 'https://pagead2.googlesyndication.com'],
        'frame-src': ['https://www.googletagmanager.com']
      }
    },
    {
      id: 'gads', name: 'Google Ads (Google tag)',
      test: (u) => (/(^|\.)googletagmanager\.com$/.test(u.host) && /\/gtag\/js/.test(u.path) && /[?&]id=AW-/i.test(u.query)) || /(^|\.)googleadservices\.com$/.test(u.host),
      doc: 'https://developers.google.com/tag-platform/security/guides/csp',
      official: true, googleTld: true,
      dirs: {
        'script-src': ['https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://www.google.com'],
        'img-src': ['https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://pagead2.googlesyndication.com', 'https://www.google.com'],
        'connect-src': ['https://www.googletagmanager.com', 'https://www.googleadservices.com', 'https://googleads.g.doubleclick.net', 'https://pagead2.googlesyndication.com', 'https://www.google.com', 'https://ad.doubleclick.net'],
        'frame-src': ['https://www.googletagmanager.com']
      }
    },
    {
      id: 'recaptcha', name: 'Google reCAPTCHA',
      test: (u) => (u.host === 'www.google.com' || u.host === 'www.gstatic.com' || u.host === 'www.recaptcha.net') && /^\/recaptcha\//.test(u.path),
      doc: 'https://developers.google.com/recaptcha/docs/faq',
      official: true,
      dirs: {
        'script-src': ['https://www.google.com/recaptcha/', 'https://www.gstatic.com/recaptcha/'],
        'frame-src': ['https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/'],
        'connect-src': ['https://www.google.com/recaptcha/']
      }
    },
    {
      id: 'turnstile', name: 'Cloudflare Turnstile',
      test: (u) => u.host === 'challenges.cloudflare.com',
      doc: 'https://developers.cloudflare.com/turnstile/reference/content-security-policy/',
      official: true,
      dirs: { 'script-src': ['https://challenges.cloudflare.com'], 'frame-src': ['https://challenges.cloudflare.com'] }
    },
    {
      id: 'stripejs', name: 'Stripe.js (Elements, Payment Element)',
      test: (u) => u.host === 'js.stripe.com',
      doc: 'https://docs.stripe.com/security/guide',
      official: true,
      dirs: {
        'connect-src': ['https://api.stripe.com'],
        'frame-src': ['https://*.js.stripe.com', 'https://js.stripe.com', 'https://hooks.stripe.com'],
        'script-src': ['https://*.js.stripe.com', 'https://js.stripe.com']
      }
    },
    {
      id: 'stripecheckout', name: 'Stripe Checkout',
      test: (u) => u.host === 'checkout.stripe.com',
      doc: 'https://docs.stripe.com/security/guide',
      official: true,
      dirs: { 'connect-src': ['https://checkout.stripe.com'], 'frame-src': ['https://checkout.stripe.com'], 'script-src': ['https://checkout.stripe.com'], 'img-src': ['https://*.stripe.com'] }
    },
    {
      id: 'gfonts', name: 'Google Fonts',
      test: (u) => u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com',
      doc: 'https://developers.google.com/tag-platform/security/guides/csp',
      official: true,
      dirs: { 'style-src': ['https://fonts.googleapis.com'], 'font-src': ['https://fonts.gstatic.com'] }
    },
    {
      id: 'metapixel', name: 'Meta Pixel',
      test: (u) => u.host === 'connect.facebook.net' && /fbevents\.js/.test(u.path),
      doc: 'https://developers.facebook.com/docs/meta-pixel/advanced/',
      official: false,
      dirs: { 'script-src': ['https://connect.facebook.net'], 'img-src': ['https://www.facebook.com'], 'connect-src': ['https://www.facebook.com', 'https://connect.facebook.net'] }
    }
  ];

  // Scripts that change by design: SRI cannot be used on them. Two of these
  // kinds of files were the road for 2026 attacks (see RESEARCH.md).
  const LIVE_SCRIPTS = [
    [/(^|\.)googletagmanager\.com$/, 'Google tag / Tag Manager'],
    [/^connect\.facebook\.net$/, 'Meta Pixel'],
    [/(^|\.)optimizely\.com$/, 'Optimizely'],
    [/(^|\.)hotjar\.com$/, 'Hotjar'],
    [/(^|\.)clarity\.ms$/, 'Microsoft Clarity'],
    [/(^|\.)plausible\.io$/, 'Plausible'],
    [/(^|\.)tiktok\.com$/, 'TikTok pixel'],
    [/(^|\.)licdn\.com$/, 'LinkedIn Insight'],
    [/(^|\.)google\.com$/, 'Google'],
    [/(^|\.)gstatic\.com$/, 'Google'],
    [/^js\.stripe\.com$/, 'Stripe.js'],
    [/^challenges\.cloudflare\.com$/, 'Cloudflare Turnstile'],
    [/(^|\.)doubleclick\.net$/, 'Google Ads']
  ];
  const PUBLIC_CDNS = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|code\.jquery\.com|ajax\.googleapis\.com|stackpath\.bootstrapcdn\.com|maxcdn\.bootstrapcdn\.com|cdn\.skypack\.dev|esm\.sh)$/;
  const DEAD_HOSTS = [
    [/(^|\.)polyfill\.io$/, 'polyfill.io was taken over in 2024 and served malware; Cloudflare said it "can no longer be trusted and should be removed from websites".'],
    [/(^|\.)bootcss\.com$|(^|\.)bootcdn\.net$|(^|\.)staticfile\.net$|(^|\.)staticfile\.org$/, 'This CDN belonged to the same operator as polyfill.io in the 2024 incident. Host the file yourself.']
  ];

  // ---------------------------------------------------------------- text
  const T = {
    en: {
      vFix: 'Fix this first', vCheck: 'Worth checking', vClean: 'Clean', vEmpty: 'Nothing to read',
      vFixP: 'Something on this page is broken or exposed today. The FIX items say what and how.',
      vCheckP: 'Nothing is broken, but some outside code could be pinned down better. See the CHECK items.',
      vCleanP: 'No mixed content, no http:// links to your own site, and every outside file is accounted for.',
      vEmptyP: 'Paste the page source (in the browser: right click, View page source, select all, copy).',
      origin: 'Your page', parties: 'outside addresses', scripts: 'scripts', inlineN: 'inline scripts', handlers: 'inline event handlers',
      httpPage: 'This page is served over http://',
      httpPageD: 'Since Chrome 154 (October 2026) Chrome asks visitors for permission before opening a public site without HTTPS. Turn on HTTPS at your host, redirect http:// to https://, then add Strict-Transport-Security.',
      mixedBlocked: 'Mixed content that browsers block', mixedBlockedD: 'The page is https:// but loads these over http://. Browsers block scripts, styles, frames, fonts and srcset images over http://, so they do not work for your visitors. Change each address to https:// (check first that the file exists there).',
      mixedUpg: 'Mixed content that browsers upgrade', mixedUpgD: 'Images, audio and video written as http://. Browsers rewrite them to https:// and the file fails if it is not there. Write https:// yourself.',
      formHttp: 'A form sends what people type without encryption', formHttpD: 'The form action is http://. Names, emails or passwords typed here travel in plain text. Change the action to https://.',
      ownHttp: 'Links to your own site with http://', ownHttpD: 'Chrome now tries HTTPS first and asks the visitor before falling back to HTTP; any http:// hop in a redirect also triggers the warning. Write these links as https://. Links that say https:// never fall back.',
      metaHttp: 'Canonical or sharing address with http://', metaHttpD: 'Search engines and social networks will use this http:// address. Change it to https://.',
      otherHttp: 'links to other sites still use http://',
      dead: 'A script from an address that is known to be unsafe',
      sriMissing: 'Library from a public CDN without integrity', sriMissingD: 'This file has a fixed version, so you can pin it: add integrity="sha384-…" and crossorigin="anonymous". If the CDN is ever tampered with, the browser refuses the changed file. Get the hash with the demo (drop the file) or: curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A',
      sriUnpinned: 'Library from a public CDN without a fixed version', sriUnpinnedD: 'The address has no version (or says "latest"), so the file can change under you and integrity cannot be used. Put the exact version in the address, then add integrity.',
      sriNoCors: 'integrity without crossorigin', sriNoCorsD: 'MDN: a cross-origin file with integrity must also carry the crossorigin attribute, or the browser cannot check it and blocks it. Add crossorigin="anonymous".',
      sriWeak: 'integrity uses an algorithm browsers do not accept', sriWeakD: 'Only sha256, sha384 and sha512 are allowed. Recompute the hash with sha384.',
      sriOk: 'Pinned with integrity',
      live: 'Outside script that changes by design', liveD: 'Files like this change whenever the vendor wants, so integrity cannot pin them. In November 2026 tampered Optimizely snippets reached 178 organisations, and a hacked self-hosted analytics file skimmed cards at checkout. Keep only the ones you still use, and never on the payment page if you can avoid it.',
      selfScript: 'Your own script files', otherScript: 'Outside script without integrity', otherScriptD: 'Ask the vendor whether the file has a fixed version you can pin with integrity. If it changes by design, keep it only if you still need it.',
      inline: 'Code written inside the page', inlineD: 'Inline <script> blocks, onclick-style attributes and javascript: links all need \'unsafe-inline\' in a CSP, which also lets injected code run. The strict policy below lists a hash per inline block instead; attributes and javascript: links must move to a script file before you can drop \'unsafe-inline\'.',
      dynInline: 'An inline block looks different on every visit', dynInlineD: 'It carries a token that changes per request (for example a WordPress nonce), so its hash will not match next time. Keep \'unsafe-inline\' or move that data into a data attribute.',
      metaCsp: 'The page sets a CSP in a <meta> tag', metaCspD: 'frame-ancestors, report-uri, report-to and sandbox are ignored in a <meta> policy, and Report-Only cannot be sent this way. Prefer the HTTP header.',
      vendorOff: 'Origins from the vendor\'s own CSP guide', vendorUnoff: 'Meta publishes no CSP list: origins taken from the address in its pixel code and its event endpoint. Check the browser\'s report before enforcing.',
      gTld: 'Google says each country domain must be listed one by one (www.google.cl, www.google.es…). Use --google-tld cl (or the field in the demo) to add yours.',
      cspHead: 'Your current CSP', blocked: 'items would be blocked by your current CSP', allowedAll: 'Your current CSP allows everything this page loads.',
      lintStar: 'A bare * or https: in script-src allows code from any site.', lintEval: '\'unsafe-eval\' lets text be run as code. Google Tag Manager needs it only for Custom JavaScript variables; Custom Templates avoid it.',
      lintHttp: 'An http: source lets scripts load without encryption.', lintData: 'data: in script-src lets injected code run.', lintObj: 'No object-src: add object-src \'none\'.', lintBase: 'No base-uri: add base-uri \'self\' so an injected <base> cannot redirect your scripts.',
      lintInlineIgn: 'This directive has a nonce or a hash, so browsers ignore \'unsafe-inline\' in it: inline code without that nonce or hash is blocked.',
      lintStrictDyn: '\'strict-dynamic\' is present: browsers that support it ignore the address list and \'unsafe-inline\' in script-src; only scripts with the nonce or hash (and what they load) run.',
      policyStarter: 'Starter policy (report only, works with this page today)', policyStrict: 'Stricter policy (hashes instead of \'unsafe-inline\' for scripts)',
      how: 'Send it as an HTTP header named Content-Security-Policy-Report-Only for one or two weeks. Nothing is blocked. Open your site with the browser developer tools (Issues and Console) and visit every kind of page: each missing address shows up as a warning. Add what is missing, then rename the header to Content-Security-Policy. Reports reach a server only if you add report-to with a Reporting-Endpoints header. A <meta> tag cannot carry Report-Only.',
      limitAllow: 'An allow-list says which addresses may load code, not whether that code is honest: it would not have stopped the November 2026 Optimizely tampering, because the code came from the allowed address.',
      integrityPolicy: 'Every outside script on this page has integrity. You can ask the browser to enforce that from now on (Firefox 145 and later support it for scripts; check MDN for other browsers): Integrity-Policy-Report-Only: blocked-destinations=(script)',
      none: 'none', line: 'line', lines: 'lines'
    },
    es: {
      vFix: 'Corrige esto primero', vCheck: 'Conviene revisar', vClean: 'Limpio', vEmpty: 'No hay nada que leer',
      vFixP: 'Hay algo roto o expuesto hoy en esta página. Los avisos CORREGIR dicen qué es y cómo se arregla.',
      vCheckP: 'No hay nada roto, pero hay código de afuera que se puede fijar mejor. Mira los avisos REVISAR.',
      vCleanP: 'Sin contenido mixto, sin enlaces http:// a tu propio sitio y cada archivo de afuera tiene explicación.',
      vEmptyP: 'Pega el código fuente de la página (en el navegador: clic derecho, Ver código fuente, seleccionar todo, copiar).',
      origin: 'Tu página', parties: 'direcciones de afuera', scripts: 'scripts', inlineN: 'scripts escritos en la página', handlers: 'atributos de evento (onclick…)',
      httpPage: 'Esta página se sirve por http://',
      httpPageD: 'Desde Chrome 154 (octubre de 2026), Chrome pide permiso al visitante antes de abrir un sitio público sin HTTPS. Activa HTTPS en tu hosting, redirige http:// a https:// y después agrega Strict-Transport-Security.',
      mixedBlocked: 'Contenido mixto que los navegadores bloquean', mixedBlockedD: 'La página es https:// pero carga esto por http://. Los navegadores bloquean scripts, estilos, iframes, fuentes e imágenes con srcset por http://, así que a tus visitas no les funciona. Cambia cada dirección a https:// (antes revisa que el archivo exista ahí).',
      mixedUpg: 'Contenido mixto que los navegadores actualizan', mixedUpgD: 'Imágenes, audio y video escritos con http://. El navegador los cambia a https:// y fallan si el archivo no está ahí. Escribe tú https://.',
      formHttp: 'Un formulario envía lo que la gente escribe sin cifrar', formHttpD: 'El action del formulario es http://. Nombres, correos o contraseñas viajan en texto plano. Cambia el action a https://.',
      ownHttp: 'Enlaces a tu propio sitio con http://', ownHttpD: 'Chrome ahora prueba primero HTTPS y pregunta al visitante antes de usar HTTP; cualquier salto http:// en una redirección también muestra el aviso. Escribe estos enlaces con https://. Un enlace que dice https:// nunca vuelve a HTTP.',
      metaHttp: 'Dirección canónica o para compartir con http://', metaHttpD: 'Buscadores y redes sociales usarán esta dirección http://. Cámbiala a https://.',
      otherHttp: 'enlaces a otros sitios siguen usando http://',
      dead: 'Un script desde una dirección que se sabe insegura',
      sriMissing: 'Librería de un CDN público sin integrity', sriMissingD: 'Este archivo tiene versión fija, así que puedes fijarlo: agrega integrity="sha384-…" y crossorigin="anonymous". Si alguien altera el CDN, el navegador rechaza el archivo cambiado. Calcula el hash en la demo (arrastra el archivo) o con: curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A',
      sriUnpinned: 'Librería de un CDN público sin versión fija', sriUnpinnedD: 'La dirección no tiene versión (o dice "latest"), así que el archivo puede cambiar sin aviso y no se puede usar integrity. Pon la versión exacta en la dirección y después agrega integrity.',
      sriNoCors: 'integrity sin crossorigin', sriNoCorsD: 'MDN: un archivo de otro origen con integrity también debe llevar el atributo crossorigin; si no, el navegador no puede revisarlo y lo bloquea. Agrega crossorigin="anonymous".',
      sriWeak: 'integrity usa un algoritmo que los navegadores no aceptan', sriWeakD: 'Solo se aceptan sha256, sha384 y sha512. Vuelve a calcular el hash con sha384.',
      sriOk: 'Fijado con integrity',
      live: 'Script de afuera que cambia por diseño', liveD: 'Archivos así cambian cuando el proveedor quiere, por eso integrity no puede fijarlos. En noviembre de 2026, fragmentos alterados de Optimizely llegaron a 178 organizaciones, y un archivo de analítica alojado por la propia empresa, hackeado, robó tarjetas en el pago. Deja solo los que todavía usas y, si puedes, ninguno en la página de pago.',
      selfScript: 'Tus propios archivos de script', otherScript: 'Script de afuera sin integrity', otherScriptD: 'Pregunta al proveedor si el archivo tiene una versión fija que puedas fijar con integrity. Si cambia por diseño, déjalo solo si todavía lo necesitas.',
      inline: 'Código escrito dentro de la página', inlineD: 'Los bloques <script> en la página, los atributos tipo onclick y los enlaces javascript: necesitan \'unsafe-inline\' en la CSP, y eso también deja correr código inyectado. La política estricta de abajo pone un hash por bloque; los atributos y los enlaces javascript: deben pasar a un archivo de script antes de quitar \'unsafe-inline\'.',
      dynInline: 'Un bloque en la página cambia en cada visita', dynInlineD: 'Lleva un código que cambia en cada carga (por ejemplo un nonce de WordPress), así que su hash no coincidirá la próxima vez. Mantén \'unsafe-inline\' o pasa ese dato a un atributo data-.',
      metaCsp: 'La página define una CSP en una etiqueta <meta>', metaCspD: 'En una política por <meta> se ignoran frame-ancestors, report-uri, report-to y sandbox, y Report-Only no se puede enviar así. Mejor usa la cabecera HTTP.',
      vendorOff: 'Orígenes de la guía CSP oficial del proveedor', vendorUnoff: 'Meta no publica una lista para CSP: orígenes tomados de la dirección de su código del píxel y de su dirección de eventos. Revisa el informe del navegador antes de aplicarla.',
      gTld: 'Google dice que cada dominio de país se lista uno por uno (www.google.cl, www.google.es…). Usa --google-tld cl (o el campo de la demo) para agregar el tuyo.',
      cspHead: 'Tu CSP actual', blocked: 'elementos quedarían bloqueados por tu CSP actual', allowedAll: 'Tu CSP actual permite todo lo que carga esta página.',
      lintStar: 'Un * solo o https: en script-src permite código de cualquier sitio.', lintEval: '\'unsafe-eval\' deja ejecutar texto como código. Google Tag Manager lo necesita solo para variables de JavaScript personalizado; las plantillas personalizadas lo evitan.',
      lintHttp: 'Una fuente http: deja cargar scripts sin cifrar.', lintData: 'data: en script-src deja correr código inyectado.', lintObj: 'Falta object-src: agrega object-src \'none\'.', lintBase: 'Falta base-uri: agrega base-uri \'self\' para que un <base> inyectado no desvíe tus scripts.',
      lintInlineIgn: 'Esta directiva tiene un nonce o un hash, así que el navegador ignora \'unsafe-inline\' en ella: el código en la página sin ese nonce o hash queda bloqueado.',
      lintStrictDyn: 'Hay \'strict-dynamic\': los navegadores que lo entienden ignoran la lista de direcciones y \'unsafe-inline\' en script-src; solo corren los scripts con el nonce o el hash (y lo que ellos carguen).',
      policyStarter: 'Política inicial (solo informa, funciona hoy con esta página)', policyStrict: 'Política más estricta (hashes en vez de \'unsafe-inline\' para scripts)',
      how: 'Envíala como cabecera HTTP con el nombre Content-Security-Policy-Report-Only durante una o dos semanas. No bloquea nada. Abre tu sitio con las herramientas de desarrollo del navegador (pestañas Issues y Console) y visita cada tipo de página: cada dirección que falte aparece como aviso. Agrega lo que falte y después cambia el nombre de la cabecera a Content-Security-Policy. Los informes llegan a un servidor solo si agregas report-to con una cabecera Reporting-Endpoints. Una etiqueta <meta> no sirve para Report-Only.',
      limitAllow: 'Una lista de direcciones dice desde dónde se puede cargar código, no si ese código es honesto: no habría frenado la alteración de Optimizely de noviembre de 2026, porque el código venía de la dirección permitida.',
      integrityPolicy: 'Todos los scripts de afuera de esta página tienen integrity. Puedes pedirle al navegador que lo exija desde ahora (Firefox 145 y posteriores lo aplican a scripts; revisa MDN para otros navegadores): Integrity-Policy-Report-Only: blocked-destinations=(script)',
      none: 'ninguno', line: 'línea', lines: 'líneas'
    }
  };

  // ---------------------------------------------------------------- helpers
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|#39);/gi, (m, e) => {
      const k = e.toLowerCase();
      if (k === 'amp') return '&'; if (k === 'quot') return '"'; if (k === 'apos' || k === '#39') return "'";
      if (k === 'lt') return '<'; if (k === 'gt') return '>';
      if (k[1] === 'x') return String.fromCodePoint(parseInt(k.slice(2), 16));
      return String.fromCodePoint(parseInt(k.slice(1), 10));
    });
  }

  function parseAttrs(s) {
    const out = {};
    const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m;
    while ((m = re.exec(s))) {
      const name = m[1].toLowerCase();
      if (name in out) continue;
      const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
      out[name] = v === undefined ? '' : decodeEntities(v);
    }
    return out;
  }

  // Splits HTML into tags with attributes, keeping raw text of script/style.
  function tokenize(html) {
    const tags = [];
    const src = String(html || '');
    let i = 0;
    while (i < src.length) {
      const lt = src.indexOf('<', i);
      if (lt < 0) break;
      if (src.startsWith('<!--', lt)) {
        const end = src.indexOf('-->', lt + 4);
        i = end < 0 ? src.length : end + 3;
        continue;
      }
      const m = /^<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/.exec(src.slice(lt, lt + 20000));
      if (!m) { i = lt + 1; continue; }
      const name = m[1].toLowerCase();
      const attrs = parseAttrs(m[2].replace(/\/\s*$/, ''));
      const line = src.slice(0, lt).split('\n').length;
      const tag = { name, attrs, line, text: '' };
      i = lt + m[0].length;
      if (name === 'script' || name === 'style' || name === 'textarea' || name === 'title') {
        const close = src.toLowerCase().indexOf('</' + name, i);
        const end = close < 0 ? src.length : close;
        tag.text = src.slice(i, end);
        i = end;
      }
      tags.push(tag);
    }
    return tags;
  }

  function parseUrl(raw, base) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (!s || s.startsWith('#') || /^(data|blob|about|mailto|tel|sms|whatsapp|intent):/i.test(s)) return null;
    if (/^javascript:/i.test(s)) return { scheme: 'javascript', raw: s };
    try {
      const u = base ? new URL(s, base) : new URL(s);
      if (!/^(https?|wss?):$/.test(u.protocol)) return null;
      return { scheme: u.protocol.slice(0, -1), host: u.hostname.toLowerCase(), port: u.port, path: u.pathname, query: u.search, origin: u.protocol + '//' + u.host.toLowerCase(), href: u.href, relative: !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(s) };
    } catch (e) {
      if (/^\/\//.test(s)) return parseUrl('https:' + s, null);
      return null;
    }
  }

  const SECOND_LEVEL = /^(co|com|net|org|gov|edu|gob|ac|or|ne|go)\.[a-z]{2}$/;
  function regDomain(host) {
    if (!host) return '';
    if (/^[\d.]+$/.test(host) || host.includes(':')) return host;
    const p = host.split('.');
    if (p.length <= 2) return host;
    const last2 = p.slice(-2).join('.');
    return SECOND_LEVEL.test(last2) ? p.slice(-3).join('.') : last2;
  }
  const isIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[?[0-9a-f:]+\]?$/i.test(h) && h.includes(':');

  // ---------------------------------------------------------------- hashing
  // Synchronous SHA-256 so the same code runs in Node and in the browser.
  function sha256Base64(str) {
    const bytes = utf8(str);
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const l = bytes.length;
    const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    withPad.set(bytes); withPad[l] = 0x80;
    const bits = l * 8;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(withPad.length - 4, bits >>> 0);
    const W = new Uint32Array(64);
    for (let o = 0; o < withPad.length; o += 64) {
      for (let t = 0; t < 16; t++) W[t] = dv.getUint32(o + t * 4);
      for (let t = 16; t < 64; t++) {
        const a = W[t - 15], b = W[t - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, idx) => odv.setUint32(idx * 4, v));
    return base64(out);
  }
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return Uint8Array.from(Buffer.from(str, 'utf8'));
  }
  function base64(bytes) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? A[n & 63] : '=');
    }
    return s;
  }

  // ---------------------------------------------------------------- CSP parsing and matching
  function parseCsp(text) {
    const pol = {};
    String(text || '').replace(/^\s*content-security-policy(-report-only)?\s*:/i, '').split(';').forEach((part) => {
      const toks = part.trim().split(/\s+/).filter(Boolean);
      if (!toks.length) return;
      const name = toks[0].toLowerCase();
      if (name in pol) return; // first one wins, as in browsers
      pol[name] = toks.slice(1);
    });
    return pol;
  }

  const FALLBACK = {
    'script-src-elem': ['script-src-elem', 'script-src', 'default-src'],
    'script-src-attr': ['script-src-attr', 'script-src', 'default-src'],
    'style-src-elem': ['style-src-elem', 'style-src', 'default-src'],
    'style-src-attr': ['style-src-attr', 'style-src', 'default-src'],
    'img-src': ['img-src', 'default-src'], 'font-src': ['font-src', 'default-src'], 'connect-src': ['connect-src', 'default-src'],
    'media-src': ['media-src', 'default-src'], 'object-src': ['object-src', 'default-src'], 'manifest-src': ['manifest-src', 'default-src'],
    'frame-src': ['frame-src', 'child-src', 'default-src'], 'worker-src': ['worker-src', 'child-src', 'script-src', 'default-src'],
    'form-action': ['form-action'], 'base-uri': ['base-uri']
  };
  function effective(pol, dir) {
    for (const d of FALLBACK[dir] || [dir]) if (pol[d]) return { name: d, list: pol[d] };
    return null;
  }

  function matchSource(expr, url, self) {
    const e = expr.toLowerCase();
    if (e === '*') return /^(https?|wss?)$/.test(url.scheme);
    if (/^[a-z][a-z0-9+.-]*:$/.test(e)) {
      const sch = e.slice(0, -1);
      return url.scheme === sch || (sch === 'http' && url.scheme === 'https') || (sch === 'ws' && url.scheme === 'wss');
    }
    if (e === "'self'") {
      if (!self) return false;
      if (url.host !== self.host || (url.port || '') !== (self.port || '')) return false;
      return url.scheme === self.scheme || (self.scheme === 'http' && url.scheme === 'https');
    }
    if (e.startsWith("'")) return false;
    const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^\/:]+|\*)(?::(\d+|\*))?(\/.*)?$/.exec(e);
    if (!m) return false;
    const [, sch, wild, host, port, path] = m;
    if (sch) {
      if (!(url.scheme === sch || (sch === 'http' && url.scheme === 'https') || (sch === 'ws' && url.scheme === 'wss'))) return false;
    } else {
      const base = self ? self.scheme : 'https';
      if (!(url.scheme === base || (base === 'http' && url.scheme === 'https'))) return false;
    }
    if (host === '*') { /* any */ } else if (wild) {
      if (!url.host.endsWith('.' + host)) return false;
    } else if (url.host !== host) return false;
    if (port !== '*') {
      const def = url.scheme === 'https' || url.scheme === 'wss' ? '443' : '80';
      const want = port || (sch === 'http' || (!sch && self && self.scheme === 'http') ? '80' : def);
      const have = url.port || def;
      if (!port) { if (have !== def && have !== want) return false; } else if (have !== want) return false;
    }
    if (path && path !== '/') {
      const p = decodeURIComponent(url.path);
      if (path.endsWith('/')) { if (!p.startsWith(path)) return false; } else if (p !== path) return false;
    }
    return true;
  }

  function allowsUrl(pol, dir, url, self, attrs) {
    const eff = effective(pol, dir);
    if (!eff) return { ok: true };
    const list = eff.list.map((x) => x.toLowerCase());
    if (list.includes("'none'") && list.length === 1) return { ok: false, by: eff.name };
    const isScript = dir.startsWith('script');
    if (isScript && attrs && attrs.nonce && list.includes("'nonce-" + attrs.nonce.toLowerCase() + "'")) return { ok: true };
    if (isScript && list.includes("'strict-dynamic'")) return { ok: false, by: eff.name, strictDynamic: true };
    for (const ex of eff.list) if (matchSource(ex, url, self)) return { ok: true };
    return { ok: false, by: eff.name };
  }

  function allowsInline(pol, dir, text, attrs) {
    const eff = effective(pol, dir);
    if (!eff) return { ok: true };
    const list = eff.list;
    const low = list.map((x) => x.toLowerCase());
    const hasNonceOrHash = list.some((x) => /^'(nonce|sha256|sha384|sha512)-/i.test(x));
    if (dir.endsWith('-elem') || dir === 'script-src-elem' || dir === 'style-src-elem') {
      if (attrs && attrs.nonce && list.includes("'nonce-" + attrs.nonce + "'")) return { ok: true };
      if (text != null && list.includes("'sha256-" + sha256Base64(text) + "'")) return { ok: true };
    }
    if (low.includes("'unsafe-inline'") && !hasNonceOrHash && !(dir.startsWith('script') && low.includes("'strict-dynamic'"))) return { ok: true };
    if (dir.endsWith('-attr') && low.includes("'unsafe-hashes'") && text != null && list.includes("'sha256-" + sha256Base64(text) + "'")) return { ok: true };
    return { ok: false, by: eff.name, ignoredInline: low.includes("'unsafe-inline'") && hasNonceOrHash };
  }

  function lintCsp(pol, t) {
    const notes = [];
    const s = (pol['script-src'] || pol['default-src'] || []).map((x) => x.toLowerCase());
    if (s.includes('*') || s.includes('https:') || s.includes('http:')) notes.push({ level: 'fix', text: t.lintStar });
    if (s.some((x) => x === 'http:' || x.startsWith('http://'))) notes.push({ level: 'fix', text: t.lintHttp });
    if (s.includes('data:')) notes.push({ level: 'fix', text: t.lintData });
    if (s.includes("'unsafe-eval'")) notes.push({ level: 'check', text: t.lintEval });
    if (s.includes("'strict-dynamic'")) notes.push({ level: 'info', text: t.lintStrictDyn });
    for (const d of ['script-src', 'style-src', 'default-src']) {
      const l = pol[d] || [];
      if (l.some((x) => x.toLowerCase() === "'unsafe-inline'") && l.some((x) => /^'(nonce|sha256|sha384|sha512)-/i.test(x))) notes.push({ level: 'check', text: d + ': ' + t.lintInlineIgn });
    }
    if (!pol['object-src'] && !(pol['default-src'] || []).map((x) => x.toLowerCase()).includes("'none'")) notes.push({ level: 'check', text: t.lintObj });
    if (!pol['base-uri']) notes.push({ level: 'check', text: t.lintBase });
    return notes;
  }

  // ---------------------------------------------------------------- analysis
  const RESOURCE_DIR = { script: 'script-src-elem', style: 'style-src-elem', img: 'img-src', frame: 'frame-src', font: 'font-src', media: 'media-src', object: 'object-src', manifest: 'manifest-src', form: 'form-action', connect: 'connect-src', worker: 'worker-src' };
  const POLICY_DIR = { script: 'script-src', style: 'style-src', img: 'img-src', frame: 'frame-src', font: 'font-src', media: 'media-src', object: 'object-src', manifest: 'manifest-src', form: 'form-action', connect: 'connect-src', worker: 'worker-src' };

  function detectSelf(tags, given) {
    if (given) { const u = parseUrl(/^https?:\/\//i.test(given) ? given : 'https://' + given); if (u) return u; }
    for (const tg of tags) {
      if (tg.name === 'link' && /\bcanonical\b/i.test(tg.attrs.rel || '') && tg.attrs.href) { const u = parseUrl(tg.attrs.href); if (u) return u; }
    }
    for (const tg of tags) {
      if (tg.name === 'meta' && /^og:url$/i.test(tg.attrs.property || tg.attrs.name || '') && tg.attrs.content) { const u = parseUrl(tg.attrs.content); if (u) return u; }
    }
    for (const tg of tags) if (tg.name === 'base' && tg.attrs.href) { const u = parseUrl(tg.attrs.href); if (u) return u; }
    return null;
  }

  const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/gi;
  const CODE_URL = /["'`](https?:)?\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(\/[^"'`\s]*)?["'`]/gi;
  const DYNAMIC_TOKEN = /(nonce|_wpnonce|csrf|token)["']?\s*[:=]\s*["'][a-f0-9]{8,}["']/i;

  function analyze(html, opts) {
    opts = opts || {};
    const lang = opts.lang === 'es' ? 'es' : 'en';
    const t = T[lang];
    const tags = tokenize(html);
    const self = detectSelf(tags, opts.origin);
    const base = self ? self.href : null;
    const resources = [];      // {kind, url, attrs, line, tag}
    const inlineScripts = [];  // {text, attrs, line, hash, dynamic}
    const inlineStyles = [];
    const handlers = [];       // {attr, value, line}
    const jsLinks = [];
    const links = [];          // anchors
    const metaUrls = [];
    const codeHosts = new Map();
    const metaCsp = [];
    const add = (kind, raw, tg, extra) => {
      const u = parseUrl(raw, base);
      if (!u || u.scheme === 'javascript') return;
      resources.push(Object.assign({ kind, url: u, attrs: tg.attrs, line: tg.line, tag: tg.name }, extra || {}));
    };
    const fromCss = (css, tg) => {
      let m; CSS_URL.lastIndex = 0;
      while ((m = CSS_URL.exec(css))) {
        const raw = m[2] || m[4];
        if (!raw) continue;
        const isFont = /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(raw);
        add(m[4] ? 'style' : (isFont ? 'font' : 'img'), raw, tg, { viaCss: true });
      }
    };

    for (const tg of tags) {
      const a = tg.attrs;
      for (const k of Object.keys(a)) {
        if (/^on[a-z]+$/.test(k) && a[k]) handlers.push({ attr: k, value: a[k], line: tg.line, tag: tg.name });
      }
      if (a.style) { inlineStyles.push({ attr: true, text: a.style, line: tg.line }); fromCss(a.style, tg); }
      switch (tg.name) {
        case 'script': {
          const type = (a.type || '').toLowerCase().trim();
          const data = type && !/^(text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript)$/.test(type);
          if (a.src !== undefined) { if (!data) add('script', a.src, tg); }
          else if (!data && tg.text.trim()) {
            inlineScripts.push({ text: tg.text, attrs: a, line: tg.line, hash: 'sha256-' + sha256Base64(tg.text), dynamic: DYNAMIC_TOKEN.test(tg.text) });
          }
          if (!data || type === 'text/partytown') {
            let m; CODE_URL.lastIndex = 0;
            while ((m = CODE_URL.exec(tg.text))) {
              const u = parseUrl((m[1] || 'https:') + '//' + m[2] + (m[3] || '/'));
              if (u) { const k = u.origin; if (!codeHosts.has(k)) codeHosts.set(k, { url: u, line: tg.line }); }
            }
          }
          break;
        }
        case 'style': inlineStyles.push({ text: tg.text, line: tg.line }); fromCss(tg.text, tg); break;
        case 'link': {
          const rel = (a.rel || '').toLowerCase();
          if (!a.href) break;
          if (/\bstylesheet\b/.test(rel)) add('style', a.href, tg);
          else if (/\bmodulepreload\b/.test(rel)) add('script', a.href, tg);
          else if (/\bpreload\b/.test(rel)) {
            const as = (a.as || '').toLowerCase();
            const map = { script: 'script', style: 'style', font: 'font', image: 'img', fetch: 'connect', video: 'media', audio: 'media' };
            if (map[as]) add(map[as], a.href, tg, { preload: true });
          } else if (/\bmanifest\b/.test(rel)) add('manifest', a.href, tg);
          else if (/\bicon\b/.test(rel)) add('img', a.href, tg);
          else if (/\bcanonical\b/.test(rel)) metaUrls.push({ what: 'canonical', raw: a.href, line: tg.line });
          break;
        }
        case 'img': case 'input':
          if (tg.name === 'input' && (a.type || '').toLowerCase() !== 'image') break;
          if (a.src) add('img', a.src, tg);
          if (a.srcset) a.srcset.split(',').forEach((c) => { const r = c.trim().split(/\s+/)[0]; if (r) add('img', r, tg, { srcset: true }); });
          break;
        case 'source':
          if (a.src) add('media', a.src, tg);
          if (a.srcset) a.srcset.split(',').forEach((c) => { const r = c.trim().split(/\s+/)[0]; if (r) add('img', r, tg, { srcset: true }); });
          break;
        case 'video': case 'audio': case 'track':
          if (a.src) add('media', a.src, tg);
          if (a.poster) add('img', a.poster, tg);
          break;
        case 'iframe': case 'frame': if (a.src) add('frame', a.src, tg); break;
        case 'object': if (a.data) add('object', a.data, tg); break;
        case 'embed': if (a.src) add('object', a.src, tg); break;
        case 'form': if (a.action) add('form', a.action, tg); break;
        case 'a': case 'area':
          if (a.href) {
            if (/^\s*javascript:/i.test(a.href) && !/^\s*javascript:\s*(void\(0\)|;)?\s*;?\s*$/i.test(a.href)) jsLinks.push({ value: a.href, line: tg.line });
            const u = parseUrl(a.href, base);
            if (u && u.scheme !== 'javascript') links.push({ url: u, line: tg.line, raw: a.href });
          }
          break;
        case 'meta': {
          const he = (a['http-equiv'] || '').toLowerCase();
          if (he === 'content-security-policy' || he === 'content-security-policy-report-only') metaCsp.push({ value: a.content || '', reportOnly: he.endsWith('only'), line: tg.line });
          const prop = (a.property || a.name || '').toLowerCase();
          if (/^(og:url|og:image|twitter:image)$/.test(prop) && a.content) metaUrls.push({ what: prop, raw: a.content, line: tg.line });
          break;
        }
      }
    }

    const isOwn = (u) => self && (u.host === self.host || regDomain(u.host) === regDomain(self.host));
    const isSame = (u) => self && u.host === self.host && (u.port || '') === (self.port || '');
    const findings = [];
    const push = (f) => findings.push(f);

    // ---- page itself over http
    if (self && self.scheme === 'http') push({ id: 'http-page', level: 'fix', title: t.httpPage, detail: t.httpPageD, items: [self.origin] });

    // ---- mixed content
    if (!self || self.scheme === 'https') {
      const blocked = [], upgraded = [];
      for (const r of resources) {
        if (r.url.scheme !== 'http' || r.kind === 'form') continue;
        if (r.preload && r.kind !== 'script' && r.kind !== 'style') { blocked.push(r); continue; }
        const upg = (r.kind === 'img' && !r.srcset && r.tag !== 'link') || r.kind === 'media';
        if (upg && !isIp(r.url.host)) upgraded.push(r); else blocked.push(r);
      }
      if (blocked.length) push({ id: 'mixed-blocked', level: 'fix', title: t.mixedBlocked, detail: t.mixedBlockedD, items: uniq(blocked.map((r) => r.kind + ' · ' + r.url.href + ' (' + t.line + ' ' + r.line + ')')) });
      if (upgraded.length) push({ id: 'mixed-upgraded', level: 'check', title: t.mixedUpg, detail: t.mixedUpgD, items: uniq(upgraded.map((r) => r.url.href + ' (' + t.line + ' ' + r.line + ')')) });
    }
    const httpForms = resources.filter((r) => r.kind === 'form' && r.url.scheme === 'http');
    if (httpForms.length) push({ id: 'form-http', level: 'fix', title: t.formHttp, detail: t.formHttpD, items: uniq(httpForms.map((r) => r.url.href + ' (' + t.line + ' ' + r.line + ')')) });

    // ---- http links (Chrome ask-before-HTTP)
    const ownHttp = links.filter((l) => l.url.scheme === 'http' && isOwn(l.url) && !isIp(l.url.host));
    if (ownHttp.length) push({ id: 'own-http-links', level: 'check', title: t.ownHttp, detail: t.ownHttpD, items: uniq(ownHttp.map((l) => l.url.origin + l.url.path + ' (' + t.line + ' ' + l.line + ')')) });
    if (!self) {
      // Without knowing the site's address we cannot split own vs other links.
    }
    const otherHttp = links.filter((l) => l.url.scheme === 'http' && !isOwn(l.url));
    const metaHttp = metaUrls.filter((m) => /^http:\/\//i.test(m.raw.trim()));
    if (metaHttp.length) push({ id: 'meta-http', level: 'check', title: t.metaHttp, detail: t.metaHttpD, items: metaHttp.map((m) => m.what + ': ' + m.raw + ' (' + t.line + ' ' + m.line + ')') });

    // ---- known-unsafe hosts
    for (const r of resources) {
      for (const [re, why] of DEAD_HOSTS) if (re.test(r.url.host) && (r.kind === 'script' || r.kind === 'style')) push({ id: 'dead-host', level: 'fix', title: t.dead + ': ' + r.url.host, detail: why, items: [r.url.href + ' (' + t.line + ' ' + r.line + ')'] });
    }

    // ---- scripts and styles: SRI
    const extCode = resources.filter((r) => (r.kind === 'script' || r.kind === 'style') && !r.viaCss && !isSame(r.url));
    const sriGroups = { missing: [], unpinned: [], nocors: [], weak: [], ok: [], live: new Map(), other: [] };
    for (const r of extCode) {
      const integ = (r.attrs.integrity || '').trim();
      const own = isOwn(r.url);
      if (integ) {
        const algos = integ.split(/\s+/).map((x) => x.split('-')[0].toLowerCase());
        if (!algos.some((x) => /^sha(256|384|512)$/.test(x))) sriGroups.weak.push(r);
        else if (r.attrs.crossorigin === undefined) sriGroups.nocors.push(r);
        else sriGroups.ok.push(r);
        continue;
      }
      if (PUBLIC_CDNS.test(r.url.host)) {
        const pinned = /@\d+\.\d+\.\d+|\/\d+\.\d+\.\d+\/|[-.]\d+\.\d+\.\d+(\.min)?\.(js|css)|\/v?\d+\.\d+\.\d+\b/.test(r.url.path) && !/@latest|\/latest\//i.test(r.url.path);
        (pinned ? sriGroups.missing : sriGroups.unpinned).push(r);
        continue;
      }
      if (own || r.url.scheme === 'http' || DEAD_HOSTS.some(([re]) => re.test(r.url.host))) continue;
      const live = LIVE_SCRIPTS.find(([re]) => re.test(r.url.host));
      if (live && r.kind === 'script') { const k = live[1]; if (!sriGroups.live.has(k)) sriGroups.live.set(k, []); sriGroups.live.get(k).push(r); }
      else if (r.kind === 'script') sriGroups.other.push(r);
    }
    const fmt = (r) => r.url.href + ' (' + t.line + ' ' + r.line + ')';
    if (sriGroups.weak.length) push({ id: 'sri-weak', level: 'fix', title: t.sriWeak, detail: t.sriWeakD, items: sriGroups.weak.map(fmt) });
    if (sriGroups.nocors.length) push({ id: 'sri-nocors', level: 'fix', title: t.sriNoCors, detail: t.sriNoCorsD, items: sriGroups.nocors.map(fmt) });
    if (sriGroups.missing.length) push({ id: 'sri-missing', level: 'check', title: t.sriMissing, detail: t.sriMissingD, items: sriGroups.missing.map(fmt) });
    if (sriGroups.unpinned.length) push({ id: 'sri-unpinned', level: 'check', title: t.sriUnpinned, detail: t.sriUnpinnedD, items: sriGroups.unpinned.map(fmt) });
    if (sriGroups.other.length) push({ id: 'script-other', level: 'check', title: t.otherScript, detail: t.otherScriptD, items: uniq(sriGroups.other.map(fmt)) });
    if (sriGroups.live.size) push({ id: 'script-live', level: 'info', title: t.live, detail: t.liveD, items: [...sriGroups.live.entries()].map(([k, rs]) => k + ': ' + uniq(rs.map((r) => r.url.host)).join(', ')) });
    if (sriGroups.ok.length) push({ id: 'sri-ok', level: 'ok', title: t.sriOk, detail: '', items: sriGroups.ok.map(fmt) });
    const extScripts = extCode.filter((r) => r.kind === 'script');
    if (extScripts.length && extScripts.every((r) => (r.attrs.integrity || '').trim() && r.attrs.crossorigin !== undefined)) push({ id: 'integrity-policy', level: 'info', title: 'Integrity-Policy', detail: t.integrityPolicy, items: [] });

    // ---- inline code
    if (inlineScripts.length || handlers.length || jsLinks.length) {
      const items = [];
      if (inlineScripts.length) items.push(inlineScripts.length + ' <script> (lines ' + inlineScripts.map((s) => s.line).join(', ') + ')');
      if (handlers.length) items.push(handlers.length + ' ' + uniq(handlers.map((h) => h.attr)).join(', ') + ' (' + t.lines + ' ' + uniq(handlers.map((h) => String(h.line))).join(', ') + ')');
      if (jsLinks.length) items.push(jsLinks.length + ' javascript: (lines ' + jsLinks.map((j) => j.line).join(', ') + ')');
      push({ id: 'inline', level: 'info', title: t.inline, detail: t.inlineD, items });
    }
    const dyn = inlineScripts.filter((s) => s.dynamic);
    if (dyn.length) push({ id: 'inline-dynamic', level: 'info', title: t.dynInline, detail: t.dynInlineD, items: dyn.map((s) => t.line + ' ' + s.line) });
    if (metaCsp.length) push({ id: 'meta-csp', level: 'check', title: t.metaCsp, detail: t.metaCspD, items: metaCsp.map((m) => t.line + ' ' + m.line + ': ' + m.value.slice(0, 160)) });

    // ---- vendors present
    const allUrls = resources.map((r) => r.url).concat([...codeHosts.values()].map((c) => c.url));
    for (const r of resources) {
      // gtag id is in the query string of the loader; also look for ids in code
    }
    const vendorHits = [];
    for (const v of VENDORS) {
      let hit = allUrls.some((u) => v.test(u));
      if (!hit && (v.id === 'ga4' || v.id === 'gads')) {
        const want = v.id === 'ga4' ? /gtag\(\s*['"]config['"]\s*,\s*['"]G-/ : /gtag\(\s*['"]config['"]\s*,\s*['"]AW-/;
        hit = inlineScripts.some((s) => want.test(s.text));
      }
      if (hit) vendorHits.push(v);
    }

    // ---- build policies
    const policy = buildPolicy({ resources, codeHosts, vendorHits, inlineScripts, inlineStyles, handlers, jsLinks, self, googleTld: opts.googleTld, isSame });
    const strict = buildPolicy({ resources, codeHosts, vendorHits, inlineScripts, inlineStyles, handlers, jsLinks, self, googleTld: opts.googleTld, isSame, strict: true });

    // ---- check against current CSP
    let current = null;
    const cspText = opts.csp || (metaCsp.find((m) => !m.reportOnly) || {}).value;
    if (cspText) {
      const pol = parseCsp(cspText);
      const blocked = [];
      const seen = new Set();
      for (const r of resources) {
        const dir = RESOURCE_DIR[r.kind];
        if (!dir) continue;
        const res = allowsUrl(pol, dir, r.url, self, r.attrs);
        if (!res.ok) { const k = res.by + '|' + r.url.origin + r.url.path; seen.add(res.by + '|' + r.url.origin); if (!seen.has(k)) { seen.add(k); blocked.push({ directive: res.by, what: r.kind, url: r.url.href, line: r.line, strictDynamic: !!res.strictDynamic }); } }
      }
      for (const v of vendorHits) {
        for (const [d, list] of Object.entries(v.dirs)) {
          const dir = d === 'script-src' ? 'script-src-elem' : d;
          for (const src of list) {
            const u = parseUrl(src.replace('*.', 'x.'));
            if (!u) continue;
            const res = allowsUrl(pol, dir, u, self, null);
            if (!res.ok) { const k = res.by + '|' + src; if (!seen.has(k) && !seen.has(res.by + '|' + src.replace(/\/$/, ''))) { seen.add(k); blocked.push({ directive: res.by, what: v.name, url: src, vendor: true, strictDynamic: !!res.strictDynamic }); } }
          }
        }
      }
      for (const s of inlineScripts) { const r = allowsInline(pol, 'script-src-elem', s.text, s.attrs); if (!r.ok) blocked.push({ directive: r.by, what: 'inline <script>', url: s.hash, line: s.line }); }
      for (const h of handlers) { const r = allowsInline(pol, 'script-src-attr', h.value, null); if (!r.ok) { blocked.push({ directive: r.by, what: h.attr + '=', url: h.value.slice(0, 60), line: h.line }); } }
      const tagStyles = inlineStyles.filter((s) => !s.attr);
      for (const s of tagStyles) { const r = allowsInline(pol, 'style-src-elem', s.text, null); if (!r.ok) blocked.push({ directive: r.by, what: 'inline <style>', url: 'sha256-' + sha256Base64(s.text), line: s.line }); }
      const attrStyles = inlineStyles.filter((s) => s.attr);
      if (attrStyles.length) { const r = allowsInline(pol, 'style-src-attr', null, null); if (!r.ok) blocked.push({ directive: r.by, what: 'style="…" ×' + attrStyles.length, url: '', line: attrStyles[0].line }); }
      current = { text: cspText.trim(), directives: Object.keys(pol), blocked, lint: lintCsp(pol, t) };
      if (blocked.some((b) => !b.vendor)) push({ id: 'csp-blocks', level: 'fix', title: blocked.filter((b) => !b.vendor).length + ' ' + t.blocked, detail: '', items: blocked.filter((b) => !b.vendor).map((b) => b.directive + ' ✗ ' + b.what + ' ' + b.url + (b.line ? ' (' + t.line + ' ' + b.line + ')' : '')) });
      if (blocked.some((b) => b.vendor)) push({ id: 'csp-vendor', level: 'check', title: t.vendorOff + ': ' + uniq(blocked.filter((b) => b.vendor).map((b) => b.what)).join(', '), detail: '', items: blocked.filter((b) => b.vendor).map((b) => b.directive + ' ✗ ' + b.url) });
      for (const n of current.lint) if (n.level !== 'info') push({ id: 'csp-lint', level: n.level, title: n.text, detail: '', items: [] });
    }

    const counts = {
      outside: uniq(resources.filter((r) => !isSame(r.url) && r.kind !== 'form').map((r) => r.url.origin)).length,
      scripts: resources.filter((r) => r.kind === 'script').length,
      inline: inlineScripts.length, handlers: handlers.length,
      otherHttpLinks: otherHttp.length
    };
    let verdict = 'clean';
    if (!tags.length) verdict = 'empty';
    else if (findings.some((f) => f.level === 'fix')) verdict = 'fix';
    else if (findings.some((f) => f.level === 'check')) verdict = 'check';
    const order = { fix: 0, check: 1, info: 2, ok: 3 };
    findings.sort((a, b) => order[a.level] - order[b.level]);
    return {
      tool: 'aduana', version: VERSION, lang, verdict, self: self ? self.origin : null,
      counts, findings, vendors: vendorHits.map((v) => ({ id: v.id, name: v.name, doc: v.doc, official: v.official })),
      policy, strictPolicy: strict, current,
      inlineHashes: inlineScripts.map((s) => ({ line: s.line, hash: s.hash, dynamic: s.dynamic })),
      codeHosts: [...codeHosts.values()].filter((c) => !(self && isSame(c.url))).map((c) => c.url.origin)
    };
  }

  function uniq(a) { return [...new Set(a)]; }

  function buildPolicy(ctx) {
    const { resources, vendorHits, inlineScripts, inlineStyles, handlers, jsLinks, self, isSame, strict } = ctx;
    const d = {};
    const addTo = (dir, v) => { (d[dir] = d[dir] || new Set()).add(v); };
    addTo('default-src', "'self'");
    const originOf = (u) => {
      if (isSame(u)) return "'self'";
      return (u.scheme === 'http' ? 'https' : u.scheme) + '://' + u.host + (u.port && u.port !== '443' && u.port !== '80' ? ':' + u.port : '');
    };
    for (const r of resources) {
      const dir = POLICY_DIR[r.kind];
      if (!dir) continue;
      if (DEAD_HOSTS.some(([re]) => re.test(r.url.host)) && (r.kind === 'script' || r.kind === 'style')) continue;
      const v = vendorHits.find((x) => x.test(r.url));
      if (v && v.dirs[dir]) continue;
      addTo(dir, originOf(r.url));
    }
    for (const v of vendorHits) for (const [dir, list] of Object.entries(v.dirs)) for (const s of list) addTo(dir, s);
    if (vendorHits.some((v) => v.googleTld) && ctx.googleTld) {
      for (const tld of String(ctx.googleTld).split(/[,\s]+/).filter(Boolean)) {
        const host = 'https://*.google.' + tld.replace(/^\.+/, '').toLowerCase();
        addTo('img-src', host); addTo('connect-src', host);
      }
    }
    for (const s of ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'media-src', 'manifest-src', 'worker-src']) if (d[s]) d[s].add("'self'");
    // Inline code
    const needsInlineScript = inlineScripts.length || handlers.length || jsLinks.length;
    if (needsInlineScript) {
      addTo('script-src', "'self'");
      const dynamic = inlineScripts.some((s) => s.dynamic);
      if (strict && !handlers.length && !jsLinks.length && !dynamic) for (const s of inlineScripts) addTo('script-src', "'" + s.hash + "'");
      else addTo('script-src', "'unsafe-inline'");
    }
    if (inlineStyles.length) { addTo('style-src', "'self'"); addTo('style-src', "'unsafe-inline'"); }
    if (resources.some((r) => r.kind === 'img')) addTo('img-src', 'data:');
    addTo('object-src', "'none'");
    d['object-src'] = new Set(["'none'"]);
    addTo('base-uri', "'self'");
    addTo('form-action', "'self'");
    addTo('frame-ancestors', "'self'");
    const order = ['default-src', 'script-src', 'style-src', 'img-src', 'font-src', 'connect-src', 'frame-src', 'media-src', 'manifest-src', 'worker-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'];
    const sortSrc = (a, b) => (a.startsWith("'") === b.startsWith("'") ? (a < b ? -1 : a > b ? 1 : 0) : a.startsWith("'") ? -1 : 1);
    const parts = order.filter((k) => d[k]).map((k) => k + ' ' + [...d[k]].sort(sortSrc).join(' '));
    const value = parts.join('; ');
    return { value, directives: Object.fromEntries(order.filter((k) => d[k]).map((k) => [k, [...d[k]].sort(sortSrc)])), unsafeInline: !!(d['script-src'] && d['script-src'].has("'unsafe-inline'")) };
  }

  function serverSnippets(value) {
    const q = value.replace(/"/g, '\\"');
    return {
      header: 'Content-Security-Policy-Report-Only: ' + value,
      nginx: 'add_header Content-Security-Policy-Report-Only "' + q + '" always;',
      apache: 'Header always set Content-Security-Policy-Report-Only "' + q + '"',
      php: "header(\"Content-Security-Policy-Report-Only: " + q + "\");",
      netlify: '/*\n  Content-Security-Policy-Report-Only: ' + value
    };
  }

  // ---------------------------------------------------------------- text report
  function toText(res) {
    const t = T[res.lang];
    const L = [];
    L.push('Aduana ' + res.version + '  ·  ' + t.origin + ': ' + (res.self || '?'));
    L.push('');
    const vt = { fix: t.vFix, check: t.vCheck, clean: t.vClean, empty: t.vEmpty }[res.verdict];
    const vp = { fix: t.vFixP, check: t.vCheckP, clean: t.vCleanP, empty: t.vEmptyP }[res.verdict];
    L.push('>> ' + vt.toUpperCase() + ' — ' + vp);
    if (res.verdict === 'empty') return L.join('\n');
    L.push('');
    L.push(res.counts.outside + ' ' + t.parties + ' · ' + res.counts.scripts + ' ' + t.scripts + ' · ' + res.counts.inline + ' ' + t.inlineN + ' · ' + res.counts.handlers + ' ' + t.handlers + (res.counts.otherHttpLinks ? ' · ' + res.counts.otherHttpLinks + ' ' + t.otherHttp : ''));
    L.push('');
    const tagOf = { fix: '[FIX]  ', check: '[CHECK]', info: '[INFO] ', ok: '[OK]   ' };
    if (res.lang === 'es') Object.assign(tagOf, { fix: '[CORREGIR]', check: '[REVISAR] ', info: '[INFO]    ', ok: '[OK]      ' });
    for (const f of res.findings) {
      L.push(tagOf[f.level] + ' ' + f.title);
      if (f.detail) L.push('        ' + f.detail);
      for (const it of f.items.slice(0, 12)) L.push('        - ' + it);
      if (f.items.length > 12) L.push('        … +' + (f.items.length - 12));
    }
    if (res.vendors.length) {
      L.push('');
      L.push(res.lang === 'es' ? 'Servicios reconocidos:' : 'Services recognised:');
      for (const v of res.vendors) L.push('  - ' + v.name + (v.official ? '  (' + t.vendorOff + ': ' + v.doc + ')' : '  (' + t.vendorUnoff + ' ' + v.doc + ')'));
      if (res.vendors.some((v) => v.id === 'ga4' || v.id === 'gads')) L.push('  ' + t.gTld);
    }
    if (res.current) {
      L.push('');
      L.push(t.cspHead + ': ' + res.current.text.slice(0, 200) + (res.current.text.length > 200 ? '…' : ''));
      if (!res.current.blocked.length) L.push('  ' + t.allowedAll);
    }
    L.push('');
    L.push('== ' + t.policyStarter);
    L.push('Content-Security-Policy-Report-Only: ' + res.policy.value);
    if (res.strictPolicy.value !== res.policy.value) {
      L.push('');
      L.push('== ' + t.policyStrict);
      L.push('Content-Security-Policy-Report-Only: ' + res.strictPolicy.value);
    }
    L.push('');
    L.push(t.how);
    L.push(t.limitAllow);
    return L.join('\n');
  }

  return { VERSION, analyze, toText, serverSnippets, parseCsp, lintCsp, VENDORS, T, sha256Base64, _matchSource: matchSource, _allowsUrl: allowsUrl, _allowsInline: allowsInline, _parseUrl: parseUrl, _tokenize: tokenize, _regDomain: regDomain };
});

// ---------------------------------------------------------------- CLI
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const A = module.exports;
  const args = process.argv.slice(2);
  const opt = { lang: 'en' };
  const files = [];
  let fmt = 'text', sri = null, server = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--es') opt.lang = 'es';
    else if (a === '--lang') opt.lang = args[++i];
    else if (a === '--json') fmt = 'json';
    else if (a === '--policy') fmt = 'policy';
    else if (a === '--origin') opt.origin = args[++i];
    else if (a === '--csp') opt.csp = args[++i];
    else if (a === '--csp-file') opt.csp = fs.readFileSync(args[++i], 'utf8');
    else if (a === '--google-tld') opt.googleTld = args[++i];
    else if (a === '--server') server = args[++i];
    else if (a === '--sri') sri = args[++i];
    else if (a === '--demo') files.push(path.join(__dirname, 'fixtures', (args[i + 1] && !args[i + 1].startsWith('-') ? args[++i] : 'shop') + '.html'));
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node aduana.js page.html [--csp "<current policy>"] [--origin https://www.example.com] [--google-tld cl] [--es] [--json|--policy] [--server nginx|apache|php|netlify]\n       node aduana.js --sri file.js     (prints integrity="sha384-…")\n       node aduana.js --demo [shop|clean|strict]\n       cat page.html | node aduana.js -\nExit code: 0 clean, 1 worth checking, 2 fix this first, 3 bad input.');
      process.exit(0);
    } else files.push(a);
  }
  if (sri) {
    const crypto = require('crypto');
    const h = crypto.createHash('sha384').update(fs.readFileSync(sri)).digest('base64');
    console.log('integrity="sha384-' + h + '" crossorigin="anonymous"');
    process.exit(0);
  }
  let html = '';
  try {
    if (!files.length || files[0] === '-') html = fs.readFileSync(0, 'utf8');
    else html = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  } catch (e) {
    console.error('aduana: cannot read input: ' + e.message);
    process.exit(3);
  }
  const res = A.analyze(html, opt);
  if (fmt === 'json') console.log(JSON.stringify(res, null, 2));
  else if (fmt === 'policy' || server) {
    const s = A.serverSnippets(res.policy.value);
    console.log(server ? (s[server] || s.header) : s.header);
  } else console.log(A.toText(res));
  process.exit({ clean: 0, check: 1, fix: 2, empty: 3 }[res.verdict]);
}
