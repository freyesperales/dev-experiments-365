/* SafeCSV core — zero dependencies, runs in Node and in the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SafeCSV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MON_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const RE_MON_NUM = new RegExp('^' + MON_WORD + '[ -]?(\\d{1,2})$', 'i');
  const RE_NUM_MON = new RegExp('^(\\d{1,2})[ -]' + MON_WORD + '$', 'i');
  const SEVERITY_RANK = { ok: 0, cosmetic: 1, altered: 2, destructive: 3 };
  const KIND_INFO = {
    'leading-zero':  { severity: 'destructive', label: 'Leading zeros stripped' },
    'plus-prefix':   { severity: 'destructive', label: 'Leading + removed' },
    'long-digits':   { severity: 'destructive', label: '16+ digit number rounded to 15 digits' },
    'e-notation':    { severity: 'destructive', label: 'Read as scientific notation' },
    'month-name':    { severity: 'destructive', label: 'Read as a date (gene/ID names like SEPT1, MARCH1)' },
    'date-like':     { severity: 'destructive', label: 'Read as a date' },
    'too-long':      { severity: 'destructive', label: 'Over 32,767 characters: Excel truncates' },
    'digits-12-15':  { severity: 'altered',     label: 'Long number shown as 1.23E+13' },
    'paren-negative': { severity: 'altered',    label: '(5) turned into -5' },
    'boolean':       { severity: 'altered',     label: 'true/false turned into TRUE/FALSE' },
    'iso-date':      { severity: 'cosmetic',    label: 'ISO date re-formatted' },
    'trailing-zero': { severity: 'cosmetic',    label: 'Trailing decimal zero dropped (2.50 shows as 2.5)' },
    'formula':       { severity: 'injection',   label: 'Starts with = + - @ : runs as a formula' }
  };

  // ---------- decoding ----------
  function decode(bytes) {
    if (typeof bytes === 'string') return { text: bytes, encoding: 'string', bom: false };
    const b = bytes;
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF)
      return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'UTF-8', bom: true };
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE)
      return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16LE', bom: true };
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF)
      return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16BE', bom: true };
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8', bom: false };
    } catch (e) {
      return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252 (not valid UTF-8)', bom: false };
    }
  }

  // ---------- parsing ----------
  function parseCSV(text, delim) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    delim = delim || ',';
    const rows = [];
    let row = [], cell = '', i = 0, inQ = false, n = text.length, sawAny = false;
    while (i < n) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '') { inQ = true; sawAny = true; i++; continue; }
      if (c === delim) { row.push(cell); cell = ''; sawAny = true; i++; continue; }
      if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = ''; sawAny = false; i++; continue;
      }
      cell += c; sawAny = true; i++;
    }
    if (inQ) throw new Error('Unterminated quoted field: the file ends inside a "..." value (is it truncated or not a CSV?)');
    if (sawAny || cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function detectDelimiter(text) {
    const sample = text.length > 200000 ? text.slice(0, 200000) : text;
    let best = ',', bestScore = -1;
    for (const d of [',', ';', '\t', '|']) {
      let rows;
      try { rows = parseCSV(sample, d); } catch (e) { rows = parseCSV(sample + '"', d); }
      rows = rows.slice(0, 30);
      if (!rows.length) continue;
      const counts = rows.map(r => r.length), freq = {};
      counts.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
      let mode = 0, modeN = 0;
      for (const k in freq) if (freq[k] > modeN) { mode = +k; modeN = freq[k]; }
      const score = mode > 1 ? (modeN / rows.length) * 100 + Math.min(mode, 20) : 0;
      if (score > bestScore + 1e-9) { best = d; bestScore = score; }
    }
    return best;
  }

  // ---------- Excel behaviour model (en-US "General" format) ----------
  function general(num) {
    if (!isFinite(num)) return '#NUM!';
    const a = Math.abs(num);
    if (a !== 0 && (a >= 1e11 || a < 1e-9)) {
      let s = num.toExponential(5).replace(/\.?0+e/, 'E');
      s = s.replace('e', 'E').replace(/E([+-])(\d)$/, 'E$10$2');
      return s;
    }
    return String(+num.toPrecision(11));
  }
  function monIndex(word) { return MONTHS.findIndex(m => word.toLowerCase().startsWith(m.toLowerCase())); }

  /** Classify one cell. Returns null (safe) or {kind, severity, label, excel}. */
  function classify(raw) {
    const v = raw;
    if (v === '' ) return null;
    if (v.length > 32767) return mk('too-long', v.slice(0, 32767).length + ' chars kept');
    let m;
    if (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && v.length > 1 && !/^[+-]\s*[$€£]?\d[\d.,]*%?$/.test(v)))
      return mk('formula', 'evaluated as a formula (#NAME?, or worse)');
    if (/^\+\d+$/.test(v)) return mk('plus-prefix', general(Number(v)));
    if (/^-?0\d+(\.\d+)?$/.test(v) || /^\+0\d+$/.test(v)) return mk('leading-zero', general(Number(v)));
    if ((m = /^-?(\d{16,})$/.exec(v))) {
      const d = m[1], kept = d.slice(0, 15) + '0'.repeat(d.length - 15);
      return mk('long-digits', general(Number(v)) + '  (stored as ' + (v[0] === '-' ? '-' : '') + kept + ')');
    }
    if (/^-?\d{12,15}$/.test(v)) return mk('digits-12-15', general(Number(v)));
    if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(v)) return mk('e-notation', general(Number(v)));
    if ((m = RE_MON_NUM.exec(v)) || (m = RE_NUM_MON.exec(v))) {
      const monWord = isNaN(+m[1]) ? m[1] : m[2], numStr = isNaN(+m[1]) ? m[2] : m[1];
      const mi = monIndex(monWord), n = +numStr;
      if (mi >= 0 && n >= 1) {
        if (n <= 31) return mk('month-name', n + '-' + MONTHS[mi]);
        return mk('month-name', MONTHS[mi] + '-' + String(n).padStart(2, '0'));
      }
    }
    if ((m = /^(\d{1,2})[/-](\d{1,2})$/.exec(v))) {
      const a = +m[1], b = +m[2];
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return mk('date-like', b + '-' + MONTHS[a - 1]);
    }
    if ((m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})$/.exec(v))) {
      const a = +m[1], b = +m[2];
      if (a >= 1 && a <= 12 && b >= 1 && b <= 31) return mk('date-like', a + '/' + b + '/' + (m[3].length === 2 ? (+m[3] < 30 ? '20' : '19') + m[3] : m[3]));
    }
    if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)) && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
      return mk('iso-date', (+m[2]) + '/' + (+m[3]) + '/' + m[1]);
    if (/^\(\d+(\.\d+)?\)$/.test(v)) return mk('paren-negative', '-' + v.slice(1, -1));
    if (/^(true|false)$/i.test(v) && v !== v.toUpperCase()) return mk('boolean', v.toUpperCase());
    if (/^\d+\.\d*0$/.test(v) && !/^0\d/.test(v)) return mk('trailing-zero', String(Number(v)));
    return null;
  }
  function mk(kind, excel) {
    const i = KIND_INFO[kind];
    return { kind, severity: i.severity, label: i.label, excel };
  }

  // ---------- analysis ----------
  /** rows[0] is the header when opts.header !== false. */
  function analyze(rows, opts) {
    opts = opts || {};
    const header = opts.header !== false;
    const head = header && rows.length ? rows[0] : null;
    const body = header ? rows.slice(1) : rows;
    const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const cols = [];
    for (let c = 0; c < ncol; c++) {
      cols.push({ index: c, name: head && head[c] !== undefined && head[c] !== '' ? head[c] : 'Column ' + (c + 1),
        counts: {}, examples: [], severity: 'ok', needsText: false, hazardCells: 0 });
    }
    const cells = [];
    const startRow = header ? 2 : 1;
    body.forEach((r, ri) => {
      for (let c = 0; c < r.length; c++) {
        const h = classify(r[c]);
        if (!h) continue;
        const col = cols[c];
        col.counts[h.kind] = (col.counts[h.kind] || 0) + 1;
        col.hazardCells++;
        if (SEVERITY_RANK[h.severity] > SEVERITY_RANK[col.severity] || (h.severity === 'injection' && col.severity === 'ok')) {
          col.severity = h.severity;
        }
        if (h.severity === 'destructive' || h.severity === 'altered') col.needsText = true;
        if (col.examples.length < 3 && !col.examples.some(e => e.kind === h.kind && col.examples.length >= 2)) {
          col.examples.push({ row: ri + startRow, value: r[c], kind: h.kind, excel: h.excel });
        }
        cells.push({ row: ri + startRow, col: c, value: r[c], kind: h.kind, severity: h.severity, label: h.label, excel: h.excel });
      }
    });
    const bySeverity = { destructive: 0, altered: 0, cosmetic: 0, injection: 0 };
    cells.forEach(x => { bySeverity[x.severity]++; });
    const warnings = [];
    if (body.length + (header ? 1 : 0) > 1048576) warnings.push('More than 1,048,576 rows: Excel will silently drop everything past that.');
    if (ncol > 16384) warnings.push('More than 16,384 columns: Excel cannot open this.');
    const widths = new Set(body.map(r => r.length));
    if (widths.size > 1) warnings.push('Ragged file: rows have ' + [...widths].sort((a, b) => a - b).join(', ') + ' fields (some rows are shorter/longer than others).');
    return { header, columns: cols, cells, bySeverity, rowCount: body.length, colCount: ncol, warnings,
      riskyColumns: cols.filter(c => c.needsText).length };
  }

  // ---------- diagnose an already-damaged file ----------
  function diagnose(rows, opts) {
    opts = opts || {};
    const header = opts.header !== false;
    const head = header && rows.length ? rows[0] : null;
    const body = header ? rows.slice(1) : rows;
    const startRow = header ? 2 : 1;
    const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const issues = [];
    const dateEaten = new RegExp('^(\\d{1,2})-' + MON_WORD.replace(/\(\?:/g, '(?:') + '$');
    for (let c = 0; c < ncol; c++) {
      const name = head && head[c] ? head[c] : 'Column ' + (c + 1);
      const vals = body.map((r, i) => ({ v: r[c] === undefined ? '' : r[c], row: i + startRow })).filter(x => x.v !== '');
      if (!vals.length) continue;
      const take = (pred) => vals.filter(x => pred(x.v));
      const dEat = take(v => /^\d{1,2}-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(v));
      if (dEat.length) {
        const share = dEat.length / vals.length;
        issues.push({ kind: 'date-eaten', column: c, name, count: dEat.length,
          confidence: share < 0.5 ? 'high' : 'low', fixable: false,
          examples: dEat.slice(0, 3).map(x => ({ row: x.row, value: x.v })),
          message: share < 0.5
            ? 'Looks like identifiers that Excel turned into dates (e.g. 1-Sep was SEPT1 / SEP1, 1-Mar was MARCH1). The original text is gone from this file: restore it from the source.'
            : 'Most values look like d-Mon dates; fine if this is a real date column, otherwise identifiers were converted.' });
      }
      const sci = take(v => /^\d(\.\d{1,5})?E\+\d{2}$/.test(v));
      if (sci.length) issues.push({ kind: 'sci-notation', column: c, name, count: sci.length, confidence: 'high', fixable: false,
        examples: sci.slice(0, 3).map(x => ({ row: x.row, value: x.v })),
        message: 'Long numbers saved in scientific notation: digits beyond ~6 significant ones were lost on save. Restore from the source.' });
      const prec = take(v => /^\d{16,}$/.test(v) && /^\d{15}0+$/.test(v) === true);
      if (prec.length) issues.push({ kind: 'precision-loss', column: c, name, count: prec.length, confidence: 'medium', fixable: false,
        examples: prec.slice(0, 3).map(x => ({ row: x.row, value: x.v })),
        message: '16+ digit values whose tail is all zeros: Excel keeps only 15 significant digits, so the real tail was probably overwritten.' });
      const err = take(v => /^#(NAME\?|VALUE!|REF!|NUM!|DIV\/0!|N\/A|NULL!)$/.test(v));
      if (err.length) issues.push({ kind: 'excel-error', column: c, name, count: err.length, confidence: 'high', fixable: false,
        examples: err.slice(0, 3).map(x => ({ row: x.row, value: x.v })),
        message: 'Excel error values were exported as data (often a formula-looking cell that was evaluated).' });
      const digitsOnly = vals.every(x => /^\d+$/.test(x.v));
      if (digitsOnly) {
        const freq = {};
        vals.forEach(x => { freq[x.v.length] = (freq[x.v.length] || 0) + 1; });
        let L = 0, LN = 0;
        for (const k in freq) if (freq[k] > LN || (freq[k] === LN && +k > L)) { L = +k; LN = freq[k]; }
        const shorter = vals.filter(x => x.v.length < L && x.v.length >= L - 3 && L >= 4);
        if (L >= 4 && LN / vals.length >= 0.7 && shorter.length && !vals.some(x => x.v.length > L)) {
          issues.push({ kind: 'zero-stripped', column: c, name, count: shorter.length, confidence: 'medium', fixable: true, padTo: L,
            examples: shorter.slice(0, 3).map(x => ({ row: x.row, value: x.v, fixed: x.v.padStart(L, '0') })),
            message: shorter.length + ' value(s) are shorter than the usual ' + L + ' digits: leading zeros were probably stripped. They can be padded back to ' + L + ' (a guess: check it).' });
        }
      }
    }
    return { issues, fixable: issues.filter(i => i.fixable).length };
  }

  function repairZeros(rows, issues, opts) {
    opts = opts || {};
    const header = opts.header !== false;
    const out = rows.map(r => r.slice());
    let fixed = 0;
    issues.filter(i => i.kind === 'zero-stripped').forEach(i => {
      for (let r = header ? 1 : 0; r < out.length; r++) {
        const v = out[r][i.column];
        if (v !== undefined && /^\d+$/.test(v) && v.length < i.padTo && v.length >= i.padTo - 3) { out[r][i.column] = v.padStart(i.padTo, '0'); fixed++; }
      }
    });
    return { rows: out, fixed };
  }

  // ---------- CSV writer ----------
  function toCSV(rows, opts) {
    opts = opts || {};
    const d = opts.delim || ',', eol = opts.eol || '\r\n';
    const q = v => (v.includes(d) || /["\r\n]/.test(v) || /^\s|\s$/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const body = rows.map((r, ri) => r.map(v => {
      if (opts.guardFormulas && !(opts.header !== false && ri === 0)) {
        const h = classify(v);
        if (h && h.kind === 'formula') v = "'" + v;
      }
      return q(v);
    }).join(d)).join(eol) + (rows.length ? eol : '');
    const text = (opts.bom ? '﻿' : '') + body;
    return text;
  }

  // ---------- XLSX writer (stored zip, inline strings) ----------
  let CRC_TABLE = null;
  function crc32(buf) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const local = [0x50, 0x4B, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
      parts.push(Uint8Array.from(local), name, data);
      central.push({ name, crc, size: data.length, offset });
      offset += local.length + name.length + data.length;
    }
    let cdSize = 0;
    for (const e of central) {
      const rec = [0x50, 0x4B, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(e.crc), ...u32(e.size), ...u32(e.size), ...u16(e.name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(e.offset)];
      parts.push(Uint8Array.from(rec), e.name);
      cdSize += rec.length + e.name.length;
    }
    parts.push(Uint8Array.from([0x50, 0x4B, 5, 6, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(offset), ...u16(0)]));
    const total = parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  /** Minimal reader for archives made by zip() above (stored entries only). Used by tests and the round-trip check. */
  function unzipStored(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), dec = new TextDecoder(), out = {};
    let p = 0;
    while (p + 30 <= bytes.length && dv.getUint32(p, true) === 0x04034b50) {
      const method = dv.getUint16(p + 8, true), size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true);
      if (method !== 0) throw new Error('unzipStored: only stored entries supported');
      const name = dec.decode(bytes.subarray(p + 30, p + 30 + nl));
      out[name] = bytes.subarray(p + 30 + nl + xl, p + 30 + nl + xl + size);
      p += 30 + nl + xl + size;
    }
    return out;
  }

  function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function xmlEsc(s) {
    return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '�').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function canonicalNumber(v) {
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) return false;
    if (v.replace(/^-/, '').replace('.', '').replace(/^0+/, '').length > 15) return false;
    return String(Number(v)) === v && isFinite(Number(v));
  }

  /**
   * Build an .xlsx where every cell round-trips to exactly the CSV text.
   * Columns in `textCols` (Set of indexes) are forced to Text format; other
   * columns get a real number only when the text is a canonical number.
   */
  function toXlsx(rows, opts) {
    opts = opts || {};
    const header = opts.header !== false, textCols = opts.textCols || new Set();
    if (rows.length > 1048576) throw new Error('Too many rows for .xlsx (' + rows.length + ' > 1,048,576).');
    const ncol = rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (ncol > 16384) throw new Error('Too many columns for .xlsx.');
    const widths = new Array(ncol).fill(8);
    rows.slice(0, 2000).forEach(r => r.forEach((v, c) => { widths[c] = Math.min(60, Math.max(widths[c], Math.ceil(v.split(/\r?\n/)[0].length * 1.1) + 2)); }));
    const sb = [];
    rows.forEach((r, ri) => {
      let line = '<row r="' + (ri + 1) + '">';
      r.forEach((v, c) => {
        if (v === '') return;
        const ref = colName(c) + (ri + 1);
        if (header && ri === 0) { line += '<c r="' + ref + '" s="2" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(v) + '</t></is></c>'; return; }
        if (!textCols.has(c) && canonicalNumber(v)) { line += '<c r="' + ref + '"><v>' + v + '</v></c>'; return; }
        const text = v.length > 32767 ? v.slice(0, 32767) : v;
        line += '<c r="' + ref + '" s="' + (textCols.has(c) ? 1 : 0) + '" t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(text) + '</t></is></c>';
      });
      sb.push(line + '</row>');
    });
    const lastRef = colName(Math.max(ncol, 1) - 1) + Math.max(rows.length, 1);
    const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + lastRef + '"/>' +
      '<sheetViews><sheetView workbookViewId="0">' + (header ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' : '') + '</sheetView></sheetViews>' +
      '<cols>' + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + sb.join('') + '</sheetData>' +
      (header && rows.length > 1 && ncol ? '<autoFilter ref="A1:' + lastRef + '"/>' : '') + '</worksheet>';
    const sheetName = xmlEsc((opts.sheetName || 'Data').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Data');
    const files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + sheetName + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
      { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ];
    return zip(files);
  }

  /** Read back sheet text from an xlsx produced by toXlsx (for the round-trip self-check). */
  function readXlsxCells(bytes) {
    const files = unzipStored(bytes), xml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);
    const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const rows = [];
    const rowRe = /<row r="(\d+)">([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml))) {
      const r = +rm[1] - 1, cellRe = /<c r="([A-Z]+)\d+"[^>]*?(?: t="inlineStr")?>(?:<is><t[^>]*>([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g;
      let cm;
      rows[r] = rows[r] || [];
      while ((cm = cellRe.exec(rm[2]))) {
        let c = 0; for (const ch of cm[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
        rows[r][c - 1] = cm[2] !== undefined ? unesc(cm[2]) : cm[3];
      }
    }
    for (let i = 0; i < rows.length; i++) { rows[i] = rows[i] || []; for (let j = 0; j < rows[i].length; j++) if (rows[i][j] === undefined) rows[i][j] = ''; }
    return rows;
  }

  function summarize(a) {
    const lines = [];
    lines.push(a.rowCount + ' rows x ' + a.colCount + ' columns, ' + a.cells.length + ' risky cell(s) in ' + a.riskyColumns + ' column(s) that need Text format.');
    a.columns.filter(c => c.hazardCells).forEach(c => {
      lines.push('  [' + c.severity + '] ' + c.name + ': ' + Object.entries(c.counts).map(([k, n]) => n + ' x ' + k).join(', '));
      c.examples.forEach(e => lines.push('      row ' + e.row + ': ' + JSON.stringify(e.value) + ' -> Excel shows ' + JSON.stringify(e.excel)));
    });
    a.warnings.forEach(w => lines.push('  warning: ' + w));
    return lines.join('\n');
  }

  return { decode, parseCSV, detectDelimiter, classify, analyze, diagnose, repairZeros, toCSV, toXlsx, readXlsxCells, unzipStored, summarize, crc32, zip, KIND_INFO, general };
});
