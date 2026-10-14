'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const P = require('../core.js');
const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);
const ex = f => fs.readFileSync(path.join(__dirname, '..', 'examples', f), 'utf8');

test('language detection', () => {
  assert.equal(P.detectLang('The council will send you a letter about the benefit that you have claimed.'), 'en');
  assert.equal(P.detectLang('El interesado deberá presentar la documentación para el trámite.'), 'es');
  assert.equal(P.detectLang('Der Bescheid wird Ihnen mit der Post zugestellt und ist nicht anfechtbar.'), 'de');
  assert.equal(P.detectLang(''), 'en');
});

test('syllable counting', () => {
  const en = { cat: 1, table: 2, make: 1, hated: 2, beautiful: 3, 'well-known': 2, the: 1 };
  for (const [w, n] of Object.entries(en)) assert.equal(P.syllables(w, 'en'), n, w);
  const es = { gato: 2, pescado: 3, país: 2, tiene: 2, canción: 2, leer: 2, 'el': 1 };
  for (const [w, n] of Object.entries(es)) assert.equal(P.syllables(w, 'es'), n, w);
  const de = { Haus: 1, Bescheid: 2, Verwaltung: 3, Kinder: 2, Beispiel: 2 };
  for (const [w, n] of Object.entries(de)) assert.equal(P.syllables(w, 'de'), n, w);
});

test('sentence splitting: abbreviations, decimals, ordinals, blank lines', () => {
  assert.equal(P.sentences('Dr. Smith arrived. He sat down.').length, 2);
  assert.equal(P.sentences('The fee is 3.50 euros. Pay it today.').length, 2);
  assert.equal(P.sentences('Wir melden uns am 3. März bei Ihnen. Danke.', 'de').length, 2);
  assert.equal(P.sentences('Title line\n\nSecond paragraph without a stop').length, 2);
  assert.equal(P.sentences('Is it? Yes! Really…  ok.').length, 4);
  assert.equal(P.sentences('').length, 0);
  const s = P.sentences('One. Two.');
  assert.equal('One. Two.'.slice(s[1].start, s[1].end), 'Two.');
});

test('readability formulas match hand-computed values', () => {
  const en = P.analyze('The cat sat on the mat.', { lang: 'en' });
  near(en.formula.value, 206.835 - 1.015 * 6 - 84.6 * 1);
  const de = P.analyze('Das ist ein Test.', { lang: 'de' });
  near(de.formula.value, 180 - 4 - 58.5);
  const es = P.analyze('El gato come pescado.', { lang: 'es' });
  near(es.formula.value, 206.84 - 0.6 * 200 - 1.02 * 25);
  near(P.analyze('Aaaaaaa bbbbbbb.', { lang: 'en' }).lix, 2 + 100);
});

test('passive detection in three languages', () => {
  const f = (t, l) => P.analyze(t, { lang: l }).sentences[0].flags.map(x => x.id);
  assert.ok(f('The form was completed by the officer.', 'en').includes('passive'));
  assert.ok(f('The letter has been sent.', 'en').includes('passive'));
  assert.ok(!f('The officer completed the form.', 'en').includes('passive'));
  assert.ok(f('La solicitud será remitida a la unidad.', 'es').includes('passive'));
  assert.ok(!f('Es importante que vengas.', 'es').includes('passive'));
  assert.ok(f('Der Bescheid wird Ihnen zugestellt.', 'de').includes('passive'));
  assert.ok(!f('Wir senden Ihnen den Bescheid.', 'de').includes('passive'));
});

test('long sentence flag follows the target', () => {
  const t = Array(20).fill('word').join(' ') + '.';
  const has = tg => P.analyze(t, { lang: 'en', target: tg }).sentences[0].flags.some(x => x.id === 'long');
  assert.ok(has('easy')); assert.ok(has('plain')); assert.ok(!has('standard'));
});

