'use strict';
const test = require('node:test');
const assert = require('node:assert');
const X = require('../src/core.js');
const { build } = require('./make-gguf.js');

const analyze = (buf, o = {}) => {
  const h = X.parseHeader(buf);
  const d = X.describe(h, buf.length);
  const opts = Object.assign({ vramGB: 8, ramGB: 16, ctx: 4096, kvType: 'f16' }, o);
  return { h, d, p: X.plan(d, opts), opts };
};

test('parses header, kv and tensors', () => {
  const { h, d } = analyze(build({ layers: 4 }));
  assert.equal(h.version, 3);
  assert.equal(d.arch, 'llama');
  assert.equal(d.layers, 4);
  assert.equal(d.tensorCount, 3 + 4 * 8);
  assert.equal(d.heads, 8);
  assert.equal(d.kvHeads, 2);
  assert.equal(d.keyLen, 32);
  assert.equal(d.fileType, 'Q8_0');
  assert.equal(d.truncated, false);
});

test('tensor byte sizes follow ggml block layouts', () => {
  const { h } = analyze(build({ emb: 256, vocab: 1024, qtype: 8 }));
  const e = h.tensors.find((t) => t.name === 'token_embd.weight');
  assert.equal(e.bytes, (256 * 1024 / 32) * 34);
  const k = analyze(build({ qtype: 12 })).h.tensors.find((t) => t.name === 'output.weight');
  assert.equal(k.typeName, 'Q4_K');
  assert.equal(k.bytes, (256 * 1024 / 256) * 144);
});

test('weights total equals sum of tensors; data offset aligned', () => {
  const buf = build();
  const { h, d } = analyze(buf);
  assert.equal(d.weightBytes, h.tensors.reduce((a, t) => a + t.bytes, 0));
  assert.equal(h.dataStart % 32, 0);
  assert.equal(d.expectedFileSize <= buf.length, true);
});

test('KV cache size = layers * kvHeads * (k+v) * ctx * bytes', () => {
  const { d, p } = analyze(build({ layers: 4, emb: 256, heads: 8, kvHeads: 2 }), { ctx: 1000 });
  assert.equal(p.kvTotal, 4 * 2 * (32 + 32) * 1000 * 2);
  assert.equal(p.kvTokenBytes, 4 * 2 * 64 * 2);
});

test('quantized KV shrinks cache proportionally', () => {
  const f16 = analyze(build(), { kvType: 'f16' }).p.kvTotal;
  const q8 = analyze(build(), { kvType: 'q8_0' }).p.kvTotal;
  const q4 = analyze(build(), { kvType: 'q4_0' }).p.kvTotal;
  assert.ok(Math.abs(q8 / f16 - 34 / 64) < 1e-9);
  assert.ok(Math.abs(q4 / f16 - 18 / 64) < 1e-9);
});

test('tiny model fits fully in VRAM', () => {
  const { p } = analyze(build());
  assert.equal(p.verdict, 'full');
  assert.equal(p.ngl, p.layers);
  assert.equal(p.cpuBytes, 0);
});

test('partial offload when VRAM is too small, full offload impossible', () => {
  const buf = build({ layers: 8 });
  const { d } = analyze(buf);
  const per = d.layerBytes / 8;
  const vramGB = (d.outputBytes + 512 * 1024 ** 2 + per * 3.5) / 1024 ** 3; // room for 3 layers
  const { p } = analyze(buf, { vramGB, ctx: 16 });
  assert.equal(p.verdict, 'partial');
  assert.equal(p.ngl, 3);
  assert.ok(p.cpuBytes > 0);
});

test('verdict none when RAM cannot hold the rest', () => {
  const { p } = analyze(build({ layers: 8 }), { vramGB: 0.5, overheadMB: 511, ramGB: 0.0001, ctx: 8 });
  assert.equal(p.verdict, 'none');
});

test('max context is monotone in VRAM and consistent with fit', () => {
  const buf = build({ layers: 8 });
  const a = analyze(buf, { vramGB: 1 }).p.maxCtxFull;
  const b = analyze(buf, { vramGB: 2 }).p.maxCtxFull;
  assert.ok(b > a);
  assert.equal(analyze(buf, { vramGB: 1, ctx: a }).p.verdict, 'full');
  assert.notEqual(analyze(buf, { vramGB: 1, ctx: a + 4096 }).p.verdict, 'full');
});

test('per-layer head_count_kv arrays are averaged', () => {
  const buf = build({ arch: 'llama', layers: 4, extraKv: [['llama.attention.head_count_kv', 'arr-u32', [2, 2, 4, 4]]] });
  // later duplicate key wins in object -> array form
  const { d } = analyze(buf);
  assert.equal(d.kvHeads, 3);
});

