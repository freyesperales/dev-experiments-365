// Generates synthetic Claude-Code-shaped sessions with planted cache breaks (ground truth in comments).
'use strict';
const fs = require('fs'), path = require('path');
function build(spec) {
  const lines = []; let prompt = 18000, t = Date.parse('2026-10-01T09:00:00Z'), n = 0, ver = '2.1.0';
  for (const s of spec) {
    if (s.compact) lines.push({ type: 'system', subtype: 'compact_boundary', timestamp: new Date(t).toISOString() });
    if (s.attach) lines.push({ type: 'attachment', attachment: { type: s.attach }, timestamp: new Date(t).toISOString() });
    if (s.version) ver = s.version;
    t += (s.gap || 20) * 1000; n++;
    const grow = s.grow == null ? 1500 : s.grow;
    const read = s.read == null ? prompt : s.read;          // tokens served from cache
    const total = (s.compact ? 9000 : prompt) + grow;
    const write = Math.max(0, total - read - 3);
    const msg = { id: 'msg_' + n, model: s.model || 'claude-sonnet-5-5', role: 'assistant', content: [],
      usage: { input_tokens: 3, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: 200,
        cache_creation: { ephemeral_5m_input_tokens: write, ephemeral_1h_input_tokens: 0 } } };
    // one JSONL line per content block, usage repeated (real Claude Code behaviour)
    for (const b of [{ type: 'thinking' }, { type: 'text', text: 'x' }, { type: 'tool_use', name: 'Read' }])
      lines.push({ type: 'assistant', isSidechain: false, version: ver, timestamp: new Date(t).toISOString(), message: Object.assign({}, msg, { content: [b] }) });
    prompt = total + 3;
  }
  return lines.map(l => JSON.stringify(l)).join('\n') + '\n';
}
const ok = Array.from({ length: 8 }, () => ({}));
const planted = [
  {}, {}, {},
  { model: 'claude-opus-5-5', read: 0 },                         // turn 4: model switch, total miss
  {}, {},
  { gap: 900, read: 0 },                                         // turn 7: idle 15 min -> TTL expiry
  {},
  { compact: true, read: 0 },                                    // turn 9: compaction
  {}, {},
  { attach: 'deferred_tools_delta', read: 5000 },               // turn 12: tool set changed, partial hit
  {},
  { read: 8000 },                                               // turn 14: unexplained partial miss
  {},
];
fs.writeFileSync(path.join(__dirname, 'healthy.jsonl'), build(ok));
fs.writeFileSync(path.join(__dirname, 'planted.jsonl'), build(planted));
