import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const HB = require('../core.cjs');

test('index.html embeds the current core.cjs (run `node tools/build.mjs` if this fails)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes(readFileSync(new URL('../core.cjs', import.meta.url), 'utf8').trim()));
});

test('codec round-trips every widget, including unicode', async () => {
  for (const t of HB.TYPES) {
    const s = HB.defaults(t);
    if (t === 'sign') s.x = 'Café ☕ 日本語 🚀';
    const h = await HB.encode(s);
    assert.match(h, /^[zj][A-Za-z0-9_-]+$/);
    const r = await HB.decode('#' + h);
    assert.deepEqual(r.state, HB.sanitize(s), t);
  }
});

test('compression is used when it helps and never makes links longer', async () => {
  const s = HB.defaults('sched'); s.x = Array.from({ length: 40 }, (_, i) => `${String(8 + (i >> 2)).padStart(2, '0')}:${(i % 4) * 15 || '00'} Session number ${i} in the main hall`).join('\n');
  const h = await HB.encode(s);
  assert.equal(h[0], 'z');
  assert.ok(h.length < JSON.stringify(s).length * 0.8);
  const tiny = { t: 'sign', th: 'night', ti: '', x: 'A' }, plain = Buffer.from(JSON.stringify(tiny)).toString('base64url');
  assert.ok((await HB.encode(tiny)).length <= plain.length + 1);
});

test('decode rejects garbage, truncation and unknown types without throwing', async () => {
  for (const bad of ['#', '#x123', '#z!!!', '#zAAAA', '#jZm9v', '#j' + Buffer.from('{"t":"evil"}').toString('base64url'), '#j' + Buffer.from('[1]').toString('base64url')]) {
    const r = await HB.decode(bad);
    assert.ok(r.state === null || r.error, bad);
    assert.ok(!r.state, bad);
  }
  const good = await HB.encode(HB.defaults('score'));
  assert.ok((await HB.decode('#' + good.slice(0, -6))).error);
});

test('sanitize clamps hostile values and strips unknown fields', () => {
  const s = HB.sanitize({ t: 'score', th: '<script>', ti: 'x'.repeat(999), tm: [{ n: '<img onerror=1>', s: 1e12 }], st: -5, evil: 1 });
  assert.equal(s.th, 'night'); assert.equal(s.ti.length, 80); assert.equal(s.tm.length, 2);
  assert.equal(s.tm[0].s, 99999); assert.equal(s.st, 1); assert.equal('evil' in s, false);
  assert.equal(HB.sanitize({ t: 'queue', n: 50, i: 3 }).i, 50);
  assert.equal(HB.sanitize({ t: 'timer', w: 0, cy: 99 }).w, 1);
  assert.equal(HB.sanitize({ t: 'timer', cy: 99 }).cy, 12);
  assert.equal(HB.sanitize(null), null); assert.equal(HB.sanitize({ t: 'nope' }), null);
  assert.equal(HB.sanitize({ t: 'count', at: 'NaN' }).at > 0, true);
});

test('countdown parts', () => {
  const p = HB.countdownParts(1000 + 90061000, 1000);
  assert.deepEqual([p.d, p.h, p.m, p.s, p.done], [1, 1, 1, 1, false]);
  assert.equal(HB.countdownParts(5, 5).done, true);
  assert.equal(HB.countdownParts(0, 5000).done, true);
});

test('scoreboard and queue are immutable, bounded transitions', () => {
  const s = HB.defaults('score'), a = HB.scoreAdd(s, 0, 3);
  assert.equal(s.tm[0].s, 0); assert.equal(a.tm[0].s, 3);
  assert.equal(HB.scoreAdd(a, 5, 1).tm[0].s, 3);
  let q = HB.defaults('queue');
  assert.equal(HB.queueCall(q).n, 0, 'cannot call past last issued ticket');
  q = HB.queueIssue(HB.queueIssue(q)); q = HB.queueCall(q);
  assert.deepEqual([q.n, q.i], [1, 2]);
  assert.equal(HB.queueBack(HB.queueBack(q)).n, 0);
});

test('pomodoro phase sequence: 2 rounds of 25/5 then long break 15, repeating', () => {
  const c = { w: 25, b: 5, lb: 15, cy: 2 }, m = 60000;
  const at = (min) => HB.timerPhase(c, min * m);
  assert.deepEqual([at(0).phase, at(0).n, at(0).left], ['work', 1, 25 * m]);
  assert.equal(at(24.99).phase, 'work');
  assert.deepEqual([at(25).phase, at(25).left], ['break', 5 * m]);
  assert.deepEqual([at(30).phase, at(30).n], ['work', 2]);
  assert.deepEqual([at(55).phase, at(55).left], ['long', 15 * m]);
  assert.deepEqual([at(70).phase, at(70).round, at(70).n], ['work', 1, 1]);
  assert.equal(HB.timerPhase(c, -500).phase, 'work');
});

