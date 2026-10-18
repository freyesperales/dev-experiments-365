'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const core = require('../load-core');

const cat = core.parseCatalog([
  'Empanada de carne | 1.50 | empanadas de carne',
  'Pizza | 10 | pizzas',
  'Coke | 2 | coca, coca cola',
  'Café | 2,50 | cafecito',
  'Tomate | 3 |',
].join('\n'));
const items = (t) => core.extractItems(t, cat).lines.map((l) => `${l.qty}x${l.item}`).join(',');

test('android 24h dmy chat, multiline, system lines skipped', () => {
  const c = core.parseChat('31/12/2025, 21:41 - Messages are end-to-end encrypted.\n31/12/2025, 21:42 - Ana: hola\nquiero pizza\n31/12/2025, 21:43 - Ana: <Media omitted>');
  assert.equal(c.messages.length, 1);
  assert.equal(c.messages[0].text, 'hola\nquiero pizza');
  assert.equal(c.order, 'dmy');
  assert.equal(c.messages[0].time, '21:42');
});

test('ios bracket format with seconds and narrow-nbsp pm', () => {
  const c = core.parseChat('‎[12/31/25, 9:41:05 PM] Bob: 2 pizzas\n[12/31/25, 12:05:00 AM] Bob: x');
  assert.equal(c.order, 'mdy');
  assert.equal(c.messages[0].time, '21:41');
  assert.equal(c.messages[1].time, '00:05');
});

test('spanish "p. m." time and 2-digit year', () => {
  const c = core.parseChat('3/4/26, 5:07 p. m. - Luz: hola');
  assert.equal(c.messages[0].time, '17:07');
  assert.equal(c.ambiguousDates, true);
  assert.equal(core.parseChat('3/4/26, 5:07 p. m. - Luz: hola', 'mdy').messages[0].date, '2026-03-04');
});

test('catalog: prices, aliases, warnings', () => {
  assert.equal(core.parsePrice('$1.200,50'), 1200.5);
  assert.equal(core.parsePrice('2,50'), 2.5);
  assert.equal(core.parsePrice('1,200'), 1200);
  assert.equal(core.parsePrice('abc'), null);
  const c = core.parseCatalog('A | x\nA | 2\nB | 1 | a');
  assert.ok(c.warnings.some((w) => /not understood/.test(w)));
  assert.ok(c.warnings.some((w) => /listed twice/.test(w)));
});

test('quantities: digits, words, x-notation, dozens', () => {
  assert.equal(items('2 pizzas'), '2xPizza');
  assert.equal(items('dos pizzas y una coca'), '2xPizza,1xCoke');
  assert.equal(items('pizza x3'), '3xPizza');
  assert.equal(items('3x pizza'), '3xPizza');
  assert.equal(items('una docena de empanadas de carne'), '12xEmpanada de carne');
  assert.equal(items('2 docenas de empanadas de carne'), '24xEmpanada de carne');
  assert.equal(items('media docena de empanadas de carne'), '6xEmpanada de carne');
  assert.equal(items('1.5 kg de tomate'), '1.5xTomate');
  assert.equal(items('1,5 kilos de tomate'), '1.5xTomate');
  assert.equal(items('quiero una pizza'), '1xPizza');
  assert.equal(items('pizza'), '1xPizza');
});

test('suffix style: "pizza 2 coke 1" and prefix style share one rule', () => {
  assert.equal(items('pizza 2 coke 1'), '2xPizza,1xCoke');
  assert.equal(items('2 pizza 1 coke'), '2xPizza,1xCoke');
  assert.equal(items('2 pizzas para 5 personas'), '2xPizza');
});

test('accents, plurals, aliases, fuzzy spelling', () => {
  assert.equal(items('2 cafés'), '2xCafé');
  assert.equal(items('3 CAFECITO'), '3xCafé');
  assert.equal(items('2 coca cola'), '2xCoke');
  const fz = core.extractItems('3 empnadas de carne', cat).lines[0];
  assert.equal(fz.item, 'Empanada de carne');
  assert.equal(fz.fuzzy, true);
  assert.equal(items('2 pizo'), '');
});

