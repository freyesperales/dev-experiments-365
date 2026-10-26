#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./src/safecsv.js');

const HELP = `SafeCSV: stop Excel from eating your CSV.

  safecsv scan  <file.csv> [--json]            report what Excel would change/destroy (exit 1 if anything destructive)
  safecsv fix   <file.csv> [-o out.xlsx|out.csv] [--guard-formulas]
                                               write an Excel-safe .xlsx (default) or a UTF-8-BOM .csv
  safecsv check <file.csv>                     quiet CI mode: exit 1 on destructive/altered cells
  safecsv diagnose <file.csv> [--repair-zeros -o fixed.csv]
                                               look for damage Excel already did to this file

Options: --delimiter <, ; tab |>   --no-header   --json
`;

function parseArgs(argv) {
  const a = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '-o' || t === '--out') a.flags.out = argv[++i];
    else if (t === '--delimiter') a.flags.delimiter = argv[++i];
    else if (t.startsWith('--')) a.flags[t.slice(2)] = true;
    else a._.push(t);
  }
  return a;
}

function load(file, flags) {
  let buf;
  try { buf = fs.readFileSync(file); } catch (e) { throw new Error('Cannot read ' + file + ': ' + e.code); }
  if (!buf.length) throw new Error(file + ' is empty.');
  const dec = S.decode(new Uint8Array(buf));
  let delim = flags.delimiter;
  if (delim === 'tab' || delim === '\\t') delim = '\t';
  if (delim && delim.length !== 1) throw new Error('--delimiter must be one character (or "tab").');
  delim = delim || S.detectDelimiter(dec.text);
  const rows = S.parseCSV(dec.text, delim);
  if (!rows.length) throw new Error('No rows found in ' + file);
  return { rows, delim, enc: dec.encoding, header: !flags['no-header'] };
}

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0], file = args._[1];
  if (!cmd || cmd === 'help' || args.flags.help || args.flags.h) { process.stdout.write(HELP); return 0; }
  if (!file) { process.stderr.write('Missing file.\n' + HELP); return 2; }
  const { rows, delim, enc, header } = load(file, args.flags);
  const info = path.basename(file) + ' (' + enc + ', delimiter ' + JSON.stringify(delim) + ')';

  if (cmd === 'scan' || cmd === 'check') {
    const a = S.analyze(rows, { header });
    const bad = a.bySeverity.destructive + a.bySeverity.altered;
    if (args.flags.json) { process.stdout.write(JSON.stringify({ file: info, ...a }, null, 2) + '\n'); return bad ? 1 : 0; }
    if (cmd === 'check') { if (bad) process.stderr.write(info + ': ' + bad + ' cell(s) Excel would change or destroy. Run: safecsv scan\n'); return bad ? 1 : 0; }
    process.stdout.write(info + '\n' + S.summarize(a) + '\n');
    if (!a.cells.length) process.stdout.write('Safe: Excel will open this exactly as written.\n');
    return a.bySeverity.destructive ? 1 : 0;
  }

  if (cmd === 'fix') {
    const a = S.analyze(rows, { header });
    const out = args.flags.out || file.replace(/\.[^.]*$/, '') + '.safe.xlsx';
    if (/\.csv$/i.test(out)) {
      fs.writeFileSync(out, S.toCSV(rows, { delim: ',', bom: true, guardFormulas: !!args.flags['guard-formulas'], header }), 'utf8');
      process.stdout.write('Wrote ' + out + ' (UTF-8 with BOM). NOTE: Excel will still mangle risky columns when it opens a CSV. Use .xlsx for those.\n');
    } else {
      const textCols = new Set(a.columns.filter(c => c.needsText || c.severity === 'injection').map(c => c.index));
      const bytes = S.toXlsx(rows, { header, textCols, sheetName: path.basename(file).replace(/\.[^.]*$/, '') });
      const back = S.readXlsxCells(bytes);
      const same = rows.every((r, i) => r.every((v, j) => (back[i] && back[i][j] !== undefined ? back[i][j] : '') === v));
      if (!same) throw new Error('Internal round-trip check failed; refusing to write a file that would not match the input.');
      fs.writeFileSync(out, bytes);
      process.stdout.write('Wrote ' + out + ': ' + rows.length + ' rows, ' + textCols.size + ' column(s) forced to Text, round-trip verified cell-for-cell.\n');
    }
    return 0;
  }

  if (cmd === 'diagnose') {
    const d = S.diagnose(rows, { header });
    if (args.flags.json) { process.stdout.write(JSON.stringify(d, null, 2) + '\n'); return d.issues.length ? 1 : 0; }
    process.stdout.write(info + '\n');
    if (!d.issues.length) { process.stdout.write('No tell-tale Excel damage found.\n'); return 0; }
    d.issues.forEach(i => {
      process.stdout.write('[' + i.confidence + '] ' + i.name + ': ' + i.kind + ' x' + i.count + '\n    ' + i.message + '\n');
      i.examples.forEach(e => process.stdout.write('    row ' + e.row + ': ' + JSON.stringify(e.value) + (e.fixed ? ' -> ' + JSON.stringify(e.fixed) : '') + '\n'));
    });
    if (args.flags['repair-zeros']) {
      const out = args.flags.out || file.replace(/\.[^.]*$/, '') + '.repaired.csv';
      const r = S.repairZeros(rows, d.issues, { header });
      fs.writeFileSync(out, S.toCSV(r.rows, { delim, bom: true, header }), 'utf8');
      process.stdout.write('Padded ' + r.fixed + ' value(s) with leading zeros -> ' + out + '\n');
    }
    return 1;
  }
  process.stderr.write('Unknown command: ' + cmd + '\n' + HELP);
  return 2;
}

try { process.exitCode = main(process.argv.slice(2)); }
catch (e) { process.stderr.write('safecsv: ' + e.message + '\n'); process.exitCode = 2; }
