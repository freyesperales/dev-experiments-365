const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');

const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const run = (expr, o) => C.simulate(C.parse(expr, o.dialect), Object.assign({ from: Date.parse('2026-01-01T00:00:00Z'), limit: 5 }, o));
const haz = (expr, o) => C.hazards(C.parse(expr, o.dialect), Object.assign({ from: Date.parse('2026-01-01T00:00:00Z'), days: 366 }, o));

test('parser: lists, ranges, steps, names, macros', () => {
  const c = C.parse('*/15 9-17 * JAN,mar MON-FRI');
  assert.deepEqual([...c.min.set], [0, 15, 30, 45]);
  assert.equal(c.hour.set.size, 9);
  assert.deepEqual([...c.mon.set], [1, 3]);
  assert.deepEqual([...c.dow.set], [1, 2, 3, 4, 5]);
  assert.equal(C.parse('@daily').times.length, 1);
  assert.equal(C.parse('0 0 * * 7').dow.set.has(0), true);
});

test('parser: errors are explicit', () => {
  for (const [e, d, re] of [
    ['* * * *', 'vixie', /5 fields/], ['61 * * * *', 'vixie', /out of range/], ['* * * * ?', 'vixie', /not valid/],
    ['5/15 * * * *', 'vixie', /step needs/], ['* 9-5 * * *', 'vixie', /backwards/], ['@reboot', 'vixie', /reboot/],
    ['0 0 12 * * *', 'quartz', /exactly one/], ['0 0 12 ? * ?', 'quartz', /exactly one/], ['0 12 * * ? ', 'eventbridge', /6 fields/],
    ['* * * XYZ *', 'vixie', /not a valid value/],
  ]) assert.throws(() => C.parse(e, d), (err) => err instanceof C.CronError && re.test(err.message), e);
});

test('vixie: dom and dow are OR-ed when both restricted, AND-ed otherwise', () => {
  // 2026-02-13 is Friday; "0 0 13 * 5" fires on every 13th OR every Friday
  const f = run('0 0 13 * 5', { zone: 'UTC', limit: 4, from: Date.parse('2026-02-01T00:00:00Z') });
  assert.deepEqual(f.map((x) => iso(x.instant).slice(0, 10)), ['2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27']);
  const g = run('0 0 */10 * 5', { zone: 'UTC', limit: 3, from: Date.parse('2026-02-01T00:00:00Z') }); // wildcard-led dom => AND
  assert.ok(g.every((x) => new Date(x.instant).getUTCDay() === 5));
});

test('quartz: L, LW, nW, nL, n#k', () => {
  const days = (e) => {
    const c = C.parse(e, 'quartz'); const out = [];
    for (let d = 1; d <= 28; d++) if (C.dayMatches(c, 2026, 2, d)) out.push(d);
    return out;
  };
  assert.deepEqual(days('0 0 0 L * ?'), [28]);
  assert.deepEqual(days('0 0 0 L-2 * ?'), [26]);
  assert.deepEqual(days('0 0 0 LW * ?'), [27]); // Feb 28 2026 is Saturday
  assert.deepEqual(days('0 0 0 15W * ?'), [16]); // Feb 15 2026 is Sunday
  assert.deepEqual(days('0 0 0 1W * ?'), [2]); // Feb 1 2026 is Sunday -> Monday 2
  assert.deepEqual(days('0 0 0 ? * 6L'), [27]); // last Friday
  assert.deepEqual(days('0 0 0 ? * 2#2'), [9]); // second Monday
  assert.deepEqual(days('0 0 0 ? * MON-FRI').length, 20);
});

test('UTC and non-DST zones never produce hazards', () => {
  assert.equal(haz('30 2 * * *', { zone: 'UTC' }).length, 0);
  assert.equal(haz('30 2 * * *', { zone: 'Asia/Kolkata' }).length, 0);
});

