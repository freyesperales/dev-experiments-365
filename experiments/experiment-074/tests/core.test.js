'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../core.js');
const make = require('./make-sample.js');
const S = make();

test('parseQuery rejects garbage with a helpful message', () => {
  assert.throws(() => L.parseQuery(''), /Type a query/);
  assert.throws(() => L.parseQuery('abc'), /Not a number/);
  assert.throws(() => L.parseQuery('5..1'), /reversed/);
  assert.throws(() => L.parseQuery('date:2024-13-45'), /date/i);
  assert.throws(() => L.parseQuery('date:2024-02-30'), /Impossible/);
  assert.throws(() => L.parseQuery('hex:zz'), /byte pairs/);
});

test('integer range finds the unix timestamp (LE u32) at offset 8', () => {
  const r = L.search(S, L.parseQuery('1700000000..1800000000'));
  const h = r.hits.find(x => x.offset === 8 && x.type === 'u32' && x.le);
  assert.ok(h, 'u32 LE at 8');
  assert.strictEqual(h.value, 1717243200);
});

test('float tolerance search finds f32 latitude and longitude', () => {
  const lat = L.search(S, L.parseQuery('37.77~0.01')).hits;
  assert.ok(lat.some(h => h.offset === 64 && h.type === 'f32' && h.le));
  const lon = L.search(S, L.parseQuery('-122.42~0.01')).hits;
  assert.ok(lon.some(h => h.offset === 68 && h.type === 'f32'));
});

test('date: query finds the same instant in unix s, unix ms, FILETIME and Cocoa encodings', () => {
  const r = L.search(S, L.parseQuery('date:2024-06-01T11:59:00..2024-06-01T12:01:00'));
  const at = (off, label) => r.hits.some(h => h.offset === off && h.label === label);
  assert.ok(at(8, 'unix s'), 'unix s @8');
  assert.ok(at(96, 'unix ms'), 'unix ms @96');
  assert.ok(at(104, 'FILETIME'), 'FILETIME @104');
  assert.ok(at(112, 'Cocoa s'), 'Cocoa f64 @112');
});

test('date: single day expands to the whole day', () => {
  const q = L.parseQuery('date:2024-06-01');
  assert.ok(L.search(S, q).hits.some(h => h.offset === 8));
});

test('natural alignment hides unaligned coincidences', () => {
  const any = L.search(S, L.parseQuery('1717243200')).hits.filter(h => h.type === 'u32');
  const nat = L.search(S, L.parseQuery('1717243200'), {align: 'natural'}).hits.filter(h => h.type === 'u32');
  assert.ok(nat.length >= 1 && nat.length <= any.length);
  assert.ok(nat.every(h => h.offset % 4 === 0));
});

test('hex and text queries (ascii + utf16)', () => {
  assert.deepStrictEqual(Array.from(L.search(S, L.parseQuery('hex:53 41 56 45')).hits.map(h => h.offset)), [0]);
  assert.ok(L.search(S, L.parseQuery('text:Aria')).hits.some(h => h.offset === 17));
  const u16 = new Uint8Array([0, 0, 0x68, 0, 0x69, 0, 0]);
  assert.ok(L.search(u16, L.parseQuery('text:hi')).hits.some(h => h.offset === 2 && h.label === 'utf16le'));
});

test('hit limit truncates and reports it', () => {
  const z = new Uint8Array(5000);
  const r = L.search(z, L.parseQuery('0'), {limit: 100});
  assert.strictEqual(r.hits.length, 100); assert.strictEqual(r.truncated, true);
});

test('empty and tiny files do not crash', () => {
  assert.strictEqual(L.search(new Uint8Array(0), L.parseQuery('1')).hits.length, 0);
  assert.strictEqual(L.search(new Uint8Array(3), L.parseQuery('1.5')).hits.length, 0);
  assert.strictEqual(L.analyzeBlocks(new Uint8Array(0)).length, 0);
  assert.ok(Array.isArray(L.interpretAt(new Uint8Array(1), 0)));
  assert.strictEqual(L.identify(new Uint8Array(0)), null);
});

test('interpretAt shows plausible dates for timestamp fields', () => {
  const rows = L.interpretAt(S, 8);
  const r = rows.find(x => x.type === 'u32 LE');
  assert.strictEqual(r.dates[0], 'unix s 2024-06-01T12:00:00Z');
  const f = L.interpretAt(S, 104).find(x => x.type === 'u64 LE');
  assert.ok(f.dates.some(d => d.startsWith('FILETIME 2024-06-01T12:00:00')));
});

test('findStrings finds length-prefixed strings that plain ASCII scanning labels differently', () => {
  const s = L.findStrings(S, 5);
  assert.ok(s.some(x => x.kind === 'len-prefixed u8' && x.text === 'Aria the Bold' && x.offset === 17));
  assert.ok(s.some(x => x.kind === 'len-prefixed u16' && x.text === 'last_checkpoint=forest_gate'));
});

test('identify / scanMagics', () => {
  assert.strictEqual(L.identify(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'PNG image');
  const buf = new Uint8Array(40); buf.set([0x50, 0x4b, 0x03, 0x04], 20);
  assert.deepStrictEqual(Array.from(L.scanMagics(buf).map(m => m.offset)), [20]);
});

test('analyzeBlocks classifies zero / text / random regions', () => {
  const b = new Uint8Array(1024);
  for (let i = 256; i < 512; i++) b[i] = 65 + (i % 26);
  let x = 99; for (let i = 512; i < 768; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = (x >> 8) & 255; }
  const k = L.analyzeBlocks(b, 256).map(x => x.kind);
  assert.deepStrictEqual(Array.from(k.slice(0, 3)), ['zero', 'text', 'random']);
});

test('hexdumpLine format', () => {
  assert.strictEqual(L.hexdumpLine(new Uint8Array([0x41, 0x42]), 0, 4), '00000000  41 42        AB');
});
