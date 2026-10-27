'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const U = require('../src/unbilled.js');
const S = f => fs.readFileSync(path.join(__dirname, '../samples', f), 'utf8');
const cfg = JSON.parse(S('config.json'));

test('parseHours handles clock, decimal, comma decimal and h/m text', () => {
  assert.strictEqual(U.parseHours('01:30:00'), 1.5);
  assert.strictEqual(U.parseHours('2:15'), 2.25);
  assert.strictEqual(U.parseHours('3.25'), 3.25);
  assert.strictEqual(U.parseHours('3,5'), 3.5);
  assert.strictEqual(U.parseHours('1h 30m'), 1.5);
  assert.strictEqual(U.parseHours('45m'), 0.75);
  assert.strictEqual(U.parseHours(''), null);
  assert.ok(Number.isNaN(U.parseHours('abc')));
});

test('parseCSV: quotes, embedded newlines/delimiters, BOM, truncated input', () => {
  const r = U.parseCSV('﻿a,b\n"x,1","line\nbreak"\n"he said ""hi""",2\n');
  assert.deepStrictEqual(r.rows[1], ['x,1', 'line\nbreak']);
  assert.deepStrictEqual(r.rows[2], ['he said "hi"', '2']);
  assert.throws(() => U.parseCSV('a,b\n"oops,1\n'), /Unterminated/);
  assert.strictEqual(U.parseCSV('a;b\n1;2').delimiter, ';');
});

test('presets: toggl, clockify (DMY auto-detected), harvest', () => {
  assert.strictEqual(U.loadEntries(S('toggl.csv')).preset, 'toggl');
  const c = U.loadEntries(S('clockify.csv'));
  assert.strictEqual(c.preset, 'clockify');
  assert.strictEqual(c.entries[0].date, '2026-09-14');
  assert.strictEqual(c.entries[0].rate, 70);
  const h = U.loadEntries(S('harvest.csv'));
  assert.strictEqual(h.preset, 'harvest');
  assert.strictEqual(h.entries[0].user, 'Sam Lee');
  assert.strictEqual(h.entries[2].invoiced, false);
});

test('ambiguous slash dates warn and default to MDY; override works', () => {
  const csv = 'Client,Start date,Duration\nA,03/04/2026,1:00\n';
  const a = U.loadEntries(csv);
  assert.strictEqual(a.entries[0].date, '2026-03-04');
  assert.ok(a.warnings.some(w => /ambiguous/.test(w)));
  assert.strictEqual(U.loadEntries(csv, { dateOrder: 'DMY' }).entries[0].date, '2026-04-03');
});

test('bad input gives clear errors', () => {
  assert.throws(() => U.loadEntries('a,b\n'), /No data rows/);
  assert.throws(() => U.loadEntries('Client,Foo\nA,1\n'), /date column/);
  assert.throws(() => U.loadEntries('Client,Start date\nA,2026-01-01\n'), /duration column/);
  assert.throws(() => U.loadEntries('Client,Start date,Duration\nA,nonsense,xx\n'), /No usable/);
  assert.throws(() => U.loadInvoiced('x,y\n1,2\n'), /needs columns/);
});

test('retainer: overage + out-of-scope counted, nothing double counted', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  const res = U.analyze(entries, cfg, U.loadInvoiced(S('invoiced.csv')));
  const acme = res.results.find(r => r.client === 'Acme Bakery');
  assert.strictEqual(acme.inScopeHours, 22.25);
  assert.strictEqual(acme.outOfScopeHours, 3);
  assert.strictEqual(acme.internalHours, 1);
  assert.strictEqual(acme.unbilledHours, 5.25);
  assert.strictEqual(acme.unbilledAmount, 446.25);
});

test('invoice file: worked minus invoiced; fully invoiced client is clean', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  const res = U.analyze(entries, cfg, U.loadInvoiced(S('invoiced.csv')));
  assert.strictEqual(res.results.find(r => r.client === 'Northwind Legal').unbilledHours, 3.5);
  assert.strictEqual(res.results.find(r => r.client === 'Globex').unbilledHours, 0);
});

