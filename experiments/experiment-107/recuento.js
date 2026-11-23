#!/usr/bin/env node
/*
 * Recuento — read the DMARC aggregate reports that arrive as XML, .gz or .zip
 * and say, in plain words, who is sending mail as your domain and whether it
 * is safe to tighten the policy.
 *
 * One file, no dependencies, no network. Works as a Node CLI and in a browser.
 * Formats: RFC 7489 Appendix C (what Google and Microsoft still send) and
 * RFC 9990 (May 2026, namespace urn:ietf:params:xml:ns:dmarc-2.0).
 *
 * Daily Security Lab · Experiment 107 of dev-experiments-365 — MIT License.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Recuento = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // Limits. RFC 9990 section 8.1 warns that the decompressor and the XML parser
  // are the two places where a hostile report can exhaust memory.
  var LIMITS = { fileOut: 64 * 1024 * 1024, totalOut: 256 * 1024 * 1024, docs: 5000, depth: 5, xmlDepth: 64 };
  var NS_9990 = 'urn:ietf:params:xml:ns:dmarc-2.0';
  var NS_7489 = 'http://dmarc.org/dmarc-xml/0.1';

  function fail(code, detail) { var e = new Error(code + (detail ? ': ' + detail : '')); e.code = code; e.detail = detail || ''; return e; }

  // ---------------------------------------------------------------------------
  // Inflate (RFC 1951), written here so the same code runs in Node and in the
  // browser, stops at the end of the stream (junk after it is common in real
  // reports) and enforces an output limit.
  // ---------------------------------------------------------------------------
  var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  var CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huffman(lengths, offset, n) {
    var count = new Uint16Array(16), symbol = new Uint16Array(n), offs = new Uint16Array(16), i;
    for (i = 0; i < n; i++) count[lengths[offset + i]]++;
    count[0] = 0;
    for (i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (i = 0; i < n; i++) if (lengths[offset + i] !== 0) symbol[offs[lengths[offset + i]]++] = i;
    return { count: count, symbol: symbol };
  }
  var FIXED = (function () {
    var l = new Uint8Array(288 + 30), i;
    for (i = 0; i < 144; i++) l[i] = 8;
    for (; i < 256; i++) l[i] = 9;
    for (; i < 280; i++) l[i] = 7;
    for (; i < 288; i++) l[i] = 8;
    for (i = 0; i < 30; i++) l[288 + i] = 5;
    return { len: huffman(l, 0, 288), dist: huffman(l, 288, 30) };
  })();

  function inflateRaw(src, start, maxOut) {
    var pos = start || 0, end = src.length, bitbuf = 0, bitcnt = 0;
    var limit = maxOut || LIMITS.fileOut;
    var out = new Uint8Array(Math.min(limit, Math.max(1024, (end - pos) * 4))), op = 0;

    function bits(n) {
      while (bitcnt < n) {
        if (pos >= end) throw fail('deflate-truncated');
        bitbuf |= src[pos++] << bitcnt; bitcnt += 8;
      }
      var v = bitbuf & ((1 << n) - 1);
      bitbuf >>>= n; bitcnt -= n;
      return v;
    }
    function decode(h) {
      var code = 0, first = 0, index = 0, len, count;
      for (len = 1; len <= 15; len++) {
        code |= bits(1);
        count = h.count[len];
        if (code - count < first) return h.symbol[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw fail('deflate-bad-code');
    }
    function room(n) {
      if (op + n > limit) throw fail('too-big');
      if (op + n > out.length) {
        var bigger = new Uint8Array(Math.min(limit, Math.max(out.length * 2, op + n)));
        bigger.set(out.subarray(0, op)); out = bigger;
      }
    }
    function codes(lenH, distH) {
      for (;;) {
        var sym = decode(lenH);
        if (sym < 256) { room(1); out[op++] = sym; }
        else if (sym === 256) return;
        else {
          sym -= 257;
          if (sym >= 29) throw fail('deflate-bad-length');
          var len = LBASE[sym] + bits(LEXT[sym]);
          var ds = decode(distH);
          if (ds >= 30) throw fail('deflate-bad-distance');
          var dist = DBASE[ds] + bits(DEXT[ds]);
          if (dist > op) throw fail('deflate-bad-distance');
          room(len);
          for (var k = 0; k < len; k++) { out[op] = out[op - dist]; op++; }
        }
      }
    }

    var last;
    do {
      last = bits(1);
      var type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > end) throw fail('deflate-truncated');
        var len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8);
        pos += 4;
        if ((len ^ 0xffff) !== nlen) throw fail('deflate-bad-stored');
        if (pos + len > end) throw fail('deflate-truncated');
        room(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      } else if (type === 1) {
        codes(FIXED.len, FIXED.dist);
      } else if (type === 2) {
        var nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, i;
        if (nl > 286 || nd > 30) throw fail('deflate-bad-counts');
        var lengths = new Uint8Array(320), cl = new Uint8Array(19);
        for (i = 0; i < nc; i++) cl[CLORDER[i]] = bits(3);
        var clH = huffman(cl, 0, 19);
        i = 0;
        while (i < nl + nd) {
          var s = decode(clH), prev = 0, rep = 0;
          if (s < 16) { lengths[i++] = s; continue; }
          if (s === 16) { if (i === 0) throw fail('deflate-bad-repeat'); prev = lengths[i - 1]; rep = 3 + bits(2); }
          else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > nl + nd) throw fail('deflate-bad-repeat');
          while (rep--) lengths[i++] = prev;
        }
        if (lengths[256] === 0) throw fail('deflate-no-end-code');
        codes(huffman(lengths, 0, nl), huffman(lengths, nl, nd));
      } else throw fail('deflate-bad-block');
    } while (!last);
    return { out: out.subarray(0, op), end: pos };
  }

  // gzip (RFC 1952). Returns the data of every member in the file, the stored
  // file name of the first one, and whether there was junk after the last one.
  function isGzip(b, p) { p = p || 0; return b.length - p >= 18 && b[p] === 0x1f && b[p + 1] === 0x8b && b[p + 2] === 8; }
  function gunzip(bytes, maxOut) {
    var pos = 0, parts = [], total = 0, name = null, sizeMismatch = false;
    while (isGzip(bytes, pos)) {
      var flg = bytes[pos + 3], p = pos + 10;
      if (flg & 4) p += 2 + (bytes[p] | (bytes[p + 1] << 8));
      if (flg & 8) { var s = p; while (p < bytes.length && bytes[p] !== 0) p++; if (name === null) name = latin1(bytes, s, p); p++; }
      if (flg & 16) { while (p < bytes.length && bytes[p] !== 0) p++; p++; }
      if (flg & 2) p += 2;
      if (p >= bytes.length) throw fail('gzip-truncated');
      var r = inflateRaw(bytes, p, (maxOut || LIMITS.fileOut) - total);
      parts.push(r.out); total += r.out.length;
      pos = r.end;
      if (pos + 8 <= bytes.length) {
        var isize = (bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)) >>> 0;
        if (isize !== (r.out.length >>> 0)) sizeMismatch = true;
        pos += 8;
      } else { sizeMismatch = true; pos = bytes.length; }
    }
    if (!parts.length) throw fail('gzip-bad-header');
    var junk = 0;
    for (var j = pos; j < bytes.length; j++) junk++;
    return { out: concat(parts, total), name: name, trailing: junk, sizeMismatch: sizeMismatch, members: parts.length };
  }

  // zip: read the central directory, inflate each entry.
  function isZip(b) { return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 3 && b[3] === 4) || (b[2] === 5 && b[3] === 6)); }
  function u16(b, p) { return b[p] | (b[p + 1] << 8); }
  function u32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }
  function unzip(bytes, maxOut) {
    var eocd = -1, min = Math.max(0, bytes.length - 65557);
    for (var i = bytes.length - 22; i >= min; i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 5 && bytes[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd < 0) throw fail('zip-no-directory');
    var n = u16(bytes, eocd + 10), p = u32(bytes, eocd + 16), entries = [], skipped = [], budget = maxOut || LIMITS.fileOut;
    for (var k = 0; k < n; k++) {
      if (p + 46 > bytes.length || u32(bytes, p) !== 0x02014b50) throw fail('zip-bad-directory');
      var flags = u16(bytes, p + 8), method = u16(bytes, p + 10), csize = u32(bytes, p + 20), usize = u32(bytes, p + 24);
      var nlen = u16(bytes, p + 28), xlen = u16(bytes, p + 30), clen = u16(bytes, p + 32), lho = u32(bytes, p + 42);
      var name = utf8(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (/\/$/.test(name)) continue;
      if (flags & 1) { skipped.push({ name: name, reason: 'zip-encrypted' }); continue; }
      if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) { skipped.push({ name: name, reason: 'zip64' }); continue; }
      if (lho + 30 > bytes.length || u32(bytes, lho) !== 0x04034b50) { skipped.push({ name: name, reason: 'zip-bad-entry' }); continue; }
      var dp = lho + 30 + u16(bytes, lho + 26) + u16(bytes, lho + 28);
      if (method === 0) {
        if (dp + csize > bytes.length) { skipped.push({ name: name, reason: 'zip-bad-entry' }); continue; }
        if (csize > budget) throw fail('too-big');
        entries.push({ name: name, data: bytes.subarray(dp, dp + csize) }); budget -= csize;
      } else if (method === 8) {
        var r = inflateRaw(bytes, dp, budget);
        entries.push({ name: name, data: r.out }); budget -= r.out.length;
      } else skipped.push({ name: name, reason: 'zip-method' });
    }
    return { entries: entries, skipped: skipped };
  }

  // ---------------------------------------------------------------------------
  // Bytes and text
  // ---------------------------------------------------------------------------
  function concat(parts, total) {
    if (parts.length === 1) return parts[0];
    var out = new Uint8Array(total), o = 0;
    for (var i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }
  function latin1(b, s, e) { var t = ''; for (var i = s; i < e; i++) t += String.fromCharCode(b[i]); return t; }
  function utf8(b) {
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
    return new TextDecoder('utf-8').decode(b).replace(/^﻿/, '');
  }
  function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined' && input instanceof ArrayBuffer) return new Uint8Array(input);
    if (typeof input === 'string') return new TextEncoder().encode(input);
    throw fail('bad-input');
  }
  function base64(text) {
    var clean = text.replace(/[^A-Za-z0-9+/]/g, '');
    var n = Math.floor(clean.length * 3 / 4), out = new Uint8Array(n), o = 0, acc = 0, nb = 0;
    for (var i = 0; i < clean.length; i++) {
      var c = clean.charCodeAt(i);
      var v = c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 71 : c >= 48 && c <= 57 ? c + 4 : c === 43 ? 62 : 63;
      acc = (acc << 6) | v; nb += 6;
      if (nb >= 8) { nb -= 8; out[o++] = (acc >> nb) & 0xff; }
    }
    return out.subarray(0, o);
  }
  function quotedPrintable(text) {
    var t = text.replace(/=\r?\n/g, ''), out = [];
    for (var i = 0; i < t.length; i++) {
      if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; }
      else out.push(t.charCodeAt(i) & 0xff);
    }
    return new Uint8Array(out);
  }

  // ---------------------------------------------------------------------------
  // Email (.eml) — only what is needed to pull the attachment out.
  // ---------------------------------------------------------------------------
  function looksLikeEmail(text) {
    var head = text.slice(0, 4000);
    if (/^\s*</.test(head)) return false;
    var hits = (head.match(/^(Received|Return-Path|Delivered-To|From|To|Subject|Date|Message-ID|MIME-Version|Content-Type|X-[\w-]+):/gim) || []).length;
    return hits >= 3;
  }
  function splitHeaders(text) {
    var m = /\r?\n\r?\n/.exec(text);
    var head = m ? text.slice(0, m.index) : text, body = m ? text.slice(m.index + m[0].length) : '';
    var h = {}, lines = head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var c = lines[i].indexOf(':');
      if (c > 0) { var k = lines[i].slice(0, c).trim().toLowerCase(); if (!(k in h)) h[k] = lines[i].slice(c + 1).trim(); }
    }
    return { headers: h, body: body };
  }
  function param(value, name) {
    var m = new RegExp('(?:^|[;\\s])' + name + '\\*?=\\s*(?:"([^"]*)"|([^;\\s]+))', 'i').exec(value || '');
    return m ? (m[1] != null ? m[1] : m[2]) : null;
  }
  function emailParts(text, depth, out) {
    if (depth > 6) return;
    var part = splitHeaders(text), ct = part.headers['content-type'] || '', boundary = param(ct, 'boundary');
    if (/^multipart\//i.test(ct) && boundary) {
      var pieces = part.body.split('--' + boundary);
      for (var i = 1; i < pieces.length; i++) {
        if (/^--/.test(pieces[i])) break;
        emailParts(pieces[i].replace(/^\r?\n/, ''), depth + 1, out);
      }
      return;
    }
    var name = param(part.headers['content-disposition'], 'filename') || param(ct, 'name');
    var enc = (part.headers['content-transfer-encoding'] || '').toLowerCase();
    var isAttachment = !!name || /application\/|text\/xml/i.test(ct);
    if (!isAttachment) return;
    var bytes = enc === 'base64' ? base64(part.body) : enc === 'quoted-printable' ? quotedPrintable(part.body) : new TextEncoder().encode(part.body);
    out.push({ name: name || 'attachment', data: bytes, subject: null });
  }

  // ---------------------------------------------------------------------------
  // Unpack: whatever the user has (xml, .gz, .zip, .eml, gzip twice, zip named
  // .gz) becomes a list of XML texts. The format is decided by the first bytes,
  // never by the extension or the declared media type.
  // ---------------------------------------------------------------------------
  function newContext() { return { docs: [], skipped: [], notes: [], total: 0 }; }
  function unpack(input, name, ctx, depth) {
    ctx = ctx || newContext(); depth = depth || 0; name = name || 'input';
    var bytes;
    try { bytes = toBytes(input); } catch (e) { ctx.skipped.push({ name: name, reason: 'bad-input' }); return ctx; }
    if (depth > LIMITS.depth) { ctx.skipped.push({ name: name, reason: 'nested-too-deep' }); return ctx; }
    if (ctx.docs.length >= LIMITS.docs) { ctx.skipped.push({ name: name, reason: 'too-many' }); return ctx; }
    try {
      if (isGzip(bytes)) {
        var g = gunzip(bytes, Math.min(LIMITS.fileOut, LIMITS.totalOut - ctx.total));
        if (g.trailing) ctx.notes.push({ name: name, note: 'gzip-trailing', n: g.trailing });
        if (isGzip(g.out)) ctx.notes.push({ name: name, note: 'gzip-twice' });
        return unpack(g.out, g.name || name.replace(/\.(gz|gzip)$/i, ''), ctx, depth + 1);
      }
      if (isZip(bytes)) {
        var z = unzip(bytes, Math.min(LIMITS.fileOut, LIMITS.totalOut - ctx.total));
        if (/\.(gz|gzip)$/i.test(name)) ctx.notes.push({ name: name, note: 'zip-named-gz' });
        z.skipped.forEach(function (s) { ctx.skipped.push({ name: name + ' › ' + s.name, reason: s.reason }); });
        if (!z.entries.length && !z.skipped.length) ctx.skipped.push({ name: name, reason: 'empty' });
        z.entries.forEach(function (en) { unpack(en.data, en.name, ctx, depth + 1); });
        return ctx;
      }
    } catch (e) {
      ctx.skipped.push({ name: name, reason: e.code || 'unreadable' });
      return ctx;
    }
    ctx.total += bytes.length;
    if (ctx.total > LIMITS.totalOut) { ctx.skipped.push({ name: name, reason: 'too-big' }); return ctx; }
    var text = utf8(bytes), trimmed = text.replace(/^\s+/, '');
    if (!trimmed) { ctx.skipped.push({ name: name, reason: 'empty' }); return ctx; }
    if (trimmed[0] === '<') { ctx.docs.push({ name: name, text: text }); return ctx; }
    if (trimmed[0] === '{' && /"organization-name"|"policies"\s*:/.test(trimmed.slice(0, 4000))) { ctx.skipped.push({ name: name, reason: 'tls-report' }); return ctx; }
    if (looksLikeEmail(text)) {
      var parts = [];
      emailParts(text, 0, parts);
      if (!parts.length) { ctx.skipped.push({ name: name, reason: 'email-no-attachment' }); return ctx; }
      parts.forEach(function (p) { unpack(p.data, p.name, ctx, depth + 1); });
      return ctx;
    }
    if (/^unused\s*$/i.test(trimmed)) { ctx.skipped.push({ name: name, reason: 'placeholder' }); return ctx; }
    ctx.skipped.push({ name: name, reason: 'not-xml' });
    return ctx;
  }

  // ---------------------------------------------------------------------------
  // XML: a small tolerant reader. It never expands entities declared in a
  // DOCTYPE, so an "XML bomb" stays as inert text.
  // ---------------------------------------------------------------------------
  var ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function unescapeXml(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, function (m, e) {
      if (e[0] !== '#') return ENT[e];
      var cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '';
    });
  }
  function localName(n) { var c = n.indexOf(':'); return (c === -1 ? n : n.slice(c + 1)).toLowerCase(); }
  function parseXml(text) {
    var rootNode = { name: '#root', children: [], text: '', ns: null }, stack = [rootNode], i = 0, n = text.length, doctype = false;
    while (i < n) {
      var lt = text.indexOf('<', i), top = stack[stack.length - 1];
      if (lt === -1) { top.text += unescapeXml(text.slice(i)); break; }
      if (lt > i) top.text += unescapeXml(text.slice(i, lt));
      var e;
      if (text.startsWith('<!--', lt)) { e = text.indexOf('-->', lt + 4); if (e === -1) throw fail('xml-unclosed', 'comment'); i = e + 3; continue; }
      if (text.startsWith('<![CDATA[', lt)) { e = text.indexOf(']]>', lt + 9); if (e === -1) throw fail('xml-unclosed', 'CDATA'); top.text += text.slice(lt + 9, e); i = e + 3; continue; }
      if (text.startsWith('<?', lt)) { e = text.indexOf('?>', lt + 2); if (e === -1) throw fail('xml-unclosed', 'declaration'); i = e + 2; continue; }
      if (text.startsWith('<!', lt)) {
        doctype = true;
        var gt0 = text.indexOf('>', lt), br = text.indexOf('[', lt);
        if (br !== -1 && gt0 !== -1 && br < gt0) { e = text.indexOf(']>', br); if (e === -1) throw fail('xml-unclosed', 'DOCTYPE'); i = e + 2; }
        else { if (gt0 === -1) throw fail('xml-unclosed', 'DOCTYPE'); i = gt0 + 1; }
        continue;
      }
      if (text[lt + 1] === '/') {
        e = text.indexOf('>', lt); if (e === -1) throw fail('xml-unclosed', 'tag');
        var closing = localName(text.slice(lt + 2, e).trim());
        for (var s = stack.length - 1; s > 0; s--) if (stack[s].name === closing) { stack.length = s; break; }
        i = e + 1; continue;
      }
      var q = null; e = -1;
      for (var j = lt + 1; j < n; j++) {
        var ch = text[j];
        if (q) { if (ch === q) q = null; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '>') { e = j; break; }
      }
      if (e === -1) throw fail('xml-unclosed', 'tag');
      var raw = text.slice(lt + 1, e), selfClose = raw[raw.length - 1] === '/';
      var nm = /^[^\s/>]+/.exec(raw);
      if (!nm) throw fail('xml-bad-tag');
      var nsm = /\sxmlns(?::[\w.-]+)?\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(raw);
      var node = { name: localName(nm[0]), children: [], text: '', ns: nsm ? (nsm[1] != null ? nsm[1] : nsm[2]) : null };
      top.children.push(node);
      if (!selfClose) { if (stack.length >= LIMITS.xmlDepth) throw fail('xml-too-deep'); stack.push(node); }
      i = e + 1;
    }
    rootNode.doctype = doctype;
    return rootNode;
  }
  function kid(node, name) { if (!node) return null; for (var i = 0; i < node.children.length; i++) if (node.children[i].name === name) return node.children[i]; return null; }
  function kids(node, name) { return node ? node.children.filter(function (c) { return c.name === name; }) : []; }
  function txt(node, name) { var k = kid(node, name); return k ? k.text.trim() : ''; }
  function dom(s) { return String(s || '').trim().toLowerCase().replace(/\.$/, ''); }
  function low(s) { return String(s || '').trim().toLowerCase(); }

  // ---------------------------------------------------------------------------
  // One XML text -> one normalised report
  // ---------------------------------------------------------------------------
  function parseReport(text, name) {
    var tree = parseXml(text), fb = kid(tree, 'feedback');
    if (!fb) {
      var first = tree.children[0] ? tree.children[0].name : '';
      throw fail('not-dmarc', first);
    }
    var meta = kid(fb, 'report_metadata'), pol = kid(fb, 'policy_published'), recs = kids(fb, 'record');
    if (!pol || !txt(pol, 'domain')) throw fail('no-policy');
    var warnings = [];
    if (tree.doctype) warnings.push('doctype');
    var has9990 = !!(kid(pol, 'np') || kid(pol, 'testing') || kid(pol, 'discovery_method') || kid(meta, 'generator'));
    var format = fb.ns === NS_9990 ? 'rfc9990' : fb.ns === NS_7489 ? 'rfc7489' : has9990 ? 'rfc9990' : 'rfc7489';
    var range = kid(meta, 'date_range');
    var begin = parseInt(txt(range, 'begin'), 10), end = parseInt(txt(range, 'end'), 10);
    if (!(begin > 0) || !(end > 0)) { begin = end = 0; warnings.push('no-dates'); }
    if (end < begin) { var sw = begin; begin = end; end = sw; }
    var pctText = txt(pol, 'pct'), pct = pctText === '' ? null : parseInt(pctText, 10);
    var report = {
      file: name || '', format: format, namespace: fb.ns || null, version: txt(fb, 'version') || null,
      org: txt(meta, 'org_name') || txt(meta, 'email').replace(/^.*@/, '') || '?',
      email: txt(meta, 'email'), reportId: txt(meta, 'report_id'), generator: txt(meta, 'generator') || null,
      begin: begin, end: end,
      errors: kids(meta, 'error').map(function (x) { return x.text.trim(); }).filter(Boolean),
      policy: {
        domain: dom(txt(pol, 'domain')), p: low(txt(pol, 'p')) || 'none', sp: low(txt(pol, 'sp')) || null, np: low(txt(pol, 'np')) || null,
        pct: isNaN(pct) ? null : pct, adkim: low(txt(pol, 'adkim')) || 'r', aspf: low(txt(pol, 'aspf')) || 'r',
        testing: low(txt(pol, 'testing')) || null, discovery: low(txt(pol, 'discovery_method')) || null, fo: txt(pol, 'fo') || null
      },
      records: [], warnings: warnings
    };
    recs.forEach(function (rec) {
      var row = kid(rec, 'row'), pe = kid(row, 'policy_evaluated'), ids = kid(rec, 'identifiers'), ar = kid(rec, 'auth_results');
      var count = parseInt(txt(row, 'count'), 10);
      if (!(count >= 0)) { count = 0; if (warnings.indexOf('bad-count') === -1) warnings.push('bad-count'); }
      report.records.push({
        ip: txt(row, 'source_ip') || '?', count: count,
        disposition: low(txt(pe, 'disposition')) || 'none',
        dkimAligned: low(txt(pe, 'dkim')) === 'pass', spfAligned: low(txt(pe, 'spf')) === 'pass',
        reasons: kids(pe, 'reason').map(function (r) { return { type: low(txt(r, 'type')), comment: txt(r, 'comment') }; }),
        headerFrom: dom(txt(ids, 'header_from')) || report.policy.domain,
        envelopeFrom: kid(ids, 'envelope_from') ? dom(txt(ids, 'envelope_from')) : null,
        envelopeTo: dom(txt(ids, 'envelope_to')) || null,
        dkim: kids(ar, 'dkim').map(function (d) { return { domain: dom(txt(d, 'domain')), selector: txt(d, 'selector'), result: low(txt(d, 'result')) || 'none' }; }),
        spf: kids(ar, 'spf').map(function (s) { return { domain: dom(txt(s, 'domain')), scope: low(txt(s, 'scope')) || null, result: low(txt(s, 'result')) || 'none' }; })
      });
    });
    if (!report.records.length) warnings.push('no-records');
    return report;
  }

  // ---------------------------------------------------------------------------
  // Hints: a short list of domains that show up in reports when a service
  // sends for you with its own identity. It only adds a friendly name; the
  // classification works without it.
  // ---------------------------------------------------------------------------
  var SERVICES = {
    'gappssmtp.com': ['Google Workspace', 'default-key', 'google'],
    'onmicrosoft.com': ['Microsoft 365', 'default-key', 'microsoft'],
    'sendgrid.net': ['SendGrid', 'service'], 'sendgrid.info': ['SendGrid', 'service'],
    'amazonses.com': ['Amazon SES', 'service'],
    'mcsv.net': ['Mailchimp', 'service'], 'mcdlv.net': ['Mailchimp', 'service'], 'mandrillapp.com': ['Mailchimp Transactional', 'service'],
    'mailgun.org': ['Mailgun', 'service'], 'sparkpostmail.com': ['SparkPost', 'service'],
    'sendinblue.com': ['Brevo', 'service'], 'brevo.com': ['Brevo', 'service'], 'mailjet.com': ['Mailjet', 'service'],
    'hubspotemail.net': ['HubSpot', 'service'], 'klaviyomail.com': ['Klaviyo', 'service'], 'shopifyemail.com': ['Shopify Email', 'service'],
    'zendesk.com': ['Zendesk', 'service'], 'freshdesk.com': ['Freshdesk', 'service'],
    'salesforce.com': ['Salesforce', 'service'], 'exacttarget.com': ['Salesforce Marketing Cloud', 'service'],
    'constantcontact.com': ['Constant Contact', 'service'], 'ccsend.com': ['Constant Contact', 'service'],
    'postmarkapp.com': ['Postmark', 'service'], 'mtasv.net': ['Postmark', 'service'],
    'zoho.com': ['Zoho', 'service'], 'zohomail.com': ['Zoho', 'service'],
    'google.com': ['Google', 'mixed'], 'googlegroups.com': ['Google Groups', 'forwarder'], 'groups.io': ['Groups.io', 'forwarder'],
    'gmail.com': ['Gmail', 'forwarder'], 'googlemail.com': ['Gmail', 'forwarder'],
    'outlook.com': ['Outlook.com', 'forwarder'], 'hotmail.com': ['Outlook.com', 'forwarder'], 'live.com': ['Outlook.com', 'forwarder'],
    'yahoo.com': ['Yahoo', 'forwarder'], 'icloud.com': ['iCloud', 'forwarder'], 'me.com': ['iCloud', 'forwarder'],
    'fastmail.com': ['Fastmail', 'forwarder'], 'pobox.com': ['Pobox', 'forwarder']
  };
  var SECOND_LEVEL = { co: 1, com: 1, net: 1, org: 1, gov: 1, gob: 1, edu: 1, ac: 1, or: 1, ne: 1 };
  // A rough "organisation" of a host name, good enough to group signers. It is
  // not the Public Suffix List and is never used to decide pass or fail.
  function orgOf(d) {
    var p = d.split('.');
    if (p.length <= 2) return d;
    var tld = p[p.length - 1], sld = p[p.length - 2];
    var take = tld.length === 2 && SECOND_LEVEL[sld] ? 3 : 2;
    return p.slice(-take).join('.');
  }
  function serviceOf(d) {
    var parts = d.split('.');
    for (var i = 0; i < parts.length - 1; i++) { var k = parts.slice(i).join('.'); if (SERVICES[k]) return { key: k, name: SERVICES[k][0], kind: SERVICES[k][1] }; }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------
  var KIND_ORDER = { 'default-key': 0, service: 1, strict: 2, 'signature-broken': 3, unknown: 4, 'other-domain': 5, forwarder: 6, forwarded: 7, ok: 8 };

  function classify(rec, policyDomain) {
    var mine = function (d) { return !!d && (d === policyDomain || d.endsWith('.' + policyDomain)); };
    var dkimPassOwn = rec.dkim.filter(function (d) { return d.result === 'pass' && mine(d.domain); });
    var dkimPassOther = rec.dkim.filter(function (d) { return d.result === 'pass' && d.domain && !mine(d.domain); });
    var dkimBadOwn = rec.dkim.filter(function (d) { return d.result !== 'pass' && mine(d.domain); });
    var spf = rec.spf[0] || { domain: '', result: 'none' };
    var spfPassOwn = spf.result === 'pass' && mine(spf.domain), spfPassOther = spf.result === 'pass' && spf.domain && !mine(spf.domain);

    if (rec.dkimAligned || rec.spfAligned) {
      var signer = dkimPassOwn[0];
      return {
        kind: 'ok', key: 'ok|' + (rec.dkimAligned ? (signer ? signer.domain + '|' + signer.selector : 'dkim') : 'spf|' + spf.domain),
        signer: rec.dkimAligned && signer ? signer.domain : null, selector: rec.dkimAligned && signer ? signer.selector : null,
        spfDomain: rec.spfAligned ? spf.domain : null, dkim: rec.dkimAligned, spf: rec.spfAligned
      };
    }
    var forwardedByReceiver = rec.reasons.some(function (r) {
      return r.type === 'forwarded' || r.type === 'mailing_list' || r.type === 'trusted_forwarder' || (r.type === 'local_policy' && /arc\s*=\s*pass/i.test(r.comment));
    });
    if (forwardedByReceiver) return { kind: 'forwarded', key: 'forwarded' };
    if (dkimPassOwn.length || spfPassOwn) return { kind: 'strict', key: 'strict|' + (dkimPassOwn[0] ? dkimPassOwn[0].domain : spf.domain), via: dkimPassOwn[0] ? dkimPassOwn[0].domain : spf.domain };
    var other = dkimPassOther[0] ? dkimPassOther[0].domain : spfPassOther ? spf.domain : null;
    if (other) {
      var svc = serviceOf(other);
      // Your own signature was on the message and broke, and the only thing that passes
      // belongs to a mailbox provider or a list: that is what forwarding looks like.
      if (svc && (svc.kind === 'forwarder' || svc.kind === 'mixed') && (dkimBadOwn.length || svc.kind === 'forwarder')) return { kind: 'forwarder', key: 'forwarder|' + svc.key, service: svc, domain: svc.key };
      if (svc && svc.kind === 'default-key') return { kind: 'default-key', key: 'default-key|' + svc.key, service: svc, domain: svc.key };
      if (svc && (svc.kind === 'service' || svc.kind === 'mixed')) return { kind: 'service', key: 'service|' + svc.key, service: svc, domain: svc.key };
      if (dkimBadOwn.length) return { kind: 'signature-broken', key: 'signature-broken' };
      return { kind: 'other-domain', key: 'other|' + orgOf(other), domain: orgOf(other) };
    }
    if (dkimBadOwn.length) return { kind: 'signature-broken', key: 'signature-broken' };
    return { kind: 'unknown', key: 'unknown' };
  }

  function analyze(reports, opts) {
    opts = opts || {};
    var minDays = opts.minDays != null ? opts.minDays : 30;
    var seen = {}, unique = [], duplicates = 0;
    reports.forEach(function (r) {
      var k = [r.org, r.reportId, r.begin, r.end, r.policy.domain].join('|');
      if (seen[k]) duplicates++; else { seen[k] = 1; unique.push(r); }
    });
    var byDomain = {};
    unique.forEach(function (r) { (byDomain[r.policy.domain] = byDomain[r.policy.domain] || []).push(r); });
    var names = Object.keys(byDomain);
    if (opts.domain) names = names.filter(function (d) { return d === dom(opts.domain); });
    var domains = names.map(function (d) { return analyzeDomain(d, byDomain[d], minDays); });
    domains.sort(function (a, b) { return b.totals.messages - a.totals.messages || (a.domain < b.domain ? -1 : 1); });
    return { version: VERSION, reports: unique.length, duplicates: duplicates, minDays: minDays, domains: domains };
  }

  function analyzeDomain(domain, reports, minDays) {
    reports = reports.slice().sort(function (a, b) { return a.end - b.end; });
    var latest = reports[reports.length - 1], policy = latest.policy;
    var begin = 0, end = 0, days = {}, reporters = {}, formats = {}, groups = {}, froms = {};
    var totals = { messages: 0, pass: 0, fail: 0, failDelivered: 0, failQuarantined: 0, failRejected: 0 };
    var policies = {}, reportErrors = [];
    reports.forEach(function (r) {
      formats[r.format] = (formats[r.format] || 0) + 1;
      policies[[r.policy.p, r.policy.sp || r.policy.p, r.policy.testing === 'y' || r.policy.pct === 0].join('|')] = 1;
      r.errors.forEach(function (e) { if (reportErrors.indexOf(e) === -1 && reportErrors.length < 5) reportErrors.push(e); });
      if (r.begin) {
        begin = begin ? Math.min(begin, r.begin) : r.begin; end = Math.max(end, r.end);
        for (var t = Math.floor(r.begin / 86400); t <= Math.floor((r.end - 1) / 86400) && t - Math.floor(r.begin / 86400) < 400; t++) days[t] = 1;
      }
      var rep = reporters[r.org] = reporters[r.org] || { org: r.org, reports: 0, messages: 0 };
      rep.reports++;
      r.records.forEach(function (rec) {
        var c = classify(rec, domain), n = rec.count;
        rep.messages += n; totals.messages += n;
        froms[rec.headerFrom] = (froms[rec.headerFrom] || 0) + n;
        if (c.kind === 'ok') totals.pass += n;
        else {
          totals.fail += n;
          if (rec.disposition === 'reject') totals.failRejected += n;
          else if (rec.disposition === 'quarantine') totals.failQuarantined += n;
          else totals.failDelivered += n;
        }
        var g = groups[c.key];
        if (!g) g = groups[c.key] = { kind: c.kind, domain: c.domain || null, service: c.service ? c.service.name : null, provider: c.service ? c.service.key : null, signer: c.signer || null, selector: c.selector || null, spfDomain: c.spfDomain || null, via: c.via || null, count: 0, dkim: 0, spf: 0, dispositions: { none: 0, quarantine: 0, reject: 0 }, ipMap: {}, seenAs: {}, reporters: {} };
        g.count += n;
        if (c.dkim) g.dkim += n;
        if (c.spf) g.spf += n;
        g.dispositions[rec.disposition === 'reject' ? 'reject' : rec.disposition === 'quarantine' ? 'quarantine' : 'none'] += n;
        g.ipMap[rec.ip] = (g.ipMap[rec.ip] || 0) + n;
        g.reporters[r.org] = 1;
        rec.dkim.forEach(function (d) { if (d.domain) { var k = 'DKIM ' + d.domain + (d.selector ? ' (' + d.selector + ')' : '') + ' ' + d.result; g.seenAs[k] = (g.seenAs[k] || 0) + n; } });
        rec.spf.forEach(function (s) { if (s.domain) { var k = 'SPF ' + s.domain + ' ' + s.result; g.seenAs[k] = (g.seenAs[k] || 0) + n; } });
      });
    });

    var total = totals.messages || 1;
    var list = Object.keys(groups).map(function (k) {
      var g = groups[k];
      var ips = Object.keys(g.ipMap).map(function (ip) { return { ip: ip, count: g.ipMap[ip] }; }).sort(function (a, b) { return b.count - a.count || (a.ip < b.ip ? -1 : 1); });
      var seenAs = Object.keys(g.seenAs).map(function (s) { return { what: s, count: g.seenAs[s] }; }).sort(function (a, b) { return b.count - a.count || (a.what < b.what ? -1 : 1); });
      var share = g.count / total, significant = share >= 0.01 || g.count >= 10;
      var status = g.kind === 'ok' ? 'ok'
        : g.kind === 'default-key' || g.kind === 'service' || g.kind === 'strict' ? 'fix'
        : g.kind === 'signature-broken' ? (share >= 0.05 ? 'fix' : 'info')
        : g.kind === 'other-domain' ? (significant ? 'check' : 'info')
        : g.kind === 'unknown' ? 'check' : 'info';
      return {
        kind: g.kind, status: status, domain: g.domain, service: g.service, provider: g.provider, signer: g.signer, selector: g.selector, spfDomain: g.spfDomain, via: g.via,
        count: g.count, share: share, dkim: g.dkim, spf: g.spf, spfOnly: g.kind === 'ok' && g.dkim === 0,
        dispositions: g.dispositions, blocked: g.dispositions.quarantine + g.dispositions.reject,
        ips: ips.slice(0, 5), ipCount: ips.length, seenAs: seenAs.slice(0, 4), reporters: Object.keys(g.reporters).length
      };
    });
    list.sort(function (a, b) {
      var sa = a.status === 'ok' ? 1 : 0, sb = b.status === 'ok' ? 1 : 0;
      return sa - sb || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.count - a.count;
    });

    var dayCount = Object.keys(days).length;
    var testing = policy.testing === 'y' || policy.pct === 0;
    var enforced = (policy.p === 'quarantine' || policy.p === 'reject') && !testing;
    var fix = list.filter(function (g) { return g.status === 'fix'; });
    var check = list.filter(function (g) { return g.status === 'check' && g.kind === 'other-domain'; });
    var blockedYours = fix.reduce(function (a, g) { return a + g.blocked; }, 0);
    var verdict;
    if (!totals.messages) verdict = 'no-data';
    else if (enforced && blockedYours > 0) verdict = 'blocking';
    else if (fix.length) verdict = 'fix-first';
    else if (check.length) verdict = 'check-first';
    else if (dayCount < minDays) verdict = enforced && policy.p === 'reject' ? 'protected' : 'more-data';
    else if (enforced && policy.p === 'reject') verdict = 'protected';
    else verdict = 'ready';

    var next = null;
    if (verdict === 'ready') next = testing ? policy.p : policy.p === 'none' ? 'quarantine' : 'reject';

    var notes = [];
    if (formats.rfc9990) notes.push({ code: 'format-9990', n: formats.rfc9990 });
    if (policy.pct != null && policy.pct < 100) notes.push({ code: 'pct', n: policy.pct });
    if (policy.testing === 'y') notes.push({ code: 'testing' });
    if (Object.keys(policies).length > 1) notes.push({ code: 'policy-changed' });
    if (policy.sp && policy.sp !== policy.p) notes.push({ code: 'sp', value: policy.sp });
    if (policy.adkim === 's' || policy.aspf === 's') notes.push({ code: 'strict-mode', value: (policy.adkim === 's' ? 'adkim=s ' : '') + (policy.aspf === 's' ? 'aspf=s' : '') });
    if (list.some(function (g) { return g.spfOnly && g.share >= 0.01; })) notes.push({ code: 'spf-only' });
    if (!enforced && totals.fail) notes.push({ code: 'fail-not-blocked', n: totals.failDelivered });
    if (Object.keys(reporters).length === 1) notes.push({ code: 'one-reporter', value: Object.keys(reporters)[0] });
    if (reportErrors.length) notes.push({ code: 'report-errors', value: reportErrors.join(' · ') });
    var subs = Object.keys(froms).filter(function (f) { return f !== domain; });
    if (subs.length) notes.push({ code: 'subdomains', value: subs.slice(0, 6).join(', ') + (subs.length > 6 ? '…' : '') });

    return {
      domain: domain, policy: policy, enforced: enforced, testing: testing,
      period: { begin: begin, end: end, days: dayCount },
      reports: reports.length,
      reporters: Object.keys(reporters).map(function (k) { return reporters[k]; }).sort(function (a, b) { return b.messages - a.messages || (a.org < b.org ? -1 : 1); }),
      totals: totals, passRate: totals.messages ? totals.pass / totals.messages : 0,
      groups: list, verdict: verdict, next: next, notes: notes
    };
  }

  // Convenience: files in, analysis out.
  function read(inputs, opts) {
    var ctx = newContext(), reports = [], warnings = [];
    inputs.forEach(function (f) { unpack(f.data, f.name, ctx, 0); });
    ctx.docs.forEach(function (d) {
      try {
        var r = parseReport(d.text, d.name);
        r.warnings.forEach(function (w) { warnings.push({ name: d.name, warning: w }); });
        reports.push(r);
      } catch (e) { ctx.skipped.push({ name: d.name, reason: e.code || 'unreadable', detail: e.detail || '' }); }
    });
    var res = analyze(reports, opts);
    res.files = { read: reports.length, skipped: ctx.skipped, notes: ctx.notes, warnings: warnings };
    return res;
  }

  // ---------------------------------------------------------------------------
  // Words
  // ---------------------------------------------------------------------------
  function num(n, lang) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'es' ? '.' : ','); }
  function pc(x, lang) { var v = (x * 100); var s = v >= 99.95 && v < 100 ? '99.9' : v > 0 && v < 0.1 ? '0.1' : v.toFixed(1); return (lang === 'es' ? s.replace('.', ',') : s) + (lang === 'es' ? ' %' : '%'); }
  function day(ts) { return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '?'; }

  var T = {
    en: {
      status: { ok: 'OK', fix: 'FIX', check: 'CHECK', info: 'INFO' },
      verdict: {
        'no-data': 'No messages in these reports',
        blocking: 'Mail that looks like yours is being blocked',
        'fix-first': 'Not yet: fix these senders first',
        'check-first': 'Not yet: identify these senders first',
        'more-data': 'Clean so far, keep collecting',
        ready: 'Ready for the next step',
        protected: 'Protected'
      },
      verdictWhy: function (d, r) {
        var fix = d.groups.filter(function (g) { return g.status === 'fix'; });
        var n = fix.reduce(function (a, g) { return a + g.count; }, 0), b = fix.reduce(function (a, g) { return a + g.blocked; }, 0);
        switch (d.verdict) {
          case 'no-data': return 'The reports are valid but list no mail for this domain.';
          case 'blocking': return 'Your policy is ' + d.policy.p + ' and ' + num(b, 'en') + ' of the ' + num(n, 'en') + ' messages from services that send for you were quarantined or rejected. Fix those senders now, or go back to p=none while you do.';
          case 'fix-first': return num(n, 'en') + ' messages (' + pc(n / d.totals.messages, 'en') + ') come from services that send for you but do not prove it. ' + (d.enforced ? 'Receivers may block them at any time.' : 'If you moved to quarantine or reject today, they would go to spam or bounce.');
          case 'check-first': return 'Some mail is authenticated as a domain that is not yours and that this tool does not know. Decide whether each one is a service you use before tightening the policy.';
          case 'more-data': return 'Everything that looks like yours passes. These reports cover ' + d.period.days + ' day' + (d.period.days === 1 ? '' : 's') + '; wait until you have ' + r.minDays + ' so that monthly mail (invoices, newsletters) shows up too.';
          case 'ready': return 'Everything that looks like yours passes, over ' + d.period.days + ' days. ' + (d.testing ? 'You can remove the testing flag so that p=' + d.policy.p + ' is applied.' : 'You can change p=' + d.policy.p + ' to p=' + d.next + '.');
          case 'protected': return 'Your policy is reject and nothing that looks like yours is failing. Keep reading the reports when you add a new sending service.';
        }
      },
      policyLine: function (d) {
        var p = d.policy, what = p.p === 'none' ? 'monitoring only: receivers are asked to block nothing' : p.p === 'quarantine' ? 'failing mail should go to spam' : 'failing mail should be refused';
        return 'Policy you publish: p=' + p.p + ' (' + what + ')' + (d.testing ? ', in testing mode, so it is not applied' : '');
      },
      head: function (d) { return d.reports + ' report' + (d.reports === 1 ? '' : 's') + ' from ' + d.reporters.length + ' receiver' + (d.reporters.length === 1 ? '' : 's') + ' · ' + day(d.period.begin) + ' → ' + day(d.period.end - 1) + ' (' + d.period.days + ' day' + (d.period.days === 1 ? '' : 's') + ')'; },
      totals: function (d) {
        var t = d.totals, s = num(t.messages, 'en') + ' messages used your domain · ' + num(t.pass, 'en') + ' passed DMARC (' + pc(d.passRate, 'en') + ') · ' + num(t.fail, 'en') + ' failed';
        if (t.fail) s += ' (' + [t.failDelivered ? num(t.failDelivered, 'en') + ' delivered anyway' : '', t.failQuarantined ? num(t.failQuarantined, 'en') + ' sent to spam' : '', t.failRejected ? num(t.failRejected, 'en') + ' rejected' : ''].filter(Boolean).join(', ') + ')';
        return s;
      },
      receivers: 'Who sent these reports',
      title: function (g, d) {
        switch (g.kind) {
          case 'ok': return (g.signer ? 'Signed as ' + g.signer + (g.selector ? ' (selector ' + g.selector + ')' : '') : g.spfDomain ? 'Sent from servers in the SPF record of ' + g.spfDomain : 'Authenticated as ' + d.domain);
          case 'default-key': return g.service + ' is signing with its own domain (' + g.provider + '), not yours';
          case 'service': return g.service + ' (' + g.provider + ') sends for you without your domain';
          case 'strict': return 'Authenticated as ' + g.via + ', but not accepted as ' + d.domain;
          case 'signature-broken': return 'Carried your DKIM signature, and it did not verify';
          case 'other-domain': return 'Authenticated as ' + g.domain + ', a domain that is not yours';
          case 'forwarder': return 'Forwarded through ' + g.service;
          case 'forwarded': return 'Forwarded mail and mailing lists, recognised by the receiver';
          case 'unknown': return 'No proof at all that this mail is yours';
        }
      },
      how: function (g) { return g.dkim && g.spf ? (g.dkim === g.count && g.spf === g.count ? 'DKIM and SPF pass' : 'DKIM passes on ' + num(g.dkim, 'en') + ', SPF on ' + num(g.spf, 'en')) : g.dkim ? 'DKIM passes; SPF does not count for your domain' : 'only SPF passes'; },
      explain: function (g, d) {
        switch (g.kind) {
          case 'ok': return g.spfOnly ? ['Nothing to fix today. It passes on SPF alone, which breaks when a message is forwarded: turn on DKIM signing with your domain in this service.'] : ['Nothing to fix.'];
          case 'default-key': return g.provider === 'gappssmtp.com'
            ? ['This is your own mailbox service. The messages are real, but the DKIM signature belongs to Google\'s default domain, so it does not count for ' + d.domain + '.', 'Do: Google Admin → Apps → Google Workspace → Gmail → Authenticate email → generate the key, publish the TXT record it shows, then press "Start authentication".']
            : ['This is your own mailbox service. The messages are real, but the DKIM signature belongs to Microsoft\'s default domain, so it does not count for ' + d.domain + '.', 'Do: Microsoft Defender portal → Email authentication settings → DKIM → select ' + d.domain + ', publish the two CNAME records it shows, then enable signing.'];
          case 'service': return ['A service you (or someone in the company) set up is sending as ' + d.domain + ', and authenticates as ' + g.provider + ' instead. Receivers cannot tell it from a forgery.', 'Do: in ' + g.service + ', look for "domain authentication", "custom DKIM" or "sender domain", and publish the DNS records it gives you. If nobody in the company uses ' + g.service + ', leave it failing: it is not yours.'];
          case 'strict': return ['The mail is authenticated with ' + g.via + ', which belongs to you, but DMARC still fails. That happens with strict alignment (adkim=s or aspf=s) when the signing domain and the visible From are not exactly the same.', 'Do: sign with exactly the domain shown in From, or use relaxed alignment (remove adkim=s / aspf=s).'];
          case 'signature-broken': return ['The message had a DKIM signature of ' + d.domain + ' that no longer matched when it arrived. Small amounts are normal: a mailing list or a forwarder changed the message on the way.', g.status === 'fix' ? 'This is ' + pc(g.share, 'en') + ' of your mail, too much for forwarding. Check that the DKIM key in your DNS is the one your mail server signs with (a key rotated on one side only gives exactly this).' : 'Nothing to fix at this volume.'];
          case 'other-domain': return ['It passes SPF or DKIM, but for ' + g.domain + ', not for you. Either a service you use that sends with its own identity, or someone else\'s server forwarding or forging.', 'Do: if you recognise ' + g.domain + ' as a tool the company uses (newsletter, shop, invoicing, CRM, web form), set up custom DKIM for ' + d.domain + ' there. If not, nothing to fix.'];
          case 'forwarder': return ['Somebody received your mail and their mailbox forwarded it (or a list resent it). SPF now belongs to the forwarder and your signature may break on the way. It is not a sender you can fix.', 'DKIM signing on all your real senders is what keeps forwarded mail passing.'];
          case 'forwarded': return ['The receiver itself marked these as forwarded or list mail and did not apply your policy to them. Nothing to fix.'];
          case 'unknown': return ['These messages said they were from ' + d.domain + ' and had no valid SPF or DKIM of yours. Usually somebody forging your address; sometimes a system of yours that nobody remembers (web site form, printer or scanner, old server, invoicing program).', (g.blocked ? num(g.blocked, 'en') + ' were blocked by your policy. ' : '') + (g.dispositions.none ? num(g.dispositions.none, 'en') + ' were delivered anyway' + (d.enforced ? '.' : ': p=none blocks nothing.') : ''), 'Do: look at the addresses below. If one is yours, add it to SPF or make it sign. The rest is what quarantine and reject are for.'];
        }
      },
      seen: 'Seen from', more: function (n) { return 'and ' + n + ' more'; }, authAs: 'Authenticated as', blocked: 'blocked',
      nextTitle: 'What to do next',
      nextSteps: function (d, r) {
        var s = [];
        var fix = d.groups.filter(function (g) { return g.status === 'fix'; }), chk = d.groups.filter(function (g) { return g.status === 'check' && g.kind === 'other-domain'; });
        if (d.verdict === 'blocking') s.push('Today: fix the senders marked FIX. If that will take more than a day, publish p=none (or add t=y) until it is done, so your own mail stops being blocked.');
        fix.forEach(function (g) { s.push('Fix: ' + T.en.title(g, d) + ' — ' + num(g.count, 'en') + ' messages.'); });
        chk.forEach(function (g) { s.push('Identify: ' + g.domain + ' — ' + num(g.count, 'en') + ' messages. Yours or not?'); });
        if (fix.length || chk.length) s.push('Then wait for new reports (they arrive once a day) and run them through here again. Do not change the policy before the list above is empty.');
        if (d.verdict === 'more-data') s.push('Keep p=' + d.policy.p + ' and keep the reports arriving. Come back with ' + r.minDays + ' days of reports.');
        if (d.verdict === 'ready' && !d.testing) s.push('In your DMARC record (TXT at _dmarc.' + d.domain + ') change p=' + d.policy.p + ' to p=' + d.next + ' and leave the rest as it is. For a trial run first, add t=y: RFC 9989 replaced pct with this flag, and receivers then report as if the policy applied without applying it.');
        if (d.verdict === 'ready' && d.testing) s.push('Remove t=y (or pct=0) from your DMARC record so that p=' + d.policy.p + ' is really applied.');
        if (d.verdict === 'ready' && d.next === 'quarantine') s.push('After another ' + r.minDays + ' clean days at quarantine, move to p=reject.');
        if (d.verdict === 'protected') s.push('Nothing to change. When you add a new tool that sends email, set up its DKIM before the first send.');
        return s;
      },
      notesTitle: 'Notes',
      note: function (n, d) {
        switch (n.code) {
          case 'format-9990': return n.n + ' report' + (n.n === 1 ? ' uses' : 's use') + ' the new format of RFC 9990 (May 2026). Some older readers reject it; it is read here the same as the old one.';
          case 'pct': return 'Your record has pct=' + n.n + '. RFC 9989 removed pct: receivers that follow it treat any value except 0 as 100. Use t=y for testing instead.';
          case 'testing': return 'Your record is in testing mode (t=y): receivers report failures but do not apply the policy.';
          case 'policy-changed': return 'Your policy changed during this period. The verdict uses the most recent one.';
          case 'sp': return 'Subdomains have a different policy (sp=' + n.value + ') from the main domain.';
          case 'strict-mode': return 'You publish strict alignment (' + n.value.trim() + '): a subdomain signing for the main domain does not count.';
          case 'spf-only': return 'Some of your mail passes on SPF alone. It works, but it fails when forwarded. DKIM is what survives forwarding.';
          case 'fail-not-blocked': return '"Fail" here does not mean "rejected". With p=none, ' + num(n.n, 'en') + ' failing messages were delivered as usual.';
          case 'one-reporter': return 'All reports come from ' + n.value + '. Other receivers may see senders that are not listed here.';
          case 'report-errors': return 'A receiver reported a problem with your DMARC record: ' + n.value;
          case 'subdomains': return 'Mail was also seen with these From domains under your policy: ' + n.value + '.';
        }
      },
      files: function (f, r) { return f.read + ' report' + (f.read === 1 ? '' : 's') + ' read' + (r.duplicates ? ', ' + r.duplicates + ' duplicate' + (r.duplicates === 1 ? '' : 's') + ' ignored' : '') + (f.skipped.length ? ', ' + f.skipped.length + ' file' + (f.skipped.length === 1 ? '' : 's') + ' skipped' : ''); },
      skip: {
        'not-xml': 'not a DMARC report (no XML inside)', 'not-dmarc': 'XML, but not a DMARC aggregate report', 'no-policy': 'DMARC report without the policy section; cannot tell which domain it is about',
        'tls-report': 'this is a TLS report (TLS-RPT, about encrypted delivery to you), not a DMARC report', placeholder: 'empty placeholder attachment (some receivers send the word "unused")',
        empty: 'empty file', 'email-no-attachment': 'email without a report attached', 'too-big': 'larger than this tool accepts (zip-bomb guard)', 'nested-too-deep': 'archives nested too deep',
        'too-many': 'too many files in one go', 'zip-encrypted': 'password-protected zip entry', zip64: 'zip64 entry, not supported', 'zip-method': 'zip compression method not supported',
        'zip-bad-entry': 'damaged zip entry', 'zip-no-directory': 'damaged or incomplete zip', 'zip-bad-directory': 'damaged zip', 'gzip-truncated': 'incomplete gzip file', 'gzip-bad-header': 'damaged gzip file',
        'xml-unclosed': 'XML cut short or damaged', 'xml-bad-tag': 'damaged XML', 'xml-too-deep': 'XML nested too deep', unreadable: 'could not be read', 'bad-input': 'could not be read'
      },
      fileNote: { 'gzip-trailing': 'had extra bytes after the gzip data (read anyway)', 'gzip-twice': 'was compressed with gzip twice (read anyway)', 'zip-named-gz': 'is a zip named .gz (read anyway)' },
      warn: { doctype: 'has a DOCTYPE; entities declared there are not expanded', 'no-dates': 'has no valid date range', 'bad-count': 'has a record without a valid message count', 'no-records': 'lists no messages' },
      otherDomains: 'Other domains in these reports', nothing: 'No DMARC report could be read from what you gave.',
      legit: 'These files are DMARC aggregate reports: daily statistics that mail receivers send because your domain\'s DMARC record asks for them (rua=). They contain counts and server addresses, never message content.'
    },
    es: {
      status: { ok: 'BIEN', fix: 'ARREGLAR', check: 'REVISAR', info: 'INFO' },
      verdict: {
        'no-data': 'Estos informes no traen mensajes',
        blocking: 'Se está bloqueando correo que parece tuyo',
        'fix-first': 'Todavía no: arregla primero estos remitentes',
        'check-first': 'Todavía no: identifica primero estos remitentes',
        'more-data': 'Limpio hasta ahora, sigue juntando informes',
        ready: 'Listo para el siguiente paso',
        protected: 'Protegido'
      },
      verdictWhy: function (d, r) {
        var fix = d.groups.filter(function (g) { return g.status === 'fix'; });
        var n = fix.reduce(function (a, g) { return a + g.count; }, 0), b = fix.reduce(function (a, g) { return a + g.blocked; }, 0);
        switch (d.verdict) {
          case 'no-data': return 'Los informes son válidos, pero no listan correo de este dominio.';
          case 'blocking': return 'Tu política es ' + d.policy.p + ' y ' + num(b, 'es') + ' de los ' + num(n, 'es') + ' mensajes de servicios que envían por ti fueron a spam o se rechazaron. Arregla esos remitentes ahora, o vuelve a p=none mientras lo haces.';
          case 'fix-first': return num(n, 'es') + ' mensajes (' + pc(n / d.totals.messages, 'es') + ') vienen de servicios que envían por ti pero no lo demuestran. ' + (d.enforced ? 'Los receptores pueden bloquearlos en cualquier momento.' : 'Si hoy pasaras a quarantine o reject, irían a spam o rebotarían.');
          case 'check-first': return 'Hay correo autenticado con un dominio que no es tuyo y que esta herramienta no conoce. Decide si cada uno es un servicio que usas antes de endurecer la política.';
          case 'more-data': return 'Todo lo que parece tuyo pasa. Estos informes cubren ' + d.period.days + ' día' + (d.period.days === 1 ? '' : 's') + '; espera a tener ' + r.minDays + ' para que aparezca también el correo mensual (facturas, boletines).';
          case 'ready': return 'Todo lo que parece tuyo pasa, durante ' + d.period.days + ' días. ' + (d.testing ? 'Puedes quitar la marca de prueba para que p=' + d.policy.p + ' se aplique.' : 'Puedes cambiar p=' + d.policy.p + ' por p=' + d.next + '.');
          case 'protected': return 'Tu política es reject y nada de lo que parece tuyo está fallando. Vuelve a leer los informes cuando sumes un servicio nuevo que envíe correo.';
        }
      },
      policyLine: function (d) {
        var p = d.policy, what = p.p === 'none' ? 'solo observa: no se pide bloquear nada' : p.p === 'quarantine' ? 'el correo que falla debería ir a spam' : 'el correo que falla debería rechazarse';
        return 'Política que publicas: p=' + p.p + ' (' + what + ')' + (d.testing ? ', en modo de prueba, así que no se aplica' : '');
      },
      head: function (d) { return d.reports + ' informe' + (d.reports === 1 ? '' : 's') + ' de ' + d.reporters.length + ' receptor' + (d.reporters.length === 1 ? '' : 'es') + ' · ' + day(d.period.begin) + ' → ' + day(d.period.end - 1) + ' (' + d.period.days + ' día' + (d.period.days === 1 ? '' : 's') + ')'; },
      totals: function (d) {
        var t = d.totals, s = num(t.messages, 'es') + ' mensajes usaron tu dominio · ' + num(t.pass, 'es') + ' pasaron DMARC (' + pc(d.passRate, 'es') + ') · ' + num(t.fail, 'es') + ' fallaron';
        if (t.fail) s += ' (' + [t.failDelivered ? num(t.failDelivered, 'es') + ' se entregaron igual' : '', t.failQuarantined ? num(t.failQuarantined, 'es') + ' fueron a spam' : '', t.failRejected ? num(t.failRejected, 'es') + ' se rechazaron' : ''].filter(Boolean).join(', ') + ')';
        return s;
      },
      receivers: 'Quién envió estos informes',
      title: function (g, d) {
        switch (g.kind) {
          case 'ok': return (g.signer ? 'Firmado como ' + g.signer + (g.selector ? ' (selector ' + g.selector + ')' : '') : g.spfDomain ? 'Enviado desde servidores del registro SPF de ' + g.spfDomain : 'Autenticado como ' + d.domain);
          case 'default-key': return g.service + ' está firmando con su propio dominio (' + g.provider + '), no con el tuyo';
          case 'service': return g.service + ' (' + g.provider + ') envía por ti sin usar tu dominio';
          case 'strict': return 'Autenticado como ' + g.via + ', pero no aceptado como ' + d.domain;
          case 'signature-broken': return 'Llevaba tu firma DKIM y no se pudo verificar';
          case 'other-domain': return 'Autenticado como ' + g.domain + ', un dominio que no es tuyo';
          case 'forwarder': return 'Reenviado a través de ' + g.service;
          case 'forwarded': return 'Reenvíos y listas de correo, reconocidos por el receptor';
          case 'unknown': return 'Ninguna prueba de que este correo sea tuyo';
        }
      },
      how: function (g) { return g.dkim && g.spf ? (g.dkim === g.count && g.spf === g.count ? 'pasan DKIM y SPF' : 'DKIM pasa en ' + num(g.dkim, 'es') + ', SPF en ' + num(g.spf, 'es')) : g.dkim ? 'pasa DKIM; SPF no cuenta para tu dominio' : 'solo pasa SPF'; },
      explain: function (g, d) {
        switch (g.kind) {
          case 'ok': return g.spfOnly ? ['Nada que arreglar hoy. Pasa solo por SPF, que deja de funcionar cuando el mensaje se reenvía: activa la firma DKIM con tu dominio en este servicio.'] : ['Nada que arreglar.'];
          case 'default-key': return g.provider === 'gappssmtp.com'
            ? ['Es tu propio servicio de correo. Los mensajes son reales, pero la firma DKIM pertenece al dominio por defecto de Google y no cuenta para ' + d.domain + '.', 'Qué hacer: Consola de Google Admin → Aplicaciones → Google Workspace → Gmail → Autenticar correo → genera la clave, publica el registro TXT que muestra y pulsa «Iniciar autenticación».']
            : ['Es tu propio servicio de correo. Los mensajes son reales, pero la firma DKIM pertenece al dominio por defecto de Microsoft y no cuenta para ' + d.domain + '.', 'Qué hacer: portal de Microsoft Defender → Configuración de autenticación de correo → DKIM → elige ' + d.domain + ', publica los dos registros CNAME que muestra y activa la firma.'];
          case 'service': return ['Un servicio que tú (o alguien de la empresa) configuró envía como ' + d.domain + ' y se autentica como ' + g.provider + '. Quien recibe no puede distinguirlo de una falsificación.', 'Qué hacer: en ' + g.service + ', busca «autenticación de dominio», «DKIM personalizado» o «dominio de envío» y publica los registros DNS que te entrega. Si nadie en la empresa usa ' + g.service + ', déjalo fallar: no es tuyo.'];
          case 'strict': return ['El correo se autentica con ' + g.via + ', que te pertenece, y aun así DMARC falla. Pasa con la alineación estricta (adkim=s o aspf=s) cuando el dominio que firma y el del remitente visible no son exactamente iguales.', 'Qué hacer: firma con el mismo dominio que aparece en el remitente, o usa alineación relajada (quita adkim=s / aspf=s).'];
          case 'signature-broken': return ['El mensaje traía una firma DKIM de ' + d.domain + ' que ya no coincidía al llegar. En poca cantidad es normal: una lista de correo o un reenvío modificó el mensaje en el camino.', g.status === 'fix' ? 'Es el ' + pc(g.share, 'es') + ' de tu correo, demasiado para ser reenvíos. Revisa que la clave DKIM de tu DNS sea la misma con la que firma tu servidor (una clave rotada en un solo lado da exactamente esto).' : 'Con este volumen no hay nada que arreglar.'];
          case 'other-domain': return ['Pasa SPF o DKIM, pero para ' + g.domain + ', no para ti. Es un servicio que usas y envía con su propia identidad, o el servidor de otra persona que reenvía o falsifica.', 'Qué hacer: si reconoces ' + g.domain + ' como una herramienta de la empresa (boletín, tienda, facturación, CRM, formulario web), configura ahí el DKIM personalizado de ' + d.domain + '. Si no, no hay nada que arreglar.'];
          case 'forwarder': return ['Alguien recibió tu correo y su casilla lo reenvió (o una lista lo redistribuyó). El SPF ahora es del que reenvía y tu firma puede romperse en el camino. No es un remitente que puedas arreglar.', 'La firma DKIM en todos tus remitentes reales es lo que mantiene pasando el correo reenviado.'];
          case 'forwarded': return ['El propio receptor marcó estos mensajes como reenvíos o listas y no les aplicó tu política. Nada que arreglar.'];
          case 'unknown': return ['Estos mensajes decían venir de ' + d.domain + ' y no traían SPF ni DKIM válidos tuyos. Casi siempre es alguien falsificando tu dirección; a veces es un sistema tuyo que nadie recuerda (formulario del sitio, impresora o escáner, servidor antiguo, programa de facturación).', (g.blocked ? num(g.blocked, 'es') + ' fueron bloqueados por tu política. ' : '') + (g.dispositions.none ? num(g.dispositions.none, 'es') + ' se entregaron igual' + (d.enforced ? '.' : ': p=none no bloquea nada.') : ''), 'Qué hacer: mira las direcciones de abajo. Si alguna es tuya, agrégala al SPF o haz que firme. El resto es justo lo que frenan quarantine y reject.'];
        }
      },
      seen: 'Visto desde', more: function (n) { return 'y ' + n + ' más'; }, authAs: 'Se autenticó como', blocked: 'bloqueados',
      nextTitle: 'Qué hacer ahora',
      nextSteps: function (d, r) {
        var s = [];
        var fix = d.groups.filter(function (g) { return g.status === 'fix'; }), chk = d.groups.filter(function (g) { return g.status === 'check' && g.kind === 'other-domain'; });
        if (d.verdict === 'blocking') s.push('Hoy: arregla los remitentes marcados ARREGLAR. Si va a tomar más de un día, publica p=none (o agrega t=y) hasta terminar, para que tu propio correo deje de bloquearse.');
        fix.forEach(function (g) { s.push('Arreglar: ' + T.es.title(g, d) + ' — ' + num(g.count, 'es') + ' mensajes.'); });
        chk.forEach(function (g) { s.push('Identificar: ' + g.domain + ' — ' + num(g.count, 'es') + ' mensajes. ¿Es tuyo o no?'); });
        if (fix.length || chk.length) s.push('Después espera los informes nuevos (llegan una vez al día) y vuelve a pasarlos por aquí. No cambies la política antes de que la lista de arriba quede vacía.');
        if (d.verdict === 'more-data') s.push('Mantén p=' + d.policy.p + ' y deja que sigan llegando los informes. Vuelve cuando tengas ' + r.minDays + ' días.');
        if (d.verdict === 'ready' && !d.testing) s.push('En tu registro DMARC (TXT en _dmarc.' + d.domain + ') cambia p=' + d.policy.p + ' por p=' + d.next + ' y deja el resto igual. Para probar antes, agrega t=y: la RFC 9989 reemplazó pct por esta marca, y los receptores informan como si la política se aplicara, sin aplicarla.');
        if (d.verdict === 'ready' && d.testing) s.push('Quita t=y (o pct=0) de tu registro DMARC para que p=' + d.policy.p + ' se aplique de verdad.');
        if (d.verdict === 'ready' && d.next === 'quarantine') s.push('Tras otros ' + r.minDays + ' días limpios en quarantine, pasa a p=reject.');
        if (d.verdict === 'protected') s.push('Nada que cambiar. Cuando sumes una herramienta nueva que envíe correo, configura su DKIM antes del primer envío.');
        return s;
      },
      notesTitle: 'Notas',
      note: function (n, d) {
        switch (n.code) {
          case 'format-9990': return n.n + ' informe' + (n.n === 1 ? ' usa' : 's usan') + ' el formato nuevo de la RFC 9990 (mayo de 2026). Algunos lectores antiguos lo rechazan; aquí se lee igual que el anterior.';
          case 'pct': return 'Tu registro tiene pct=' + n.n + '. La RFC 9989 eliminó pct: los receptores que la siguen tratan cualquier valor distinto de 0 como 100. Para probar usa t=y.';
          case 'testing': return 'Tu registro está en modo de prueba (t=y): los receptores informan los fallos, pero no aplican la política.';
          case 'policy-changed': return 'Tu política cambió durante este período. El veredicto usa la más reciente.';
          case 'sp': return 'Los subdominios tienen una política distinta (sp=' + n.value + ') de la del dominio principal.';
          case 'strict-mode': return 'Publicas alineación estricta (' + n.value.trim() + '): un subdominio que firma por el dominio principal no cuenta.';
          case 'spf-only': return 'Parte de tu correo pasa solo por SPF. Funciona, pero falla cuando se reenvía. DKIM es lo que sobrevive al reenvío.';
          case 'fail-not-blocked': return 'Aquí «falló» no significa «rechazado». Con p=none, ' + num(n.n, 'es') + ' mensajes que fallaron se entregaron como siempre.';
          case 'one-reporter': return 'Todos los informes vienen de ' + n.value + '. Otros receptores pueden ver remitentes que aquí no aparecen.';
          case 'report-errors': return 'Un receptor informó un problema con tu registro DMARC: ' + n.value;
          case 'subdomains': return 'También se vio correo con estos dominios de remitente bajo tu política: ' + n.value + '.';
        }
      },
      files: function (f, r) { return f.read + ' informe' + (f.read === 1 ? '' : 's') + ' leído' + (f.read === 1 ? '' : 's') + (r.duplicates ? ', ' + r.duplicates + ' duplicado' + (r.duplicates === 1 ? '' : 's') + ' ignorado' + (r.duplicates === 1 ? '' : 's') : '') + (f.skipped.length ? ', ' + f.skipped.length + ' archivo' + (f.skipped.length === 1 ? '' : 's') + ' omitido' + (f.skipped.length === 1 ? '' : 's') : ''); },
      skip: {
        'not-xml': 'no es un informe DMARC (no trae XML)', 'not-dmarc': 'es XML, pero no un informe agregado DMARC', 'no-policy': 'informe DMARC sin la sección de política; no se sabe de qué dominio habla',
        'tls-report': 'es un informe TLS (TLS-RPT, sobre la entrega cifrada hacia ti), no un informe DMARC', placeholder: 'adjunto vacío de relleno (algunos receptores envían la palabra «unused»)',
        empty: 'archivo vacío', 'email-no-attachment': 'correo sin informe adjunto', 'too-big': 'más grande de lo que acepta esta herramienta (protección contra bombas zip)', 'nested-too-deep': 'archivos comprimidos anidados en exceso',
        'too-many': 'demasiados archivos de una vez', 'zip-encrypted': 'entrada de zip con contraseña', zip64: 'entrada zip64, no soportada', 'zip-method': 'método de compresión zip no soportado',
        'zip-bad-entry': 'entrada de zip dañada', 'zip-no-directory': 'zip dañado o incompleto', 'zip-bad-directory': 'zip dañado', 'gzip-truncated': 'archivo gzip incompleto', 'gzip-bad-header': 'archivo gzip dañado',
        'xml-unclosed': 'XML cortado o dañado', 'xml-bad-tag': 'XML dañado', 'xml-too-deep': 'XML anidado en exceso', unreadable: 'no se pudo leer', 'bad-input': 'no se pudo leer'
      },
      fileNote: { 'gzip-trailing': 'traía bytes de sobra después del gzip (se leyó igual)', 'gzip-twice': 'venía comprimido con gzip dos veces (se leyó igual)', 'zip-named-gz': 'es un zip con nombre .gz (se leyó igual)' },
      warn: { doctype: 'trae un DOCTYPE; las entidades declaradas ahí no se expanden', 'no-dates': 'no trae un rango de fechas válido', 'bad-count': 'tiene un registro sin cantidad de mensajes válida', 'no-records': 'no lista mensajes' },
      otherDomains: 'Otros dominios en estos informes', nothing: 'No se pudo leer ningún informe DMARC de lo que entregaste.',
      legit: 'Estos archivos son informes agregados DMARC: estadísticas diarias que los receptores de correo envían porque el registro DMARC de tu dominio las pide (rua=). Traen cantidades y direcciones de servidores, nunca el contenido de los mensajes.'
    }
  };
  // deflate errors share one message
  ['deflate-truncated', 'deflate-bad-code', 'deflate-bad-length', 'deflate-bad-distance', 'deflate-bad-stored', 'deflate-bad-counts', 'deflate-bad-repeat', 'deflate-no-end-code', 'deflate-bad-block'].forEach(function (k) {
    T.en.skip[k] = 'damaged compressed file'; T.es.skip[k] = 'archivo comprimido dañado';
  });

  function skipText(s, lang) { return (T[lang].skip[s.reason] || s.reason) + (s.detail && s.reason === 'not-dmarc' ? ' (<' + s.detail + '>)' : ''); }

  function render(res, lang) {
    var t = T[lang || 'en'], L = [];
    lang = lang || 'en';
    if (!res.domains.length) L.push('Recuento ' + VERSION, '', t.nothing);
    res.domains.forEach(function (d, idx) {
      if (idx) L.push('', '='.repeat(72), '');
      L.push('Recuento ' + VERSION + '  ·  ' + d.domain + '  ·  ' + t.head(d));
      L.push('');
      L.push('>> ' + t.verdict[d.verdict].toUpperCase());
      L.push('   ' + t.verdictWhy(d, res));
      L.push('');
      L.push(t.policyLine(d));
      L.push(t.totals(d));
      L.push('');
      d.groups.forEach(function (g) {
        var tag = ('[' + t.status[g.status] + ']').padEnd(lang === 'es' ? 11 : 8);
        L.push(tag + num(g.count, lang).padStart(7) + '  ' + pc(g.share, lang).padStart(lang === 'es' ? 7 : 6) + '  ' + t.title(g, d) + (g.kind === 'ok' ? ' — ' + t.how(g) : ''));
        var pad = ' '.repeat(tag.length);
        t.explain(g, d).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x) { if (!(g.kind === 'ok' && !g.spfOnly)) L.push(pad + x); });
        if (g.kind !== 'ok') {
          if (g.seenAs.length) L.push(pad + t.authAs + ': ' + g.seenAs.map(function (s) { return s.what; }).join('; '));
          L.push(pad + t.seen + ': ' + g.ips.map(function (i) { return i.ip + ' (' + num(i.count, lang) + ')'; }).join(', ') + (g.ipCount > g.ips.length ? ' ' + t.more(g.ipCount - g.ips.length) : ''));
        }
      });
      var steps = t.nextSteps(d, res);
      if (steps.length) { L.push('', t.nextTitle); steps.forEach(function (s, i) { L.push((i + 1) + '. ' + s); }); }
      if (d.notes.length) { L.push('', t.notesTitle); d.notes.forEach(function (n) { L.push('- ' + t.note(n, d)); }); }
      L.push('', t.receivers + ': ' + d.reporters.map(function (r) { return r.org + ' (' + r.reports + ', ' + num(r.messages, lang) + ')'; }).join(' · '));
    });
    if (res.files) {
      L.push('', t.files(res.files, res));
      res.files.skipped.forEach(function (s) { L.push('  - ' + s.name + ': ' + skipText(s, lang)); });
      res.files.notes.forEach(function (n) { L.push('  - ' + n.name + ' ' + t.fileNote[n.note]); });
      res.files.warnings.forEach(function (w) { L.push('  - ' + w.name + ' ' + t.warn[w.warning]); });
    }
    return L.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Samples (invented data: example.com and the documentation address ranges)
  // ---------------------------------------------------------------------------
  function xmlReport(o) {
    var n9990 = o.format === 'rfc9990', p = o.policy || {};
    var x = '<?xml version="1.0" encoding="UTF-8" ?>\n<feedback' + (n9990 ? ' xmlns="' + NS_9990 + '"' : '') + '>\n';
    if (n9990) x += '  <version>1.0</version>\n';
    x += '  <report_metadata>\n    <org_name>' + o.org + '</org_name>\n    <email>noreply-dmarc@' + o.orgDomain + '</email>\n    <report_id>' + o.id + '</report_id>\n    <date_range>\n      <begin>' + o.begin + '</begin>\n      <end>' + o.end + '</end>\n    </date_range>\n' + (n9990 ? '    <generator>Example Reporter 2.0</generator>\n' : '') + '  </report_metadata>\n';
    x += '  <policy_published>\n    <domain>' + o.domain + '</domain>\n' + (n9990 ? '' : '    <adkim>r</adkim>\n    <aspf>r</aspf>\n') + '    <p>' + (p.p || 'none') + '</p>\n    <sp>' + (p.sp || p.p || 'none') + '</sp>\n' + (n9990 ? '    <np>' + (p.p || 'none') + '</np>\n    <testing>' + (p.testing || 'n') + '</testing>\n    <discovery_method>treewalk</discovery_method>\n' : '    <pct>' + (p.pct != null ? p.pct : 100) + '</pct>\n') + '  </policy_published>\n';
    o.rows.forEach(function (r) {
      x += '  <record>\n    <row>\n      <source_ip>' + r.ip + '</source_ip>\n      <count>' + r.count + '</count>\n      <policy_evaluated>\n        <disposition>' + (r.disposition || 'none') + '</disposition>\n        <dkim>' + (r.dkimAligned ? 'pass' : 'fail') + '</dkim>\n        <spf>' + (r.spfAligned ? 'pass' : 'fail') + '</spf>\n' +
        (r.reason ? '        <reason>\n          <type>' + r.reason[0] + '</type>\n          <comment>' + (r.reason[1] || '') + '</comment>\n        </reason>\n' : '') +
        '      </policy_evaluated>\n    </row>\n    <identifiers>\n      <header_from>' + (r.from || o.domain) + '</header_from>\n    </identifiers>\n    <auth_results>\n';
      (r.dkim || []).forEach(function (d) { x += '      <dkim>\n        <domain>' + d[0] + '</domain>\n        <result>' + d[2] + '</result>\n        <selector>' + d[1] + '</selector>\n      </dkim>\n'; });
      if (r.spf) x += '      <spf>\n        <domain>' + r.spf[0] + '</domain>\n        <result>' + r.spf[1] + '</result>\n      </spf>\n';
      x += '    </auth_results>\n  </record>\n';
    });
    return x + '</feedback>\n';
  }
  var DAY0 = 1792454400; // 2026-10-20 00:00:00 UTC
  function sampleSet(kind) {
    var files = [], D = 'example.com';
    var own = function (n, disp) { return { ip: '192.0.2.10', count: n, disposition: disp || 'none', dkimAligned: true, spfAligned: true, dkim: [[D, 'google', 'pass']], spf: [[D, 'pass'][0], 'pass'] }; };
    var news = function (n, disp, fixed) { return fixed
      ? { ip: '198.51.100.24', count: n, disposition: 'none', dkimAligned: true, spfAligned: false, dkim: [[D, 's1', 'pass'], ['sendgrid.net', 'smtpapi', 'pass']], spf: ['em1234.' + D, 'pass'] }
      : { ip: '198.51.100.24', count: n, disposition: disp || 'none', dkimAligned: false, spfAligned: false, dkim: [['sendgrid.net', 'smtpapi', 'pass']], spf: ['sendgrid.net', 'pass'] }; };
    var fwd = function (n) { return { ip: '203.0.113.77', count: n, disposition: 'none', dkimAligned: false, spfAligned: false, reason: ['local_policy', 'arc=pass'], dkim: [[D, 'google', 'fail']], spf: ['forwarder.example.net', 'pass'] }; };
    var spoof = function (n, ip, disp) { return { ip: ip, count: n, disposition: disp || 'none', dkimAligned: false, spfAligned: false, dkim: [], spf: [D, 'fail'] }; };
    var days = kind === 'week' ? 7 : 31;
    for (var i = 0; i < days; i++) {
      var b = DAY0 + i * 86400, e = b + 86400, weekday = i % 7 < 5;
      var pol = kind === 'blocked' ? { p: 'reject' } : { p: 'none' };
      var rows = [own(weekday ? 38 + (i * 7) % 11 : 6, 'none')];
      if (kind === 'shop') { if (i % 7 === 1) rows.push(news(420)); rows.push(news(9 + i % 5)); }
      if (kind === 'blocked') { if (i % 7 === 1) rows.push(news(420, 'reject')); rows.push(news(9 + i % 5, 'reject')); }
      if (kind === 'ready' || kind === 'week') { if (i % 7 === 1) rows.push(news(420, 'none', true)); rows.push(news(9 + i % 5, 'none', true)); }
      if (i % 3 === 0) rows.push(fwd(2));
      if (i % 4 === 2) rows.push(spoof(3 + i % 4, '203.0.113.' + (140 + i), kind === 'blocked' ? 'reject' : 'none'));
      files.push({ name: 'google.com!' + D + '!' + b + '!' + (e - 1) + '.xml', data: xmlReport({ org: 'google.com', orgDomain: 'google.com', id: String(1700000000000000000 + i * 977), begin: b, end: e - 1, domain: D, policy: pol, rows: rows }) });
      if (i % 2 === 0) {
        var r2 = [{ ip: '192.0.2.10', count: weekday ? 11 : 2, disposition: 'none', dkimAligned: true, spfAligned: true, dkim: [[D, 'google', 'pass']], spf: [D, 'pass'] }];
        if (kind === 'shop') r2.push(news(4));
        if (kind === 'blocked') r2.push(news(4, 'reject'));
        if (kind === 'ready' || kind === 'week') r2.push(news(4, 'none', true));
        files.push({ name: 'enterprise.protection.outlook.com!' + D + '!' + b + '!' + e + '.xml', data: xmlReport({ org: 'Outlook.com', orgDomain: 'microsoft.com', id: 'a1b2c3d4e5f6' + i, begin: b, end: e, domain: D, policy: pol, rows: r2 }) });
      }
      if (i % 5 === 3) files.push({ name: 'mail.receiver.example!' + D + '!' + b + '!' + e + '!r' + i + '.xml', data: xmlReport({ format: 'rfc9990', org: 'Receiver Example', orgDomain: 'receiver.example', id: 'r' + i + '-3v98abbp8ya9', begin: b, end: e, domain: D, policy: pol, rows: [{ ip: '192.0.2.10', count: 3, disposition: kind === 'blocked' ? 'pass' : 'none', dkimAligned: true, spfAligned: true, dkim: [[D, 'google', 'pass']], spf: [D, 'pass'] }] }) });
    }
    return files;
  }
  function samples() { return { shop: sampleSet('shop'), ready: sampleSet('ready'), blocked: sampleSet('blocked'), week: sampleSet('week') }; }

  var api = {
    VERSION: VERSION, LIMITS: LIMITS, read: read, unpack: unpack, parseReport: parseReport, analyze: analyze, render: render, samples: samples, T: T,
    skipText: skipText, num: num, pc: pc, day: day,
    _inflateRaw: inflateRaw, _gunzip: gunzip, _unzip: unzip, _parseXml: parseXml, _classify: classify, _xmlReport: xmlReport, _base64: base64, _orgOf: orgOf, _serviceOf: serviceOf
  };

  // ---------------------------------------------------------------------------
  // CLI
  // ---------------------------------------------------------------------------
  if (typeof require === 'function' && typeof module === 'object' && require.main === module) {
    var fs = require('fs'), path = require('path');
    var argv = process.argv.slice(2), o = { lang: 'en', json: false, demo: null, domain: null, minDays: 30, files: [] };
    for (var a = 0; a < argv.length; a++) {
      var arg = argv[a];
      if (arg === '--help' || arg === '-h') {
        console.log('Recuento ' + VERSION + ' — read DMARC aggregate reports and see who sends mail as your domain.\n' +
          'Usage: node recuento.js <file-or-folder>... [--lang en|es] [--json] [--domain example.com] [--min-days 30]\n' +
          '       node recuento.js --demo shop|ready|blocked|week     run on invented reports\n' +
          'Accepts .xml, .xml.gz, .zip, .eml (the email with the report attached) and folders of them.\n' +
          'Offline: no network call. Exit codes: 0 nothing to fix, 1 something to fix or identify, 2 usage/input error.');
        process.exit(0);
      } else if (arg === '--json') o.json = true;
      else if (arg === '--lang') o.lang = argv[++a];
      else if (arg === '--demo') o.demo = argv[++a];
      else if (arg === '--domain') o.domain = argv[++a];
      else if (arg === '--min-days') o.minDays = parseInt(argv[++a], 10);
      else if (arg === '--version') { console.log(VERSION); process.exit(0); }
      else if (arg[0] === '-') { console.error('Unknown option: ' + arg + ' (try --help)'); process.exit(2); }
      else o.files.push(arg);
    }
    if (!T[o.lang]) { console.error('--lang must be en or es'); process.exit(2); }
    if (!(o.minDays >= 0)) { console.error('--min-days must be a number'); process.exit(2); }
    var inputs = [];
    if (o.demo) {
      var all = samples();
      if (!all[o.demo]) { console.error('--demo must be one of: ' + Object.keys(all).join(', ')); process.exit(2); }
      inputs = all[o.demo];
    } else {
      if (!o.files.length) { console.error('Give report files or a folder, or --demo shop (try --help)'); process.exit(2); }
      var add = function (p, deep) {
        var st;
        try { st = fs.statSync(p); } catch (e) { console.error('Cannot read ' + p + ': ' + e.message); process.exit(2); }
        if (st.isDirectory()) { if (deep < 3) fs.readdirSync(p).sort().forEach(function (f) { if (f[0] !== '.') add(path.join(p, f), deep + 1); }); }
        else inputs.push({ name: path.basename(p), data: new Uint8Array(fs.readFileSync(p)) });
      };
      o.files.forEach(function (f) { add(f, 0); });
    }
    var res = read(inputs, { domain: o.domain, minDays: o.minDays });
    console.log(o.json ? JSON.stringify(res, null, 2) : render(res, o.lang));
    if (!res.domains.length) process.exit(2);
    var bad = res.domains.some(function (d) { return d.verdict === 'blocking' || d.verdict === 'fix-first' || d.verdict === 'check-first'; });
    process.exit(bad ? 1 : 0);
  }

  return api;
});
