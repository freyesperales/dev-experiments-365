'use strict';
// Unbilled core: parse Toggl / Clockify / Harvest time exports, compare them with
// retainer caps, scope keywords and invoiced hours, and say what was worked but never billed.
// UMD: used by cli.js (Node) and inlined into index.html (browser). No dependencies.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Unbilled = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_INTERNAL = ['internal', 'admin', 'lunch', 'break', 'vacation', 'pto', 'holiday', 'sick'];

  // ---------- CSV ----------
  function detectDelimiter(text) {
    const head = text.split(/\r?\n/).slice(0, 5).join('\n');
    let best = ',', bestN = -1;
    for (const d of [',', ';', '\t']) {
      const n = (head.match(new RegExp(d === '\t' ? '\t' : '\\' + d, 'g')) || []).length;
      if (n > bestN) { best = d; bestN = n; }
    }
    return best;
  }

  function parseCSV(text, delimiter) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const d = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [], field = '', i = 0, inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { inQ = true; i++; continue; }
      if (c === d) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (inQ) throw new Error('Unterminated quoted field: the CSV looks truncated or malformed.');
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return { rows: rows.filter(r => r.some(x => x.trim() !== '')), delimiter: d };
  }

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ---------- value parsing ----------
  function parseHours(raw, kind) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?$/);
    if (m) return (+m[1]) + (+m[2]) / 60 + (m[3] ? +m[3] / 3600 : 0);
    m = s.match(/^(?:(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:[.,]\d+)?)\s*m(?:in(?:ute)?s?)?)?$/i);
    if (m && (m[1] || m[2])) return (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? parseFloat(m[2].replace(',', '.')) / 60 : 0);
    m = s.match(/^\d+(?:[.,]\d+)?$/);
    if (m && kind !== 'clock') return parseFloat(s.replace(',', '.'));
    return NaN;
  }

  function parseYesNo(raw) {
    const s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (['yes', 'y', 'true', '1', 'billable'].includes(s)) return true;
    if (['no', 'n', 'false', '0', 'non-billable', 'nonbillable'].includes(s)) return false;
    return null;
  }

  function parseMoney(raw) {
    const s = String(raw == null ? '' : raw).replace(/[^0-9.,-]/g, '');
    if (!s) return null;
    const v = parseFloat(s.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  }

  function splitDate(s, order) {
    s = String(s || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
    m = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if (m) return order === 'DMY' ? { y: +m[3], mo: +m[2], d: +m[1] } : { y: +m[3], mo: +m[1], d: +m[2] };
    return null;
  }

  function detectDateOrder(values) {
    let firstBig = false, secondBig = false, ambiguous = false;
    for (const v of values) {
      const m = String(v).trim().match(/^(\d{1,2})([\/.])(\d{1,2})\2\d{4}/);
      if (!m) continue;
      if (+m[1] > 12) firstBig = true; else if (+m[3] > 12) secondBig = true; else ambiguous = true;
      if (m[2] === '.') firstBig = firstBig || false;
    }
    if (firstBig && !secondBig) return { order: 'DMY', guessed: false };
    if (secondBig && !firstBig) return { order: 'MDY', guessed: false };
    if (firstBig && secondBig) return { order: 'MDY', guessed: true, conflict: true };
    const dots = values.some(v => /^\d{1,2}\.\d{1,2}\.\d{4}/.test(String(v).trim()));
    return { order: dots ? 'DMY' : 'MDY', guessed: ambiguous };
  }

  const pad = n => String(n).padStart(2, '0');
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const round3 = n => Math.round((n + Number.EPSILON) * 1000) / 1000;

  // ---------- entries ----------
  const ALIASES = {
    client: ['client', 'customer'],
    project: ['project'],
    task: ['task'],
    desc: ['description', 'notes', 'note'],
    date: ['startdate', 'date', 'day'],
    hoursDec: ['durationdecimal', 'hours', 'durationhours', 'roundedhours'],
    hoursClock: ['durationh', 'duration'],
    billable: ['billable'],
    invoiced: ['invoiced'],
    tags: ['tags'],
    user: ['user', 'member', 'person', 'name'],
    start: ['starttime'],
    end: ['endtime'],
    enddate: ['enddate'],
  };

  function detectPreset(h) {
    if (h.includes('durationdecimal') || h.includes('durationh')) return 'clockify';
    if (h.includes('hours') && (h.includes('notes') || h.includes('projectcode'))) return 'harvest';
    if (h.includes('startdate') && h.includes('duration')) return 'toggl';
    return 'generic';
  }

  function loadEntries(text, opts) {
    opts = opts || {};
    const { rows, delimiter } = parseCSV(text, opts.delimiter);
    if (rows.length < 2) throw new Error('No data rows found. Export a detailed time-entry report (one row per entry), not a summary.');
    const headers = rows[0].map(norm);
    const idx = {};
    for (const [key, names] of Object.entries(ALIASES)) {
      for (const n of names) { const i = headers.indexOf(n); if (i >= 0) { idx[key] = i; break; } }
    }
    const rateIdx = headers.findIndex(h => h.startsWith('billablerate') || h === 'rate' || h === 'hourlyrate');
    if (idx.firstname === undefined) {
      const fi = headers.indexOf('firstname'), li = headers.indexOf('lastname');
      if (fi >= 0) idx.userFirst = fi;
      if (li >= 0) idx.userLast = li;
    }
    const warnings = [];
    if (idx.date === undefined) throw new Error('Could not find a date column (expected "Start date", "Date" or "Day"). Is this a detailed time-entry export?');
    if (idx.hoursDec === undefined && idx.hoursClock === undefined && !(idx.start !== undefined && idx.end !== undefined)) {
      throw new Error('Could not find a duration column (expected "Duration", "Duration (decimal)" or "Hours").');
    }
    if (idx.client === undefined) warnings.push('No Client column: every entry is "(no client)". Group by client in the export, or map projects to clients in the config.');
    const preset = detectPreset(headers);
    const dateVals = rows.slice(1).map(r => r[idx.date] || '');
    const dd = detectDateOrder(opts.dateOrder ? [] : dateVals);
    const order = opts.dateOrder || dd.order;
    if (!opts.dateOrder && dd.guessed) warnings.push('Dates like 03/04/2026 are ambiguous; assuming ' + (order === 'DMY' ? 'day/month/year' : 'month/day/year') + '. Override with --date-order DMY|MDY.');

    const entries = [];
    let skipped = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = k => (idx[k] === undefined ? '' : String(row[idx[k]] == null ? '' : row[idx[k]]).trim());
      const dt = splitDate(get('date'), order);
      if (!dt) { skipped++; continue; }
      let hours = idx.hoursDec !== undefined ? parseHours(get('hoursDec')) : null;
      if ((hours == null || Number.isNaN(hours)) && idx.hoursClock !== undefined) hours = parseHours(get('hoursClock'), 'clock');
      if ((hours == null || Number.isNaN(hours)) && idx.start !== undefined && idx.end !== undefined) {
        const a = parseHours(get('start'), 'clock'), b = parseHours(get('end'), 'clock');
        if (a != null && b != null && !Number.isNaN(a) && !Number.isNaN(b)) hours = b >= a ? b - a : b + 24 - a;
      }
      if (hours == null || Number.isNaN(hours) || hours < 0) { skipped++; continue; }
      const user = get('user') || [idx.userFirst !== undefined ? row[idx.userFirst] : '', idx.userLast !== undefined ? row[idx.userLast] : ''].join(' ').trim();
      entries.push({
        row: r + 1,
        date: dt.y + '-' + pad(dt.mo) + '-' + pad(dt.d),
        month: dt.y + '-' + pad(dt.mo),
        client: get('client'),
        project: get('project'),
        task: get('task'),
        desc: get('desc'),
        tags: get('tags'),
        user,
        hours,
        billable: idx.billable === undefined ? null : parseYesNo(get('billable')),
        invoiced: idx.invoiced === undefined ? null : parseYesNo(get('invoiced')),
        rate: rateIdx >= 0 ? parseMoney(row[rateIdx]) : null,
      });
    }
    if (skipped) warnings.push(skipped + ' row(s) skipped (bad date or duration).');
    if (!entries.length) throw new Error('No usable time entries: every row had a bad date or duration.');
    return { preset, delimiter, entries, warnings, hasBillable: idx.billable !== undefined, hasInvoicedFlag: idx.invoiced !== undefined };
  }

  // Invoiced-hours CSV: client, month (YYYY-MM), hours
  function loadInvoiced(text) {
    const { rows } = parseCSV(text);
    if (rows.length < 2) throw new Error('Invoiced CSV has no data rows (expected columns: client, month, hours).');
    const h = rows[0].map(norm);
    const ci = h.findIndex(x => x === 'client' || x === 'customer');
    const mi = h.findIndex(x => x === 'month' || x === 'period');
    const hi = h.findIndex(x => x === 'hours' || x === 'invoicedhours' || x === 'qty' || x === 'quantity');
    if (ci < 0 || mi < 0 || hi < 0) throw new Error('Invoiced CSV needs columns: client, month (YYYY-MM), hours.');
    const out = {};
    for (const r of rows.slice(1)) {
      const mm = String(r[mi] || '').trim().match(/^(\d{4})-(\d{2})/);
      const hrs = parseHours(r[hi]);
      if (!mm || hrs == null || Number.isNaN(hrs)) continue;
      const key = norm(r[ci]) + '|' + mm[1] + '-' + mm[2];
      out[key] = (out[key] || 0) + hrs;
    }
    return out;
  }

  // ---------- config ----------
  function normalizeConfig(cfg) {
    cfg = cfg || {};
    const clients = {};
    for (const [name, c] of Object.entries(cfg.clients || {})) clients[norm(name)] = Object.assign({ name }, c);
    return {
      currency: cfg.currency || '$',
      defaultRate: Number(cfg.defaultRate) || 0,
      internalKeywords: (cfg.internalKeywords || DEFAULT_INTERNAL).map(s => String(s).toLowerCase()),
      clients,
      raw: cfg,
    };
  }

  function hasKw(text, kws, whole) {
    const t = String(text).toLowerCase();
    return (kws || []).some(k => {
      if (!k) return false;
      k = String(k).toLowerCase();
      if (!whole) return t.includes(k);
      return new RegExp('(^|[^a-z0-9])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t);
    });
  }

  function starterConfig(entries) {
    const clients = {};
    const sums = {};
    for (const e of entries) {
      if (!e.client) continue;
      const s = sums[e.client] || (sums[e.client] = { w: 0, h: 0 });
      if (e.rate) { s.w += e.rate * e.hours; s.h += e.hours; }
    }
    for (const e of entries) {
      if (!e.client || clients[e.client]) continue;
      const s = sums[e.client];
      clients[e.client] = { rate: s.h ? round2(s.w / s.h) : 0, retainerHours: null, outOfScope: [], minIncrementMinutes: 0 };
    }
    return { currency: '$', defaultRate: 0, internalKeywords: DEFAULT_INTERNAL, clients };
  }

  // ---------- analysis ----------
  function analyze(entries, config, invoicedMap, opts) {
    opts = opts || {};
    const cfg = normalizeConfig(config);
    const byKey = new Map();
    for (const e of entries) {
      if (opts.month && e.month !== opts.month) continue;
      const k = (e.client ? norm(e.client) : '') + '|' + e.month;
      if (!byKey.has(k)) byKey.set(k, { client: e.client || '(no client)', month: e.month, list: [] });
      byKey.get(k).list.push(e);
    }
    const hasFlagInvoiced = entries.some(e => e.invoiced !== null);
    const results = [];
    for (const g of byKey.values()) {
      const cc = cfg.clients[norm(g.client)] || {};
      const list = g.list.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row);
      const unattributed = g.client === '(no client)';
      const m = {
        client: g.client, month: g.month, unattributed,
        entries: list.length, totalHours: 0, internalHours: 0, workHours: 0,
        inScopeHours: 0, outOfScopeHours: 0, flaggedNonBillableHours: 0,
        invoicedHours: null, invoiceSource: 'none',
        retainerHours: cc.retainerHours != null && cc.retainerHours !== '' ? Number(cc.retainerHours) : null,
        rate: 0, rateSource: 'none',
        unbilledHours: 0, unbilledAmount: 0, reasons: [], evidence: [],
        roundingUpsideHours: 0, emptyDescriptions: 0, notes: [],
      };
      let rw = 0, rh = 0;
      const work = [];
      for (const e of list) {
        m.totalHours += e.hours;
        const text = [e.project, e.task, e.desc, e.tags].join(' ');
        if (hasKw(text, cfg.internalKeywords, true) && !hasKw(text, cc.billableKeywords)) { m.internalHours += e.hours; e.kind = 'internal'; continue; }
        if (e.rate) { rw += e.rate * e.hours; rh += e.hours; }
        let out = false;
        if (cc.inScope && cc.inScope.length) out = !hasKw(text, cc.inScope);
        if (cc.outOfScope && cc.outOfScope.length && hasKw(text, cc.outOfScope)) out = true;
        e.kind = out ? 'out' : 'in';
        if (out) m.outOfScopeHours += e.hours; else m.inScopeHours += e.hours;
        m.workHours += e.hours;
        if (e.billable === false) m.flaggedNonBillableHours += e.hours;
        if (!e.desc) m.emptyDescriptions++;
        work.push(e);
      }
      if (cc.rate) { m.rate = Number(cc.rate); m.rateSource = 'config'; }
      else if (rh) { m.rate = round2(rw / rh); m.rateSource = 'export'; }
      else if (cfg.defaultRate) { m.rate = cfg.defaultRate; m.rateSource = 'default'; }
      const inc = Number(cc.minIncrementMinutes) || 0;
      if (inc > 0) for (const e of work) m.roundingUpsideHours += (Math.ceil(e.hours * 60 / inc - 1e-9) * inc - e.hours * 60) / 60;

      const inv = invoicedMap && invoicedMap[norm(g.client) + '|' + g.month];
      let flagUninvoiced = 0;
      if (inv != null) { m.invoicedHours = inv; m.invoiceSource = 'invoice-file'; }
      else if (hasFlagInvoiced && !unattributed) {
        m.invoicedHours = work.filter(e => e.invoiced === true).reduce((a, e) => a + e.hours, 0);
        flagUninvoiced = work.filter(e => e.invoiced === false && e.billable !== false).reduce((a, e) => a + e.hours, 0);
        m.invoiceSource = 'invoiced-flag';
      }

      let extra = [];   // entries that exceed the retainer or sit outside scope
      if (unattributed) {
        m.notes.push('Hours with no client cannot be invoiced to anyone.');
        m.unbilledHours = m.workHours;
        m.reasons.push({ kind: 'no-client', hours: m.workHours, text: fmt(m.workHours) + 'h tracked with no client' });
        extra = work;
      } else if (m.retainerHours != null) {
        let used = 0;
        for (const e of work) {
          if (e.kind === 'out') { extra.push(e); continue; }
          const room = Math.max(0, m.retainerHours - used);
          if (e.hours <= room + 1e-9) { used += e.hours; continue; }
          used += room; extra.push(Object.assign({}, e, { hours: e.hours - room, kind: 'over' }));
        }
        const overage = Math.max(0, m.inScopeHours - m.retainerHours);
        const extraWork = overage + m.outOfScopeHours;
        const billedExtra = m.invoicedHours != null ? Math.max(0, m.invoicedHours - m.retainerHours) : 0;
        m.unbilledHours = Math.max(0, extraWork - billedExtra);
        if (overage > 0) m.reasons.push({ kind: 'over-retainer', hours: overage, text: fmt(overage) + 'h over the ' + fmt(m.retainerHours) + 'h retainer' });
        if (m.outOfScopeHours > 0) m.reasons.push({ kind: 'out-of-scope', hours: m.outOfScopeHours, text: fmt(m.outOfScopeHours) + 'h of out-of-scope work' });
        if (billedExtra > 0 && extraWork > 0) m.reasons.push({ kind: 'already-billed', hours: -Math.min(billedExtra, extraWork), text: 'minus ' + fmt(Math.min(billedExtra, extraWork)) + 'h already invoiced beyond the retainer' });
        if (m.invoicedHours == null && extraWork > 0) m.notes.push('No invoice data: assuming nothing beyond the retainer was invoiced.');
      } else if (m.invoiceSource === 'invoice-file') {
        m.unbilledHours = Math.max(0, m.workHours - m.invoicedHours);
        if (m.unbilledHours > 0) m.reasons.push({ kind: 'uninvoiced', hours: m.unbilledHours, text: fmt(m.workHours) + 'h worked vs ' + fmt(m.invoicedHours) + 'h invoiced' });
        extra = work.slice().reverse();
      } else if (m.invoiceSource === 'invoiced-flag') {
        m.unbilledHours = flagUninvoiced + m.flaggedNonBillableHours;
        if (flagUninvoiced > 0) m.reasons.push({ kind: 'uninvoiced', hours: flagUninvoiced, text: fmt(flagUninvoiced) + 'h billable but not marked invoiced' });
        if (m.flaggedNonBillableHours > 0) m.reasons.push({ kind: 'flagged-non-billable', hours: m.flaggedNonBillableHours, text: fmt(m.flaggedNonBillableHours) + 'h on this client marked non-billable' });
        extra = work.filter(e => e.billable === false || e.invoiced === false);
      } else {
        m.unbilledHours = m.flaggedNonBillableHours;
        if (m.flaggedNonBillableHours > 0) m.reasons.push({ kind: 'flagged-non-billable', hours: m.flaggedNonBillableHours, text: fmt(m.flaggedNonBillableHours) + 'h on this client marked non-billable' });
        extra = work.filter(e => e.billable === false);
      }
      if (m.emptyDescriptions) m.notes.push(m.emptyDescriptions + ' entr' + (m.emptyDescriptions === 1 ? 'y has' : 'ies have') + ' no description, which makes them hard to invoice.');
      if (m.unbilledHours > 0 && !m.rate) m.notes.push('No rate known: amount shown as 0. Set a rate for this client in the config.');
      // evidence: aggregate the hours that make up the unbilled amount
      const agg = new Map();
      let remaining = m.unbilledHours;
      const ordered = m.retainerHours != null || unattributed ? extra : extra;
      for (const e of ordered) {
        if (remaining <= 1e-9) break;
        const take = Math.min(e.hours, remaining);
        remaining -= take;
        const label = e.desc || ((e.task || e.project || 'entry') + ' (no description)');
        const a = agg.get(label) || { label, hours: 0, dates: [] };
        a.hours += take; a.dates.push(e.date);
        agg.set(label, a);
      }
      m.evidence = [...agg.values()].sort((a, b) => b.hours - a.hours).slice(0, 12)
        .map(a => ({ label: a.label, hours: round2(a.hours), first: a.dates[0], last: a.dates[a.dates.length - 1] }));
      m.unbilledAmount = round2(m.unbilledHours * m.rate);
      if (m.roundingUpsideHours > 0.004) m.notes.push('Billing in ' + inc + '-minute increments would add ' + fmt(m.roundingUpsideHours) + 'h (' + money(m.roundingUpsideHours * m.rate, cfg.currency) + ') on top of the above.');
      for (const k of ['totalHours', 'internalHours', 'workHours', 'inScopeHours', 'outOfScopeHours', 'flaggedNonBillableHours', 'unbilledHours', 'roundingUpsideHours']) m[k] = round2(m[k]);
      if (m.invoicedHours != null) m.invoicedHours = round2(m.invoicedHours);
      results.push(m);
    }
    results.sort((a, b) => b.unbilledAmount - a.unbilledAmount || b.unbilledHours - a.unbilledHours || (a.month < b.month ? -1 : 1));
    const leaks = results.filter(r => r.unbilledHours > 0);
    const totals = {
      unbilledAmount: round2(leaks.reduce((a, r) => a + r.unbilledAmount, 0)),
      unbilledHours: round2(leaks.reduce((a, r) => a + r.unbilledHours, 0)),
      clientMonths: results.length, leakingClientMonths: leaks.length,
      workHours: round2(results.reduce((a, r) => a + r.workHours, 0)),
      currency: cfg.currency,
    };
    return { results, totals, currency: cfg.currency };
  }

  function fmt(n) { return String(round2(n)); }
  const money = (n, cur) => (cur || '$') + round2(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // ---------- drafts ----------
  function draft(r, currency) {
    if (r.unbilledHours <= 0 || r.unattributed) return '';
    const rate = r.rate ? ' at ' + money(r.rate, currency) + '/h' : '';
    const lines = [];
    lines.push('Subject: Additional work for ' + r.month + ' (' + r.client + ')');
    lines.push('');
    lines.push('Hi,');
    lines.push('');
    if (r.retainerHours != null) {
      lines.push('In ' + r.month + ' we logged ' + fmt(r.workHours) + 'h of work against the ' + fmt(r.retainerHours) + 'h monthly retainer. The following ' + fmt(r.unbilledHours) + 'h falls outside it' + (r.rate ? ' and comes to ' + money(r.unbilledAmount, currency) + rate : '') + ':');
    } else {
      lines.push('Our ' + r.month + ' records show ' + fmt(r.unbilledHours) + 'h of work that has not yet been invoiced' + (r.rate ? ' (' + money(r.unbilledAmount, currency) + rate + ')' : '') + ':');
    }
    lines.push('');
    for (const e of r.evidence) lines.push('  - ' + e.label + ': ' + fmt(e.hours) + 'h' + (e.first === e.last ? ' (' + e.first + ')' : ' (' + e.first + ' to ' + e.last + ')'));
    lines.push('');
    lines.push(r.retainerHours != null ? 'Happy to either add this to the next invoice or agree a scope change for next month. Let me know which you prefer.' : 'I will include this on the next invoice unless you would like to discuss it first.');
    lines.push('');
    lines.push('Thanks!');
    return lines.join('\n');
  }

  // ---------- rendering ----------
  function renderText(res) {
    const cur = res.currency;
    const out = [];
    const t = res.totals;
    out.push(t.unbilledHours > 0
      ? 'Unbilled: ' + money(t.unbilledAmount, cur) + ' (' + fmt(t.unbilledHours) + 'h) across ' + t.leakingClientMonths + ' of ' + t.clientMonths + ' client-months'
      : 'No unbilled work found across ' + t.clientMonths + ' client-months (' + fmt(t.workHours) + 'h of client work).');
    for (const r of res.results) {
      if (r.unbilledHours <= 0) continue;
      out.push('');
      out.push(r.client + '  ' + r.month + '   ' + money(r.unbilledAmount, cur) + '  (' + fmt(r.unbilledHours) + 'h' + (r.rate ? ' x ' + money(r.rate, cur) + '/h' : '') + ')');
      for (const x of r.reasons) out.push('  - ' + x.text);
      for (const e of r.evidence.slice(0, 5)) out.push('      ' + fmt(e.hours) + 'h  ' + e.label);
      for (const n of r.notes) out.push('  note: ' + n);
    }
    return out.join('\n');
  }

  function csvCell(v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function renderCSV(res) {
    const head = ['client', 'month', 'work_hours', 'retainer_hours', 'invoiced_hours', 'out_of_scope_hours', 'unbilled_hours', 'rate', 'unbilled_amount', 'reasons'];
    const lines = [head.join(',')];
    for (const r of res.results) {
      lines.push([r.client, r.month, r.workHours, r.retainerHours == null ? '' : r.retainerHours, r.invoicedHours == null ? '' : r.invoicedHours,
        r.outOfScopeHours, r.unbilledHours, r.rate, r.unbilledAmount, r.reasons.map(x => x.text).join('; ')].map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
  }

  return { parseCSV, parseHours, loadEntries, loadInvoiced, analyze, starterConfig, normalizeConfig, draft, renderText, renderCSV, money, DEFAULT_INTERNAL };
});
