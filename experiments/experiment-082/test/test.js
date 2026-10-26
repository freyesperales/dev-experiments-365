'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../src/safecsv.js');

const kind = v => { const h = S.classify(v); return h && h.kind; };

test('classify: destructive conversions', () => {
  assert.strictEqual(kind('02134'), 'leading-zero');
  assert.strictEqual(S.classify('007').excel, '7');
  assert.strictEqual(kind('+34600123456'), 'plus-prefix');
  assert.strictEqual(kind('1234567890123456789'), 'long-digits');
  assert.match(S.classify('1234567890123456789').excel, /1\.23457E\+18/);
  assert.strictEqual(kind('1E3'), 'e-notation');
  assert.strictEqual(S.classify('1E3').excel, '1000');
  assert.strictEqual(kind('SEPT1'), 'month-name');
  assert.strictEqual(S.classify('SEPT1').excel, '1-Sep');
  assert.strictEqual(S.classify('MARCH1').excel, '1-Mar');
  assert.strictEqual(S.classify('Jan 19').excel, '19-Jan');
  assert.strictEqual(S.classify('1-Mar').excel, '1-Mar');
  assert.strictEqual(kind('3/4'), 'date-like');
  assert.strictEqual(S.classify('1-2').excel, '2-Jan');
  assert.strictEqual(kind('1/2/20'), 'date-like');
});

test('classify: things that are safe stay safe', () => {
  for (const v of ['', 'hello', '-5', '3.14', '0', '0.5', '123', 'TP53', 'BRCA1', '-', '2024', '13/1', 'Mayor', 'Sept', '555-1234', '12345678901'])
    assert.strictEqual(kind(v), null, JSON.stringify(v));
});

test('classify: 12-15 digits is altered, trailing zero cosmetic, boolean/paren altered', () => {
  assert.strictEqual(S.classify('123456789012').severity, 'altered');
  assert.strictEqual(S.classify('2.50').severity, 'cosmetic');
  assert.strictEqual(S.classify('(5)').excel, '-5');
  assert.strictEqual(S.classify('true').excel, 'TRUE');
  assert.strictEqual(kind('TRUE'), null);
});

test('classify: formula injection', () => {
  for (const v of ['=1+1', '@SUM(A1)', '+cmd|x', '-abc', '+44 600 123', '\tx'])
    assert.strictEqual(kind(v), 'formula', JSON.stringify(v));
  for (const v of ['-5', '-$5.00', '+3.5', '-12%']) assert.notStrictEqual(kind(v), 'formula', v);
});

test('parseCSV: quotes, escaped quotes, embedded newlines, CRLF, no trailing newline', () => {
  const rows = S.parseCSV('a,b,c\r\n1,"x,y","he said ""hi"""\r\n"multi\nline",,3');
  assert.deepStrictEqual(rows, [['a', 'b', 'c'], ['1', 'x,y', 'he said "hi"'], ['multi\nline', '', '3']]);
  assert.deepStrictEqual(S.parseCSV(''), []);
  assert.deepStrictEqual(S.parseCSV('a\n'), [['a']]);
  assert.deepStrictEqual(S.parseCSV('﻿a,b'), [['a', 'b']]);
  assert.throws(() => S.parseCSV('a,"unterminated\n1,2'), /Unterminated/);
});

test('detectDelimiter', () => {
  assert.strictEqual(S.detectDelimiter('a;b;c\n1;2;3\n4;5;6'), ';');
  assert.strictEqual(S.detectDelimiter('a\tb\n1\t2\n3\t4'), '\t');
  assert.strictEqual(S.detectDelimiter('a|b|c\n1|2|3'), '|');
  assert.strictEqual(S.detectDelimiter('a,b,c\n1,"x;y;z",3'), ',');
  assert.strictEqual(S.detectDelimiter('just one column\nof text'), ',');
});

test('decode: BOMs, UTF-8, and windows-1252 fallback', () => {
  assert.strictEqual(S.decode(Uint8Array.from([0xEF, 0xBB, 0xBF, 0x61])).text, 'a');
  assert.strictEqual(S.decode(Uint8Array.from([0xFF, 0xFE, 0x61, 0x00])).text, 'a');
  assert.strictEqual(S.decode(Uint8Array.from([0xFE, 0xFF, 0x00, 0x61])).text, 'a');
  assert.strictEqual(S.decode(new TextEncoder().encode('Pérez')).text, 'Pérez');
  const d = S.decode(Uint8Array.from([0x50, 0xE9, 0x72, 0x65, 0x7A]));
  assert.strictEqual(d.text, 'Pérez');
  assert.match(d.encoding, /1252/);
});

test('analyze: flags columns and counts severities', () => {
  const rows = S.parseCSV('id,zip,note\n1,02134,ok\n2,90210,=1+1\n3,00501,fine');
  const a = S.analyze(rows);
  assert.strictEqual(a.rowCount, 3);
  assert.strictEqual(a.columns[1].needsText, true);
  assert.strictEqual(a.columns[0].needsText, false);
  assert.strictEqual(a.columns[2].severity, 'injection');
  assert.strictEqual(a.bySeverity.destructive, 2);
  assert.strictEqual(a.bySeverity.injection, 1);
  assert.strictEqual(a.cells[0].row, 2);
});

