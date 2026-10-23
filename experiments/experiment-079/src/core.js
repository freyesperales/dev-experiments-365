// cuepoint core — subtitle parsing, piecewise re-timing, repair. Zero dependencies.
// Works in browsers and Node.
const Cuepoint = (function () {
  'use strict';
  class SubError extends Error {}

  // ---------- time helpers ----------
  const pad = (n, w) => String(n).padStart(w, '0');
  function fmtTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
    return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${sep || ','}${pad(ms % 1000, 3)}`;
  }
  // Accepts "1:02:03,500", "62.5", "01:02.5", "-0:00:01", "+2.5s"; returns ms or null.
  function parseTime(str) {
    if (typeof str === 'number') return str;
    let s = String(str).trim().replace(/s$/i, '');
    let sign = 1;
    if (s[0] === '-') { sign = -1; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    if (!/^\d+(:\d{1,2}){0,2}([.,]\d{1,3})?$/.test(s)) return null;
    const m = s.replace(',', '.').split(':');
    let sec = parseFloat(m.pop());
    let min = m.length ? parseInt(m.pop(), 10) : 0;
    let hr = m.length ? parseInt(m.pop(), 10) : 0;
    return sign * Math.round(((hr * 60 + min) * 60 + sec) * 1000);
  }

  // ---------- decoding ----------
  // bytes: Uint8Array. Returns {text, encoding}. Strict UTF-8 first, then a fallback legacy codepage.
  function decode(bytes, prefer) {
    let enc;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8-bom' };
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
    if (prefer && prefer !== 'auto') {
      try { return { text: new TextDecoder(prefer).decode(bytes), encoding: prefer }; } catch (e) { throw new SubError(`unknown encoding "${prefer}"`); }
    }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }; } catch (e) { /* not UTF-8 */ }
    enc = 'windows-1252';
    return { text: new TextDecoder(enc).decode(bytes), encoding: enc };
  }
  // UTF-8 text that was wrongly decoded as latin1/cp1252 ("Ã©" for "é"). Reverse it if it round-trips.
  const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function fixMojibake(text) {
    if (!/[\u00C2-\u00F4][\u0080-\u00BF\u0152-\u2122]/.test(text)) return { text, fixed: false };
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 256) out[i] = c; else if (CP1252[c] !== undefined) out[i] = CP1252[c]; else return { text, fixed: false };
    }
    try {
      const fixed = new TextDecoder('utf-8', { fatal: true }).decode(out);
      return { text: fixed, fixed: fixed !== text };
    } catch (e) { return { text, fixed: false }; }
  }

  // ---------- parsing ----------
  function detect(text) {
    const t = text.replace(/^\uFEFF/, '').trimStart();
    if (/^WEBVTT/.test(t)) return 'vtt';
    if (/^\[Script Info\]/i.test(t) || /^\[V4\+? Styles\]/im.test(t) || /^Dialogue:/m.test(t)) return 'ass';
    if (/^\{\d+\}\{\d+\}/m.test(t)) return 'sub';
    if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(t)) return 'srt';
    return null;
  }
  function parseSrtLike(text, vtt) {
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    const re = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
    const cues = []; let cur = null;
    const ms = (h, m, s, f) => (((+h || 0) * 60 + +m) * 60 + +s) * 1000 + Math.round(parseFloat('0.' + f) * 1000);
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]);
      if (m) {
        if (cur) cues.push(cur);
        cur = { start: ms(m[1], m[2], m[3], m[4]), end: ms(m[5], m[6], m[7], m[8]), text: '' };
        continue;
      }
      if (!cur) continue;
      if (lines[i].trim() === '') { cues.push(cur); cur = null; continue; }
      // a bare numeric line directly before a timing line is the SRT index, not text
      if (/^\d+$/.test(lines[i].trim()) && re.test(lines[i + 1] || '')) { cues.push(cur); cur = null; continue; }
      cur.text += (cur.text ? '\n' : '') + lines[i];
    }
    if (cur) cues.push(cur);
    if (vtt) cues.forEach((c) => { c.text = c.text.trim(); });
    return cues.map((c) => Object.assign(c, { text: c.text.replace(/\s+$/, '') }));
  }
  function parseAss(text) {
    const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
    let fmt = null; const cues = []; const head = [];
    let inEvents = false;
    for (const ln of lines) {
      if (/^\[Events\]/i.test(ln)) { inEvents = true; continue; }
      if (/^\[/.test(ln)) inEvents = false;
      if (!inEvents) { head.push(ln); continue; }
      if (/^Format:/i.test(ln)) { fmt = ln.slice(7).split(',').map((s) => s.trim().toLowerCase()); continue; }
      const m = /^(Dialogue|Comment):\s?(.*)$/.exec(ln);
      if (!m || m[1] !== 'Dialogue') continue;
      if (!fmt) throw new SubError('ASS file has Dialogue lines before a Format: line');
      const parts = m[2].split(','); const ti = fmt.indexOf('text');
      const row = parts.slice(0, ti); row.push(parts.slice(ti).join(','));
      const get = (k) => row[fmt.indexOf(k)];
      const st = parseTime(get('start')), en = parseTime(get('end'));
      if (st == null || en == null) continue;
      cues.push({ start: st, end: en, text: get('text').replace(/\\N/gi, '\n').replace(/\{[^}]*\}/g, '') });
    }
    return { cues, head: head.join('\n') };
  }
  function parseSub(text, fps) {
    const cues = [];
    for (const ln of text.replace(/\r\n?/g, '\n').split('\n')) {
      const m = /^\{(\d+)\}\{(\d+)\}(.*)$/.exec(ln);
      if (m) cues.push({ start: Math.round(m[1] / fps * 1000), end: Math.round(m[2] / fps * 1000), text: m[3].replace(/\|/g, '\n') });
    }
    return cues;
  }
  // parse(text, {format, fps}) -> {format, cues}
  function parse(text, opts) {
    opts = opts || {};
    const format = opts.format && opts.format !== 'auto' ? opts.format : detect(text);
    if (!format) throw new SubError('could not recognise the subtitle format (expected SRT, WebVTT, ASS/SSA or MicroDVD .sub)');
    let cues;
    if (format === 'srt') cues = parseSrtLike(text, false);
    else if (format === 'vtt') cues = parseSrtLike(text, true);
    else if (format === 'ass') cues = parseAss(text).cues;
    else if (format === 'sub') cues = parseSub(text, opts.fps || 23.976);
    else throw new SubError(`unsupported format "${format}"`);
    if (!cues.length) throw new SubError(`no cues found (looked for ${format.toUpperCase()})`);
    return { format, cues };
  }

  // ---------- writing ----------
  function stringify(cues, format, opts) {
    opts = opts || {};
    if (format === 'srt') return cues.map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
    if (format === 'vtt') return 'WEBVTT\n\n' + cues.map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${c.text}\n`).join('\n');
    if (format === 'ass') {
      const at = (ms) => { ms = Math.max(0, Math.round(ms / 10)); return `${Math.floor(ms / 360000)}:${pad(Math.floor(ms / 6000) % 60, 2)}:${pad(Math.floor(ms / 100) % 60, 2)}.${pad(ms % 100, 2)}`; };
      return '[Script Info]\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\n\n[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,30,1\n\n[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
        cues.map((c) => `Dialogue: 0,${at(c.start)},${at(c.end)},Default,,0,0,0,,${c.text.replace(/\n/g, '\\N')}`).join('\n') + '\n';
    }
    if (format === 'sub') {
      const fps = opts.fps || 23.976;
      return cues.map((c) => `{${Math.round(c.start / 1000 * fps)}}{${Math.round(c.end / 1000 * fps)}}${c.text.replace(/\n/g, '|')}`).join('\n') + '\n';
    }
    throw new SubError(`cannot write format "${format}"`);
  }

  // ---------- re-timing ----------
  // anchors: [{from, to}] in ms — "the cue that is now at `from` should be at `to`".
  // mode 'smooth': linear between anchors, edge slopes extrapolated (fixes linear drift; 1 anchor = pure shift).
  // mode 'step':   constant offset per segment, changing at each anchor (fixes "jumps after the ad break").
  function buildMapper(anchors, mode) {
    const a = anchors.map((x) => ({ from: x.from, to: x.to })).sort((p, q) => p.from - q.from);
    if (!a.length) return (t) => t;
    for (let i = 1; i < a.length; i++) if (a[i].from === a[i - 1].from) throw new SubError(`two anchors share the same source time ${fmtTime(a[i].from)}`);
    if (a.length === 1) return (t) => t + (a[0].to - a[0].from);
    if (mode === 'step') {
      return (t) => { let off = a[0].to - a[0].from; for (const x of a) if (t >= x.from) off = x.to - x.from; return t + off; };
    }
    for (let i = 1; i < a.length; i++) if (a[i].to <= a[i - 1].to) throw new SubError('anchors must keep cues in order (target times must increase)');
    return (t) => {
      let i = 0;
      while (i < a.length - 2 && t > a[i + 1].from) i++;
      const p = a[i], q = a[i + 1];
      return p.to + (t - p.from) * (q.to - p.to) / (q.from - p.from);
    };
  }
  function retime(cues, anchors, mode) {
    const f = buildMapper(anchors, mode);
    return cues.map((c) => Object.assign({}, c, { start: Math.round(f(c.start)), end: Math.round(f(c.end)) }));
  }
  const FPS_PRESETS = [23.976, 24, 25, 29.97, 30];
  // Subtitles authored for video at `from` fps, playing on a video that runs at `to` fps (same frames).
  function fpsConvert(cues, from, to) {
    if (!(from > 0) || !(to > 0)) throw new SubError('frame rates must be positive numbers');
    const k = from / to;
    return cues.map((c) => Object.assign({}, c, { start: Math.round(c.start * k), end: Math.round(c.end * k) }));
  }
  function shift(cues, ms) { return retime(cues, [{ from: 0, to: ms }]); }

  // ---------- cleaning ----------
  const WATERMARK = /(opensubtitles|subscene|addic7ed|yifysubtitles|yts\.|advertise your product|support us and become|synced (and|&) corrected|subtitles? (by|downloaded)|www\.[\w-]+\.\w{2,}|downloaded from)/i;
  function stripHI(text) {
    let t = text.replace(/\[[^\]\n]*\]|\([^)\n]*\)|\u266A[^\n]*|\u266B[^\n]*|#[^\n]*#/g, (m) => (/^\(.*\)$/.test(m) && /[a-z]{4,}.*\s.*[a-z]/.test(m) && !/[A-Z]{2,}|\b(sighs|laughs|music|gasps|screams|coughs|applause)\b/i.test(m) ? m : ''));
    t = t.replace(/^\s*[A-Z][A-Z0-9 .'-]{1,24}:\s+/gm, '');
    return t.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '' && l.trim() !== '-').join('\n');
  }
  function stripTags(text) { return text.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\{\\[^}]*\}/g, ''); }
  // Returns {cues, report}. All steps opt-in via opts.
  function clean(cues, opts) {
    opts = Object.assign({ repair: true, minDuration: 300, minGap: 1, maxOverlapFix: true }, opts || {});
    const r = { dropped: 0, watermark: 0, hiStripped: 0, tagsStripped: 0, overlapsFixed: 0, reordered: 0, negative: 0, zeroLength: 0, extended: 0, merged: 0 };
    let out = cues.map((c) => Object.assign({}, c));
    if (opts.stripWatermarks) { const n = out.length; out = out.filter((c) => !WATERMARK.test(c.text)); r.watermark = n - out.length; }
    if (opts.stripHI) out.forEach((c) => { const t = stripHI(c.text); if (t !== c.text) { r.hiStripped++; c.text = t; } });
    if (opts.stripTags) out.forEach((c) => { const t = stripTags(c.text); if (t !== c.text) { r.tagsStripped++; c.text = t; } });
    if (opts.repair) {
      out.forEach((c) => { if (c.start < 0 || c.end < 0) { r.negative++; c.start = Math.max(0, c.start); c.end = Math.max(0, c.end); } });
      const sorted = out.slice().sort((a, b) => a.start - b.start || a.end - b.end);
      for (let i = 0; i < out.length; i++) if (out[i] !== sorted[i]) { r.reordered++; }
      out = sorted;
      const n0 = out.length; out = out.filter((c) => c.text.trim() !== ''); r.dropped += n0 - out.length;
      const merged = [];
      for (const c of out) {
        const p = merged[merged.length - 1];
        if (p && p.text === c.text && c.start <= p.end + 50) { p.end = Math.max(p.end, c.end); r.merged++; } else merged.push(c);
      }
      out = merged;
      for (let i = 0; i < out.length; i++) {
        const c = out[i], nx = out[i + 1];
        if (c.end <= c.start) { r.zeroLength++; c.end = c.start + Math.max(opts.minDuration, 1000); }
        else if (c.end - c.start < opts.minDuration) { r.extended++; c.end = c.start + opts.minDuration; }
        if (nx && c.end > nx.start) {
          if (opts.maxOverlapFix) { r.overlapsFixed++; c.end = Math.max(c.start + 1, nx.start - opts.minGap); }
        }
      }
    }
    return { cues: out, report: r };
  }

  // Concatenate two parts (CD1/CD2): second part is placed after `offsetMs`.
  function merge(a, b, offsetMs) { return a.concat(shift(b, offsetMs)).sort((x, y) => x.start - y.start); }

  // Heuristic hint for the three classic failures given the user's anchors: describes what was applied.
  function describeFix(anchors, mode) {
    if (!anchors.length) return 'no change';
    const a = anchors.slice().sort((x, y) => x.from - y.from);
    const offs = a.map((x) => x.to - x.from);
    if (a.length === 1) return `constant shift of ${offs[0] >= 0 ? '+' : ''}${offs[0]} ms`;
    if (mode === 'step') return `${a.length} step offsets: ${offs.map((o) => (o >= 0 ? '+' : '') + o + ' ms').join(', ')}`;
    if (a.length > 2) return `piecewise-linear retiming through ${a.length} anchors (offsets ${offs.map((o) => (o >= 0 ? '+' : '') + o).join(', ')} ms)`;
    const rate = (a[a.length - 1].to - a[0].to) / (a[a.length - 1].from - a[0].from);
    return `linear stretch ×${rate.toFixed(6)} (${rate > 1 ? 'slows' : 'speeds up'} subtitles ${Math.abs((rate - 1) * 100).toFixed(3)}%)`;
  }

  return { SubError, fmtTime, parseTime, decode, fixMojibake, detect, parse, stringify, buildMapper, retime, fpsConvert, shift, clean, merge, describeFix, FPS_PRESETS };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Cuepoint;
