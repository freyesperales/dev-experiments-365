/* hashboard core: pure logic (no DOM). Inlined into index.html between the CORE markers by tools/build.mjs. */
var HB = (function () {
  'use strict';
  var TYPES = ['sign', 'count', 'score', 'queue', 'timer', 'sched'];
  var THEMES = ['night', 'paper', 'terminal', 'signal', 'ocean', 'ember'];
  var LIM = { title: 80, text: 600, name: 24, sched: 1500, teams: 8 };

  function clampInt(v, lo, hi, d) {
    v = Math.floor(Number(v));
    if (!isFinite(v)) return d;
    return Math.min(hi, Math.max(lo, v));
  }
  function str(v, max, d) {
    if (typeof v !== 'string') return d === undefined ? '' : d;
    return v.slice(0, max);
  }

  /* ---------- state validation: the URL is untrusted input ---------- */
  function sanitize(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    if (TYPES.indexOf(s.t) < 0) return null;
    var o = { t: s.t, th: THEMES.indexOf(s.th) >= 0 ? s.th : 'night', ti: str(s.ti, LIM.title) };
    switch (s.t) {
      case 'sign':
        o.x = str(s.x, LIM.text, 'HELLO');
        break;
      case 'count':
        o.x = str(s.x, LIM.name * 2, 'Countdown');
        o.at = clampInt(s.at, 0, 8.64e15, Date.now() + 864e5);
        o.dn = str(s.dn, LIM.title, "It's time!");
        break;
      case 'score': {
        var tm = Array.isArray(s.tm) ? s.tm.slice(0, LIM.teams) : [];
        o.tm = tm.map(function (t) {
          t = t && typeof t === 'object' ? t : {};
          return { n: str(t.n, LIM.name, 'Team'), s: clampInt(t.s, -9999, 99999, 0) };
        });
        while (o.tm.length < 2) o.tm.push({ n: o.tm.length ? 'Away' : 'Home', s: 0 });
        o.st = clampInt(s.st, 1, 100, 1);
        break;
      }
      case 'queue':
        o.l = str(s.l, LIM.name * 2, 'Now serving');
        o.n = clampInt(s.n, 0, 9999, 0);
        o.i = clampInt(s.i, 0, 9999, 0);
        if (o.i < o.n) o.i = o.n;
        break;
      case 'timer':
        o.w = clampInt(s.w, 1, 600, 25);
        o.b = clampInt(s.b, 1, 600, 5);
        o.lb = clampInt(s.lb, 1, 600, 15);
        o.cy = clampInt(s.cy, 1, 12, 4);
        o.st = clampInt(s.st, 0, 8.64e15, 0);
        o.p = clampInt(s.p, 0, 8.64e15, 0);
        break;
      case 'sched':
        o.x = str(s.x, LIM.sched, '09:00 Doors open\n10:00 Welcome\n12:00 Lunch');
        break;
    }
    return o;
  }

  function defaults(type) {
    var base = { t: type, th: 'night', ti: '' };
    switch (type) {
      case 'sign': base.x = 'BACK IN 10 MIN'; break;
      case 'count': base.x = 'Launch day'; base.at = Date.now() + 7 * 864e5; base.dn = "We're live!"; break;
      case 'score': base.tm = [{ n: 'Home', s: 0 }, { n: 'Away', s: 0 }]; base.ti = 'Match'; break;
      case 'queue': base.l = 'Now serving'; base.n = 0; base.i = 0; break;
      case 'timer': base.w = 25; base.b = 5; base.lb = 15; base.cy = 4; base.st = 0; base.p = 0; base.ti = 'Focus'; break;
      case 'sched': base.x = '09:00 Doors open\n10:00 Welcome\n10:30 Keynote\n12:00 Lunch\n13:30 Workshops\n17:00 Wrap-up'; base.ti = 'Today'; break;
    }
    return sanitize(base);
  }

  /* ---------- URL codec: JSON -> (deflate-raw) -> base64url ---------- */
  function b64u(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(t) {
    t = t.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    var s = atob(t), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  async function pipe(bytes, stream) {
    var r = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(r).arrayBuffer());
  }
  async function encode(state) {
    var raw = new TextEncoder().encode(JSON.stringify(state));
    var plain = 'j' + b64u(raw);
    if (typeof CompressionStream === 'undefined') return plain;
    var z = 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw')));
    return z.length < plain.length ? z : plain;
  }
  async function decode(hash) {
    hash = String(hash || '').replace(/^#/, '');
    if (!hash) return { state: null };
    try {
      var kind = hash[0], bytes = unb64u(hash.slice(1));
      if (kind === 'z') {
        if (typeof DecompressionStream === 'undefined') return { error: 'This browser cannot decompress the link (DecompressionStream missing).' };
        bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
      } else if (kind !== 'j') return { error: 'Unknown link format.' };
      if (bytes.length > 20000) return { error: 'Link payload too large.' };
      var st = sanitize(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      return st ? { state: st } : { error: 'Link does not describe a known board.' };
    } catch (e) {
      return { error: 'Link is damaged or truncated.' };
    }
  }

  /* ---------- widget logic ---------- */
  function countdownParts(at, now) {
    var ms = at - now, done = ms <= 0;
    var t = Math.floor(Math.abs(ms) / 1000);
    return { done: done, d: Math.floor(t / 86400), h: Math.floor(t % 86400 / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
  }
  function scoreAdd(state, idx, delta) {
    var o = JSON.parse(JSON.stringify(state));
    if (!o.tm[idx]) return o;
    o.tm[idx].s = clampInt(o.tm[idx].s + delta, -9999, 99999, o.tm[idx].s);
    return o;
  }
  function queueCall(state) {
    var o = JSON.parse(JSON.stringify(state));
    if (o.n < o.i) o.n++;
    return o;
  }
  function queueIssue(state) {
    var o = JSON.parse(JSON.stringify(state));
    o.i = Math.min(9999, o.i + 1);
    return o;
  }
  function queueBack(state) {
    var o = JSON.parse(JSON.stringify(state));
    if (o.n > 0) o.n--;
    return o;
  }
  /* sequence: work, break, work, break ... work x cy, then one long break, repeat */
  function timerPhase(c, elapsedMs) {
    var e = Math.max(0, elapsedMs), W = c.w * 60000, B = c.b * 60000, L = c.lb * 60000;
    var cycle = c.cy * W + (c.cy - 1) * B + L;
    var round = Math.floor(e / cycle), t = e % cycle;
    for (var i = 0; i < c.cy; i++) {
      if (t < W) return { phase: 'work', n: i + 1, round: round, left: W - t, total: W };
      t -= W;
      if (i < c.cy - 1) {
        if (t < B) return { phase: 'break', n: i + 1, round: round, left: B - t, total: B };
        t -= B;
      }
    }
    return { phase: 'long', n: c.cy, round: round, left: L - t, total: L };
  }
  function timerElapsed(c, now) {
    return c.st ? now - c.st : c.p;
  }
  function timerStart(c, now) { var o = JSON.parse(JSON.stringify(c)); o.st = now - o.p; o.p = 0; return o; }
  function timerPause(c, now) { var o = JSON.parse(JSON.stringify(c)); if (o.st) { o.p = Math.max(0, now - o.st); o.st = 0; } return o; }
  function timerReset(c) { var o = JSON.parse(JSON.stringify(c)); o.st = 0; o.p = 0; return o; }

  function parseSchedule(text) {
    var rows = [], bad = [];
    String(text).split(/\r?\n/).forEach(function (line, i) {
      if (!line.trim()) return;
      var m = /^\s*(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm)?\s*[-–—:|]?\s*(.*)$/i.exec(line);
      var hh, mm, ap;
      if (m) { hh = +m[1]; ap = m[3] && m[3].toLowerCase(); mm = m[2] === undefined ? (ap ? 0 : NaN) : +m[2]; }
      if (!m || mm !== mm || mm > 59 || (ap ? (hh < 1 || hh > 12) : hh > 23)) { bad.push(i + 1); return; }
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
      rows.push({ m: hh * 60 + mm, text: m[4].trim() || '(untitled)' });
    });
    rows.sort(function (a, b) { return a.m - b.m; });
    return { rows: rows, bad: bad };
  }
  function scheduleNow(rows, minutes) {
    var cur = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].m <= minutes) cur = i;
    return { cur: cur, next: cur + 1 < rows.length ? cur + 1 : -1 };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
  function fmtMs(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }

  /* ---------- QR code (byte mode, ECC level L, versions 1-20) ---------- */
  // [data codewords, ec blocks] for level L, versions 1..20
  var L_TABLE = [null, [19, 1], [34, 1], [55, 1], [80, 1], [108, 1], [136, 2], [156, 2], [194, 2], [232, 2], [274, 4], [324, 4], [370, 4], [428, 4], [461, 4], [523, 6], [589, 6], [647, 6], [721, 6], [795, 7], [861, 8]];
  function rawModules(v) {
    var r = (16 * v + 128) * v + 64;
    if (v >= 2) { var na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(deg) {
    var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (var k = 0; k < deg; k++) {
      for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var res = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ res.shift(); res.push(0);
      div.forEach(function (c, i) { res[i] ^= gfMul(c, f); });
    });
    return res;
  }
  function utf8(text) { return Array.from(new TextEncoder().encode(text)); }

  function qrCapacity(v) { return L_TABLE[v][0] - (v <= 9 ? 2 : 3); } // bytes, minus mode+count header
  function qrEncode(text, forceMask) {
    var bytes = utf8(text), ver = 0;
    for (var v = 1; v <= 20; v++) if (bytes.length <= qrCapacity(v)) { ver = v; break; }
    if (!ver) return null;
    var bits = [];
    function put(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var cap = L_TABLE[ver][0] * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (var pb = 0xEC; bits.length < cap; pb ^= 0xEC ^ 0x11) put(pb, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var x = 0; for (var j = 0; j < 8; j++) x = x << 1 | bits[i + j]; data.push(x); }

    var raw = Math.floor(rawModules(ver) / 8), nb = L_TABLE[ver][1], eclen = (raw - L_TABLE[ver][0]) / nb;
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eclen), blocks = [], k = 0;
    for (var b = 0; b < nb; b++) {
      var dl = shortLen - eclen + (b < nShort ? 0 : 1), d = data.slice(k, k + dl); k += dl;
      var ec = rsRemainder(d, div);
      if (b < nShort) d.push(0);
      blocks.push(d.concat(ec));
    }
    var all = [];
    for (var c = 0; c < blocks[0].length; c++) blocks.forEach(function (blk, bi) { if (c !== shortLen - eclen || bi >= nShort) all.push(blk[c]); });

    var size = ver * 4 + 17, M = [], F = [];
    for (var y = 0; y < size; y++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
    function setF(x, y, dark) { M[y][x] = dark; F[y][x] = true; }
    for (var t = 0; t < size; t++) { setF(6, t, t % 2 === 0); setF(t, 6, t % 2 === 0); }
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = cx + dx, yy = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      ap = [6]; for (var pos = size - 7; ap.length < na; pos -= step) ap.splice(1, 0, pos);
    }
    ap.forEach(function (ax, i) { ap.forEach(function (ay, j) {
      if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
      for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }); });
    function drawFormat(mask) {
      var d = (1 << 3) | mask, r = d;
      for (var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var f = ((d << 10) | r) ^ 0x5412;
      function bit(i) { return ((f >>> i) & 1) !== 0; }
      for (var i2 = 0; i2 <= 5; i2++) setF(8, i2, bit(i2));
      setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
      for (var i3 = 9; i3 < 15; i3++) setF(14 - i3, 8, bit(i3));
      for (var i4 = 0; i4 < 8; i4++) setF(size - 1 - i4, 8, bit(i4));
      for (var i5 = 8; i5 < 15; i5++) setF(8, size - 15 + i5, bit(i5));
      setF(8, size - 8, true);
    }
    drawFormat(0);
    if (ver >= 7) {
      var rem = ver;
      for (var q = 0; q < 12; q++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vb = (ver << 12) | rem;
      for (var n = 0; n < 18; n++) {
        var dk = ((vb >>> n) & 1) !== 0, a = size - 11 + n % 3, bb = Math.floor(n / 3);
        setF(a, bb, dk); setF(bb, a, dk);
      }
    }
    // zigzag data placement
    var bi2 = 0, total = all.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (var j2 = 0; j2 < 2; j2++) {
        var xx2 = right - j2, up = ((right + 1) & 2) === 0, yy2 = up ? size - 1 - vert : vert;
        if (!F[yy2][xx2] && bi2 < total) { M[yy2][xx2] = ((all[bi2 >>> 3] >>> (7 - (bi2 & 7))) & 1) !== 0; bi2++; }
      }
    }
    var MASKS = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x, y) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }];
    function applyMask(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; }
    function penalty() {
      var p = 0, dark = 0, x, y, run, i;
      function line(get) {
        var rl = 1, pv = get(0);
        for (var i = 1; i < size; i++) { var c = get(i); if (c === pv) { rl++; if (rl === 5) p += 3; else if (rl > 5) p++; } else { rl = 1; pv = c; } }
      }
      for (y = 0; y < size; y++) line(function (i) { return M[y][i]; });
      for (x = 0; x < size; x++) line(function (i) { return M[i][x]; });
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) if (M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) p += 3;
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (M[y][x]) dark++;
      p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) { if (forceMask !== undefined && m !== forceMask) continue; applyMask(m); drawFormat(m); var pp = penalty(); if (pp < bestP) { bestP = pp; best = m; } applyMask(m); }
    applyMask(best); drawFormat(best);
    return { size: size, version: ver, mask: best, modules: M };
  }

  return { TYPES: TYPES, THEMES: THEMES, sanitize: sanitize, defaults: defaults, encode: encode, decode: decode,
    countdownParts: countdownParts, scoreAdd: scoreAdd, queueCall: queueCall, queueIssue: queueIssue, queueBack: queueBack,
    timerPhase: timerPhase, timerElapsed: timerElapsed, timerStart: timerStart, timerPause: timerPause, timerReset: timerReset,
    parseSchedule: parseSchedule, scheduleNow: scheduleNow, fmtClock: fmtClock, fmtMs: fmtMs, qrEncode: qrEncode, qrCapacity: qrCapacity };
})();
if (typeof module !== 'undefined') module.exports = HB;
