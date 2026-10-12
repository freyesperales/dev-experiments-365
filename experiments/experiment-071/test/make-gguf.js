'use strict';
// Builds synthetic but spec-correct GGUF v3 files for tests and the demo.
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
function str(s) { const d = Buffer.from(s, 'utf8'); return Buffer.concat([u64(d.length), d]); }
const T = { u32: 4, f32: 6, bool: 7, str: 8, arr: 9 };
function kv(key, type, val) {
  let v;
  if (type === 'u32') v = u32(val);
  else if (type === 'bool') v = Buffer.from([val ? 1 : 0]);
  else if (type === 'str') v = str(val);
  else if (type === 'f32') { v = Buffer.alloc(4); v.writeFloatLE(val); }
  else if (type === 'arr-u32') v = Buffer.concat([u32(T.u32), u64(val.length), ...val.map(u32)]);
  else if (type === 'arr-str') v = Buffer.concat([u32(T.str), u64(val.length), ...val.map(str)]);
  else throw new Error('type ' + type);
  const tcode = type.startsWith('arr') ? T.arr : T[type];
  return Buffer.concat([str(key), u32(tcode), v]);
}
// opts: {arch, layers, emb, heads, kvHeads, ctx, ffn, vocab, qtype(ggml id), template, addBos, eos, extraKv, noData, vocabTokens}
function build(o = {}) {
  const arch = o.arch || 'llama', L = o.layers || 4, emb = o.emb || 256, heads = o.heads || 8;
  const kvh = o.kvHeads || 2, ffn = o.ffn || 512, vocab = o.vocab || 1024, q = o.qtype == null ? 8 : o.qtype;
  const kvs = [
    kv('general.architecture', 'str', arch), kv('general.name', 'str', o.name || 'Tiny Test'),
    kv('general.file_type', 'u32', o.fileType == null ? 7 : o.fileType),
    kv(arch + '.block_count', 'u32', L), kv(arch + '.context_length', 'u32', o.ctx || 4096),
    kv(arch + '.embedding_length', 'u32', emb), kv(arch + '.attention.head_count', 'u32', heads),
    kv(arch + '.attention.head_count_kv', 'u32', kvh),
  ];
  if (o.template !== null) kvs.push(kv('tokenizer.chat_template', 'str', o.template || '{{ messages }}'));
  if (o.addBos !== undefined) kvs.push(kv('tokenizer.ggml.add_bos_token', 'bool', o.addBos));
  if (o.eos !== false) kvs.push(kv('tokenizer.ggml.eos_token_id', 'u32', 2));
  if (o.vocabTokens) kvs.push(kv('tokenizer.ggml.tokens', 'arr-str', Array.from({ length: o.vocabTokens }, (_, i) => 'tok' + i)));
  for (const e of o.extraKv || []) kvs.push(kv(...e));
  const tensors = [];
  const bsz = { 0: [1, 4], 1: [1, 2], 8: [32, 34], 12: [256, 144], 14: [256, 210] }[q];
  const tb = (n) => (n / bsz[0]) * bsz[1];
  const add = (name, dims, type = q) => tensors.push({ name, dims, type });
  add('token_embd.weight', [emb, vocab]);
  add('output_norm.weight', [emb], 0);
  add('output.weight', [emb, vocab]);
  for (let i = 0; i < L; i++) {
    add(`blk.${i}.attn_q.weight`, [emb, emb]);
    add(`blk.${i}.attn_k.weight`, [emb, (emb / heads) * kvh]);
    add(`blk.${i}.attn_v.weight`, [emb, (emb / heads) * kvh]);
    add(`blk.${i}.attn_output.weight`, [emb, emb]);
    add(`blk.${i}.ffn_up.weight`, [emb, ffn]);
    add(`blk.${i}.ffn_gate.weight`, [emb, ffn]);
    add(`blk.${i}.ffn_down.weight`, [ffn, emb]);
    add(`blk.${i}.attn_norm.weight`, [emb], 0);
  }
  let off = 0;
  const infos = tensors.map((t) => {
    const n = t.dims.reduce((a, b) => a * b, 1);
    const bytes = t.type === 0 ? n * 4 : tb(n);
    const b = Buffer.concat([str(t.name), u32(t.dims.length), ...t.dims.map(u64), u32(t.type), u64(off)]);
    off += Math.ceil(bytes / 32) * 32;
    return b;
  });
  const head = Buffer.concat([Buffer.from('GGUF'), u32(3), u64(tensors.length), u64(kvs.length), ...kvs, ...infos]);
  const pad = (32 - (head.length % 32)) % 32;
  const data = o.noData ? Buffer.alloc(0) : Buffer.alloc(off);
  return Buffer.concat([head, Buffer.alloc(pad), data]);
}
module.exports = { build, kv, u32, u64, str };
