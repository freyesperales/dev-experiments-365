'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const L = require('../src/core.js');
const S = require('../src/sample.js');
const CLI = path.join(__dirname, '..', 'bin', 'logfold.js');
const one = text => L.analyze([{ name: 't', text }]);

test('timestamps: ISO, nginx, syslog, epoch, time-only', () => {
  assert.equal(L.extractTimestamp('2026-10-10T10:00:01.250Z INFO hi').ts, Date.UTC(2026, 9, 10, 10, 0, 1, 250));
  assert.equal(L.extractTimestamp('2026-10-10 12:00:00+02:00 x').ts, Date.UTC(2026, 9, 10, 10, 0, 0));
  assert.equal(L.extractTimestamp('1.2.3.4 - - [10/Oct/2026:13:55:36 +0000] "GET /"').ts, Date.UTC(2026, 9, 10, 13, 55, 36));
  assert.ok(L.extractTimestamp('Oct 10 13:55:36 host sshd[1]: x').ts > 0);
  assert.equal(L.extractTimestamp('1760000000 hello').ts, 1760000000000);
  assert.equal(L.extractTimestamp('1760000000123 hello').ts, 1760000000123);
  assert.equal(L.extractTimestamp('12:30:05.5 hi').ts, Date.UTC(2000, 0, 1, 12, 30, 5, 500));
  assert.equal(L.extractTimestamp('no time here'), null);
});

test('timestamp is stripped from the template text', () => {
  const p = L.parseLine('2026-10-10T10:00:01Z INFO started in 40ms');
  assert.equal(p.text, 'INFO started in 40ms');
  assert.equal(p.level, 'INFO');
});

test('masking: ip, uuid, hex, path, numbers, email', () => {
  assert.equal(L.maskToken('10.0.0.5:5432'), '<IP>');
  assert.equal(L.maskToken('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), '<UUID>');
  assert.equal(L.maskToken('deadbeef01'), '<HEX>');
  assert.equal(L.maskToken('0x7ffd'), '<HEX>');
  assert.equal(L.maskToken('/var/log/app/x.log'), '<PATH>');
  assert.equal(L.maskToken('48ms'), '<N>ms');
  assert.equal(L.maskToken('req-4821'), 'req-<N>');
  assert.equal(L.maskToken('a@b.com'), '<EMAIL>');
  assert.equal(L.maskToken('plainword'), 'plainword');
});

test('clusters lines differing only by variables into one template', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(`2026-10-10T10:00:${String(i % 60).padStart(2, '0')}Z INFO Connection to 10.0.0.${i} failed after ${i * 3}ms`);
  for (let i = 0; i < 40; i++) lines.push(`2026-10-10T10:01:00Z ERROR user u${i} not found`);
  const r = one(lines.join('\n'));
  assert.equal(r.templates.length, 2);
  assert.equal(r.templates[0].template, 'INFO Connection to <IP> failed after <N>ms');
  assert.equal(r.templates[0].total, 100);
  assert.equal(r.templates[1].total, 40);
  assert.equal(r.templates[1].level, 'ERROR');
});

test('different message shapes stay separate', () => {
  const r = one('INFO server started\nINFO worker pool resized to 8 threads for tenant 4\nWARN disk almost full on sda\n');
  assert.equal(r.templates.length, 3);
});

test('variable positions are recorded with value distributions', () => {
  const r = one('GET /a 200\nGET /b 200\nGET /c 500\nGET /d 200\n');
  const t = r.templates[0];
  assert.equal(t.total, 4);
  const status = t.vars.find(v => v.top.some(p => p[0] === '500'));
  assert.deepEqual(status.top[0], ['200', 3]);
});

test('multi-line stack traces fold into one event (timestamped log)', () => {
  const lines = [];
  for (let i = 0; i < 70; i++) lines.push(`2026-10-10T10:00:00Z ERROR boom ${i}\n    at fn (a.js:${i}:1)\n    at other (b.js:2:2)`);
  const r = one(lines.join('\n'));
  assert.equal(r.sources[0].events, 70);
  assert.equal(r.sources[0].lines, 210);
  assert.equal(r.templates.length, 1);
  assert.equal(r.templates[0].multiline, 70);
  assert.match(r.templates[0].examples[0].text, /at fn/);
});

test('multi-line in a log without timestamps (python traceback)', () => {
  const r = one('starting\nTraceback (most recent call last):\n  File "x.py", line 1, in <module>\nValueError: bad\nstarting\n');
  assert.equal(r.sources[0].events, 4);
});

test('JSON lines: message, level and time are extracted', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push(JSON.stringify({ time: '2026-10-10T10:00:' + String(i).padStart(2, '0') + 'Z', level: 'warn', msg: 'cache miss for key k' + i, svc: 'api' }));
  const r = one(rows.join('\n'));
  assert.equal(r.templates.length, 1);
  assert.equal(r.templates[0].level, 'WARN');
  assert.ok(r.sources[0].hasTime);
});

test('JSON without message falls back to key=value fields', () => {
  const p = L.parseLine('{"level":"error","code":500,"path":"/x"}');
  assert.equal(p.level, 'ERROR');
  assert.equal(p.text, 'code=500 path=/x');
});

