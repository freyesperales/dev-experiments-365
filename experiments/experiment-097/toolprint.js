#!/usr/bin/env node
/*
 * Toolprint — paste an MCP server's tools/list, see what it whispers to your AI model,
 * and fingerprint every tool so you notice when it changes after you approved it.
 * Offline, zero dependencies. Works in Node 18+ and in the browser (window.Toolprint).
 * Daily Security Lab · Experiment 097 · MIT
 */
(function (root) {
  'use strict';

  // ---------- SHA-256 (pure JS, so the browser and Node give the same synchronous result) ----------
  var K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];

  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function sha256(str) {
    var bytes = utf8(str), bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var W = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var off = 0; off < bytes.length; off += 64) {
      for (var t = 0; t < 16; t++) W[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        var s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  // Canonical JSON: sorted keys, so key order in the server's output does not change the fingerprint.
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
      .map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }

  // Tool fields in MCP spec 2025-06-18 + 2025-11-25 (icons, execution). Absent fields do not change the hash.
  var FIELDS = ['name', 'title', 'description', 'icons', 'inputSchema', 'outputSchema', 'annotations', 'execution'];
  function fingerprint(tool) {
    var fields = {}, whole = {};
    FIELDS.forEach(function (f) { if (tool[f] !== undefined) { fields[f] = sha256(canon(tool[f])); whole[f] = tool[f]; } });
    return { sha256: sha256(canon(whole)), fields: fields };
  }

  // ---------- Messages (English / Spanish) ----------
  var M = {
    en: {
      input_invalid: 'Could not read this as JSON. Paste the output of tools/list (a JSON-RPC response, {"tools":[...]}, or an array of tools).',
      no_tools: 'No tools found in the input. Expected result.tools, tools, or an array of objects with a "name".',
      tool_no_name: 'A tool has no "name": clients cannot show it properly.',
      dup_name: function (d) { return 'Two tools share the name "' + d.name + '": one can silently replace the other.'; },
      unicode_tags: function (d) { return 'Invisible Unicode Tag characters hide this text from you but not from the model: "' + d.decoded + '"'; },
      bidi: 'Bidirectional control characters can make the text you see differ from the text the model reads.',
      zero_width: function (d) { return d.count + ' zero-width character(s) inside the text: a common way to split keywords or hide markers.'; },
      instruction_tag: function (d) { return 'Instruction-style tag ' + d.tag + ' aimed at the model (the exact pattern used in published tool-poisoning attacks).'; },
      hide_from_user: 'Tells the model to keep something from the user. A tool has no legitimate reason to ask for secrecy.',
      override: 'Tries to override the model\'s other instructions ("ignore previous instructions" style).',
      precondition: 'Tells the model what to do before using this or other tools: legitimate tools rarely need that.',
      context_grab: 'Asks for conversation history, system prompt or previous messages.',
      sensitive_path: function (d) { return 'Mentions a sensitive file or folder (' + d.match + '): a tool description should not need it.'; },
      credential_words: function (d) { return 'Mentions credentials (' + d.match + '). Fine for an API tool that asks for its own key; suspicious anywhere else.'; },
      exfil_param: function (d) { return 'Parameter "' + d.param + '" is tied to file contents, secrets or conversation in the text: a side channel to carry data out.'; },
      md_image: function (d) { return 'Markdown image pointing to ' + d.host + (d.query ? ' with a query string or placeholder' : '') + ': if your chat renders it, data can leave in the URL.'; },
      url_http: function (d) { return 'Plain-HTTP URL in the text: ' + d.url; },
      url: function (d) { return 'External URL in the text: ' + d.url + ' (check you trust it).'; },
      shadowing: function (d) { return 'Gives the model orders about another tool ("' + d.other + '"): one server can change how a different one behaves.'; },
      long_desc: function (d) { return 'Very long description (' + d.len + ' characters). Clients often truncate it, so the end may be text only the model reads.'; },
      padding: 'Large blocks of blank lines or spaces push text out of the visible area.',
      base64: 'Long encoded blob (looks like base64) inside the text: hidden content you cannot read at a glance.',
      annot_mismatch: function (d) { return 'Annotation says read-only, but the name or text says "' + d.word + '". Annotations are self-declared and not proof.'; },
      tool_changed: function (d) { return 'Changed since you approved it (' + d.fields.join(', ') + '). Review it again before your agent uses it.'; },
      tool_added: 'New tool, not in your approved copy.',
      tool_removed: 'Was in your approved copy and is gone now.',
      name_lookalike: function (d) { return 'Tool name uses non-ASCII characters (' + d.chars + '): it can imitate another tool\'s name. The MCP spec asks for A-Z, a-z, 0-9, _ - . only.'; },
      name_format: 'Tool name breaks the MCP naming guidance (1-128 characters; letters, digits, _ - . only; no spaces).',
      icon_url: function (d) { return 'Icon loaded from ' + d.url + ': your client may fetch it every time it shows the tool.'; },
      header_secret: function (d) { return 'Parameter "' + d.param + '" looks sensitive but is copied into an HTTP header (x-mcp-header), where proxies and logs can see it.'; },
      header_invalid: function (d) { return 'x-mcp-header on "' + d.param + '" is not a valid header name; spec-following clients must drop this tool.'; }
    },
    es: {
      input_invalid: 'No pude leer esto como JSON. Pega la salida de tools/list (una respuesta JSON-RPC, {"tools":[...]} o una lista de herramientas).',
      no_tools: 'No encontré herramientas. Se esperaba result.tools, tools o una lista de objetos con "name".',
      tool_no_name: 'Una herramienta no tiene "name": los clientes no pueden mostrarla bien.',
      dup_name: function (d) { return 'Dos herramientas se llaman "' + d.name + '": una puede reemplazar a la otra sin que lo notes.'; },
      unicode_tags: function (d) { return 'Caracteres invisibles (Unicode Tags) esconden este texto de ti, pero no del modelo: "' + d.decoded + '"'; },
      bidi: 'Caracteres de control bidireccional pueden hacer que lo que tú ves no sea lo que lee el modelo.',
      zero_width: function (d) { return d.count + ' carácter(es) de ancho cero dentro del texto: un truco común para partir palabras o esconder marcas.'; },
      instruction_tag: function (d) { return 'Etiqueta de instrucciones ' + d.tag + ' dirigida al modelo (el patrón exacto de los ataques publicados de envenenamiento de herramientas).'; },
      hide_from_user: 'Le pide al modelo que le oculte algo al usuario. Una herramienta no tiene motivo legítimo para pedir secreto.',
      override: 'Intenta anular las demás instrucciones del modelo (estilo «ignora las instrucciones anteriores»).',
      precondition: 'Le dice al modelo qué hacer antes de usar esta u otras herramientas: rara vez es legítimo.',
      context_grab: 'Pide el historial de la conversación, el prompt del sistema o mensajes anteriores.',
      sensitive_path: function (d) { return 'Menciona un archivo o carpeta sensible (' + d.match + '): la descripción de una herramienta no debería necesitarlo.'; },
      credential_words: function (d) { return 'Menciona credenciales (' + d.match + '). Normal si es una herramienta de API que pide su propia clave; sospechoso en cualquier otro caso.'; },
      exfil_param: function (d) { return 'El parámetro "' + d.param + '" aparece ligado a contenido de archivos, secretos o la conversación: un canal lateral para sacar datos.'; },
      md_image: function (d) { return 'Imagen markdown hacia ' + d.host + (d.query ? ' con parámetros o marcadores en la URL' : '') + ': si tu chat la muestra, los datos pueden salir en la URL.'; },
      url_http: function (d) { return 'URL sin HTTPS en el texto: ' + d.url; },
      url: function (d) { return 'URL externa en el texto: ' + d.url + ' (confirma que confías en ella).'; },
      shadowing: function (d) { return 'Da órdenes al modelo sobre otra herramienta ("' + d.other + '"): un servidor puede cambiar cómo se comporta otro.'; },
      long_desc: function (d) { return 'Descripción muy larga (' + d.len + ' caracteres). Los clientes suelen recortarla: el final puede ser texto que solo lee el modelo.'; },
      padding: 'Bloques grandes de líneas o espacios en blanco empujan texto fuera de la vista.',
      base64: 'Bloque codificado largo (parece base64) dentro del texto: contenido oculto que no se lee a simple vista.',
      annot_mismatch: function (d) { return 'La anotación dice solo lectura, pero el nombre o el texto dice "' + d.word + '". Las anotaciones las declara el propio servidor y no prueban nada.'; },
      tool_changed: function (d) { return 'Cambió desde que la aprobaste (' + d.fields.join(', ') + '). Revísala otra vez antes de que tu agente la use.'; },
      tool_added: 'Herramienta nueva: no está en tu copia aprobada.',
      tool_removed: 'Estaba en tu copia aprobada y ya no está.',
      name_lookalike: function (d) { return 'El nombre de la herramienta usa caracteres no ASCII (' + d.chars + '): puede imitar el nombre de otra. La especificación MCP pide solo A-Z, a-z, 0-9, _ - .'; },
      name_format: 'El nombre de la herramienta no sigue la guía de MCP (1 a 128 caracteres; letras, dígitos, _ - .; sin espacios).',
      icon_url: function (d) { return 'Ícono cargado desde ' + d.url + ': tu cliente puede descargarlo cada vez que muestra la herramienta.'; },
      header_secret: function (d) { return 'El parámetro "' + d.param + '" parece sensible, pero se copia a una cabecera HTTP (x-mcp-header), donde lo ven proxies y registros.'; },
      header_invalid: function (d) { return 'x-mcp-header en "' + d.param + '" no es un nombre de cabecera válido; los clientes que siguen la especificación deben descartar esta herramienta.'; }
    }
  };
  function msg(lang, id, d) { var m = (M[lang] || M.en)[id]; return typeof m === 'function' ? m(d || {}) : m; }

  // ---------- Input parsing ----------
  function extractTools(obj, acc) {
    if (!obj || typeof obj !== 'object') return acc;
    if (Array.isArray(obj)) {
      if (obj.length && obj.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x) && ('name' in x || 'inputSchema' in x || 'description' in x) && !('result' in x) && !('tools' in x); })) {
        obj.forEach(function (t) { acc.push(t); });
      } else obj.forEach(function (x) { extractTools(x, acc); });
      return acc;
    }
    if (obj.result && obj.result.tools) return extractTools(obj.result.tools, acc);
    if (obj.tools) return extractTools(obj.tools, acc);
    if (('name' in obj) && ('inputSchema' in obj || 'description' in obj)) acc.push(obj);
    return acc;
  }

  function parseInput(text) {
    text = String(text || '').replace(/^﻿/, '').trim();
    if (!text) return { ok: false, error: 'input_invalid', tools: [] };
    var docs = [];
    try { docs.push(JSON.parse(text)); } catch (e) {
      // NDJSON / several JSON-RPC lines (for example a captured stdio session)
      text.split(/\r?\n/).forEach(function (line) { line = line.trim(); if (!line) return; try { docs.push(JSON.parse(line)); } catch (e2) { /* skip */ } });
    }
    if (!docs.length) return { ok: false, error: 'input_invalid', tools: [] };
    var tools = [];
    docs.forEach(function (d) { extractTools(d, tools); });
    if (!tools.length) return { ok: false, error: 'no_tools', tools: [] };
    return { ok: true, tools: tools };
  }

  // ---------- Text collection ----------
  function collect(tool) {
    var out = [];
    ['name', 'title', 'description'].forEach(function (f) { if (typeof tool[f] === 'string') out.push({ where: f, text: tool[f] }); });
    function walk(v, path) {
      if (typeof v === 'string') { out.push({ where: path, text: v }); return; }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(function (x, i) { walk(x, path + '[' + i + ']'); }); return; }
      Object.keys(v).forEach(function (k) {
        if (path.slice(-11) === '.properties') out.push({ where: path + '.' + k + ' (key)', text: k });
        walk(v[k], path + '.' + k);
      });
    }
    walk(tool.inputSchema, 'inputSchema');
    walk(tool.outputSchema, 'outputSchema');
    walk(tool.annotations, 'annotations');
    return out;
  }

  // ---------- Rules ----------
  var RX = {
    instructionTag: /<\s*\/?\s*(important|system|instructions?|secret|hidden|admin|assistant|context|note_to_ai|ai)\b[^>]*>|\[\/?INST\]|<\|im_start\|>|<!--[\s\S]*?-->/i,
    hideFromUser: [
      /\b(do not|don't|dont|never)\s+(tell|mention|inform|reveal|show|notify|alert|let)\b[^.\n]{0,40}\buser/i,
      /\b(do not|don't|dont|never)\s+(mention|reveal|disclose)\b/i,
      /\bwithout\s+(telling|informing|notifying|asking|alerting)\s+(the\s+)?user/i,
      /\b(the\s+)?user\s+(must|should)\s+not\s+(know|see|be told)/i,
      /\bno\s+(le\s+)?(digas|menciones|informes|cuentes|muestres|avises)\b[^.\n]{0,40}\busuari/i,
      /\bsin\s+(avisar|decir|decirle|informar|informarle|preguntar)\b[^.\n]{0,20}\busuari/i
    ],
    override: [
      /\bignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|other)\s+(instructions|rules|prompts|messages)/i,
      /\b(disregard|forget)\s+(all\s+|any\s+)?(previous|prior|your)\s+(instructions|rules)/i,
      /\bignora\s+(todas\s+)?(las\s+)?instrucciones\s+(anteriores|previas)/i,
      /\bolvida\s+(todas\s+)?(las\s+)?instrucciones/i
    ],
    precondition: [
      /\bbefore\s+(using|calling|invoking|running)\s+(this|any|the|other)\b[^.\n]{0,20}\btools?\b/i,
      /\b(you|the\s+(assistant|model|ai|agent))\s+(must|should|need\s+to|have\s+to)\s+(first\s+|always\s+)?(read|call|send|include|pass|run|execute|fetch|upload)\b/i,
      /\bantes\s+de\s+(usar|llamar|ejecutar)\s+(esta|cualquier|otra|la)\b[^.\n]{0,20}\bherramienta/i,
      /\b(debes|tienes que)\s+(primero\s+)?(leer|llamar|enviar|incluir|pasar|ejecutar)\b/i
    ],
    contextGrab: /\b(system\s+prompt|developer\s+(message|prompt)|conversation\s+history|chat\s+history|previous\s+messages|full\s+conversation|historial\s+(de\s+la\s+)?conversaci[oó]n|prompt\s+del\s+sistema|mensajes\s+anteriores)\b/i,
    sensitivePath: /(~?\/?\.ssh\b|id_rsa|id_ed25519|id_ecdsa|\.aws\/credentials|\.git-credentials|\.npmrc|\.pypirc|\.netrc|\.kube\/config|\/etc\/passwd|\/etc\/shadow|wallet\.dat|\bmcp\.json\b|claude_desktop_config\.json|\.cursor\/|(^|[\s"'`/])\.env\b|login\s+keychain|cookies\.sqlite)/i,
    credentialWords: /\b(api[_\s-]?keys?|access[_\s-]?tokens?|secret[_\s-]?keys?|passwords?|private\s+keys?|seed\s+phrase|payment\s+(details|data|info)|card\s+numbers?|cvv|n[uú]mero\s+de\s+tarjeta|contraseñas?|claves?\s+privadas?)\b/i,
    exfilWords: /\b(contents?|file|files|conversation|history|messages|credentials?|keys?|tokens?|secrets?|password|contenido|archivo|conversaci[oó]n|clave|secreto)\b/i,
    mdImage: /!\[[^\]]*\]\(\s*<?([a-z][a-z0-9+.-]*:\/\/[^)\s>]+)>?[^)]*\)/ig,
    url: /\b(https?):\/\/[^\s)<>"'`\]]+/ig,
    padding: /\n[ \t]*\n[ \t]*\n[ \t]*\n[ \t]*\n[ \t]*\n|[ \t ]{40,}/,
    base64: /[A-Za-z0-9+\/]{100,}={0,2}/,
    writeWords: /\b(delete|remove|write|send|post|upload|drop|update|transfer|pay|execute|run|create|modify|borrar|eliminar|enviar|escribir|ejecutar|pagar)\b/i
  };
  var DIRECTIVE = /\b(must|always|never|instead|before|after|whenever|should|siempre|nunca|en\s+lugar|antes|despu[eé]s|debe)\b/i;

  function scanHidden(text) {
    var tags = '', tagCount = 0, bidi = 0, zw = 0;
    var cps = Array.from(text);
    for (var i = 0; i < cps.length; i++) {
      var cp = cps[i].codePointAt(0);
      // Legitimate use: subdivision flags (England, Scotland, Wales) = U+1F3F4 + tag letters/digits + U+E007F
      if (cp === 0x1F3F4) {
        var j = i + 1;
        while (j < cps.length && /^[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]$/u.test(cps[j])) j++;
        if (j > i + 1 && j < cps.length && cps[j].codePointAt(0) === 0xE007F) { i = j; continue; }
      }
      if (cp >= 0xE0000 && cp <= 0xE007F) {
        tagCount++;
        var a = cp - 0xE0000;
        if (a >= 0x20 && a < 0x7f) tags += String.fromCharCode(a);
        continue;
      }
      if ((cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069)) { bidi++; continue; }
      if (cp === 0x200B || cp === 0x200C || cp === 0x2060 || cp === 0x2061 || cp === 0x2062 || cp === 0x2063 || cp === 0x2064 || cp === 0xFEFF || cp === 0x180E) { zw++; continue; }
      if (cp === 0x200D) {
        // Zero-width joiner is legitimate between emoji (family, profession emoji ...)
        var prev = cps[i - 1] || '', next = cps[i + 1] || '';
        if (/\p{Extended_Pictographic}|️|[\u{1F3FB}-\u{1F3FF}]/u.test(prev) && /\p{Extended_Pictographic}/u.test(next)) continue;
        zw++;
      }
    }
    return { tags: tags, tagCount: tagCount, bidi: bidi, zw: zw };
  }

  function visible(text) {
    // Remove invisible characters so the phrase rules see what the model sees ("normalize before you match").
    return Array.from(text).filter(function (ch) {
      var cp = ch.codePointAt(0);
      return !(cp === 0x200B || cp === 0x200C || cp === 0x200D || (cp >= 0x2060 && cp <= 0x2064) || cp === 0xFEFF || cp === 0x180E || (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069));
    }).map(function (ch) {
      var cp = ch.codePointAt(0);
      if (cp >= 0xE0020 && cp < 0xE007F) return String.fromCharCode(cp - 0xE0000);
      if (cp >= 0xE0000 && cp <= 0xE007F) return '';
      return ch;
    }).join('');
  }

  function short(s, n) { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function host(u) { var m = /^[a-z][a-z0-9+.-]*:\/\/([^\/?#]+)/i.exec(u); return m ? m[1] : u; }

  function analyzeTool(tool, allNames, lang) {
    var F = [], seen = {};
    var name = typeof tool.name === 'string' ? tool.name : '';
    function add(id, severity, where, data, evidence) {
      var key = id + '|' + (data && (data.param || data.other || data.url || data.match || data.tag) || '');
      if (seen[key]) return;
      seen[key] = 1;
      F.push({ id: id, severity: severity, tool: name || '(no name)', where: where, message: msg(lang, id, data), evidence: evidence ? short(evidence, 160) : undefined });
    }
    if (!name) add('tool_no_name', 'medium', 'name');
    else {
      var nonAscii = Array.from(name).filter(function (ch) { return ch.codePointAt(0) > 0x7e; });
      if (nonAscii.length) add('name_lookalike', 'medium', 'name', { chars: nonAscii.map(function (ch) { return 'U+' + ch.codePointAt(0).toString(16).toUpperCase(); }).slice(0, 4).join(' ') });
      else if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name)) add('name_format', 'low', 'name');
    }
    if (Array.isArray(tool.icons)) tool.icons.forEach(function (ic, i) {
      var src = ic && typeof ic.src === 'string' ? ic.src : '';
      if (/^https?:\/\//i.test(src)) add('icon_url', 'low', 'icons[' + i + '].src', { url: short(src, 80) });
    });

    var texts = collect(tool), joined = '';
    texts.forEach(function (t) {
      var h = scanHidden(t.text);
      if (h.tagCount) add('unicode_tags', 'high', t.where, { decoded: short(h.tags || '(non-printing)', 120) });
      if (h.bidi) add('bidi', 'high', t.where);
      if (h.zw) add('zero_width', 'medium', t.where, { count: h.zw });
      var v = visible(t.text);
      joined += '\n' + v;
      var m;
      if ((m = RX.instructionTag.exec(v))) add('instruction_tag', 'high', t.where, { tag: short(m[0], 40) }, v.slice(Math.max(0, m.index - 20), m.index + 120));
      RX.hideFromUser.forEach(function (r) { var mm = r.exec(v); if (mm) add('hide_from_user', 'high', t.where, null, mm[0]); });
      RX.override.forEach(function (r) { var mm = r.exec(v); if (mm) add('override', 'high', t.where, null, mm[0]); });
      RX.precondition.forEach(function (r) { var mm = r.exec(v); if (mm) add('precondition', 'medium', t.where, null, mm[0]); });
      if ((m = RX.contextGrab.exec(v))) add('context_grab', 'medium', t.where, null, m[0]);
      var sp = new RegExp(RX.sensitivePath.source, 'ig');
      while ((m = sp.exec(v))) add('sensitive_path', 'high', t.where, { match: m[0].replace(/^[\s"'`]+/, '') }, v.slice(Math.max(0, m.index - 30), m.index + 60));
      if (!/\(key\)$/.test(t.where) && (m = RX.credentialWords.exec(v))) add('credential_words', 'low', t.where, { match: m[0] });
      RX.mdImage.lastIndex = 0;
      var imgUrls = {};
      while ((m = RX.mdImage.exec(v))) {
        imgUrls[m[1]] = 1;
        var q = /[?#]|\{[^}]*\}|\$\{|%7B/i.test(m[1]);
        add('md_image', q ? 'high' : 'medium', t.where, { host: host(m[1]), query: q, url: m[1] }, m[0]);
      }
      RX.url.lastIndex = 0;
      while ((m = RX.url.exec(v))) {
        if (imgUrls[m[0]]) continue;
        m[0] = m[0].replace(/[.,;:!?]+$/, '');
        if (m[1].toLowerCase() === 'http' && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])([:\/]|$)/i.test(m[0])) add('url_http', 'medium', t.where, { url: short(m[0], 80) });
        else if (t.where === 'description' || /description$/.test(t.where)) add('url', 'low', t.where, { url: short(m[0], 80) });
      }
      if (RX.padding.test(t.text)) add('padding', 'medium', t.where);
      if ((m = RX.base64.exec(v))) add('base64', 'medium', t.where, null, m[0].slice(0, 40) + '…');
      if (/description$/.test(t.where) && t.text.length > 1500) add('long_desc', 'low', t.where, { len: t.text.length });
    });

    // Exfiltration side channel: a parameter named in text that also talks about files, secrets or the conversation
    var props = tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object' ? tool.inputSchema.properties : {};
    var desc = visible(typeof tool.description === 'string' ? tool.description : '');
    Object.keys(props).forEach(function (p) {
      var pd = props[p] && typeof props[p].description === 'string' ? visible(props[p].description) : '';
      var re = new RegExp('(^|[^A-Za-z0-9_])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)');
      var inDesc = p.length >= 3 && re.test(desc);
      var risky = function (s) { return RX.sensitivePath.test(s) || RX.contextGrab.test(s) || (RX.exfilWords.test(s) && DIRECTIVE.test(s)); };
      if ((inDesc && risky(desc)) || (pd && (RX.sensitivePath.test(pd) || RX.contextGrab.test(pd) || /\b(full|entire|whole|complete|todo|completo)\b[^.\n]{0,30}\b(contents?|file|conversation|history|contenido|archivo|conversaci[oó]n)/i.test(pd))))
        add('exfil_param', 'high', 'inputSchema.properties.' + p, { param: p });
    });

    // Shadowing: orders about another tool in the same list
    allNames.forEach(function (other) {
      if (!other || other === name || other.length < 4) return;
      var re = new RegExp('(^|[^A-Za-z0-9_])' + other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_]|$)');
      var m = re.exec(desc);
      if (m) {
        var around = desc.slice(Math.max(0, m.index - 120), m.index + other.length + 120);
        if (DIRECTIVE.test(around)) add('shadowing', 'medium', 'description', { other: other }, around);
      }
    });

    // x-mcp-header (MCP draft): parameter values mirrored into HTTP headers
    Object.keys(props).forEach(function (p) {
      var hv = props[p] && props[p]['x-mcp-header'];
      if (hv === undefined) return;
      if (typeof hv !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(hv)) add('header_invalid', 'medium', 'inputSchema.properties.' + p, { param: p });
      else if (/pass(word)?|secret|token|api[_-]?key|auth|credential|cookie|session|ssn|card|cvv|contrase/i.test(p + ' ' + hv)) add('header_secret', 'medium', 'inputSchema.properties.' + p, { param: p });
    });

    // Self-declared annotations that contradict the tool
    if (tool.annotations && tool.annotations.readOnlyHint === true) {
      var mw = RX.writeWords.exec(name.replace(/[_-]/g, ' ') + ' ' + desc);
      if (mw) add('annot_mismatch', 'low', 'annotations.readOnlyHint', { word: mw[0] });
    }
    return F;
  }

  var ORDER = { high: 3, medium: 2, low: 1, info: 0 };

  function analyze(input, opts) {
    opts = opts || {};
    var lang = opts.lang === 'es' ? 'es' : 'en';
    var parsed = typeof input === 'string' ? parseInput(input) : { ok: true, tools: extractTools(input, []) };
    if (!parsed.ok) return { ok: false, error: parsed.error, message: msg(lang, parsed.error), findings: [], tools: [], counts: { high: 0, medium: 0, low: 0, info: 0 } };
    var names = parsed.tools.map(function (t) { return typeof t.name === 'string' ? t.name : ''; });
    var findings = [], counted = {};
    names.forEach(function (n) {
      if (!n) return;
      counted[n] = (counted[n] || 0) + 1;
      if (counted[n] === 2) findings.push({ id: 'dup_name', severity: 'medium', tool: n, where: 'name', message: msg(lang, 'dup_name', { name: n }) });
    });
    var tools = parsed.tools.map(function (t) {
      var fp = fingerprint(t);
      var f = analyzeTool(t, names, lang);
      findings = findings.concat(f);
      return { name: names[parsed.tools.indexOf(t)] || '(no name)', sha256: fp.sha256, fields: fp.fields, description: typeof t.description === 'string' ? t.description : '' };
    });
    if (opts.baseline) findings = findings.concat(compare(tools, opts.baseline, lang));
    findings.sort(function (a, b) { return ORDER[b.severity] - ORDER[a.severity]; });
    var counts = { high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });
    return { ok: true, tools: tools, findings: findings, counts: counts, verdict: counts.high ? 'high' : counts.medium ? 'medium' : counts.low ? 'low' : 'clean' };
  }

  function makeBaseline(result, server) {
    var b = { toolprint: 1, created: new Date().toISOString(), server: server || undefined, tools: {} };
    (result.tools || []).forEach(function (t) { b.tools[t.name] = { sha256: t.sha256, fields: t.fields, description: t.description }; });
    return b;
  }

  function compare(tools, baseline, lang) {
    if (typeof baseline === 'string') baseline = JSON.parse(baseline);
    if (!baseline || baseline.toolprint !== 1 || typeof baseline.tools !== 'object') throw new Error('Not a Toolprint baseline file (expected {"toolprint":1,"tools":{...}}).');
    var out = [], now = {};
    tools.forEach(function (t) {
      now[t.name] = 1;
      var old = baseline.tools[t.name];
      if (!old) { out.push({ id: 'tool_added', severity: 'medium', tool: t.name, where: 'tools/list', message: msg(lang, 'tool_added') }); return; }
      if (old.sha256 === t.sha256) return;
      var changed = [];
      FIELDS.forEach(function (f) { if ((old.fields || {})[f] !== t.fields[f]) changed.push(f); });
      var ev;
      if (changed.indexOf('description') >= 0 && typeof old.description === 'string') {
        var a = old.description, b = t.description, i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        ev = (lang === 'es' ? 'antes: ' : 'was: ') + JSON.stringify(short(a.slice(Math.max(0, i - 20), i + 60), 80)) + (lang === 'es' ? ' → ahora: ' : ' → now: ') + JSON.stringify(short(b.slice(Math.max(0, i - 20), i + 60), 80));
      }
      out.push({ id: 'tool_changed', severity: 'high', tool: t.name, where: changed.join(', '), message: msg(lang, 'tool_changed', { fields: changed.length ? changed : ['?'] }), evidence: ev });
    });
    Object.keys(baseline.tools).forEach(function (n) { if (!now[n]) out.push({ id: 'tool_removed', severity: 'low', tool: n, where: 'tools/list', message: msg(lang, 'tool_removed') }); });
    return out;
  }

  function renderText(r, lang) {
    lang = lang === 'es' ? 'es' : 'en';
    if (!r.ok) return 'Toolprint: ' + r.message + '\n';
    var L = lang === 'es'
      ? { head: 'herramientas', verdict: { high: 'RIESGO ALTO', medium: 'revisar', low: 'detalles menores', clean: 'sin señales' }, none: 'Sin hallazgos.', fp: 'Huellas (SHA-256 de cada herramienta)' }
      : { head: 'tools', verdict: { high: 'HIGH RISK', medium: 'review', low: 'minor notes', clean: 'no signals' }, none: 'No findings.', fp: 'Fingerprints (SHA-256 per tool)' };
    var s = 'Toolprint  ' + r.tools.length + ' ' + L.head + '  ·  ' + L.verdict[r.verdict] + '  (high ' + r.counts.high + ', medium ' + r.counts.medium + ', low ' + r.counts.low + ')\n';
    if (!r.findings.length) s += L.none + '\n';
    r.findings.forEach(function (f) {
      s += '[' + (f.severity.toUpperCase() + '     ').slice(0, 6) + '] ' + f.tool + ' · ' + f.where + '\n         ' + f.message + '\n';
      if (f.evidence) s += '         > ' + f.evidence + '\n';
    });
    s += '\n' + L.fp + '\n';
    r.tools.forEach(function (t) { s += '  ' + t.sha256.slice(0, 16) + '  ' + t.name + '\n'; });
    return s;
  }

  var api = { sha256: sha256, canon: canon, fingerprint: fingerprint, parseInput: parseInput, analyze: analyze, makeBaseline: makeBaseline, compare: compare, renderText: renderText, scanHidden: scanHidden, visible: visible, version: '1.0.0' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Toolprint = api;

  // ---------- CLI ----------
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
    var fs = require('fs');
    var args = process.argv.slice(2), o = { lang: 'en', failOn: 'high' }, file = null;
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '--json') o.json = true;
      else if (a === '--lang') o.lang = args[++i];
      else if (a === '--baseline') o.baselineFile = args[++i];
      else if (a === '--save-baseline') o.save = args[++i];
      else if (a === '--fail-on') o.failOn = args[++i];
      else if (a === '-h' || a === '--help') o.help = true;
      else if (a === '--version') { console.log(api.version); process.exit(0); }
      else if (a[0] === '-' && a !== '-') { console.error('Unknown option ' + a); process.exit(2); }
      else file = a;
    }
    if (o.help) {
      console.log('Usage: node toolprint.js [tools.json|-] [--baseline approved.json] [--save-baseline approved.json]\n' +
        '                         [--json] [--lang en|es] [--fail-on high|medium|low|never]\n' +
        'Input: output of tools/list, e.g.\n  npx @modelcontextprotocol/inspector --cli <server command or https URL> --method tools/list > tools.json\n' +
        'Exit codes: 0 ok, 1 findings at/above --fail-on (default high), 2 usage/input error.');
      process.exit(0);
    }
    if (['high', 'medium', 'low', 'never'].indexOf(o.failOn) < 0) { console.error('--fail-on must be high, medium, low or never'); process.exit(2); }
    var text;
    try { text = (!file || file === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8'); }
    catch (e) { console.error('Cannot read input: ' + e.message); process.exit(2); }
    var baseline = null;
    if (o.baselineFile) {
      try { baseline = JSON.parse(fs.readFileSync(o.baselineFile, 'utf8')); }
      catch (e) { console.error('Cannot read baseline: ' + e.message); process.exit(2); }
    }
    var r;
    try { r = analyze(text, { lang: o.lang, baseline: baseline }); }
    catch (e) { console.error(e.message); process.exit(2); }
    if (o.json) console.log(JSON.stringify(r, null, 2)); else process.stdout.write(renderText(r, o.lang));
    if (!r.ok) process.exit(2);
    if (o.save) { fs.writeFileSync(o.save, JSON.stringify(makeBaseline(r), null, 2) + '\n'); if (!o.json) console.log('\nBaseline saved: ' + o.save); }
    var lim = { high: 3, medium: 2, low: 1, never: 99 }[o.failOn];
    process.exit(r.findings.some(function (f) { return ORDER[f.severity] >= lim; }) ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : this);