test('large string arrays are skipped without storing but still parsed', () => {
  const buf = build({ vocabTokens: 5000 });
  const { h, d } = analyze(buf);
  assert.equal(h.kv['tokenizer.ggml.tokens'].length, 5000);
  assert.equal(d.layers, 4);
});

test('NeedMore on truncated header buffer, and readHeader grows its window', async () => {
  const buf = build({ vocabTokens: 3000 });
  assert.throws(() => X.parseHeader(buf.subarray(0, 200)), X.NeedMore);
  let reads = 0;
  const h = await X.readHeader(async (s, e) => { reads++; return buf.subarray(s, e); }, buf.length, 256);
  assert.ok(reads > 1);
  assert.equal(h.tensors.length, 35);
});

test('rejects non-GGUF, old versions, big-endian and junk', () => {
  assert.throws(() => X.parseHeader(Buffer.from('PK\x03\x04aaaaaaaaaaaaaaaaaaaaaaaa')), /not a GGUF/);
  assert.throws(() => X.parseHeader(Buffer.from('FUGG\x00\x00\x00\x03aaaaaaaaaaaaaaaa')), /big-endian/);
  const v1 = build(); v1.writeUInt32LE(1, 4);
  assert.throws(() => X.parseHeader(v1), /obsolete/);
  const bad = build(); bad.writeUInt32LE(99, 4);
  assert.throws(() => X.parseHeader(bad), /unsupported GGUF version 99/);
  const huge = Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(4), Buffer.alloc(16)]);
  huge.writeUInt32LE(3, 4); huge.writeUInt32LE(0xffffffff, 8);
  assert.throws(() => X.parseHeader(huge), /implausible/);
});

test('detects truncated download (data missing)', () => {
  const full = build();
  const part = full.subarray(0, full.length - 5000);
  const { h, d, p, opts } = analyze(part);
  assert.equal(d.truncated, true);
  assert.ok(X.checks(h, d, p, opts, 'x.gguf').some((c) => c.id === 'TRUNCATED' && c.sev === 'error'));
});

const ids = (buf, o, name) => { const { h, d, p, opts } = analyze(buf, o); return X.checks(h, d, p, opts, name).map((c) => c.id); };

test('template: double BOS, reverse slice, tools, strftime, think', () => {
  const tpl = '{{ bos_token }}{% for m in messages[::-1] %}{{ strftime_now("%Y") }}{% endfor %}{{ tools }}<think>';
  const r = ids(build({ template: tpl, addBos: true }));
  for (const id of ['DOUBLE_BOS', 'REVERSE_SLICE', 'STRFTIME', 'TOOLS', 'THINK']) assert.ok(r.includes(id), id);
});

test('template: no double-BOS when add_bos_token is false; clean template is quiet', () => {
  const r = ids(build({ template: '{{ bos_token }}x', addBos: false }));
  assert.ok(!r.includes('DOUBLE_BOS'));
  const clean = ids(build({ template: '{% for m in messages %}{{ m.content }}{% endfor %}' }));
  assert.deepEqual(clean, ['NO_TOOLS']);
});

test('missing template and missing EOS are warned', () => {
  const r = ids(build({ template: null, eos: false }));
  assert.ok(r.includes('NO_TEMPLATE') && r.includes('NO_EOS'));
});

test('context over trained length and shard filenames are flagged', () => {
  const r = ids(build({ ctx: 4096 }), { ctx: 8192 }, 'm-00001-of-00003.gguf');
  assert.ok(r.includes('CTX_OVER_TRAINED') && r.includes('SPLIT'));
});

test('MLA architectures are flagged as overstated', () => {
  const r = ids(build({ arch: 'deepseek2', extraKv: [['deepseek2.attention.kv_lora_rank', 'u32', 512]] }));
  assert.ok(r.includes('MLA'));
});

test('launch command adds --jinja for tool templates and KV flags', () => {
  const { d, p } = analyze(build());
  const cmd = X.launchCommand('m.gguf', d, p, { ctx: 8192, kvType: 'q8_0', template: '{{ tools }}' });
  assert.equal(cmd, `llama-server -m m.gguf -c 8192 -ngl ${p.ngl} -fa on -ctk q8_0 -ctv q8_0 --jinja`);
});

test('missing attention metadata yields a clear non-crashing plan', () => {
  const { p } = analyze(build({ arch: 'weird', layers: 4 }), {});
  assert.equal(p.ok, true); // metadata present in builder; sanity
  const h = X.parseHeader(build());
  delete h.kv['llama.attention.head_count'];
  const d = X.describe(h, 1e9);
  assert.equal(X.plan(d, { vramGB: 8, ctx: 1000 }).ok, false);
});
