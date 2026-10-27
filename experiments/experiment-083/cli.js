#!/usr/bin/env node
'use strict';
const fs = require('fs');
const U = require('./src/unbilled.js');

const HELP = `Unbilled: find the hours you worked but never billed.

  unbilled report <time.csv> [--config c.json] [--invoiced inv.csv] [--month YYYY-MM]
                  [--json] [--csv out.csv] [--drafts] [--fail-on-leak AMOUNT]
  unbilled init   <time.csv> [-o config.json]     write a starter config (clients, rates found in the export)

<time.csv>  detailed time-entry export from Toggl, Clockify or Harvest (one row per entry)
--invoiced  CSV with columns: client, month (YYYY-MM), hours
--drafts    also print a ready-to-send invoice / change-request note per leak
--fail-on-leak N   exit 1 when total unbilled amount (or hours, if no rates) is >= N, for a monthly cron or CI
--date-order DMY|MDY   for ambiguous dd/mm vs mm/dd dates
`;

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  const withValue = new Set(['config', 'invoiced', 'month', 'csv', 'o', 'fail-on-leak', 'date-order']);
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '-o') a.flags.o = argv[++i];
    else if (t.startsWith('--')) {
      const k = t.slice(2);
      if (withValue.has(k)) a.flags[k] = argv[++i]; else a.flags[k] = true;
    } else a._.push(t);
  }
  return a;
}

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { throw new Error('Cannot read ' + p + ': ' + e.message); }
}

function main(argv) {
  const a = parseArgs(argv);
  const cmd = a._[0];
  if (!cmd || a.flags.help || a.flags.h || cmd === 'help') { process.stdout.write(HELP); return 0; }
  if (cmd !== 'report' && cmd !== 'init') throw new Error('Unknown command "' + cmd + '". Run with --help.');
  if (!a._[1]) throw new Error('Missing <time.csv>.');
  const order = a.flags['date-order'];
  if (order && !['DMY', 'MDY'].includes(order)) throw new Error('--date-order must be DMY or MDY.');
  const loaded = U.loadEntries(read(a._[1]), { dateOrder: order });
  for (const w of loaded.warnings) process.stderr.write('warning: ' + w + '\n');

  if (cmd === 'init') {
    const out = JSON.stringify(U.starterConfig(loaded.entries), null, 2) + '\n';
    if (a.flags.o) { fs.writeFileSync(a.flags.o, out); process.stdout.write('Wrote ' + a.flags.o + '\n'); }
    else process.stdout.write(out);
    return 0;
  }

  let config = {};
  if (a.flags.config) {
    try { config = JSON.parse(read(a.flags.config)); }
    catch (e) { throw new Error('Config is not valid JSON: ' + e.message); }
  }
  if (a.flags.month && !/^\d{4}-\d{2}$/.test(a.flags.month)) throw new Error('--month must look like 2026-09.');
  const invoiced = a.flags.invoiced ? U.loadInvoiced(read(a.flags.invoiced)) : null;
  const res = U.analyze(loaded.entries, config, invoiced, { month: a.flags.month });
  if (!res.results.length) throw new Error('No entries' + (a.flags.month ? ' in ' + a.flags.month : '') + '.');

  if (a.flags.json) process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  else {
    process.stdout.write(U.renderText(res) + '\n');
    if (a.flags.drafts) for (const r of res.results) {
      const d = U.draft(r, res.currency);
      if (d) process.stdout.write('\n----- draft: ' + r.client + ' ' + r.month + ' -----\n' + d + '\n');
    }
  }
  if (a.flags.csv) { fs.writeFileSync(a.flags.csv, U.renderCSV(res)); process.stderr.write('Wrote ' + a.flags.csv + '\n'); }
  if (a.flags['fail-on-leak'] !== undefined) {
    const n = Number(a.flags['fail-on-leak']);
    if (!Number.isFinite(n)) throw new Error('--fail-on-leak needs a number.');
    const v = res.totals.unbilledAmount > 0 ? res.totals.unbilledAmount : res.totals.unbilledHours;
    if (v >= n && v > 0) return 1;
  }
  return 0;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (e) { process.stderr.write('unbilled: ' + e.message + '\n'); process.exitCode = 2; }
