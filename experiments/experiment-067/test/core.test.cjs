const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const C = require('../core.cjs');
const ex = f => fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8');
const cat = C.parsePriceList(ex('prices.txt'));
const run = (chat, o = {}) => C.buildOrders(C.parseChat(chat).messages, cat, o);
const msg = t => `01/02/2026, 10:00 - Cli: ${t}`;
const lines = r => r.customers.flatMap(c => c.lines.map(l => `${l.qty}|${l.item}`));

test('parseMoney handles locales', () => {
  for (const [s, v] of [['5', 5], ['5,50', 5.5], ['5.50', 5.5], ['2.500', 2500], ['1.234,50', 1234.5], ['1,234.50', 1234.5], ['0.500', 0.5], ['$12', 12]])
    assert.equal(C.parseMoney(s), v, s);
});
test('price list: aliases, comments, errors', () => {
  assert.equal(cat.items.length, 9); assert.equal(cat.errors.length, 0);
  const b = C.parsePriceList('# c\nfoo | f, bar = 3,5\nbroken line\n = 4');
  assert.equal(b.items.length, 1); assert.equal(b.items[0].price, 3.5); assert.deepEqual(b.items[0].aliases, ['f', 'bar']); assert.equal(b.errors.length, 2);
});
test('chat: android + ios formats, multiline, system lines', () => {
  const p = C.parseChat(ex('chat-es.txt'));
  assert.equal(p.dateOrder, 'dmy'); assert.ok(!p.senders.some(s => /cifrados/.test(s)));
  assert.equal(p.messages.find(m => m.sender === 'Diego Paz').text.split('\n').length, 4);
  const q = C.parseChat(ex('chat-en-ios.txt'));
  assert.equal(q.dateOrder, 'mdy'); assert.equal(q.messages[0].date, '2026-03-12'); assert.equal(q.messages.length, 4);
});
test('quantity syntaxes', () => {
  assert.deepEqual(lines(run(msg('2 pan de yuca'))), ['2|pan de yuca']);
  assert.deepEqual(lines(run(msg('2x pan de yuca'))), ['2|pan de yuca']);
  assert.deepEqual(lines(run(msg('pan de yuca x3'))), ['3|pan de yuca']);
  assert.deepEqual(lines(run(msg('tres brownies'))), ['3|brownie']);
  assert.deepEqual(lines(run(msg('una docena de brownies'))), ['12|brownie']);
  assert.deepEqual(lines(run(msg('media docena de brownies'))), ['6|brownie']);
  assert.deepEqual(lines(run(msg('brownie 4'))), ['4|brownie']);
  assert.deepEqual(lines(run(msg('1,5 kg de torta'))), ['1.5|torta de chocolate']);
});
test('multiple items per message, separators, protected "mac y queso"', () => {
  assert.deepEqual(lines(run(msg('quiero 2 pan de yuca y 3 empanadas de pollo, 1 café'))), ['2|pan de yuca', '3|empanada de pollo', '1|café']);
  assert.deepEqual(lines(run(msg('1 mac y queso y 2 brownies'))), ['1|mac y queso', '2|brownie']);
  assert.deepEqual(lines(run(msg('2 brownies + 1 cafe'))), ['2|brownie', '1|café']);
});
test('fuzzy: accents, plurals, typos', () => {
  assert.equal(C.findItem('cafe', cat).item.name, 'café');
  assert.equal(C.findItem('empanadas de pllo', cat).item.name, 'empanada de pollo');
  assert.equal(C.findItem('brounies', cat).item.name, 'brownie');
});
test('ambiguity and unknown items go to review, not totals', () => {
  const r = run(msg('1 pan') + '\n' + msg('2 kombucha'));
  assert.equal(r.customers.length, 0); assert.equal(r.unmatched.length, 2);
  assert.match(r.unmatched[0].reason, /ambiguous/); assert.match(r.unmatched[1].reason, /not in price list/);
});
test('chatter and noise create nothing', () => {
  const r = run(msg('hola buenas tardes') + '\n' + msg('gracias!!') + '\n' + msg('para las 5 pm') + '\n' + msg('<Media omitted>'));
  assert.equal(r.customers.length, 0); assert.equal(r.unmatched.length, 0);
});
test('bare item name = assumed qty 1', () => {
  const r = run(msg('brownie'));
  assert.equal(r.customers[0].lines[0].qty, 1); assert.equal(r.customers[0].lines[0].assumed, true);
});
test('cancel: whole order vs one item', () => {
  const a = run(msg('2 brownies') + '\n' + msg('cancela mi pedido'));
  assert.equal(a.customers.length, 0); assert.equal(a.events.length, 1);
  const b = run(msg('2 brownies y 1 cafe') + '\n' + msg('cancela el café'));
  assert.deepEqual(lines(b), ['2|brownie']);
});
test('seller messages ignored; date filter', () => {
  const chat = '01/02/2026, 10:00 - Cli: 2 brownies\n01/02/2026, 10:01 - Shop: 5 brownies\n02/02/2026, 10:00 - Cli: 1 cafe';
  assert.deepEqual(lines(run(chat, {ignore: ['Shop']})), ['2|brownie', '1|café']);
  assert.deepEqual(lines(run(chat, {ignore: ['Shop'], from: '2026-02-02'})), ['1|café']);
});
test('totals, tax, rounding, pick list, grouping, CSV', () => {
  const r = run(ex('chat-es.txt'), {ignore: ['Panadería Luz']});
  const marta = r.customers.find(c => c.name === 'Marta Ríos');
  assert.deepEqual(C.customerTotals(marta, {taxRate: 10, shipping: 5}), {sub: 189.5, tax: 18.95, ship: 5, total: 213.45});
  assert.equal(C.pickList(r.customers)[0].item, 'brownie');
  assert.equal(C.groupLines(marta.lines).find(g => g.item === 'pan de yuca').qty, 4);
  const csv = C.toCSV(r.customers).split('\n'); assert.equal(csv[0], 'date,customer,item,qty,unit_price,line_total'); assert.ok(csv.some(l => l.startsWith('2026-03-12,Marta Ríos,brownie,12,12,144')));
});
test('CSV escapes quotes and commas', () => {
  const csv = C.toCSV([{name: 'A "B", C', lines: [{date: '2026-01-01', item: 'x', qty: 1, price: 1}]}]);
  assert.match(csv, /"A ""B"", C"/);
});
test('English iOS sample end to end', () => {
  const p = C.parseChat(ex('chat-en-ios.txt'));
  const r = C.buildOrders(p.messages, cat, {ignore: ['Bakery']});
  const sam = r.customers.find(c => c.name === 'Sam Cole');
  assert.deepEqual(sam.lines.map(l => `${l.qty}|${l.item}`), ['2|brownie', '1|café', '6|empanada de pollo']);
  assert.equal(r.customers.find(c => c.name === 'Priya N').lines[0].item, 'torta de chocolate');
});