test('spring forward, New York 2026-03-08: 02:30 does not exist', () => {
  const s = haz('30 2 * * *', { zone: 'America/New_York', policy: 'strict' });
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, 'skipped');
  assert.equal(s[0].wall, '2026-03-08 02:30:00');
  const o = haz('30 2 * * *', { zone: 'America/New_York', policy: 'once' });
  assert.equal(o[0].kind, 'shifted');
  assert.equal(iso(o[0].instant), '2026-03-08T07:00:00Z'); // 02:00 EST jumps to 03:00 EDT
});

test('fall back, New York 2026-11-01: 01:30 happens twice', () => {
  const s = haz('30 1 * * *', { zone: 'America/New_York', policy: 'strict' });
  assert.deepEqual(s.map((x) => [x.kind, iso(x.instant)]), [['repeat-1', '2026-11-01T05:30:00Z'], ['repeat-2', '2026-11-01T06:30:00Z']]);
  const o = haz('30 1 * * *', { zone: 'America/New_York', policy: 'once' });
  assert.deepEqual(o.map((x) => [x.kind, iso(x.instant)]), [['first-of-two', '2026-11-01T05:30:00Z']]);
});

test('hourly (wildcard) jobs follow real time: no hazards, 25 fires on fall-back day', () => {
  assert.equal(haz('0 * * * *', { zone: 'America/New_York' }).length, 0);
  const f = run('0 * * * *', { zone: 'America/New_York', limit: 30, from: Date.parse('2026-11-01T04:00:00Z') });
  const dayFires = f.filter((x) => x.instant < Date.parse('2026-11-02T05:00:00Z'));
  assert.equal(dayFires.length, 25);
  const spring = run('0 * * * *', { zone: 'America/New_York', limit: 30, from: Date.parse('2026-03-08T05:00:00Z') })
    .filter((x) => x.instant < Date.parse('2026-03-09T04:00:00Z'));
  assert.equal(spring.length, 23);
});

test('Europe/London 2026-03-29 gap at 01:xx and 2026-10-25 overlap', () => {
  const a = haz('15 1 * * *', { zone: 'Europe/London', policy: 'strict', from: Date.parse('2026-03-01T00:00:00Z'), days: 300 });
  assert.deepEqual(a.map((x) => [x.kind, x.wall]), [['skipped', '2026-03-29 01:15:00'], ['repeat-1', '2026-10-25 01:15:00'], ['repeat-2', '2026-10-25 01:15:00']]);
});

test('half-hour DST: Lord Howe (+10:30 -> +11:00 on 2026-10-04 at 02:00)', () => {
  const a = haz('15 2 * * *', { zone: 'Australia/Lord_Howe', policy: 'strict', from: Date.parse('2026-09-01T00:00:00Z'), days: 90 });
  assert.deepEqual(a.map((x) => x.kind), ['skipped']);
  assert.equal(haz('45 2 * * *', { zone: 'Australia/Lord_Howe', from: Date.parse('2026-09-01T00:00:00Z'), days: 90 }).length, 0);
});

test('fires near DST are correct instants (normal days)', () => {
  const f = run('0 9 * * *', { zone: 'America/New_York', limit: 3, from: Date.parse('2026-03-06T00:00:00Z') });
  assert.deepEqual(f.map((x) => iso(x.instant)), ['2026-03-06T14:00:00Z', '2026-03-07T14:00:00Z', '2026-03-08T13:00:00Z']);
});

test('Quartz seconds and year, EventBridge', () => {
  const f = run('30 0 12 * * ? 2027', { dialect: 'quartz', zone: 'UTC', limit: 2 });
  assert.equal(iso(f[0].instant), '2027-01-01T12:00:30Z');
  const e = run('0 12 * * ? 2026', { dialect: 'eventbridge', zone: 'UTC', limit: 1 });
  assert.equal(iso(e[0].instant), '2026-01-01T12:00:00Z');
});

test('unknown zone is rejected', () => {
  assert.throws(() => run('0 0 * * *', { zone: 'Mars/Base' }), C.CronError);
});
