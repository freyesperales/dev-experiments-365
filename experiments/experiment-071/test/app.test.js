'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { build } = require('./make-gguf.js');
const cli = require('../cli.js');

test('index.html embeds the current core.js (run `node build.js` if this fails)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(html.includes(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8')));
});

test('inlined core runs in a browser-like global and exposes GGUFXray', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const ctx = { TextDecoder, DataView, Uint8Array, Math };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(scripts[0], ctx);
  const X = ctx.GGUFXray;
  assert.equal(typeof X.parseHeader, 'function');
  const h = X.parseHeader(new Uint8Array(build()));
  assert.equal(h.version, 3);
  new vm.Script(scripts[1]); // UI script at least parses
});

function tmpModel(opts) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xray-')), 'm.gguf');
  fs.writeFileSync(f, build(opts));
  return f;
}
const run = async (args) => { const lines = []; const code = await cli.run(args, (s) => lines.push(s)); return { code, text: lines.join('\n') }; };

test('CLI reports fit and launch command', async () => {
  const r = await run([tmpModel(), '--vram', '8', '--ctx', '2048']);
  assert.equal(r.code, 0);
  assert.match(r.text, /FITS/);
  assert.match(r.text, /llama-server -m m\.gguf -c 2048 -ngl 4/);
});

test('CLI --json is valid JSON and exits 1 on a truncated file', async () => {
  const f = tmpModel();
  fs.truncateSync(f, fs.statSync(f).size - 4000);
  const r = await run([f, '--json']);
  assert.equal(r.code, 1);
  assert.ok(JSON.parse(r.text).checks.some((c) => c.id === 'TRUNCATED'));
});

test('CLI rejects bad args and non-GGUF files', async () => {
  assert.throws(() => cli.parseArgs(['x', '--vram', '-3']), /positive/);
  assert.throws(() => cli.parseArgs(['x', '--kv', 'q9']), /--kv/);
  assert.throws(() => cli.parseArgs(['x', '--bogus']), /unknown option/);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'xray-')), 'a.gguf');
  fs.writeFileSync(f, 'this is definitely not a gguf file at all');
  await assert.rejects(run([f]), /not a GGUF/);
});
