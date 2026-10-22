const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const ctx = { module: { exports: {} } };
vm.runInNewContext(code, ctx);
const raw = ctx.module.exports;
const ER = {};
for (const k in raw) ER[k] = (...a) => { const r = raw[k](...a); return r && typeof r === 'object' ? JSON.parse(JSON.stringify(r)) : r; };

test('splits sentences and respects abbreviations', () => {
  const s = ER.splitSentences('Dr. Smith called. He left a message! Call back?');
  assert.deepStrictEqual(s, ['Dr. Smith called.', 'He left a message!', 'Call back?']);
});
test('strips list markers and handles newlines', () => {
  assert.deepStrictEqual(ER.splitSentences('- Bring ID\n2. Bring money'), ['Bring ID', 'Bring money']);
});
test('empty input gives no sentences', () => {
  assert.deepStrictEqual(ER.splitSentences('  \n '), []);
  assert.deepStrictEqual(ER.splitSentences(null), []);
});
test('autoSplit leaves short sentences alone', () => {
  assert.deepStrictEqual(ER.autoSplit('Bring your card.', 15), ['Bring your card.']);
});
test('autoSplit breaks long sentences at conjunctions and semicolons', () => {
  const long = 'You must apply before the end of April, and you will need to bring proof of your income with you; failure to do so may delay the payment.';
  const parts = ER.autoSplit(long, 12);
  assert.ok(parts.length >= 2, JSON.stringify(parts));
  parts.forEach(p => assert.match(p, /^[A-Z]/));
});
test('autoSplit does not make tiny fragments', () => {
  const parts = ER.autoSplit('It is long but it is a sentence that goes on and on without any good place to split anywhere at all really.', 8);
  parts.forEach(p => assert.ok(ER.countWords(p) >= 4));
});
test('analyze flags long, hard, passive, abbreviations', () => {
  const a = ER.analyze('Individuals who are eligible will be contacted by the HT regarding accommodation (see below).', 8);
  const j = a.flags.join('|');
  assert.match(j, /Long/); assert.match(j, /Simpler word/); assert.match(j, /Abbreviation: HT/); assert.match(j, /Brackets/);
});
test('analyze is quiet on a clean sentence', () => {
  assert.deepStrictEqual(ER.analyze('Bring your card.', 15).flags, []);
});
test('syllables sanity', () => {
  assert.strictEqual(ER.syllables('cat'), 1);
  assert.ok(ER.syllables('documentation') >= 4);
});
test('summarize and markdown', () => {
  const s = ER.summarize(['One two three.', 'Four five six seven eight nine ten eleven twelve.'], 5);
  assert.deepStrictEqual([s.blocks, s.over], [2, 1]);
  assert.strictEqual(ER.toMarkdown('T', [{ text: 'a' }, { text: 'b' }]), '# T\n\na\n\nb\n');
});
