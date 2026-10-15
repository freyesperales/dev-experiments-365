'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const bin = path.join(__dirname, '..', 'hexlens.js'), file = path.join(__dirname, '..', 'samples', 'demo.sav');
require('node:fs').mkdirSync(path.dirname(file), {recursive: true});
require('node:fs').writeFileSync(file, require('./make-sample.js')());
const run = (...a) => spawnSync(process.execPath, [bin, ...a], {encoding: 'utf8'});

test('cli finds dates', () => {
  const r = run(file, '--find', 'date:2024-06-01');
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /0x00000008\s+u32 LE\s+1717243200\s+\[unix s\]/);
  assert.match(r.stdout, /FILETIME/);
});
test('cli bad query exits 2', () => { const r = run(file, '--find', 'wat'); assert.strictEqual(r.status, 2); assert.match(r.stderr, /Not a number/); });
test('cli missing file exits 2', () => { assert.strictEqual(run('/nope/x.bin').status, 2); });
test('cli --at lists dates', () => { assert.match(run(file, '--at', '8').stdout, /unix s 2024-06-01T12:00:00Z/); });
test('cli default hexdump', () => { assert.match(run(file).stdout, /^samples|SAVE/m); });