test('swaps: case, longest match, word boundaries, offsets', () => {
  const r = P.applySwaps('Prior to the meeting, utilize the form. Utilize it.', 'en');
  assert.equal(r.text, 'Before the meeting, use the form. Use it.');
  assert.equal(r.count, 3);
  assert.equal(P.applySwaps('We shall go in order to win.', 'en').text, 'We must go to win.');
  assert.equal(P.applySwaps('The utilization rate', 'en').count, 0); // no partial-word hit
  assert.equal(P.applySwaps('Aufgrund der Lage, bezüglich des Falles.', 'de').text, 'Wegen der Lage, zu des Falles.');
  assert.equal(P.applySwaps('Deberá abonar la cuantía.', 'es').text, 'Debe pagar la cantidad.');
  const hits = P.findSwaps('See: prior to x', 'en');
  assert.equal('See: prior to x'.slice(hits[0].start, hits[0].end), 'prior to');
});

test('applying swaps never makes the text harder', () => {
  for (const f of ['letter-en.txt', 'brief-de.txt', 'carta-es.txt']) {
    const t = ex(f), lang = P.detectLang(t);
    const before = P.analyze(t, { lang }), after = P.analyze(P.applySwaps(t, lang).text, { lang });
    assert.ok(after.lix <= before.lix + 0.01, `${f}: ${before.lix} -> ${after.lix}`);
    assert.ok(after.sentences.reduce((n, s) => n + s.swaps.length, 0) === 0, f);
  }
});

test('example documents are detected and fail the plain target', () => {
  assert.equal(P.detectLang(ex('letter-en.txt')), 'en');
  assert.equal(P.detectLang(ex('brief-de.txt')), 'de');
  assert.equal(P.detectLang(ex('carta-es.txt')), 'es');
  for (const f of ['letter-en.txt', 'brief-de.txt', 'carta-es.txt']) assert.equal(P.analyze(ex(f)).passesTarget, false, f);
});

test('plain text passes', () => {
  const a = P.analyze('We got your form. We will reply by mail. It takes ten days.', { lang: 'en', target: 'plain' });
  assert.equal(a.passesTarget, true);
  assert.equal(a.flaggedCount, 0);
  assert.match(P.checklistMarkdown('x', a), /Nothing to fix/);
});

test('German-only metric present only for German', () => {
  assert.equal(P.analyze('Das ist gut.', { lang: 'en' }).wstf, null);
  assert.equal(typeof P.analyze('Das ist gut.', { lang: 'de' }).wstf, 'number');
});

test('robustness: empty, whitespace, symbols, huge, random input never throws', () => {
  for (const t of ['', '   \n\n ', '!!!...???', '12345', '😀😀', 'a'.repeat(5000), 'x. '.repeat(3000)]) {
    for (const l of P.LANGS) { const a = P.analyze(t, { lang: l }); assert.ok(Number.isFinite(a.lix)); P.checklistMarkdown(t, a); }
  }
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alpha = 'abc äöü ñé .,;!?()\n-’1';
  for (let i = 0; i < 200; i++) {
    let t = ''; for (let j = 0; j < 80; j++) t += alpha[Math.floor(rnd() * alpha.length)];
    const a = P.analyze(t); assert.ok(Number.isFinite(a.lix) && Number.isFinite(a.avgSentence));
  }
});

test('checklist lists flagged sentences', () => {
  const t = ex('letter-en.txt');
  const md = P.checklistMarkdown(t, P.analyze(t));
  assert.match(md, /- \[ \] \*\*Sentence 1:\*\*/);
  assert.match(md, /Passive voice/);
});

test('CLI: report, json, apply, fail exit code, bad args', () => {
  const cli = path.join(__dirname, '..', 'cli.js'), file = path.join(__dirname, '..', 'examples', 'letter-en.txt');
  assert.match(execFileSync('node', [cli, file]).toString(), /NEEDS WORK/);
  const j = JSON.parse(execFileSync('node', [cli, file, '--json']).toString());
  assert.equal(j.lang, 'en'); assert.equal(j.passesTarget, false);
  assert.match(execFileSync('node', [cli, file, '--apply'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(), /Before the commencement/i);
  assert.equal(spawnSync('node', [cli, file, '--fail']).status, 1);
  assert.equal(spawnSync('node', [cli, file, '--lang', 'xx']).status, 2);
  assert.equal(spawnSync('node', [cli, '/nonexistent']).status, 2);
  assert.equal(spawnSync('node', [cli]).status, 2);
});
