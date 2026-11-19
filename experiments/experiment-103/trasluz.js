#!/usr/bin/env node
/*
 * Trasluz — hold a web page or an email up to the light: see the text an AI assistant reads
 * and a person never sees (hidden CSS, white-on-white, comments, alt/aria text, invisible
 * Unicode), and the instructions aimed at the AI inside it.
 * Offline, zero dependencies. Works in Node 18+ and in the browser (window.Trasluz).
 * Daily Security Lab · Experiment 103 · MIT
 */
(function (root) {
  'use strict';
  var VERSION = '1.0.0';
  var ORDER = { low: 1, medium: 2, high: 3 };

  // ---------------------------------------------------------------- i18n
  var M = {
    en: {
      verdict: { high: 'HIGH RISK', medium: 'Review', low: 'Minor notes', clean: 'No signals' },
      kind: { html: 'web page', email: 'email', text: 'text' },
      reason: {
        'hidden-attr': 'hidden attribute', 'display-none': 'display:none', 'visibility': 'visibility:hidden',
        'opacity': 'opacity:0', 'font-size': 'font size 0', 'mso-hide': 'mso-hide:all (Outlook)',
        'collapsed': 'zero height with overflow hidden', 'tiny-box': '1px box with overflow hidden',
        'clipped': 'clipped (screen-reader-only pattern)', 'scale': 'transform: scale(0)',
        'offscreen': 'moved off-screen', 'transparent': 'transparent text color',
        'same-color': 'text color same as background', 'template': '<template> element',
        'noscript': '<noscript> element'
      },
      label: {
        override: 'tells it to ignore its instructions', address: 'addresses an AI directly',
        secrecy: 'asks to keep something from the user', sysprompt: 'asks for the system prompt or its instructions',
        newinstr: 'announces new instructions', tokens: 'uses chat-format control tokens',
        exfilimg: 'markdown image that would carry data out in its URL', send: 'asks to send or forward something to an email address',
        secrets: 'mentions passwords, keys or seed phrases', manip: 'asks for a favorable rating or recommendation',
        role: 'role label such as "assistant:"', fromnow: '"from now on" style order', search: 'asks to search the mailbox, folders or files',
        respond: 'dictates how the AI must answer'
      },
      msg: {
        'hidden-instructions': function (a) { return 'Hidden text (' + a.reason + ') written for an AI: ' + a.labels + '. A person reading this never sees it; an assistant that summarizes or acts on it does.'; },
        'hidden-weak': function (a) { return 'Hidden text (' + a.reason + ') with a sign aimed at an AI: ' + a.labels + '. Read it before an assistant does.'; },
        'hidden-long': function (a) { return a.n + ' characters of hidden text (' + a.reason + '). Not an attack by itself, but only machines read it: check what it says.'; },
        'hidden-short': function (a) { return 'Short hidden text (' + a.reason + '), often a legitimate email preview line.'; },
        'comment-instructions': function (a) { return 'HTML comment written for an AI: ' + a.labels + '. Browsers hide comments; many AI tools read the raw page.'; },
        'comment-long': function (a) { return 'Long HTML comment (' + a.n + ' characters). Only machines read it.'; },
        'attr-instructions': function (a) { return 'The ' + a.attr + ' attribute is written for an AI: ' + a.labels + '.'; },
        'visible-instructions': function (a) { return 'Visible text written for an AI: ' + a.labels + '. It does not need to be hidden to work, so treat this content as untrusted.'; },
        'plain-instructions': function (a) { return 'The plain-text version of this email (people usually see only the HTML one) is written for an AI: ' + a.labels + '.'; },
        'plain-differs': function (a) { return 'The plain-text version says ' + a.n + ' thing(s) the HTML version you see does not. AI tools often read the plain-text version.'; },
        'unicode-tags': function (a) { return 'Invisible Unicode Tag characters hide this text from you, not from the AI: "' + a.decoded + '"'; },
        'variation-selectors': function (a) { return a.n + ' invisible variation selectors in a row: a known way to smuggle data inside an emoji or a letter.'; },
        'zero-width-split': function (a) { return a.n + ' words split by invisible zero-width characters: a trick to slip phrases past filters.'; },
        'bidi': function (a) { return a.n + ' text-direction control character(s): they can make text display in a different order than the AI reads it.'; }
      },
      head: 'Trasluz', hidden: 'What only an AI reads', none: 'No findings.', chars: 'chars', blocks: 'hidden blocks',
      notInput: 'Empty input. Paste HTML, an email source (.eml) or text.'
    },
    es: {
      verdict: { high: 'RIESGO ALTO', medium: 'Revisar', low: 'Detalles menores', clean: 'Sin señales' },
      kind: { html: 'página web', email: 'correo', text: 'texto' },
      reason: {
        'hidden-attr': 'atributo hidden', 'display-none': 'display:none', 'visibility': 'visibility:hidden',
        'opacity': 'opacity:0', 'font-size': 'tamaño de letra 0', 'mso-hide': 'mso-hide:all (Outlook)',
        'collapsed': 'altura 0 con overflow oculto', 'tiny-box': 'caja de 1px con overflow oculto',
        'clipped': 'recortado (patrón solo para lectores de pantalla)', 'scale': 'transform: scale(0)',
        'offscreen': 'movido fuera de la pantalla', 'transparent': 'color de letra transparente',
        'same-color': 'letra del mismo color que el fondo', 'template': 'elemento <template>',
        'noscript': 'elemento <noscript>'
      },
      label: {
        override: 'le pide ignorar sus instrucciones', address: 'se dirige directamente a una IA',
        secrecy: 'pide ocultarle algo al usuario', sysprompt: 'pide el prompt del sistema o sus instrucciones',
        newinstr: 'anuncia instrucciones nuevas', tokens: 'usa marcas de control de chat',
        exfilimg: 'imagen markdown que sacaría datos en su URL', send: 'pide enviar o reenviar algo a un correo',
        secrets: 'menciona contraseñas, claves o frases semilla', manip: 'pide una valoración o recomendación favorable',
        role: 'etiqueta de rol como "assistant:"', fromnow: 'orden del tipo "a partir de ahora"', search: 'pide buscar en el buzón, carpetas o archivos',
        respond: 'dicta cómo debe responder la IA'
      },
      msg: {
        'hidden-instructions': function (a) { return 'Texto oculto (' + a.reason + ') escrito para una IA: ' + a.labels + '. Quien lee nunca lo ve; un asistente que lo resume o actúa sobre él, sí.'; },
        'hidden-weak': function (a) { return 'Texto oculto (' + a.reason + ') con una señal dirigida a una IA: ' + a.labels + '. Léelo antes de que lo lea un asistente.'; },
        'hidden-long': function (a) { return a.n + ' caracteres de texto oculto (' + a.reason + '). No es un ataque por sí solo, pero solo lo leen las máquinas: revisa qué dice.'; },
        'hidden-short': function (a) { return 'Texto oculto corto (' + a.reason + '), a menudo la línea de vista previa legítima de un correo.'; },
        'comment-instructions': function (a) { return 'Comentario HTML escrito para una IA: ' + a.labels + '. El navegador oculta los comentarios; muchas herramientas de IA leen la página en bruto.'; },
        'comment-long': function (a) { return 'Comentario HTML largo (' + a.n + ' caracteres). Solo lo leen las máquinas.'; },
        'attr-instructions': function (a) { return 'El atributo ' + a.attr + ' está escrito para una IA: ' + a.labels + '.'; },
        'visible-instructions': function (a) { return 'Texto visible escrito para una IA: ' + a.labels + '. No necesita estar oculto para funcionar: trata este contenido como no confiable.'; },
        'plain-instructions': function (a) { return 'La versión de texto plano de este correo (normalmente solo se ve la HTML) está escrita para una IA: ' + a.labels + '.'; },
        'plain-differs': function (a) { return 'La versión de texto plano dice ' + a.n + ' cosa(s) que la versión HTML que ves no dice. Las herramientas de IA suelen leer la de texto plano.'; },
        'unicode-tags': function (a) { return 'Caracteres Unicode Tag invisibles esconden este texto de ti, no de la IA: "' + a.decoded + '"'; },
        'variation-selectors': function (a) { return a.n + ' selectores de variación invisibles seguidos: una forma conocida de esconder datos dentro de un emoji o una letra.'; },
        'zero-width-split': function (a) { return a.n + ' palabras partidas por caracteres invisibles de ancho cero: un truco para que una frase pase los filtros.'; },
        'bidi': function (a) { return a.n + ' carácter(es) de control de dirección del texto: pueden mostrar el texto en un orden distinto al que lee la IA.'; }
      },
      head: 'Trasluz', hidden: 'Lo que solo lee una IA', none: 'Sin hallazgos.', chars: 'caracteres', blocks: 'bloques ocultos',
      notInput: 'Entrada vacía. Pega HTML, el código fuente de un correo (.eml) o texto.'
    }
  };
  function T(lang) { return M[lang] || M.en; }

  // ---------------------------------------------------------------- phrase rules (EN + ES)
  // strong: one hit is enough in hidden content. weak: needs two, or one plus hidden context.
  var RULES = [
    { id: 'override', strong: true, re: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|every\s+)?(of\s+)?(the\s+|your\s+|my\s+)?(previous|prior|above|earlier|preceding|original|system|other)\s+(instructions?|prompts?|rules|directions|guidelines)/i },
    { id: 'override', strong: true, re: /\b(ignora|olvida|omite|desobedece)\s+(todas\s+|cualquier\s+)?(las\s+|tus\s+)?(instrucciones|indicaciones|reglas|órdenes)(\s+(anteriores|previas|originales|del sistema))?/i },
    { id: 'override', strong: true, re: /\bignora\s+(todo\s+)?lo\s+anterior\b/i },
    { id: 'address', strong: true, re: /\b(if|when)\s+you\s+are\s+(an?\s+)?(ai|a\.i\.|artificial intelligence|assistant|language model|large language model|llm|chatbot|agent|summari[sz]er|bot|copilot)\b/i },
    { id: 'address', strong: true, re: /\b(note|message|instructions?|reminder|attention)\s+(to|for)\s+(the\s+|any\s+)?(ai|a\.i\.|assistant|llm|language model|model|agent|summari[sz]er|bot|copilot|chatbot)s?\b/i },
    { id: 'address', strong: true, re: /\b(dear|hey|hello|attention)\s+(ai|assistant|llm|agent|chatgpt|claude|gemini|copilot|summari[sz]er)\b/i },
    { id: 'address', strong: true, re: /\bsi\s+(eres|sos)\s+(una?\s+)?(ia|inteligencia artificial|asistente|modelo de lenguaje|modelo|agente|bot|chatbot|llm)\b/i },
    { id: 'address', strong: true, re: /\b(nota|mensaje|instrucci[oó]n|instrucciones|aviso)\s+para\s+(el\s+|la\s+|cualquier\s+)?(ia|asistente|modelo|agente|bot|chatbot|llm)\b/i },
    { id: 'secrecy', strong: true, re: /\b(do\s+not|don'?t|never|without)\s+(tell|telling|mention|mentioning|reveal|revealing|inform|informing|show|showing|alert|alerting|notify|notifying)\s+(this\s+|it\s+|anything\s+)?(to\s+)?(the\s+)?(user|human|reader|recipient|person)/i },
    { id: 'secrecy', strong: true, re: /\b(no|sin)\s+(le\s+)?(digas|decir|menciones|mencionar|reveles|revelar|muestres|mostrar|informes|informar|avises|avisar)\s+(nada\s+|esto\s+)?(de\s+esto\s+)?al\s+(usuario|lector|destinatario|humano)/i },
    { id: 'sysprompt', strong: true, re: /\b(reveal|print|show|repeat|output|leak|share|send)\b[^.\n]{0,40}\b(system\s+prompt|your\s+(instructions|prompt|rules))/i },
    { id: 'sysprompt', strong: true, re: /\b(revela|imprime|muestra|repite|comparte|env[ií]a)\b[^.\n]{0,40}\b(prompt\s+del\s+sistema|tus\s+instrucciones)/i },
    { id: 'newinstr', strong: true, re: /\b(new|updated|important|additional|real|actual)\s+(system\s+)?instructions?\s*[:\-]/i },
    { id: 'newinstr', strong: true, re: /\b(nuevas|verdaderas|importantes)\s+instrucciones\b/i },
    { id: 'tokens', strong: true, re: /<\|(im_start|im_end|system|user|assistant|endoftext|start_header_id|eot_id)\|>|\[\/?INST\]|<<\/?SYS>>|<\/?(system|instructions|important)>/i },
    { id: 'exfilimg', strong: true, re: /!\[[^\]]*\]\(\s*https?:\/\/[^)\s]*(\?|\{|%7B)[^)\s]*\)/i },
    { id: 'send', re: /\b(forward|send|email|e-mail|cc|bcc)\b[^.\n]{0,80}\b[\w.+-]+@[\w-]+(\.[\w-]+)+/i },
    { id: 'send', re: /\b(reenv[ií]a|env[ií]a|manda|reenviar|enviar|mandar)\b[^.\n]{0,80}\b[\w.+-]+@[\w-]+(\.[\w-]+)+/i },
    { id: 'secrets', re: /\b(seed\s+phrase|recovery\s+phrase|private\s+keys?|api[\s_-]?keys?|passwords?|credentials|frase\s+semilla|clave\s+privada|claves\s+privadas|contrase[ñn]as?|credenciales)\b/i },
    { id: 'manip', re: /\b(rate|rank|score|recommend|evaluate|review|describe)\b[^.\n]{0,60}\b(highly|positively|favorabl[ey]|best|top|excellent|5\s+stars?|five\s+stars?|well[\s-]qualified|ideal)\b/i },
    { id: 'manip', re: /\b(this\s+candidate|the\s+candidate|this\s+applicant)\b[^.\n]{0,60}\b(hire|qualified|recommend|best|perfect)/i },
    { id: 'manip', re: /\b(recomienda|califica|eval[uú]a|valora|describe)\b[^.\n]{0,60}\b(positivamente|favorablemente|excelente|el\s+mejor|la\s+mejor|5\s+estrellas|cinco\s+estrellas|ideal)\b/i },
    { id: 'role', re: /(^|\n)\s*(system|assistant|ai|agent|sistema|asistente)\s*:\s*\S/i },
    { id: 'fromnow', re: /\b(from\s+now\s+on|starting\s+now|a\s+partir\s+de\s+ahora|de\s+ahora\s+en\s+adelante)\b/i },
    { id: 'search', re: /\b(search|look\s+through|scan|go\s+through|check)\b[^.\n]{0,40}\b(inbox|mailbox|folders?|files|emails|drive|documents)\b/i },
    { id: 'search', re: /\b(busca|revisa|recorre|escanea)\b[^.\n]{0,40}\b(bandeja|buz[oó]n|carpetas?|archivos|correos|documentos|drive)\b/i },
    { id: 'respond', re: /\b(respond|reply|answer|summari[sz]e)\s+(only\s+)?(with|by\s+saying|that)\b/i },
    { id: 'respond', re: /\b(responde|contesta|resume)\s+(solo\s+|[uú]nicamente\s+)?(con|diciendo|que)\b/i }
  ];

  // ---------------------------------------------------------------- unicode helpers
  var ZW = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD\u034F\u115F\u1160\u3164\uFFA0\u180E]/g;
  var BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

  function stripInvisible(s) {
    return s.replace(/[\u{E0000}-\u{E007F}]/gu, '').replace(/[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu, '')
      .replace(ZW, '').replace(BIDI, '');
  }
  function norm(s) {
    var t = stripInvisible(s);
    try { t = t.normalize('NFKC'); } catch (e) { /* old engines */ }
    return t.replace(/[\u00A0\s]+/g, ' ').trim();
  }
  function clip(s, n) { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function unicodeFindings(text) {
    var out = [], m;
    // Unicode Tags, except flag sequences (black flag U+1F3F4 followed by tags ending in U+E007F)
    var re = /(\u{1F3F4}[\u{E0020}-\u{E007E}]+\u{E007F})|([\u{E0000}-\u{E007F}]+)/gu;
    while ((m = re.exec(text))) {
      if (m[1]) continue;
      var run = Array.from(m[2]);
      if (run.length < 4) continue;
      var decoded = run.map(function (c) { var cp = c.codePointAt(0) - 0xE0000; return cp >= 32 && cp < 127 ? String.fromCharCode(cp) : ''; }).join('');
      out.push({ rule: 'unicode-tags', severity: 'high', args: { decoded: clip(decoded, 160) } });
    }
    var vs = /(?:[\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]){8,}/gu;
    while ((m = vs.exec(text))) out.push({ rule: 'variation-selectors', severity: 'high', args: { n: Array.from(m[0]).length } });
    var split = text.match(/[\p{L}\p{N}][\u200B\u200C\u200D\u2060\uFEFF]+[\p{L}\p{N}]/gu);
    if (split && split.length >= 3) out.push({ rule: 'zero-width-split', severity: 'medium', args: { n: split.length } });
    var bidi = text.match(BIDI);
    if (bidi) out.push({ rule: 'bidi', severity: 'medium', args: { n: bidi.length } });
    return out;
  }

  function phraseHits(text) {
    var t = norm(text), hits = [], seen = {};
    RULES.forEach(function (r) {
      if (seen[r.id]) return;
      var m = r.re.exec(t);
      if (m) {
        seen[r.id] = 1;
        var a = Math.max(0, m.index - 40), b = Math.min(t.length, m.index + m[0].length + 60);
        hits.push({ id: r.id, strong: !!r.strong, snippet: (a > 0 ? '…' : '') + t.slice(a, b) + (b < t.length ? '…' : '') });
      }
    });
    return hits;
  }
  function strength(hits) {
    var s = hits.filter(function (h) { return h.strong; }).length, w = hits.length - s;
    return { strong: s, weak: w, any: hits.length > 0, decisive: s > 0 || w >= 2 };
  }

  // ---------------------------------------------------------------- HTML entities
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', zwnj: '\u200C', zwj: '\u200D', shy: '\u00AD',
    copy: '©', reg: '®', trade: '™', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    bull: '•', middot: '·', euro: '€', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', aacute: 'á', eacute: 'é', iacute: 'í',
    oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
    uuml: 'ü', Uuml: 'Ü', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', lrm: '\u200E', rlm: '\u200F' };
  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, function (all, e) {
      if (e[0] === '#') {
        var cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try { return cp > 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : all; } catch (x) { return all; }
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : all;
    });
  }

  // ---------------------------------------------------------------- CSS helpers
  function parseDecls(s) {
    var o = {};
    (s || '').replace(/\/\*[\s\S]*?\*\//g, '').split(';').forEach(function (d) {
      var i = d.indexOf(':'); if (i < 0) return;
      var k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).replace(/!\s*important/i, '').trim().toLowerCase();
      if (k) o[k] = v;
    });
    return o;
  }
  // top-level rules only: rules inside @media/@supports are conditional (mobile/desktop swaps) and are skipped
  function parseStyleSheet(css) {
    var rules = [], i = 0, n = css.length, depth = 0, start = 0, sel = null, skip = false;
    css = css.replace(/\/\*[\s\S]*?\*\//g, ''); n = css.length;
    for (i = 0; i < n; i++) {
      var c = css[i];
      if (c === '{') {
        if (depth === 0) { sel = css.slice(start, i).trim(); skip = sel[0] === '@'; start = i + 1; }
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) {
          if (!skip && sel) {
            var decls = parseDecls(css.slice(start, i));
            sel.split(',').forEach(function (one) {
              one = one.trim();
              var m = /^([a-z][a-z0-9]*)?((?:[.#][\w-]+)*)$/i.exec(one);
              if (!m || (!m[1] && !m[2])) return; // complex selectors are not evaluated
              var classes = [], id = null;
              (m[2].match(/[.#][\w-]+/g) || []).forEach(function (p) { if (p[0] === '.') classes.push(p.slice(1)); else id = p.slice(1); });
              rules.push({ tag: m[1] ? m[1].toLowerCase() : null, classes: classes, id: id, decls: decls });
            });
          }
          start = i + 1; sel = null; skip = false;
        }
        if (depth < 0) depth = 0;
      }
    }
    return rules;
  }
  function lengthOf(v) {
    var m = /^(-?\d*\.?\d+)\s*(px|pt|em|rem|%|vw|vh|ex|ch|cm|mm|in)?$/.exec((v || '').trim());
    return m ? { n: parseFloat(m[1]), unit: m[2] || '' } : null;
  }
  var NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0], snow: [255, 250, 250, 1], ivory: [255, 255, 240, 1],
    whitesmoke: [245, 245, 245, 1], ghostwhite: [248, 248, 255, 1], gray: [128, 128, 128, 1], grey: [128, 128, 128, 1], silver: [192, 192, 192, 1],
    red: [255, 0, 0, 1], green: [0, 128, 0, 1], blue: [0, 0, 255, 1], yellow: [255, 255, 0, 1], navy: [0, 0, 128, 1], lightgray: [211, 211, 211, 1], lightgrey: [211, 211, 211, 1] };
  function parseColor(v) {
    if (!v) return null; v = v.trim().toLowerCase();
    var m;
    if ((m = /^#([0-9a-f]{3,8})$/.exec(v))) {
      var h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (c) { return c + c; }).join('');
      if (h.length !== 6 && h.length !== 8) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    if ((m = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,\/]+([\d.]+%?))?\s*\)$/.exec(v))) {
      var ch = function (x) { return /%$/.test(x) ? parseFloat(x) * 2.55 : parseFloat(x); };
      var al = m[4] === undefined ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
      return [ch(m[1]), ch(m[2]), ch(m[3]), al];
    }
    return NAMED[v] || null;
  }
  function firstColor(v) {
    if (!v) return null;
    var m = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(white|black|transparent|snow|ivory|whitesmoke|ghostwhite|gray|grey|silver|red|green|blue|yellow|navy|lightgray|lightgrey)\b/i.exec(v);
    return m ? parseColor(m[0]) : null;
  }
  function lum(c) {
    var f = function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  function hiddenReason(tag, attrs, st) {
    if ('hidden' in attrs) return 'hidden-attr';
    if (tag === 'template') return 'template';
    if (tag === 'noscript') return 'noscript';
    if (st.display === 'none') return 'display-none';
    if (st.visibility === 'hidden' || st.visibility === 'collapse') return 'visibility';
    if (st['mso-hide'] === 'all') return 'mso-hide';
    if (st.opacity !== undefined && parseFloat(st.opacity) <= 0.05) return 'opacity';
    var fs = lengthOf(st['font-size']);
    if (fs && (fs.n <= 0 || ((fs.unit === 'px' || fs.unit === 'pt' || fs.unit === '') && fs.n <= 1) || ((fs.unit === 'em' || fs.unit === 'rem') && fs.n <= 0.1) || (fs.unit === '%' && fs.n <= 10))) return 'font-size';
    var ovh = /hidden|clip/.test(st.overflow || '') || /hidden|clip/.test(st['overflow-y'] || '');
    var h = lengthOf(st.height), mh = lengthOf(st['max-height']), w = lengthOf(st.width), mw = lengthOf(st['max-width']);
    if (ovh && ((h && h.n <= 0) || (mh && mh.n <= 0) || (mw && mw.n <= 0) || (w && w.n <= 0))) return 'collapsed';
    if (/rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(st.clip || '') || /inset\(\s*50%\s*\)/.test(st['clip-path'] || '')) return 'clipped';
    if (ovh && h && w && h.n <= 1 && w.n <= 1) return 'tiny-box';
    if (/scale\(\s*0(\.0+)?\s*(,\s*0(\.0+)?\s*)?\)|scale[xy]\(\s*0(\.0+)?\s*\)/.test(st.transform || '')) return 'scale';
    var off = ['left', 'top', 'right', 'text-indent', 'margin-left', 'margin-top'].some(function (k) {
      var l = lengthOf(st[k]); return l && ((l.unit === 'px' || l.unit === '') && l.n <= -500 || (l.unit === 'em' || l.unit === 'rem') && l.n <= -50);
    });
    if (off && (/absolute|fixed|relative/.test(st.position || '') || lengthOf(st['text-indent']))) return 'offscreen';
    var c = parseColor(st.color);
    if (c && c[3] <= 0.05) return 'transparent';
    return null;
  }

  // ---------------------------------------------------------------- HTML walk
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var RAW = { script: 1, style: 1, textarea: 1, title: 1, xmp: 1 };
  var BLOCK = { p: 1, div: 1, br: 1, li: 1, tr: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, table: 1, section: 1, article: 1, header: 1, footer: 1,
    ul: 1, ol: 1, blockquote: 1, pre: 1, hr: 1, center: 1, main: 1, nav: 1, aside: 1, form: 1, dd: 1, dt: 1, figure: 1, figcaption: 1, body: 1, td: 1, th: 1 };
  var TEXT_ATTRS = ['alt', 'title', 'aria-label', 'aria-description', 'placeholder', 'summary', 'label', 'content', 'value'];

  function walkHtml(html) {
    var lineStarts = [0];
    for (var q = 0; q < html.length; q++) if (html.charCodeAt(q) === 10) lineStarts.push(q + 1);
    function lineAt(off) { var lo = 0, hi = lineStarts.length - 1; while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; }

    // pass 1: style sheets
    var sheet = [], sm, sre = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
    while ((sm = sre.exec(html))) sheet = sheet.concat(parseStyleSheet(sm[1]));

    var root = { tag: '#root', hidden: null, color: null, bg: null, id: 0 };
    var stack = [root], nextId = 1;
    var visible = [], segs = [], comments = [], attrs = [];
    var i = 0, n = html.length;

    function top() { return stack[stack.length - 1]; }
    function emitText(raw, off) {
      var text = decodeEntities(raw);
      var f = top(), reason = f.hidden, key = f.hiddenBy;
      if (!reason && /\S/.test(stripInvisible(text).replace(/\u00A0/g, ' '))) {
        var fg = f.color || [0, 0, 0, 1], bg = f.bg || [255, 255, 255, 1];
        if (contrast(fg, bg) < 1.15) { reason = 'same-color'; key = f.colorBy; }
      }
      if (!reason) { visible.push(text); return; }
      var last = segs[segs.length - 1];
      if (last && last.key === key && last.reason === reason) last.text += text;
      else segs.push({ key: key, reason: reason, text: text, line: lineAt(off), tag: f.tag });
    }

    while (i < n) {
      var lt = html.indexOf('<', i);
      if (lt < 0) { emitText(html.slice(i), i); break; }
      if (lt > i) emitText(html.slice(i, lt), i);
      i = lt;
      if (html.startsWith('<!--', i)) {
        var ce = html.indexOf('-->', i + 4); if (ce < 0) ce = n;
        comments.push({ text: html.slice(i + 4, ce), line: lineAt(i) });
        i = ce + 3; continue;
      }
      if (html[i + 1] === '!' || html[i + 1] === '?') { var ge = html.indexOf('>', i); i = ge < 0 ? n : ge + 1; continue; }
      var isEnd = html[i + 1] === '/';
      var nm = /^[a-zA-Z][a-zA-Z0-9:-]*/.exec(html.slice(i + (isEnd ? 2 : 1), i + 80));
      if (!nm) { emitText('<', i); i++; continue; }
      // find end of tag, respecting quotes
      var j = i + 1, quote = null;
      while (j < n) { var c = html[j]; if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break; j++; }
      var tagSrc = html.slice(i, j + 1), tag = nm[0].toLowerCase(), tagOff = i;
      i = j + 1;
      if (isEnd) {
        for (var k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
        if (BLOCK[tag]) visible.push('\n');
        continue;
      }
      var at = {}, am, are = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g, inner = tagSrc.slice(1 + nm[0].length, -1);
      while ((am = are.exec(inner))) at[am[1].toLowerCase()] = decodeEntities(am[2] !== undefined ? am[2] : am[3] !== undefined ? am[3] : am[4] !== undefined ? am[4] : '');
      // computed style: matching sheet rules, then inline
      var st = {}, cls = (at['class'] || '').split(/\s+/).filter(Boolean);
      sheet.forEach(function (r) {
        if (r.tag && r.tag !== tag) return;
        if (r.id && r.id !== at.id) return;
        if (!r.classes.every(function (x) { return cls.indexOf(x) >= 0; })) return;
        for (var key in r.decls) st[key] = r.decls[key];
      });
      var inl = parseDecls(at.style); for (var key2 in inl) st[key2] = inl[key2];
      var parent = top();
      var frame = { tag: tag, id: nextId++, hidden: parent.hidden, hiddenBy: parent.hiddenBy, color: parent.color, colorBy: parent.colorBy, bg: parent.bg };
      var own = hiddenReason(tag, at, st);
      if (!frame.hidden && own) { frame.hidden = own; frame.hiddenBy = frame.id; }
      var col = parseColor(st.color) || (tag === 'font' ? parseColor(at.color) : null);
      if (col && col[3] > 0.05) { frame.color = col; frame.colorBy = frame.id; }
      var bgc = parseColor(st['background-color']) || firstColor(st.background) || parseColor(at.bgcolor);
      if (bgc && bgc[3] > 0.5) { frame.bg = bgc; frame.colorBy = frame.id; }
      // attributes that carry text an AI may read
      Object.keys(at).forEach(function (a) {
        if ((TEXT_ATTRS.indexOf(a) >= 0 || /^data-/.test(a)) && at[a] && at[a].length >= 12) {
          if (a === 'content' && tag !== 'meta') return;
          if (a === 'value' && !(tag === 'input' && /hidden/i.test(at.type || ''))) return;
          attrs.push({ attr: a, tag: tag, text: at[a], line: lineAt(tagOff) });
        }
      });
      if (BLOCK[tag]) visible.push('\n');
      if (RAW[tag]) {
        var closeRe = new RegExp('</' + tag + '\\s*>', 'ig'); closeRe.lastIndex = i;
        var cm = closeRe.exec(html), endRaw = cm ? cm.index : n;
        if (tag === 'title' || tag === 'textarea') { stack.push(frame); emitText(html.slice(i, endRaw), i); stack.pop(); }
        i = cm ? cm.index + cm[0].length : n;
        continue;
      }
      if (VOID[tag]) continue;
      stack.push(frame);
    }
    var vis = visible.join('').replace(/[ \t\u00A0]+/g, ' ').replace(/ *\n[\s\n]*/g, '\n').trim();
    segs = segs.filter(function (s) { return norm(s.text).length > 0; });
    return { visible: vis, segments: segs, comments: comments, attrs: attrs };
  }

  // ---------------------------------------------------------------- email (MIME) parsing
  function looksLikeEmail(s) {
    return /^(?:[\w-]+:[^\n]*\r?\n(?:[ \t][^\n]*\r?\n)*)+\r?\n/.test(s) &&
      /^(received|from|return-path|mime-version|delivered-to|subject|date|message-id|to|dkim-signature|content-type|x-[\w-]+|arc-[\w-]+|authentication-results):/im.test(s.slice(0, 200));
  }
  function splitHead(s) {
    var m = /\r?\n\r?\n/.exec(s);
    var head = m ? s.slice(0, m.index) : s, body = m ? s.slice(m.index + m[0].length) : '';
    var h = {};
    head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (l) {
      var i = l.indexOf(':'); if (i > 0) { var k = l.slice(0, i).trim().toLowerCase(); if (!(k in h)) h[k] = l.slice(i + 1).trim(); }
    });
    return { h: h, body: body };
  }
  function param(v, name) { var m = new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))', 'i').exec(v || ''); return m ? (m[1] !== undefined ? m[1] : m[2]) : null; }
  function bytesToString(bytes, charset) {
    charset = (charset || 'utf-8').toLowerCase();
    if (typeof TextDecoder !== 'undefined') {
      try { return new TextDecoder(charset).decode(new Uint8Array(bytes)); } catch (e) { /* unknown charset */ }
      try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch (e2) { /* fall through */ }
    }
    return String.fromCharCode.apply(null, bytes);
  }
  function b64bytes(s) {
    s = s.replace(/[^A-Za-z0-9+/=]/g, '');
    var bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    var out = new Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255; return out;
  }
  function qpbytes(s) {
    s = s.replace(/=\r?\n/g, ''); var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else { var cp = s.charCodeAt(i); if (cp < 128) out.push(cp); else utf8bytes(s[i]).forEach(function (b) { out.push(b); }); }
    }
    return out;
  }
  function utf8bytes(str) { return Array.from(unescape(encodeURIComponent(str))).map(function (c) { return c.charCodeAt(0); }); }
  function decodeBody(body, h) {
    var cte = (h['content-transfer-encoding'] || '').toLowerCase(), cs = param(h['content-type'], 'charset');
    if (cte === 'base64') return bytesToString(b64bytes(body), cs);
    if (cte === 'quoted-printable') return bytesToString(qpbytes(body), cs);
    return body;
  }
  function decodeWords(v) {
    return (v || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, function (all, cs, enc, data) {
      try { return enc.toLowerCase() === 'b' ? bytesToString(b64bytes(data), cs) : bytesToString(qpbytes(data.replace(/_/g, ' ')), cs); } catch (e) { return all; }
    }).replace(/\?=\s+=\?/g, '?==?');
  }
  function parseMime(raw, parts, depth) {
    var p = splitHead(raw), ct = (p.h['content-type'] || 'text/plain').toLowerCase();
    if (/^multipart\//.test(ct) && depth < 8) {
      var b = param(p.h['content-type'], 'boundary');
      if (b) {
        var chunks = p.body.split(new RegExp('\\r?\\n?--' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\r?\\n?'));
        chunks.slice(1).forEach(function (c) { if (/\S/.test(c)) parseMime(c, parts, depth + 1); });
        return p.h;
      }
    }
    if (/^text\/(html|plain)/.test(ct) && !/attachment/i.test(p.h['content-disposition'] || '')) {
      parts.push({ type: /html/.test(ct) ? 'html' : 'plain', text: decodeBody(p.body, p.h) });
    }
    return p.h;
  }

  // ---------------------------------------------------------------- analysis
  function analyze(input, opts) {
    opts = opts || {};
    var lang = opts.lang === 'es' ? 'es' : 'en', t = T(lang);
    var text = String(input == null ? '' : input).replace(/^\uFEFF/, '');
    if (!text.trim()) return { ok: false, message: t.notInput };
    var findings = [], kind, htmlParts = [], plainParts = [], subject = null;

    if (looksLikeEmail(text)) {
      kind = 'email';
      var parts = [], h = parseMime(text, parts, 0);
      subject = decodeWords(h.subject || '');
      parts.forEach(function (p) { (p.type === 'html' ? htmlParts : plainParts).push(p.text); });
    } else if (/<\s*[a-zA-Z!][^>]*>/.test(text)) { kind = 'html'; htmlParts.push(text); }
    else { kind = 'text'; plainParts.push(text); }

    function add(sev, rule, where, args, evidence) {
      findings.push({ severity: sev, rule: rule, where: where, message: t.msg[rule](args), evidence: evidence ? clip(evidence, 220) : '' });
    }
    function labels(hits) { return hits.map(function (x) { return t.label[x.id]; }).join('; '); }
    function uni(where, s) { unicodeFindings(s).forEach(function (u) { add(u.severity, u.rule, where, u.args); }); }

    if (subject) uni(lang === 'es' ? 'asunto' : 'subject', subject);

    var visibleAll = [], hiddenOut = [], hiddenChars = 0;
    htmlParts.forEach(function (html, idx) {
      var pre = htmlParts.length > 1 ? 'HTML ' + (idx + 1) + ', ' : (kind === 'email' ? 'HTML, ' : '');
      var w = walkHtml(html);
      visibleAll.push(w.visible);
      w.segments.forEach(function (s) {
        var reasonTxt = t.reason[s.reason] || s.reason, clean = norm(s.text), where = pre + (lang === 'es' ? 'línea ' : 'line ') + s.line + ' <' + s.tag + '>';
        hiddenChars += clean.length;
        hiddenOut.push({ reason: s.reason, reasonText: reasonTxt, line: s.line, tag: s.tag, text: clean });
        var hits = phraseHits(s.text), st = strength(hits);
        uni(where, s.text);
        if (s.reason === 'clipped' && !st.any) return; // screen-reader text is legitimate accessibility
        if (st.decisive) add('high', 'hidden-instructions', where, { reason: reasonTxt, labels: labels(hits) }, hits[0].snippet);
        else if (st.any) add('medium', 'hidden-weak', where, { reason: reasonTxt, labels: labels(hits) }, hits[0].snippet);
        else if (clean.length >= 200) add('medium', 'hidden-long', where, { reason: reasonTxt, n: clean.length }, clean);
        else add('low', 'hidden-short', where, { reason: reasonTxt }, clean);
      });
      w.comments.forEach(function (c) {
        var clean = norm(c.text); if (!clean || /^\[if |^<!\[endif|^\[endif\]/i.test(clean)) return;
        var where = pre + (lang === 'es' ? 'línea ' : 'line ') + c.line + ' <!-- -->', hits = phraseHits(c.text), st = strength(hits);
        uni(where, c.text);
        if (st.decisive) add('high', 'comment-instructions', where, { labels: labels(hits) }, hits[0].snippet);
        else if (clean.length >= 200) add('low', 'comment-long', where, { n: clean.length }, clean);
      });
      w.attrs.forEach(function (a) {
        var where = pre + (lang === 'es' ? 'línea ' : 'line ') + a.line + ' <' + a.tag + ' ' + a.attr + '>', hits = phraseHits(a.text), st = strength(hits);
        uni(where, a.text);
        if (st.strong) add('high', 'attr-instructions', where, { attr: a.attr, labels: labels(hits) }, hits[0].snippet);
        else if (st.decisive) add('medium', 'attr-instructions', where, { attr: a.attr, labels: labels(hits) }, hits[0].snippet);
      });
      var vh = phraseHits(w.visible).filter(function (x) { return x.strong; });
      uni(pre + (lang === 'es' ? 'texto visible' : 'visible text'), w.visible);
      if (vh.length) add('medium', 'visible-instructions', pre + (lang === 'es' ? 'texto visible' : 'visible text'), { labels: labels(vh) }, vh[0].snippet);
    });

    plainParts.forEach(function (p) {
      var where = kind === 'email' ? (lang === 'es' ? 'texto plano' : 'plain-text part') : (lang === 'es' ? 'texto' : 'text');
      uni(where, p);
      var hits = phraseHits(p), st = strength(hits);
      if (kind === 'email' && htmlParts.length) {
        if (st.decisive) add('high', 'plain-instructions', where, { labels: labels(hits) }, hits[0].snippet);
        else {
          var seen = norm(visibleAll.join(' ')).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ');
          var extra = norm(p).split(/(?<=[.!?])\s+|\n/).map(function (x) { return x.trim(); }).filter(function (x) {
            var words = x.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
            return words.split(' ').length >= 6 && seen.indexOf(words) < 0 && !/https?:\/\//.test(x);
          });
          if (extra.length >= 2) add('medium', 'plain-differs', where, { n: extra.length }, extra[0]);
        }
      } else {
        var strong = hits.filter(function (x) { return x.strong; });
        if (strong.length) add('medium', 'visible-instructions', where, { labels: labels(strong) }, strong[0].snippet);
        visibleAll.push(norm(p));
      }
    });

    findings.sort(function (a, b) { return ORDER[b.severity] - ORDER[a.severity]; });
    var counts = { high: 0, medium: 0, low: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });
    var verdict = counts.high ? 'high' : counts.medium ? 'medium' : counts.low ? 'low' : 'clean';
    return { ok: true, version: VERSION, kind: kind, subject: subject, verdict: verdict, counts: counts, findings: findings,
      hidden: hiddenOut, stats: { hiddenBlocks: hiddenOut.length, hiddenChars: hiddenChars, visibleChars: norm(visibleAll.join(' ')).length },
      visibleText: visibleAll.join('\n\n').trim() };
  }

  // Text a person actually sees: what to pass to an LLM instead of the raw page or email.
  function visibleText(input) { var r = analyze(input); return r.ok ? stripInvisible(r.visibleText) : ''; }

  function renderText(r, lang) {
    var t = T(lang);
    if (!r.ok) return r.message + '\n';
    var lines = [t.head + '  ' + t.kind[r.kind] + '  ·  ' + r.stats.hiddenBlocks + ' ' + t.blocks + ' (' + r.stats.hiddenChars + ' ' + t.chars + ')  ·  ' +
      t.verdict[r.verdict] + '  (high ' + r.counts.high + ', medium ' + r.counts.medium + ', low ' + r.counts.low + ')'];
    if (!r.findings.length) lines.push(t.none);
    r.findings.forEach(function (f) {
      lines.push('[' + (f.severity.toUpperCase() + '      ').slice(0, 6) + '] ' + f.where);
      lines.push('         ' + f.message);
      if (f.evidence) lines.push('         > ' + f.evidence);
    });
    if (r.hidden.length) {
      lines.push('', t.hidden + ':');
      r.hidden.forEach(function (h) { lines.push('  - ' + (lang === 'es' ? 'línea ' : 'line ') + h.line + ' <' + h.tag + '> [' + h.reasonText + '] ' + clip(h.text, 160)); });
    }
    return lines.join('\n') + '\n';
  }

  var api = { analyze: analyze, visibleText: visibleText, renderText: renderText, walkHtml: walkHtml, phraseHits: phraseHits, version: VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.Trasluz = api;

  // ---------------------------------------------------------------- CLI
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs');
    var args = process.argv.slice(2), o = { lang: 'en', failOn: 'high' }, file = null;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '--json') o.json = true;
      else if (a === '--lang') o.lang = args[++i];
      else if (a === '--visible') o.visible = true;
      else if (a === '--fail-on') o.failOn = args[++i];
      else if (a === '-h' || a === '--help') o.help = true;
      else if (a === '--version') { console.log(VERSION); process.exit(0); }
      else if (a[0] === '-' && a !== '-') { console.error('Unknown option ' + a); process.exit(2); }
      else file = a;
    }
    if (o.help) {
      console.log('Usage: node trasluz.js [page.html|message.eml|file.txt|-] [--json] [--lang en|es] [--fail-on high|medium|low|never] [--visible]\n' +
        '  --visible   print only the text a person sees (pass this to your AI instead of the raw page or email)\n' +
        'Exit codes: 0 ok, 1 findings at/above --fail-on (default high), 2 usage/input error.');
      process.exit(0);
    }
    if (['high', 'medium', 'low', 'never'].indexOf(o.failOn) < 0) { console.error('--fail-on must be high, medium, low or never'); process.exit(2); }
    var input;
    try { input = (!file || file === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8'); }
    catch (e) { console.error('Cannot read input: ' + e.message); process.exit(2); }
    var r = analyze(input, { lang: o.lang });
    if (!r.ok) { console.error(r.message); process.exit(2); }
    if (o.visible) process.stdout.write(stripInvisible(r.visibleText) + '\n');
    else if (o.json) console.log(JSON.stringify(r, null, 2));
    else process.stdout.write(renderText(r, o.lang));
    var lim = { high: 3, medium: 2, low: 1, never: 99 }[o.failOn];
    process.exit(!o.visible && r.findings.some(function (f) { return ORDER[f.severity] >= lim; }) ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : null);
