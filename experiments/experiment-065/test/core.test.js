'use strict';
const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/core.js');

test('parseNumber handles locale separators', () => {
  assert.strictEqual(L.parseNumber('1.234,50'), 1234.5);
  assert.strictEqual(L.parseNumber('1,234.50'), 1234.5);
  assert.strictEqual(L.parseNumber('1.500'), 1500);
  assert.strictEqual(L.parseNumber('1,250'), 1250);
  assert.strictEqual(L.parseNumber('12,5'), 12.5);
  assert.strictEqual(L.parseNumber('210.50'), 210.5);
  assert.strictEqual(L.parseNumber('0.500'), 0.5);
});

test('parses iOS and Android formats, multiline, system lines', () => {
  const t = [
    '12/03/2024, 14:05 - Messages are end-to-end encrypted.',
    '12/03/2024, 14:05 - Ana: hola',
    'segunda línea',
    '[13/03/2024, 2:05:33 PM] Beto: total $50'
  ].join('\n');
  const r = L.parseChat(t);
  assert.strictEqual(r.messages.length, 2);
  assert.strictEqual(r.messages[0].text, 'hola\nsegunda línea');
  assert.strictEqual(r.messages[1].time, '14:05');
  assert.strictEqual(r.messages[1].date, '2024-03-13');
});

test('detects month-first dates', () => {
  const r = L.parseChat('3/25/24, 9:00 AM - Ana: hi\n3/26/24, 9:00 PM - Ana: hi');
  assert.strictEqual(r.dateOrder, 'mdy');
  assert.strictEqual(r.messages[0].date, '2024-03-25');
  assert.strictEqual(r.messages[1].time, '21:00');
});

test('detectMoney classifies and ignores noise', () => {
  assert.deepStrictEqual(L.detectMoney('El total son $480'), { amount: 480, kind: 'charge' });
  assert.deepStrictEqual(L.detectMoney('ya te transferí $300'), { amount: 300, kind: 'payment' });
  assert.strictEqual(L.detectMoney('2 roscas y 12 conchas'), null);
  assert.strictEqual(L.detectMoney('nos vemos a las 5:30'), null);
  assert.strictEqual(L.detectMoney('¿son 1,250 o 1,350?'), null); // no keyword, no currency mark
  assert.strictEqual(L.detectMoney('Total $50 ?').kind, 'review');
  assert.strictEqual(L.detectMoney('Pagué el saldo anterior, 180').amount, 180);
});

test('sample chat produces expected balances', () => {
  const { messages } = L.parseChat(L.SAMPLE);
  const owner = L.guessOwner(messages);
  assert.strictEqual(owner, 'Panadería Lupita');
  const entries = L.buildEntries(messages, owner);
  const book = Object.fromEntries(L.ledger(entries).map(c => [c.customer, c]));
  // Marta: 480 charged + 1250 charged; paid 300 + 180; "quedan $180" is a charge line by keyword -> user can override
  assert.strictEqual(book['Jorge Ruiz'].balance, 0);
  assert.strictEqual(book['Marta Gómez'].charged, 1730);
  assert.strictEqual(book['Marta Gómez'].paid, 480);
  assert.strictEqual(book['Marta Gómez'].balance, 1250);
  const rev = L.buildEntries(messages, owner).filter(e => e.kind === 'review');
  assert.ok(rev.some(e => /quedan/.test(e.text)), 'remainder statement is flagged for review, not counted');
});

test('overrides change the ledger', () => {
  const { messages } = L.parseChat(L.SAMPLE);
  const owner = L.guessOwner(messages);
  const base = L.buildEntries(messages, owner);
  const idx = base.find(e => /quedan/.test(e.text)).index;
  const b = Object.fromEntries(L.ledger(L.buildEntries(messages, owner, { [idx]: 'charge' })).map(c => [c.customer, c]));
  assert.strictEqual(b['Marta Gómez'].charged, 1730 + 180);
  assert.strictEqual(b['Marta Gómez'].balance, 1910 - 480);
});

test('CSV escapes quotes, commas and formula injection', () => {
  const csv = L.toCSV([{ date: '2026-01-01', time: '10:00', customer: '=cmd', kind: 'charge', amount: 5, text: 'a, "b"' }]);
  assert.match(csv, /'=cmd/);
  assert.match(csv, /"a, ""b"""/);
});
