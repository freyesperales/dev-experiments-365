/* Logfold core — dependency-free log template miner (Drain-style) + diff.
 * Works in Node, browsers and Web Workers. No I/O in here. */
(function (root) {
  'use strict';

  var NBINS = 32;
  var MAX_VALUES = 200;       // distinct values tracked per variable position
  var MAX_EXAMPLES = 3;
  var EXAMPLE_CHARS = 700;
  var MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  var LEVEL_RE = /\b(TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|ERR|FATAL|CRITICAL|CRIT|SEVERE|PANIC)\b/i;
  var CONT_RE = /^(\s+|at\s|Caused by[: ]|\.\.\.\s*\d+\s+more|File ")/;
  var WILD = '<*>';

  function normLevel(l) {
    if (!l) return '';
    l = String(l).toUpperCase();
    if (l === 'WARNING') return 'WARN';
    if (l === 'ERR' || l === 'SEVERE') return 'ERROR';
    if (l === 'CRIT' || l === 'CRITICAL' || l === 'PANIC') return 'FATAL';
    if (l === 'NOTICE') return 'INFO';
    return l;
  }

  // ---- timestamps -------------------------------------------------------
  var TS_RES = [
    { re: /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?\s?(Z|[+-]\d{2}:?\d{2})?/, f: function (m) {
      var ms = m[7] ? Math.round(parseFloat('0.' + m[7]) * 1000) : 0;
      var t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
      return t - tzOffset(m[8]);
    } },
    { re: /(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s?([+-]\d{4})?/, f: function (m) {
      var mo = MONTHS[m[2].toLowerCase()]; if (mo === undefined) return NaN;
      return Date.UTC(+m[3], mo, +m[1], +m[4], +m[5], +m[6]) - tzOffset(m[7]);
    } },
    { re: /\b([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\b/, f: function (m) {
      var mo = MONTHS[m[1].toLowerCase()]; if (mo === undefined) return NaN;
      return Date.UTC(2000, mo, +m[2], +m[3], +m[4], +m[5]);
    } },
    { re: /^\W{0,2}(\d{13})\b/, f: function (m) { return +m[1]; } },
    { re: /^\W{0,2}(\d{10})(?:\.(\d+))?\b/, f: function (m) { return +m[1] * 1000 + (m[2] ? Math.round(parseFloat('0.' + m[2]) * 1000) : 0); } },
    { re: /^\W{0,2}(\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?/, f: function (m) {
      return Date.UTC(2000, 0, 1, +m[1], +m[2], +m[3], m[4] ? Math.round(parseFloat('0.' + m[4]) * 1000) : 0);
    } }
  ];
  function tzOffset(z) {
    if (!z || z === 'Z') return 0;
    var m = /^([+-])(\d{2}):?(\d{2})$/.exec(z); if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) * 60000;
  }
  // Finds a timestamp in the first 48 chars. Returns {ts, rest} or null.
  function extractTimestamp(line) {
    var head = line.slice(0, 48);
    for (var i = 0; i < TS_RES.length; i++) {
      var m = TS_RES[i].re.exec(head);
      if (!m) continue;
      var ts = TS_RES[i].f(m);
      if (ts !== ts) continue;
      var s = m.index, e = m.index + m[0].length;
      // swallow wrapping brackets and trailing separators
      if (s > 0 && /[\[(<]/.test(line[s - 1])) s--;
      if (/[\])>]/.test(line[e] || '')) e++;
      var rest = (line.slice(0, s) + ' ' + line.slice(e)).replace(/^[\s:|,-]+/, '').replace(/\s+/g, ' ').trim();
      return { ts: ts, rest: rest };
    }
    return null;
  }

  // ---- masking ----------------------------------------------------------
  var MASKS = [
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<UUID>'],
    [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<EMAIL>'],
    [/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?\b/g, '<IP>'],
    [/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '<IP>'],
    [/\b0x[0-9a-f]+\b/gi, '<HEX>'],
    [/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, '<HEX>'],
    [/(?:\/[\w.@%+=~-]+){3,}\/?/g, '<PATH>'],
    [/\d+(?:\.\d+)*/g, '<N>']
  ];
  function maskToken(tok) {
    for (var i = 0; i < MASKS.length; i++) tok = tok.replace(MASKS[i][0], MASKS[i][1]);
    return tok;
  }
  function mask(text) {
    // mask on the whole string first (UUID/IP/path patterns can't contain spaces), then tokenise
    var s = text;
    for (var i = 0; i < MASKS.length; i++) s = s.replace(MASKS[i][0], MASKS[i][1]);
    return s;
  }

  // ---- event parsing ----------------------------------------------------
  var TSKEYS = ['@timestamp', 'timestamp', 'time', 'ts', 'datetime', 't'];
  var LVKEYS = ['level', 'severity', 'lvl', 'loglevel', 'log.level'];
  var MSGKEYS = ['msg', 'message', 'event', 'log', 'body'];

  function parseJsonLine(line) {
    var o;
    try { o = JSON.parse(line); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    var ts = null, level = '', msg = null, k, i;
    for (i = 0; i < TSKEYS.length; i++) if (o[TSKEYS[i]] !== undefined) {
      var v = o[TSKEYS[i]];
      if (typeof v === 'number') ts = v < 1e11 ? v * 1000 : v;
      else if (typeof v === 'string') { var x = extractTimestamp(v); if (x) ts = x.ts; }
      if (ts !== null) break;
    }
    for (i = 0; i < LVKEYS.length; i++) if (o[LVKEYS[i]] !== undefined) { level = normLevel(o[LVKEYS[i]]); break; }
    for (i = 0; i < MSGKEYS.length; i++) if (typeof o[MSGKEYS[i]] === 'string') { msg = o[MSGKEYS[i]]; break; }
    var skip = {}; TSKEYS.concat(LVKEYS, MSGKEYS).forEach(function (s) { skip[s] = 1; });
    var extra = [];
    Object.keys(o).sort().forEach(function (key) {
      if (skip[key]) return;
      var val = o[key];
      if (val !== null && typeof val === 'object') return;
      extra.push(key + '=' + String(val).replace(/\s+/g, '_'));
    });
    var text = msg !== null ? msg.split('\n')[0] : extra.join(' ');
    if (msg !== null && extra.length) text += ' ' + extra.join(' ');
    return { ts: ts, level: level, text: text.replace(/\s+/g, ' ').trim() };
  }

  // classify a raw line: {start:bool, ts, level, text}
  function parseLine(line) {
    var t = line.replace(/\r$/, '');
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
    t = t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    if (!t.trim()) return null;
    if (t[0] === '{' && t[t.length - 1] === '}') {
      var j = parseJsonLine(t);
      if (j) { j.start = true; return j; }
    }
    var x = extractTimestamp(t);
    var level = '';
    var text = x ? x.rest : t.trim().replace(/\s+/g, ' ');
    var lm = LEVEL_RE.exec(text.slice(0, 60));
    if (lm) level = normLevel(lm[1]);
    return { start: !!x, cont: CONT_RE.test(t), ts: x ? x.ts : null, level: level, text: text };
  }

  // ---- Drain-style clustering ------------------------------------------
  function isVarTok(t) { return t === WILD || /<[A-Z*]+>/.test(t) || /\d/.test(t); }

  function Analyzer(opts) {
    opts = opts || {};
    this.sim = opts.similarity || 0.5;
    this.sources = [];
    this.tree = Object.create(null);   // len -> firstKey -> [cluster]
    this.clusters = [];
  }

  Analyzer.prototype.addSource = function (name) {
    this.sources.push({
      name: name || 'log ' + (this.sources.length + 1),
      lines: 0, events: 0, tmin: Infinity, tmax: -Infinity, tsEvents: 0,
      levels: {}, buf: [], mode: null, cur: null
    });
    return this.sources.length - 1;
  };

  Analyzer.prototype.addLine = function (si, line) {
    var s = this.sources[si];
    s.lines++;
    if (s.mode === null) {
      s.buf.push(line);
      if (s.buf.length >= 60) this._decide(s, si);
      return;
    }
    this._feed(s, si, line);
  };

  Analyzer.prototype._decide = function (s, si) {
    var starts = 0, total = 0;
    for (var i = 0; i < s.buf.length; i++) {
      var p = parseLine(s.buf[i]); if (!p) continue;
      total++; if (p.start) starts++;
    }
    // timestamped log: lines without a timestamp are continuations
    s.mode = total && starts / total > 0.5 ? 'ts' : 'plain';
    var b = s.buf; s.buf = [];
    for (var k = 0; k < b.length; k++) this._feed(s, si, b[k]);
  };

  Analyzer.prototype._feed = function (s, si, line) {
    var p = parseLine(line);
    if (!p) return;
    var isCont = s.mode === 'ts' ? !p.start : (!p.start && p.cont);
    if (isCont && s.cur) {
      s.cur.extra++;
      if (s.cur.tail.length < EXAMPLE_CHARS) s.cur.tail += '\n' + line.replace(/\r$/, '');
      return;
    }
    this._flush(s, si);
    s.cur = { p: p, raw: line.replace(/\r$/, ''), extra: 0, tail: '' };
  };

  Analyzer.prototype._flush = function (s, si) {
    if (!s.cur) return;
    var c = s.cur; s.cur = null;
    this._event(s, si, c);
  };

  Analyzer.prototype.endSource = function (si) {
    var s = this.sources[si];
    if (s.mode === null) this._decide(s, si);
    this._flush(s, si);
    s.done = true;
  };

  Analyzer.prototype._event = function (s, si, c) {
    var p = c.p;
    var idx = s.events++;
    if (p.ts !== null) { s.tsEvents++; if (p.ts < s.tmin) s.tmin = p.ts; if (p.ts > s.tmax) s.tmax = p.ts; }
    if (p.level) s.levels[p.level] = (s.levels[p.level] || 0) + 1;
    var orig = p.text.split(' ');
    if (orig.length > 80) orig.length = 80;
    var masked = orig.map(maskToken);
    var cl = this._match(masked);
    // update template
    for (var i = 0; i < masked.length; i++) {
      if (cl.tokens[i] !== masked[i] && cl.tokens[i] !== WILD) cl.tokens[i] = WILD;
    }
    while (cl.counts.length < this.sources.length) { cl.counts.push(0); cl.first.push(null); cl.last.push(null); cl.events.push([]); }
    cl.counts[si]++;
    cl.levelCounts[p.level || ''] = (cl.levelCounts[p.level || ''] || 0) + 1;
    // time / index record for sparkline (resolved later)
    cl.events[si].push(p.ts !== null ? p.ts : -idx - 1);
    if (cl.events[si].length > 20000) thinEvents(cl.events[si]);
    if (p.ts !== null) {
      if (cl.first[si] === null || p.ts < cl.first[si]) cl.first[si] = p.ts;
      if (cl.last[si] === null || p.ts > cl.last[si]) cl.last[si] = p.ts;
    }
    // variable distributions
    for (var j = 0; j < orig.length; j++) {
      var m = cl.vars[j] || (cl.vars[j] = { map: Object.create(null), n: 0, over: 0 });
      m.n++;
      var v = orig[j];
      if (m.map[v] !== undefined) m.map[v]++;
      else if (Object.keys(m.map).length < MAX_VALUES) m.map[v] = 1;
      else m.over++;
    }
    if (cl.examples.length < MAX_EXAMPLES && (cl.examples.length === 0 || si !== cl.examples[cl.examples.length - 1].si || cl.examples.length < 2)) {
      cl.examples.push({ si: si, text: (c.raw + c.tail).slice(0, EXAMPLE_CHARS), extra: c.extra });
    }
    if (c.extra) cl.multiline += 1;
  };

  function thinEvents(a) { var out = []; for (var i = 0; i < a.length; i += 2) out.push(a[i]); a.length = 0; Array.prototype.push.apply(a, out); }

  Analyzer.prototype._match = function (masked) {
    var len = masked.length;
    var lenNode = this.tree[len] || (this.tree[len] = Object.create(null));
    var key = isVarTok(masked[0] || '') ? WILD : masked[0] || '';
    var list = lenNode[key] || (lenNode[key] = []);
    var best = null, bestSim = -1, i, k;
    for (i = 0; i < list.length; i++) {
      var t = list[i].tokens, eq = 0, fixed = 0;
      for (k = 0; k < len; k++) { if (t[k] === WILD) continue; fixed++; if (t[k] === masked[k]) eq++; }
      var sim = len ? (eq + (len - fixed) * 0.0) / len : 1;
      if (sim > bestSim || (sim === bestSim && best && list[i].total > best.total)) { bestSim = sim; best = list[i]; }
    }
    if (best && bestSim >= this.sim) { best.total++; return best; }
    var cl = {
      id: this.clusters.length, tokens: masked.slice(), counts: [], first: [], last: [], events: [],
      levelCounts: {}, vars: [], examples: [], multiline: 0, total: 1
    };
    this.clusters.push(cl);
    list.push(cl);
    return cl;
  };

  Analyzer.prototype.result = function () {
    var self = this, n = this.sources.length;
    for (var si = 0; si < n; si++) if (!this.sources[si].done) this.endSource(si);
    var srcs = this.sources.map(function (s) {
      var hasTime = s.tsEvents > s.events * 0.5 && s.tmax > s.tmin;
      return { name: s.name, lines: s.lines, events: s.events, hasTime: hasTime,
        tmin: hasTime ? s.tmin : null, tmax: hasTime ? s.tmax : null, levels: s.levels };
    });
    var templates = this.clusters.map(function (cl) {
      while (cl.counts.length < n) { cl.counts.push(0); cl.first.push(null); cl.last.push(null); cl.events.push([]); }
      var bins = cl.events.map(function (ev, si) {
        var b = new Array(NBINS).fill(0), s = srcs[si], w = ev.length ? cl.counts[si] / ev.length : 0;
        for (var i = 0; i < ev.length; i++) {
          var v = ev[i], pos;
          if (v >= 0) pos = s.hasTime ? (v - s.tmin) / (s.tmax - s.tmin) : 0;
          else pos = (-v - 1) / Math.max(1, self.sources[si].events - 1);
          if (!(pos >= 0)) pos = 0;
          b[Math.min(NBINS - 1, Math.floor(pos * NBINS))] += w;
        }
        return b.map(Math.round);
      });
      var level = '', lc = -1;
      for (var l in cl.levelCounts) if (cl.levelCounts[l] > lc) { lc = cl.levelCounts[l]; level = l; }
      var vars = [];
      for (var pos = 0; pos < cl.tokens.length; pos++) {
        var t = cl.tokens[pos];
        if (!(t === WILD || isVarTok(t)) || !cl.vars[pos]) continue;
        var m = cl.vars[pos], top = Object.keys(m.map).map(function (k) { return [k, m.map[k]]; })
          .sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
        vars.push({ pos: pos, distinct: top.length + (m.over ? '+' : ''), top: top.slice(0, 8), n: m.n });
      }
      var total = cl.counts.reduce(function (a, b) { return a + b; }, 0);
      return {
        id: cl.id, template: cl.tokens.join(' '), tokens: cl.tokens.slice(), total: total,
        counts: cl.counts, first: cl.first, last: cl.last, bins: bins, level: level,
        vars: vars, examples: cl.examples, multiline: cl.multiline
      };
    });
    templates.sort(function (a, b) { return b.total - a.total || a.id - b.id; });
    return { sources: srcs, templates: templates, nbins: NBINS };
  };

  // ---- diff -------------------------------------------------------------
  // Compares source A (index 0) against B (index 1) of a 2-source result.
  function diff(res, opts) {
    opts = opts || {};
    var ratio = opts.ratio || 3, minCount = opts.minCount || 5;
    var ea = Math.max(1, res.sources[0].events), eb = Math.max(1, res.sources[1].events);
    var rows = res.templates.map(function (t) {
      var a = t.counts[0], b = t.counts[1], ra = a / ea, rb = b / eb, status, factor = null;
      if (a === 0 && b > 0) status = 'new';
      else if (a > 0 && b === 0) status = 'gone';
      else {
        factor = rb / ra;
        if (factor >= ratio && b >= minCount) status = 'spiking';
        else if (factor <= 1 / ratio && a >= minCount) status = 'dropping';
        else status = 'steady';
      }
      var weight = Math.abs(rb - ra) * 1;
      return { id: t.id, template: t.template, level: t.level, a: a, b: b, ra: ra, rb: rb, factor: factor, status: status, weight: weight };
    });
    var order = { 'new': 0, spiking: 1, gone: 2, dropping: 3, steady: 4 };
    rows.sort(function (x, y) { return order[x.status] - order[y.status] || y.weight - x.weight || y.b - x.b; });
    var summary = {};
    rows.forEach(function (r) { summary[r.status] = (summary[r.status] || 0) + 1; });
    return { rows: rows, summary: summary, events: [ea, eb] };
  }

  // ---- convenience ------------------------------------------------------
  function analyze(inputs, opts) {
    // inputs: [{name, text}]
    var an = new Analyzer(opts);
    inputs.forEach(function (inp, si) {
      an.addSource(inp.name);
      var text = inp.text, i = 0, n = text.length;
      while (i < n) {
        var j = text.indexOf('\n', i); if (j < 0) j = n;
        an.addLine(si, text.slice(i, j));
        i = j + 1;
      }
      an.endSource(si);
    });
    return an.result();
  }

  // ---- reports ----------------------------------------------------------
  function fmtTime(ms) { return ms === null || ms === undefined ? '-' : new Date(ms).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z'); }

  function toMarkdown(res, opts) {
    opts = opts || {}; var top = opts.top || 30;
    var out = [], s = res.sources;
    if (s.length === 1) {
      out.push('# Logfold — ' + s[0].name, '', s[0].events.toLocaleString('en-US') + ' events → **' + res.templates.length + ' templates**', '');
      out.push('| count | % | level | template |', '|---:|---:|---|---|');
      res.templates.slice(0, top).forEach(function (t) {
        out.push('| ' + t.total + ' | ' + (100 * t.total / Math.max(1, s[0].events)).toFixed(1) + ' | ' + (t.level || '') + ' | `' + t.template.replace(/\|/g, '\\|') + '` |');
      });
    } else {
      var d = diff(res);
      out.push('# Logfold diff — ' + s[0].name + ' → ' + s[1].name, '');
      out.push(Object.keys(d.summary).map(function (k) { return d.summary[k] + ' ' + k; }).join(', '), '');
      out.push('| status | A | B | template |', '|---|---:|---:|---|');
      d.rows.filter(function (r) { return r.status !== 'steady'; }).slice(0, top).forEach(function (r) {
        out.push('| ' + r.status + (r.factor ? ' ×' + r.factor.toFixed(1) : '') + ' | ' + r.a + ' | ' + r.b + ' | `' + r.template.replace(/\|/g, '\\|') + '` |');
      });
    }
    return out.join('\n') + '\n';
  }

  function toText(res, opts) {
    opts = opts || {}; var top = opts.top || 25, out = [], s = res.sources;
    function trunc(x, n) { return x.length > n ? x.slice(0, n - 1) + '…' : x; }
    if (s.length === 1) {
      out.push('logfold  ' + s[0].name + '  — ' + s[0].events.toLocaleString('en-US') + ' events → ' + res.templates.length + ' templates');
      if (s[0].hasTime) out.push('span     ' + fmtTime(s[0].tmin) + '  →  ' + fmtTime(s[0].tmax));
      out.push('');
      out.push('   count      %  lvl    template');
      res.templates.slice(0, top).forEach(function (t) {
        var c = String(t.total); while (c.length < 8) c = ' ' + c;
        var pc = (100 * t.total / Math.max(1, s[0].events)).toFixed(1); while (pc.length < 6) pc = ' ' + pc;
        var lv = (t.level || '').padEnd(5);
        out.push(c + pc + '  ' + lv + '  ' + trunc(t.template, 110));
      });
      if (res.templates.length > top) out.push('   … ' + (res.templates.length - top) + ' more templates (use --top N or --json)');
    } else {
      var d = diff(res, opts);
      out.push('logfold diff  ' + s[0].name + '  →  ' + s[1].name);
      out.push(Object.keys(d.summary).map(function (k) { return d.summary[k] + ' ' + k; }).join('   '));
      out.push('');
      out.push('  status        A→B (per-event rate)         template');
      d.rows.filter(function (r) { return r.status !== 'steady'; }).slice(0, top).forEach(function (r) {
        var st = (r.status + (r.factor && r.status !== 'steady' ? ' ×' + (r.factor >= 1 ? r.factor.toFixed(1) : (1 / r.factor).toFixed(1)) : '')).padEnd(13);
        out.push('  ' + st + String(r.a).padStart(7) + ' → ' + String(r.b).padEnd(8) + '  ' + trunc(r.template, 100));
      });
    }
    return out.join('\n') + '\n';
  }

  var api = { analyze: analyze, Analyzer: Analyzer, diff: diff, parseLine: parseLine, extractTimestamp: extractTimestamp,
    mask: mask, maskToken: maskToken, toMarkdown: toMarkdown, toText: toText, NBINS: NBINS, WILD: WILD, fmtTime: fmtTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Logfold = api;
})(typeof self !== 'undefined' ? self : globalThis);