test('extra invoiced beyond retainer offsets extra work', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  const res = U.analyze(entries, cfg, { 'acmebakery|2026-09': 25.25 });
  assert.strictEqual(res.results.find(r => r.client === 'Acme Bakery').unbilledHours, 0);
});

test('no client entries are surfaced but never priced; no draft for them', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  const res = U.analyze(entries, cfg, null);
  const nc = res.results.find(r => r.unattributed);
  assert.strictEqual(nc.unbilledHours, 1);
  assert.strictEqual(U.draft(nc), '');
});

test('harvest invoiced flag + non-billable flag; whole-word internal keywords', () => {
  const { entries } = U.loadEntries(S('harvest.csv'));
  const r = U.analyze(entries, {}, null).results[0];
  assert.strictEqual(r.unbilledHours, 5.25);
  assert.strictEqual(r.unbilledAmount, 498.75);
  const e2 = U.loadEntries('Client,Description,Start date,Duration,Billable\nA,Network breakdown fix,2026-01-02,2:00,No\nA,Lunch break,2026-01-02,1:00,No\n').entries;
  const r2 = U.analyze(e2, {}, null).results[0];
  assert.strictEqual(r2.internalHours, 1);
  assert.strictEqual(r2.flaggedNonBillableHours, 2);
});

test('--month filter, rate sources and rounding upside note', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  assert.strictEqual(U.analyze(entries, cfg, null, { month: '2026-08' }).results.length, 0);
  const e = U.loadEntries('Client,Start date,Duration,Billable\nA,2026-02-01,0:10,Yes\nA,2026-02-02,0:20,Yes\n').entries;
  const r = U.analyze(e, { clients: { A: { rate: 60, minIncrementMinutes: 15 } } }, null).results[0];
  assert.strictEqual(r.roundingUpsideHours, 0.25);
  assert.ok(r.notes.some(n => /15-minute/.test(n)));
  assert.strictEqual(r.rateSource, 'config');
});

test('starterConfig derives rates from the export', () => {
  const c = U.starterConfig(U.loadEntries(S('harvest.csv')).entries);
  assert.strictEqual(c.clients.Initech.rate, 95);
});

test('draft text and CSV export', () => {
  const { entries } = U.loadEntries(S('toggl.csv'));
  const res = U.analyze(entries, cfg, U.loadInvoiced(S('invoiced.csv')));
  const acme = res.results.find(r => r.client === 'Acme Bakery');
  assert.match(U.draft(acme, '$'), /\$446\.25 at \$85\.00\/h/);
  const csv = U.renderCSV(res);
  assert.match(csv, /^client,month,work_hours/);
  assert.match(csv, /Acme Bakery,2026-09,/);
});

test('CLI: report, exit codes, errors, init', () => {
  const cli = path.join(__dirname, '../cli.js');
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' });
  const s = path.join(__dirname, '../samples');
  let r = run('report', s + '/toggl.csv', '--config', s + '/config.json', '--invoiced', s + '/invoiced.csv');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Unbilled: \$831\.25/);
  r = run('report', s + '/toggl.csv', '--config', s + '/config.json', '--invoiced', s + '/invoiced.csv', '--fail-on-leak', '500');
  assert.strictEqual(r.status, 1);
  r = run('report', s + '/toggl.csv', '--config', s + '/config.json', '--invoiced', s + '/invoiced.csv', '--fail-on-leak', '5000');
  assert.strictEqual(r.status, 0);
  assert.strictEqual(run('report', 'nope.csv').status, 2);
  assert.strictEqual(run('bogus').status, 2);
  r = run('report', s + '/harvest.csv', '--json');
  assert.strictEqual(JSON.parse(r.stdout).totals.unbilledHours, 5.25);
  r = run('init', s + '/harvest.csv');
  assert.strictEqual(JSON.parse(r.stdout).clients.Initech.rate, 95);
});