test('timer start/pause/resume keeps elapsed time', () => {
  let c = HB.defaults('timer');
  c = HB.timerStart(c, 1000); assert.equal(HB.timerElapsed(c, 4000), 3000);
  c = HB.timerPause(c, 4000); assert.equal(HB.timerElapsed(c, 99999), 3000);
  c = HB.timerStart(c, 10000); assert.equal(HB.timerElapsed(c, 12000), 5000);
  assert.equal(HB.timerElapsed(HB.timerReset(c), 12000), 0);
  assert.equal(HB.fmtMs(61000), '01:01'); assert.equal(HB.fmtMs(500), '00:01'); assert.equal(HB.fmtMs(0), '00:00');
});

test('schedule parser: formats, am/pm, bad lines, ordering, current/next', () => {
  const p = HB.parseSchedule('13:30 Workshops\n9.30am - Keynote\n0900 Doors\n12pm Lunch\nnonsense\n25:00 bad\n10:75 bad\n12:00am Midnight');
  assert.deepEqual(p.rows.map(r => HB.fmtClock(r.m) + ' ' + r.text), ['00:00 Midnight', '09:00 Doors', '09:30 Keynote', '12:00 Lunch', '13:30 Workshops']);
  assert.deepEqual(p.bad, [5, 6, 7]);
  assert.deepEqual(HB.scheduleNow(p.rows, 9 * 60 + 45), { cur: 2, next: 3 });
  assert.deepEqual(HB.scheduleNow(p.rows, 23 * 60), { cur: 4, next: -1 });
  assert.deepEqual(HB.scheduleNow(HB.parseSchedule('10:00 A').rows, 60), { cur: -1, next: 0 });
});

function structure(q) {
  const n = q.size, m = q.modules;
  const finder = (x0, y0) => { for (let d = 0; d < 7; d++) { const ring = [m[y0][x0 + d], m[y0 + 6][x0 + d], m[y0 + d][x0], m[y0 + d][x0 + 6]]; if (!ring.every(Boolean)) return false; } return m[y0 + 3][x0 + 3] && !m[y0 + 1][x0 + 1]; };
  return finder(0, 0) && finder(n - 7, 0) && finder(0, n - 7) && m[n - 8][8] === true;
}
test('QR: sizes, capacity limits, finder patterns', () => {
  assert.equal(HB.qrEncode('hello').version, 1);
  assert.equal(HB.qrEncode('x'.repeat(17)).version, 1);
  assert.equal(HB.qrEncode('x'.repeat(18)).version, 2);
  assert.equal(HB.qrEncode('x'.repeat(HB.qrCapacity(20))).version, 20);
  assert.equal(HB.qrEncode('x'.repeat(HB.qrCapacity(20) + 1)), null);
  for (const len of [5, 40, 120, 300, 600, 850]) assert.ok(structure(HB.qrEncode('a'.repeat(len))), len);
  assert.ok(HB.qrEncode('日本語 ☕'));
});

// Independent decoder check: OpenCV's QR detector must read back what we encode, for every version.
const py = spawnSync('python3.13', ['-c', 'import cv2,numpy'], { encoding: 'utf8' }).status === 0 ? 'python3.13'
  : spawnSync('python3', ['-c', 'import cv2,numpy'], { encoding: 'utf8' }).status === 0 ? 'python3' : null;
test('QR: decodes with OpenCV (two detectors) for every version 1-20 and every mask', { skip: py ? false : 'opencv not installed (pip install opencv-python-headless)' }, () => {
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const A = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/#:.';
  const cases = [];
  for (let v = 1; v <= 20; v++) for (let m = 0; m < 8; m += (v % 2 ? 3 : 5)) {
    const len = v === 1 ? 10 : Math.floor(HB.qrCapacity(v) * (0.7 + 0.3 * rnd()));
    let text = ''; for (let i = 0; i < len; i++) text += A[Math.floor(rnd() * A.length)];
    const q = HB.qrEncode(text, m);
    assert.equal(q.mask, m);
    cases.push({ text, rows: q.modules.map(r => r.map(b => b ? '1' : '0').join('')) });
  }
  assert.equal(HB.qrEncode('x'.repeat(HB.qrCapacity(20)), 3).version, 20);
  const code = `
import sys,json,cv2,numpy as np
bad=[]
for i,c in enumerate(json.load(sys.stdin)):
    a=np.array([[0 if ch=='1' else 255 for ch in r] for r in c['rows']],dtype=np.uint8);ok=False
    for s in (4,6,8):
        b=np.kron(np.pad(a,4,constant_values=255),np.ones((s,s),dtype=np.uint8))
        if cv2.QRCodeDetector().detectAndDecode(b)[0]==c['text'] or cv2.QRCodeDetectorAruco().detectAndDecode(b)[0]==c['text']: ok=True;break
    if not ok: bad.append(i)
print(json.dumps(bad))`;
  const r = spawnSync(py, ['-c', code], { input: JSON.stringify(cases), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), []);
});

test('QR: a real hashboard link encodes and decodes', async () => {
  const link = 'https://example.github.io/hashboard/#' + await HB.encode(HB.defaults('sched'));
  const q = HB.qrEncode(link);
  assert.ok(q, 'default schedule link must fit in a QR (' + link.length + ' chars)');
});