test('same product twice in one message adds up', () => {
  assert.equal(items('2 pizza y 3 pizza'), '5xPizza');
});

const chat = [
  '01/02/2026, 10:00 - Ana: 2 pizzas y una coca',
  '01/02/2026, 10:05 - Ana: dirección: Calle 1 #2',
  '01/02/2026, 10:06 - Ana: 3 de empanadas de carne tambien',
  '01/02/2026, 10:30 - Shop: ok Ana',
  '01/02/2026, 14:00 - Ana: 1 pizza',
  '01/02/2026, 14:10 - Ana: cancela por favor',
  '01/02/2026, 15:00 - Ben: 4 chipas porfa',
  '01/02/2026, 15:05 - Shop: tenemos 2 pizzas listas',
].join('\n');

test('orders: merge within gap, split after gap, address, cancel, ignore', () => {
  const c = core.parseChat(chat);
  const r = core.buildOrders(c.messages, cat, { gapMinutes: 30, ignoreSenders: ['Shop'] });
  assert.equal(r.orders.length, 2);
  const [o1, o2] = r.orders;
  assert.equal(core.describe(o1), '2× Pizza; 1× Coke; 3× Empanada de carne');
  assert.equal(o1.address, 'Calle 1 #2');
  assert.equal(o1.total, 20 + 2 + 4.5);
  assert.equal(o1.status, 'new');
  assert.equal(o2.status, 'cancelled');
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.suggestions[0].word, 'chipas');
});

test('without ignoring the shop, its message becomes a (wrong) order — hence the ignore list', () => {
  const r = core.buildOrders(core.parseChat(chat).messages, cat, {});
  assert.equal(r.orders.length, 3);
});

test('pick list excludes cancelled orders and keeps catalog order', () => {
  const r = core.buildOrders(core.parseChat(chat).messages, cat, { ignoreSenders: ['Shop'] });
  const p = core.pickList(r.orders, cat);
  assert.equal(JSON.stringify(p.map((x) => [x.item, x.qty])), JSON.stringify([['Empanada de carne', 3], ['Pizza', 2], ['Coke', 1]]));
});

test('unpriced items are flagged, not counted as zero silently', () => {
  const c2 = core.parseCatalog('Thing | | ');
  const r = core.buildOrders(core.parseChat('01/02/2026, 10:00 - A: 2 things').messages, c2, {});
  assert.equal(r.orders[0].unpriced, true);
  assert.equal(core.ordersCSV(r.orders).split('\r\n')[1].split(',')[5], '');
});

test('CSV quoting and spreadsheet-formula guard', () => {
  assert.equal(core.toCSV([['a,b', 'say "hi"', '=1+1', '+54 9 11 5555', '-3', 'ok']]), '"a,b","say ""hi""",\'=1+1,\'+54 9 11 5555,-3,ok\r\n');
});

test('zip: stored and deflated _chat.txt are extracted', async () => {
  const text = '01/02/2026, 10:00 - A: 2 pizzas ñ';
  for (const method of [0, 8]) {
    const data = Buffer.from(text);
    const body = method ? zlib.deflateRawSync(data) : data;
    const name = Buffer.from('_chat.txt');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const local = Buffer.concat([lh, name, body]);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 42);
    const cd = Buffer.concat([ch, name]);
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(local.length, 16);
    const zip = new Uint8Array(Buffer.concat([local, cd, eocd]));
    assert.equal(await core.textFromZip(zip), text);
  }
  await assert.rejects(core.textFromZip(new Uint8Array(40)), /valid \.zip/);
});

test('demo end to end', () => {
  const r = core.buildOrders(core.parseChat(core.DEMO_CHAT).messages, core.parseCatalog(core.DEMO_CATALOG), { ignoreSenders: ['Panadería Dulce Hogar'] });
  assert.equal(r.orders.length, 4);
  assert.equal(r.orders[0].total, 63);
  assert.equal(r.orders[1].status, 'cancelled');
  assert.equal(r.orders[1].phone, '+54 9 11 5555-0142');
});
