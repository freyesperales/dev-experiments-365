// cronwise core — cron parsing + DST-aware fire simulation. Zero dependencies.
// Works in browsers and Node (uses Intl for time-zone rules).
const CronWise = (function () {
  'use strict';
  const DAY = 86400000;
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const DOWS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MACROS = {
    '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
  };
  const DIALECTS = {
    vixie: { label: 'Linux crontab / Vixie (5 fields)', quartz: false },
    k8s: { label: 'Kubernetes CronJob (5 fields + spec.timeZone)', quartz: false },
    quartz: { label: 'Quartz / Spring (6-7 fields, seconds first)', quartz: true },
    eventbridge: { label: 'AWS EventBridge (6 fields, year last)', quartz: true },
  };

  class CronError extends Error {}

  // ---------- parsing ----------
  function parseNumber(tok, names, lo, hi, what) {
    const up = tok.toUpperCase();
    let n;
    if (/^\d+$/.test(tok)) n = parseInt(tok, 10);
    else if (names && names.indexOf(up) >= 0) n = names.indexOf(up) + (names === MONTHS ? 1 : 0) + (names === DOWS ? names._base || 0 : 0);
    else throw new CronError(`${what}: "${tok}" is not a valid value`);
    return n;
  }

  // Returns { text, wild, set:Set, specials:[] }
  function parseField(text, o) {
    const { lo, hi, what, names, nameBase, allowQ, allowSpecial, allowBareStep } = o;
    const out = { text, wild: /^[*?]/.test(text), set: new Set(), specials: [], any: false };
    const num = (tok) => {
      let n;
      if (/^\d+$/.test(tok)) n = parseInt(tok, 10);
      else if (names && names.indexOf(tok.toUpperCase()) >= 0) n = names.indexOf(tok.toUpperCase()) + nameBase;
      else throw new CronError(`${what}: "${tok}" is not a valid value`);
      if (n < lo || n > hi) throw new CronError(`${what}: ${tok} is out of range ${lo}-${hi}`);
      return n;
    };
    if (text === '') throw new CronError(`${what}: empty field`);
    if (text === '?') {
      if (!allowQ) throw new CronError(`${what}: "?" is not valid in this dialect`);
      out.any = true; out.wild = true;
      for (let i = lo; i <= hi; i++) out.set.add(i);
      return out;
    }
    for (const item of text.split(',')) {
      if (item === '') throw new CronError(`${what}: empty list element in "${text}"`);
      if (allowSpecial) {
        let m;
        if (what === 'day-of-month') {
          if (item === 'L') { out.specials.push({ t: 'L' }); continue; }
          if (item === 'LW') { out.specials.push({ t: 'LW' }); continue; }
          if ((m = /^L-(\d+)$/.exec(item))) { out.specials.push({ t: 'Ln', n: +m[1] }); continue; }
          if ((m = /^(\d+)W$/i.exec(item))) {
            const n = +m[1]; if (n < 1 || n > 31) throw new CronError(`${what}: ${item} out of range`);
            out.specials.push({ t: 'W', n }); continue;
          }
        } else if (what === 'day-of-week') {
          if ((m = /^(\w+)L$/i.exec(item)) && item.toUpperCase() !== 'L') {
            out.specials.push({ t: 'dL', d: num(m[1]) }); continue;
          }
          if ((m = /^(\w+)#(\d)$/.exec(item))) {
            const k = +m[2]; if (k < 1 || k > 5) throw new CronError(`${what}: ${item} nth must be 1-5`);
            out.specials.push({ t: 'dN', d: num(m[1]), k }); continue;
          }
        }
      }
      const [base, stepTxt, extra] = item.split('/');
      if (extra !== undefined) throw new CronError(`${what}: bad step in "${item}"`);
      let step = 1, a, b;
      if (stepTxt !== undefined) {
        if (!/^\d+$/.test(stepTxt) || +stepTxt < 1) throw new CronError(`${what}: step "${stepTxt}" must be a positive integer`);
        step = +stepTxt;
      }
      if (base === '*') { a = lo; b = hi; }
      else if (base.indexOf('-') > 0) {
        const [x, y, z] = base.split('-');
        if (z !== undefined) throw new CronError(`${what}: bad range "${base}"`);
        a = num(x); b = num(y);
        if (a > b) throw new CronError(`${what}: range ${base} is backwards`);
      } else {
        a = num(base);
        if (stepTxt !== undefined) { if (!allowBareStep) throw new CronError(`${what}: "${item}" — a step needs "*" or a range here`); b = hi; }
        else b = a;
      }
      for (let i = a; i <= b; i += step) out.set.add(i);
    }
    return out;
  }

  function parse(expr, dialect) {
    dialect = dialect || 'vixie';
    const D = DIALECTS[dialect];
    if (!D) throw new CronError(`unknown dialect "${dialect}"`);
    let s = String(expr).trim().replace(/\s+/g, ' ');
    if (!s) throw new CronError('empty expression');
    if (s.startsWith('@')) {
      if (D.quartz) throw new CronError('@macros are not supported in this dialect');
      if (s === '@reboot') throw new CronError('@reboot has no schedule to simulate');
      if (!MACROS[s.toLowerCase()]) throw new CronError(`unknown macro ${s}`);
      s = MACROS[s.toLowerCase()];
    }
    let f = s.split(' ');
    let sec, year = null;
    const q = D.quartz;
    if (!q) {
      if (f.length !== 5) throw new CronError(`expected 5 fields (min hour dom mon dow), got ${f.length}`);
    } else if (dialect === 'quartz') {
      if (f.length !== 6 && f.length !== 7) throw new CronError(`Quartz expects 6 or 7 fields (sec min hour dom mon dow [year]), got ${f.length}`);
    } else {
      if (f.length !== 6) throw new CronError(`EventBridge expects 6 fields (min hour dom mon dow year), got ${f.length}`);
      f = ['0'].concat(f);
    }
    const dowNames = DOWS.slice();
    const F = (i, o) => parseField(f[i], Object.assign({ allowQ: q, allowSpecial: q, allowBareStep: q }, o));
    let off = 0;
    if (q) { sec = F(0, { lo: 0, hi: 59, what: 'second' }); off = 1; }
    else sec = { set: new Set([0]), wild: false, text: '0', specials: [] };
    const min = F(off, { lo: 0, hi: 59, what: 'minute', allowQ: false, allowSpecial: false });
    const hour = F(off + 1, { lo: 0, hi: 23, what: 'hour', allowQ: false, allowSpecial: false });
    const dom = F(off + 2, { lo: 1, hi: 31, what: 'day-of-month', allowQ: q, allowSpecial: q });
    const mon = F(off + 3, { lo: 1, hi: 12, what: 'month', names: MONTHS, nameBase: 1, allowQ: false, allowSpecial: false });
    let dow;
    if (q) dow = F(off + 4, { lo: 1, hi: 7, what: 'day-of-week', names: dowNames, nameBase: 1, allowSpecial: true });
    else dow = F(off + 4, { lo: 0, hi: 7, what: 'day-of-week', names: dowNames, nameBase: 0, allowQ: false, allowSpecial: false });
    // normalise day-of-week to 0=Sun..6=Sat
    const nd = new Set();
    for (const v of dow.set) nd.add(q ? v - 1 : v % 7);
    dow.set = nd;
    dow.specials = dow.specials.map((x) => Object.assign({}, x, x.d !== undefined ? { d: q ? x.d - 1 : x.d % 7 } : {}));
    if (q) {
      if (f.length > off + 5) year = F(off + 5, { lo: 1970, hi: 2099, what: 'year', allowQ: false, allowSpecial: false });
      if (dialect === 'eventbridge' && !year) throw new CronError('EventBridge requires a year field');
      if (dom.any === dow.any) throw new CronError('Quartz/EventBridge need "?" in exactly one of day-of-month / day-of-week');
    }
    const fixed = !/^[*?]/.test(f[off]) && !/^[*?]/.test(f[off + 1]);
    return {
      expr: String(expr).trim(), dialect, quartz: q, sec, min, hour, dom, mon, dow, year, fixed,
      times: (() => { const t = []; for (const h of [...hour.set].sort((a, b) => a - b)) for (const m of [...min.set].sort((a, b) => a - b)) for (const x of [...sec.set].sort((a, b) => a - b)) t.push([h, m, x]); return t; })(),
    };
  }

  // ---------- calendar ----------
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
  const wdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  function dayMatches(c, y, m, d) {
    if (!c.mon.set.has(m)) return false;
    if (c.year && !c.year.set.has(y)) return false;
    const wd = wdayOf(y, m, d), last = dim(y, m);
    if (!c.quartz) {
      const domOk = c.dom.set.has(d), dowOk = c.dow.set.has(wd);
      return (c.dom.wild || c.dow.wild) ? (domOk && dowOk) : (domOk || dowOk);
    }
    let domOk = c.dom.any || c.dom.set.has(d);
    if (!domOk) for (const sp of c.dom.specials) {
      if (sp.t === 'L' && d === last) domOk = true;
      else if (sp.t === 'Ln' && d === last - sp.n) domOk = true;
      else if (sp.t === 'LW') { let t = last; const w = wdayOf(y, m, t); if (w === 6) t -= 1; else if (w === 0) t -= 2; if (d === t) domOk = true; }
      else if (sp.t === 'W' && sp.n <= last) {
        let t = sp.n; const w = wdayOf(y, m, t);
        if (w === 6) t = t > 1 ? t - 1 : t + 2; else if (w === 0) t = t < last ? t + 1 : t - 2;
        if (d === t) domOk = true;
      }
    }
    let dowOk = c.dow.any || c.dow.set.has(wd);
    if (!dowOk) for (const sp of c.dow.specials) {
      if (sp.t === 'dL' && wd === sp.d && d + 7 > last) dowOk = true;
      else if (sp.t === 'dN' && wd === sp.d && Math.ceil(d / 7) === sp.k) dowOk = true;
    }
    return domOk && dowOk;
  }

  // ---------- time zones ----------
  const fmtCache = {};
  function dtf(zone) {
    if (!fmtCache[zone]) {
      try {
        fmtCache[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) { throw new CronError(`unknown time zone "${zone}"`); }
    }
    return fmtCache[zone];
  }
  function wallOf(ms, zone) {
    const o = {};
    for (const p of dtf(zone).formatToParts(new Date(ms))) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
  }
  function offsetAt(ms, zone) { // minutes east of UTC
    const w = wallOf(ms, zone);
    return Math.round((Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function wallToInstants(zone, y, mo, d, h, mi, s) {
    const g = Date.UTC(y, mo - 1, d, h, mi, s), res = [];
    for (const off of new Set([offsetAt(g - DAY, zone), offsetAt(g, zone), offsetAt(g + DAY, zone)])) {
      const t = g - off * 60000;
      if (offsetAt(t, zone) === off && res.indexOf(t) < 0) res.push(t);
    }
    return res.sort((a, b) => a - b);
  }
  function transitionBefore(t, zone) { // first instant at/after which the offset equals offsetAt(t), searching back 6h
    let lo = t - 6 * 3600000, hi = t;
    const oh = offsetAt(hi, zone);
    if (offsetAt(lo, zone) === oh) return t;
    while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2000) * 1000; if (offsetAt(mid, zone) === oh) hi = mid; else lo = mid; }
    return hi;
  }
  const p2 = (n) => String(n).padStart(2, '0');
  function fmtWall(w) { return `${w.y}-${p2(w.mo)}-${p2(w.d)} ${p2(w.h)}:${p2(w.mi)}:${p2(w.s)}`; }
  function fmtOffset(min) { const a = Math.abs(min); return `${min < 0 ? '-' : '+'}${p2(Math.floor(a / 60))}:${p2(a % 60)}`; }
  function fmtInZone(ms, zone) { return `${fmtWall(wallOf(ms, zone))} ${fmtOffset(offsetAt(ms, zone))}`; }

  // ---------- simulation ----------
  // policy 'strict'  : a wall time that does not exist never fires; one that happens twice fires twice.
  // policy 'once'    : Vixie-cron style for fixed-time jobs: a nonexistent time fires once at the moment
  //                    the clocks jump; a repeated time fires only the first time.
  // Jobs with a wildcard hour/minute follow real elapsed time in both policies (no hazard).
  function simulate(c, opts) {
    const zone = opts.zone || 'UTC', policy = opts.policy || 'strict';
    const from = opts.from, limit = opts.limit || 20, days = opts.days || 400;
    dtf(zone);
    const fires = [];
    const w0 = wallOf(from, zone);
    let dayMs = Date.UTC(w0.y, w0.mo - 1, w0.d);
    for (let i = 0; i < days + 2; i++, dayMs += DAY) {
      const dt = new Date(dayMs), y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      if (!dayMatches(c, y, mo, d)) continue;
      const oA = offsetAt(dayMs - 14 * 3600000, zone), oB = offsetAt(dayMs + 38 * 3600000, zone);
      const plain = oA === oB;
      for (const [h, mi, s] of c.times) {
        const wall = { y, mo, d, h, mi, s };
        if (plain) {
          const t = Date.UTC(y, mo - 1, d, h, mi, s) - oA * 60000;
          if (t >= from && !opts.onlyHazards) fires.push({ kind: 'normal', wall: fmtWall(wall), instant: t });
          continue;
        }
        const ins = wallToInstants(zone, y, mo, d, h, mi, s);
        if (ins.length === 1) { if (ins[0] >= from && !opts.onlyHazards) fires.push({ kind: 'normal', wall: fmtWall(wall), instant: ins[0] }); }
        else if (ins.length === 0) {
          if (!c.fixed) continue; // wildcard job: the slot simply does not exist, real-time cadence continues
          const g = Date.UTC(y, mo - 1, d, h, mi, s);
          const after = g - offsetAt(g - DAY, zone) * 60000;
          const trans = transitionBefore(after, zone);
          if (policy === 'once') { if (trans >= from) fires.push({ kind: 'shifted', wall: fmtWall(wall), instant: trans }); }
          else if (after >= from) fires.push({ kind: 'skipped', wall: fmtWall(wall), instant: null, sortKey: after });
        } else {
          const hazard = c.fixed;
          const pick = hazard && policy === 'once' ? [ins[0]] : ins;
          pick.forEach((t, k) => {
            if (t < from) return;
            if (!hazard) { if (!opts.onlyHazards) fires.push({ kind: 'normal', wall: fmtWall(wall), instant: t }); return; }
            fires.push({ kind: policy === 'once' ? 'first-of-two' : (k === 0 ? 'repeat-1' : 'repeat-2'), wall: fmtWall(wall), instant: t });
          });
        }
      }
      if (fires.length >= limit && !opts.onlyHazards) break;
    }
    fires.sort((a, b) => (a.instant ?? a.sortKey) - (b.instant ?? b.sortKey));
    return fires.slice(0, opts.onlyHazards ? 1000 : limit);
  }

  function hazards(c, opts) {
    return simulate(c, Object.assign({}, opts, { onlyHazards: true, limit: 1000 })).filter((f) => f.kind !== 'normal');
  }

  const KIND_TEXT = {
    normal: '', skipped: 'SKIPPED — this wall-clock time does not exist that day',
    shifted: 'SHIFTED — runs the moment the clocks jump forward',
    'repeat-1': 'RUNS TWICE (1st) — wall time happens twice', 'repeat-2': 'RUNS TWICE (2nd) — wall time happens twice',
    'first-of-two': 'RUNS ONCE — wall time happens twice, only the first fires',
  };

  return { parse, simulate, hazards, dayMatches, offsetAt, wallOf, wallToInstants, fmtInZone, fmtWall, fmtOffset, DIALECTS, KIND_TEXT, CronError };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CronWise;