test('analyze: ragged rows produce a warning', () => {
  const a = S.analyze(S.parseCSV('a,b\n1\n1,2,3'));
  assert.ok(a.warnings.some(w => /Ragged/.test(w)));
});

test('diagnose: finds zero-stripped, date-eaten, sci, precision loss, Excel errors', () => {
  const rows = S.parseCSV(fs.readFileSync(path.join(__dirname, '../samples/damaged.csv'), 'utf8'));
  const kinds = S.diagnose(rows).issues.map(i => i.kind).sort();
  assert.deepStrictEqual(kinds, ['date-eaten', 'excel-error', 'precision-loss', 'sci-notation', 'zero-stripped']);
});

test('diagnose: clean file, and genuine date column is low confidence', () => {
  assert.deepStrictEqual(S.diagnose(S.parseCSV('a,b\n02134,x\n90210,y')).issues, []);
  const d = S.diagnose(S.parseCSV('when\n1-Sep\n2-Sep\n3-Sep')).issues[0];
  assert.strictEqual(d.confidence, 'low');
});

test('repairZeros pads only flagged columns', () => {
  const rows = S.parseCSV('zip,qty\n02134,5\n7030,6\n90210,7\n10001,8\n60601,9');
  const d = S.diagnose(rows);
  const r = S.repairZeros(rows, d.issues);
  assert.strictEqual(r.fixed, 1);
  assert.strictEqual(r.rows[2][0], '07030');
  assert.strictEqual(r.rows[1][1], '5');
});

test('toCSV: quoting, BOM, formula guard', () => {
  const rows = [['h', 'x'], ['a,b', 'he said "hi"'], ['=1+1', 'multi\nline']];
  const out = S.toCSV(rows, { bom: true, guardFormulas: true });
  assert.ok(out.startsWith('﻿'));
  assert.ok(out.includes('"a,b"') && out.includes('"he said ""hi"""') && out.includes("'=1+1"));
  assert.deepStrictEqual(S.parseCSV(S.toCSV(rows)), rows);
});

test('xlsx: zip is structurally valid and every cell round-trips exactly', () => {
  const text = fs.readFileSync(path.join(__dirname, '../samples/customers.csv'), 'utf8');
  const rows = S.parseCSV(text), a = S.analyze(rows);
  const textCols = new Set(a.columns.filter(c => c.needsText || c.severity === 'injection').map(c => c.index));
  const bytes = S.toXlsx(rows, { textCols });
  const files = S.unzipStored(bytes);
  assert.deepStrictEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  const back = S.readXlsxCells(bytes);
  rows.forEach((r, i) => r.forEach((v, j) => assert.strictEqual(back[i][j] === undefined ? '' : back[i][j], v, `cell ${i},${j}`)));
  const xml = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);
  assert.ok(xml.includes('<c r="C2" s="1" t="inlineStr"><is><t xml:space="preserve">02134</t>'), 'zip forced to Text');
  assert.ok(/<c r="A2"><v>1<\/v><\/c>/.test(xml), 'plain ids stay numeric');
  assert.ok(!/<f>/.test(xml), 'no cell becomes a formula');
});

test('xlsx: crc32 known vector, XML escaping, control chars, numeric canonical form', () => {
  assert.strictEqual(S.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  const rows = [['h'], ['a<b&c>'], ['bad\u0001char'], ['2.50'], ['007']];
  const back = S.readXlsxCells(S.toXlsx(rows));
  assert.strictEqual(back[1][0], 'a<b&c>');
  assert.strictEqual(back[2][0], 'bad�char');
  assert.strictEqual(back[3][0], '2.50');
  assert.strictEqual(back[4][0], '007');
});

test('xlsx: refuses impossible sizes', () => {
  assert.throws(() => S.toXlsx(new Array(1048577).fill(['x'])), /Too many rows/);
});

test('CLI: scan exit codes, fix writes a verified xlsx, diagnose repairs', () => {
  const cli = path.join(__dirname, '../cli.js'), sm = path.join(__dirname, '../samples');
  const run = (...a) => spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8' });
  let r = run('scan', path.join(sm, 'customers.csv'));
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /leading-zero/);
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'safecsv-'));
  fs.writeFileSync(path.join(tmp, 'ok.csv'), 'a,b\nx,y\n');
  r = run('check', path.join(tmp, 'ok.csv'));
  assert.strictEqual(r.status, 0);
  r = run('fix', path.join(sm, 'customers.csv'), '-o', path.join(tmp, 'o.xlsx'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /round-trip verified/);
  assert.ok(fs.statSync(path.join(tmp, 'o.xlsx')).size > 500);
  r = run('diagnose', path.join(sm, 'damaged.csv'), '--repair-zeros', '-o', path.join(tmp, 'r.csv'));
  assert.strictEqual(r.status, 1);
  assert.match(fs.readFileSync(path.join(tmp, 'r.csv'), 'utf8'), /07030/);
  r = run('scan', path.join(tmp, 'missing.csv'));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /Cannot read/);
  fs.rmSync(tmp, { recursive: true });
});