test('robustness: empty input, blank lines, CRLF, BOM, ANSI colours', () => {
  const r0 = one('');
  assert.equal(r0.templates.length, 0);
  const r = one('﻿\x1b[31mERROR\x1b[0m something broke 5\r\n\r\n\x1b[31mERROR\x1b[0m something broke 6\r\n');
  assert.equal(r.templates.length, 1);
  assert.equal(r.templates[0].total, 2);
});

test('sparkline bins sum to the event count and respect time order', () => {
  const lines = [];
  for (let i = 0; i < 100; i++) lines.push(`2026-10-10T10:00:${String(i % 60).padStart(2, '0')}Z INFO tick`);
  for (let i = 0; i < 60; i++) lines.push(`2026-10-10T10:${String(1 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z WARN late burst ${i}`);
  const r = one(lines.join('\n'));
  const burst = r.templates.find(t => /burst/.test(t.template));
  assert.equal(burst.bins[0].reduce((a, b) => a + b, 0), 60);
  assert.equal(burst.bins[0].slice(0, 16).reduce((a, b) => a + b, 0) < 30, true);
});

test('diff: new / gone / spiking / dropping / steady', () => {
  const mk = (spec) => Object.entries(spec).map(([k, n]) => Array.from({ length: n }, (_, i) => k.replace('#', i)).join('\n')).join('\n');
  const a = mk({ 'INFO steady request #': 100, 'INFO job # was cancelled by the user': 20, 'WARN slow response from upstream after #ms': 60, 'ERROR db connection reset code #': 10 });
  const b = mk({ 'INFO steady request #': 100, 'FATAL brand new crash in module # at boot': 25, 'WARN slow response from upstream after #ms': 5, 'ERROR db connection reset code #': 80 });
  const res = L.analyze([{ name: 'a', text: a }, { name: 'b', text: b }]);
  const d = L.diff(res);
  const st = Object.fromEntries(d.rows.map(r => [r.template.split(' ')[1], r.status]));
  assert.equal(st.steady, 'steady');
  assert.equal(st.job, 'gone');
  assert.equal(st.brand, 'new');
  assert.equal(st.db, 'spiking');
  assert.equal(st.slow, 'dropping');
  assert.equal(d.rows[0].status, 'new');
});

test('diff compares per-event rates, not raw counts', () => {
  const a = Array.from({ length: 100 }, (_, i) => 'INFO hello ' + i).join('\n');
  const b = Array.from({ length: 1000 }, (_, i) => 'INFO hello ' + i).join('\n');
  const d = L.diff(L.analyze([{ name: 'a', text: a }, { name: 'b', text: b }]));
  assert.equal(d.rows[0].status, 'steady');
});

test('demo logs: the incident is found, healthy cache-warm line is gone', () => {
  const res = L.analyze([{ name: 'g', text: S.gen('good', 5000) }, { name: 'b', text: S.gen('bad', 5000) }]);
  const d = L.diff(res);
  assert.ok(d.rows.some(r => r.status === 'new' && /Connection pool exhausted/.test(r.template) && r.level === 'ERROR'));
  assert.ok(d.rows.some(r => r.status === 'gone' && /Cache warmed/.test(r.template)));
  assert.ok(res.templates.length <= 14, 'collapsed to few templates, got ' + res.templates.length);
});

test('reports render', () => {
  const r = one('INFO a 1\nINFO a 2\nWARN b\n');
  assert.match(L.toText(r), /2 templates/);
  assert.match(L.toMarkdown(r), /\| count \|/);
});

test('scale: 200k lines fold in a few seconds', () => {
  const t0 = Date.now();
  const r = one(S.gen('bad', 200000));
  assert.ok(r.templates.length < 20);
  assert.ok(Date.now() - t0 < 15000);
});

// ---- CLI ---------------------------------------------------------------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logfold-'));
test('cli: single file, json, stdin, errors', () => {
  const f = path.join(tmp, 'a.log'); fs.writeFileSync(f, S.gen('good', 500));
  const txt = execFileSync('node', [CLI, f]).toString();
  assert.match(txt, /templates/);
  const js = JSON.parse(execFileSync('node', [CLI, f, '--json']).toString());
  assert.ok(js.templates.length > 3);
  const viaStdin = execFileSync('node', [CLI, '-'], { input: S.gen('good', 200) }).toString();
  assert.match(viaStdin, /stdin/);
  assert.equal(spawnSync('node', [CLI, path.join(tmp, 'nope.log')]).status, 2);
  assert.equal(spawnSync('node', [CLI, '--bogus']).status, 2);
  assert.equal(spawnSync('node', [CLI, tmp]).status, 2);
  const e = path.join(tmp, 'empty.log'); fs.writeFileSync(e, '');
  assert.equal(spawnSync('node', [CLI, e]).status, 2);
});

test('cli: diff with --fail-on-new exits 1 on a new ERROR template', () => {
  const a = path.join(tmp, 'good.log'), b = path.join(tmp, 'bad.log');
  fs.writeFileSync(a, S.gen('good', 3000)); fs.writeFileSync(b, S.gen('bad', 3000));
  const r = spawnSync('node', [CLI, a, b, '--fail-on-new']);
  assert.equal(r.status, 1);
  assert.match(r.stdout.toString(), /new/);
  assert.equal(spawnSync('node', [CLI, a, a, '--fail-on-new']).status, 0);
});

test('index.html is in sync with src/', () => {
  const { build } = require('../scripts/build.js');
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), build());
});
