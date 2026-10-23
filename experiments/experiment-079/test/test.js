const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../src/core.js');
const SRT = `1\n00:00:01,000 --> 00:00:03,000\nHello\nthere\n\n2\n00:01:00,000 --> 00:01:02,500\nSecond\n\n3\n00:10:00,000 --> 00:10:04,000\nThird\n`;

test('parseTime / fmtTime', () => {
  assert.equal(C.parseTime('1:02:03,500'), 3723500);
  assert.equal(C.parseTime('62.5'), 62500);
  assert.equal(C.parseTime('-0:00:01'), -1000);
  assert.equal(C.parseTime('+2.5s'), 2500);
  assert.equal(C.parseTime('abc'), null);
  assert.equal(C.fmtTime(3723500), '01:02:03,500');
  assert.equal(C.fmtTime(3723500, '.'), '01:02:03.500');
});
test('parse srt keeps multi-line text and ignores indices', () => {
  const { format, cues } = C.parse(SRT);
  assert.equal(format, 'srt'); assert.equal(cues.length, 3);
  assert.equal(cues[0].text, 'Hello\nthere'); assert.equal(cues[1].start, 60000);
});
test('srt round trip', () => {
  const { cues } = C.parse(SRT);
  assert.deepEqual(C.parse(C.stringify(cues, 'srt')).cues, cues);
});
test('srt without blank lines between cues still splits', () => {
  const { cues } = C.parse('1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n');
  assert.equal(cues.length, 2); assert.equal(cues[0].text, 'A');
});
test('vtt in/out', () => {
  const { cues } = C.parse(SRT);
  const v = C.stringify(cues, 'vtt'); assert.match(v, /^WEBVTT/); assert.match(v, /00:00:01\.000 --> 00:00:03\.000/);
  const back = C.parse(v); assert.equal(back.format, 'vtt'); assert.deepEqual(back.cues, cues);
});
test('vtt with short hours and settings-free cue ids', () => {
  const { cues } = C.parse('WEBVTT\n\nintro\n00:01.500 --> 00:03.000\nHi\n');
  assert.equal(cues[0].start, 1500); assert.equal(cues[0].text, 'Hi');
});
test('ass in/out', () => {
  const { cues } = C.parse(SRT);
  const a = C.stringify(cues, 'ass'); const back = C.parse(a);
  assert.equal(back.format, 'ass'); assert.equal(back.cues.length, 3); assert.equal(back.cues[0].text, 'Hello\nthere');
  assert.equal(back.cues[1].start, 60000);
});
test('ass strips override tags and keeps commas in text', () => {
  const t = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.50,Default,,0,0,0,,{\\i1}Well, hello{\\i0}\n';
  const { cues } = C.parse(t); assert.equal(cues[0].text, 'Well, hello'); assert.equal(cues[0].end, 2500);
});
test('microdvd uses fps', () => {
  const { cues } = C.parse('{240}{480}Hi|there', { fps: 24 });
  assert.equal(cues[0].start, 10000); assert.equal(cues[0].text, 'Hi\nthere');
  assert.equal(C.stringify(cues, 'sub', { fps: 24 }), '{240}{480}Hi|there\n');
});
test('unrecognised input gives a clear error', () => {
  assert.throws(() => C.parse('just some text'), C.SubError);
});
test('single anchor = constant shift', () => {
  const { cues } = C.parse(SRT);
  const r = C.retime(cues, [{ from: 1000, to: 3500 }]);
  assert.equal(r[0].start, 3500); assert.equal(r[2].start, 602500);
});
test('two anchors fix linear drift, incl. extrapolation', () => {
  const { cues } = C.parse(SRT); // true timeline is 1.001x slower
  const r = C.retime(cues, [{ from: 1000, to: 1000 }, { from: 600000, to: 600600 }]);
  assert.equal(r[0].start, 1000); assert.equal(r[2].start, 600600);
  assert.equal(r[1].start, Math.round(1000 + 59000 * 599600 / 599000));
});
test('step mode fixes a mid-file jump only after the anchor', () => {
  const { cues } = C.parse(SRT);
  const r = C.retime(cues, [{ from: 1000, to: 1000 }, { from: 600000, to: 645000 }], 'step');
  assert.equal(r[0].start, 1000); assert.equal(r[1].start, 60000); assert.equal(r[2].start, 645000);
});
test('anchor errors', () => {
  const { cues } = C.parse(SRT);
  assert.throws(() => C.retime(cues, [{ from: 5, to: 5 }, { from: 5, to: 9 }]), C.SubError);
  assert.throws(() => C.retime(cues, [{ from: 0, to: 9000 }, { from: 100, to: 8000 }]), /order/);
});
test('fps conversion 25 -> 23.976', () => {
  const { cues } = C.parse(SRT);
  const r = C.fpsConvert(cues, 25, 23.976);
  assert.equal(r[2].start, Math.round(600000 * 25 / 23.976));
  assert.throws(() => C.fpsConvert(cues, 0, 24), C.SubError);
});
test('decode: utf8, bom, utf16, cp1252 fallback', () => {
  assert.equal(C.decode(new TextEncoder().encode('café')).text, 'café');
  assert.equal(C.decode(Buffer.from([0xEF, 0xBB, 0xBF, 0x61])).encoding, 'utf-8-bom');
  assert.equal(C.decode(Buffer.from([0xFF, 0xFE, 0x61, 0x00])).text, 'a');
  const d = C.decode(Buffer.from([0x63, 0x61, 0x66, 0xE9])); assert.equal(d.text, 'café'); assert.equal(d.encoding, 'windows-1252');
  assert.throws(() => C.decode(Buffer.from([0x61]), 'nope-enc'), C.SubError);
});
test('fixMojibake repairs double-encoded text and leaves good text alone', () => {
  const bad = Buffer.from('señor “hola” ¿qué?', 'utf8').toString('latin1');
  const f = C.fixMojibake(new TextDecoder('windows-1252').decode(Buffer.from('señor “hola” ¿qué?', 'utf8')));
  assert.ok(bad.length > 0); assert.equal(f.text, 'señor “hola” ¿qué?'); assert.equal(f.fixed, true);
  assert.equal(C.fixMojibake('Ã is fine alone').fixed, false);
  assert.equal(C.fixMojibake('plain ascii').fixed, false);
});
test('clean: repairs order, overlap, zero length, empties, duplicates', () => {
  const cues = [
    { start: 5000, end: 6000, text: 'B' }, { start: 1000, end: 5500, text: 'A' },
    { start: 7000, end: 7000, text: 'Z' }, { start: 8000, end: 9000, text: '  ' },
    { start: 9500, end: 10000, text: 'D' }, { start: 10000, end: 10500, text: 'D' },
  ];
  const { cues: o, report } = C.clean(cues);
  assert.deepEqual(o.map((c) => c.text), ['A', 'B', 'Z', 'D']);
  assert.ok(o[0].end < o[1].start); assert.ok(o[2].end > o[2].start);
  assert.equal(report.dropped, 1); assert.equal(report.merged, 1); assert.equal(report.zeroLength, 1); assert.ok(report.overlapsFixed >= 1);
});
test('clean: watermark, HI and tag stripping', () => {
  const cues = [
    { start: 0, end: 2000, text: 'Subtitles by OpenSubtitles.org' },
    { start: 3000, end: 5000, text: '[door slams]\nJOHN: Hello <i>there</i>' },
    { start: 6000, end: 8000, text: '♪ la la la ♪' },
    { start: 9000, end: 11000, text: 'Real line' },
  ];
  const { cues: o, report } = C.clean(cues, { stripWatermarks: true, stripHI: true, stripTags: true });
  assert.deepEqual(o.map((c) => c.text), ['Hello there', 'Real line']);
  assert.equal(report.watermark, 1);
});
test('merge two parts with offset', () => {
  const a = [{ start: 0, end: 1000, text: 'a' }], b = [{ start: 0, end: 1000, text: 'b' }];
  assert.deepEqual(C.merge(a, b, 5000).map((c) => c.start), [0, 5000]);
});
test('describeFix words', () => {
  assert.match(C.describeFix([{ from: 0, to: 2000 }]), /\+2000 ms/);
  assert.match(C.describeFix([{ from: 0, to: 0 }, { from: 1000, to: 1001 }]), /×1\.001000/);
});
