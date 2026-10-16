/* cachebreak core — pure, dependency-free, runs in Node and the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CacheBreak = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // USD per million tokens. ILLUSTRATIVE DEFAULTS — editable in the UI / --prices.
  // cacheWrite5m / cacheWrite1h / cacheRead follow Anthropic's 1.25x / 2x / 0.1x multipliers.
  function mk(i, o) { return { input: i, output: o, cacheWrite5m: i * 1.25, cacheWrite1h: i * 2, cacheRead: i * 0.1 }; }
  const DEFAULT_PRICES = { opus: mk(15, 75), sonnet: mk(3, 15), haiku: mk(1, 5) };

  const TTL_5M = 300, TTL_1H = 3600;
  const PREFIX_ATTACHMENTS = {
    deferred_tools_delta: 'tool set changed',
    mcp_instructions_delta: 'MCP server instructions changed',
    skill_listing: 'skill list changed',
    agent_listing_delta: 'agent list changed',
  };

  function family(model) {
    const m = String(model || '').toLowerCase();
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    if (m.includes('sonnet') || m.includes('fable')) return 'sonnet';
    return 'sonnet';
  }

  function parseJsonl(text) {
    const entries = []; let bad = 0;
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { const d = JSON.parse(line); if (d && typeof d === 'object' && !Array.isArray(d)) entries.push(d); else bad++; }
      catch (e) { bad++; }
    }
    return { entries, bad };
  }

  const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
  const ts = (e) => { const t = Date.parse(e.timestamp); return isNaN(t) ? null : t / 1000; };

  /**
   * Turn entries into API turns. Claude Code writes one JSONL line per content block, each
   * repeating the same usage block, so lines are de-duplicated by message.id.
   * Sub-agent (isSidechain) turns have their own prefix and are accounted separately.
   */
  function extract(entries) {
    const turns = [], byId = new Map(), side = { turns: 0, cacheRead: 0, cacheWrite: 0, input: 0, output: 0 };
    let pending = []; // events between assistant turns: {kind, detail}
    let lastVersion = null, skippedSynthetic = 0;
    for (const e of entries) {
      if (e.type === 'system' && e.subtype === 'compact_boundary') pending.push({ kind: 'compact', detail: 'conversation compacted' });
      else if (e.type === 'user' && e.isCompactSummary) pending.push({ kind: 'compact', detail: 'conversation compacted' });
      else if (e.type === 'attachment' && e.attachment && PREFIX_ATTACHMENTS[e.attachment.type] && !e.isSidechain)
        pending.push({ kind: 'prefix', detail: PREFIX_ATTACHMENTS[e.attachment.type] });
      if (e.type !== 'assistant' || !e.message || !e.message.usage) continue;
      const m = e.message, u = m.usage;
      if (m.model === '<synthetic>' || e.isApiErrorMessage) { skippedSynthetic++; continue; }
      const id = m.id || e.requestId || e.uuid;
      if (byId.has(id)) { const t = byId.get(id); const x = ts(e); if (x !== null) t.tEnd = x; continue; }
      const cc = u.cache_creation || {};
      let w5 = num(cc.ephemeral_5m_input_tokens), w1 = num(cc.ephemeral_1h_input_tokens);
      const cw = num(u.cache_creation_input_tokens);
      if (w5 + w1 === 0) w5 = cw; else if (w5 + w1 < cw) w5 += cw - (w5 + w1);
      const t = {
        id, model: m.model || 'unknown', input: num(u.input_tokens), cacheWrite: Math.max(cw, w5 + w1), w5, w1,
        cacheRead: num(u.cache_read_input_tokens), output: num(u.output_tokens),
        t: ts(e), tEnd: ts(e), version: e.version || null, sidechain: !!e.isSidechain, events: [],
      };
      byId.set(id, t);
      if (t.sidechain) {
        side.turns++; side.cacheRead += t.cacheRead; side.cacheWrite += t.cacheWrite; side.input += t.input; side.output += t.output;
        continue;
      }
      t.events = pending; pending = [];
      if (t.version && lastVersion && t.version !== lastVersion) t.events.push({ kind: 'version', detail: `client ${lastVersion} → ${t.version}` });
      if (t.version) lastVersion = t.version;
      turns.push(t);
    }
    turns.forEach((t, i) => { t.index = i + 1; t.prompt = t.input + t.cacheWrite + t.cacheRead; });
    return { turns, sidechain: side, skippedSynthetic };
  }

  function cost(t, prices) {
    const p = (prices || DEFAULT_PRICES)[family(t.model)] || DEFAULT_PRICES.sonnet;
    return (t.input * p.input + t.output * p.output + t.w5 * p.cacheWrite5m + t.w1 * p.cacheWrite1h + t.cacheRead * p.cacheRead) / 1e6;
  }

  function fmtDur(s) {
    if (s < 90) return Math.round(s) + 's';
    if (s < 5400) return Math.round(s / 60) + ' min';
    return (s / 3600).toFixed(1) + ' h';
  }

  /**
   * A turn is a BREAK when the previous turn's whole prompt should have been a cache hit
   * (it was written to cache) but this turn read much less of it back.
   * lost = tokens of the previous prompt that were not read from cache (re-billed at write price).
   */
  function analyze(entries, opts) {
    opts = opts || {};
    const prices = opts.prices || DEFAULT_PRICES;
    const minLost = opts.minLost == null ? 2000 : opts.minLost;
    const minFrac = opts.minFrac == null ? 0.2 : opts.minFrac;
    const { turns, sidechain, skippedSynthetic } = extract(entries);
    const breaks = [];
    let total = 0, totalRead = 0, totalPrompt = 0, wasted = 0;
    turns.forEach((t, i) => {
      t.cost = cost(t, prices); total += t.cost; totalRead += t.cacheRead; totalPrompt += t.prompt;
      t.gap = null; t.break = null;
      if (i === 0) return;
      const prev = turns[i - 1];
      if (t.t !== null && prev.tEnd !== null) t.gap = Math.max(0, t.t - prev.tEnd);
      const expected = prev.prompt;
      const lost = Math.max(0, expected - t.cacheRead);
      if (lost < minLost || lost < expected * minFrac) return;
      const p = (prices[family(t.model)] || DEFAULT_PRICES.sonnet);
      // Re-written tokens cost write price instead of read price; use the 5m/1h mix actually billed.
      const wPrice = t.cacheWrite ? (t.w5 * p.cacheWrite5m + t.w1 * p.cacheWrite1h) / t.cacheWrite : p.cacheWrite5m;
      const waste = lost * (wPrice - p.cacheRead) / 1e6;
      const causes = [];
      if (t.model !== prev.model) causes.push({ cause: 'model-switch', confidence: 'high', detail: `${prev.model} → ${t.model} (cache is per-model)` });
      const ttl = prev.w1 > prev.w5 ? TTL_1H : TTL_5M;
      if (t.gap !== null && t.gap > ttl) causes.push({ cause: 'ttl-expiry', confidence: 'high', detail: `idle ${fmtDur(t.gap)} > ${ttl === TTL_1H ? '1 h' : '5 min'} cache TTL` });
      for (const ev of t.events) {
        if (ev.kind === 'compact') causes.push({ cause: 'compaction', confidence: 'high', detail: ev.detail });
        else if (ev.kind === 'version') causes.push({ cause: 'client-upgrade', confidence: 'medium', detail: ev.detail });
        else if (ev.kind === 'prefix') causes.push({ cause: 'prefix-change', confidence: 'medium', detail: ev.detail });
      }
      if (!causes.length) causes.push({ cause: 'unexplained', confidence: 'low', detail: 'no model/TTL/compaction/client signal in the log — prefix edited upstream (system prompt, tool schemas, CLAUDE.md) or server-side eviction' });
      // Where the prefix diverged: cache read stops at the first changed token (rounded to a cache block).
      const diverge = t.cacheRead;
      const where = diverge === 0 ? 'the very start of the prompt (system prompt / tool definitions)'
        : `≈ token ${diverge.toLocaleString('en-US')} of ${expected.toLocaleString('en-US')}`;
      const b = { turn: t.index, lost, expected, read: t.cacheRead, waste, gap: t.gap, divergedAt: diverge, where, causes, primary: causes[0].cause };
      t.break = b; breaks.push(b); wasted += waste;
    });
    const hit = totalPrompt ? totalRead / totalPrompt : null;
    return {
      turns, breaks, sidechain, skippedSynthetic,
      summary: { turns: turns.length, hitRate: hit, cost: total, wasted, breaks: breaks.length, models: [...new Set(turns.map(t => t.model))] },
    };
  }

  function money(x) { return '$' + (x < 10 ? x.toFixed(2) : x.toFixed(0)); }

  function toMarkdown(r) {
    const s = r.summary, L = [];
    L.push('# CacheBreak report', '');
    L.push(`- Turns: ${s.turns} · cache hit rate: ${s.hitRate === null ? 'n/a' : (s.hitRate * 100).toFixed(1) + '%'} · est. cost: ${money(s.cost)} · wasted on cache breaks: **${money(s.wasted)}**`);
    L.push('', r.breaks.length ? '| Turn | Lost tokens | Wasted | Cause | Diverged at |' : '_No cache breaks detected._');
    if (r.breaks.length) {
      L.push('|---|---|---|---|---|');
      for (const b of r.breaks) L.push(`| ${b.turn} | ${b.lost.toLocaleString('en-US')} | ${money(b.waste)} | ${b.causes.map(c => c.cause).join(' + ')} | ${b.where} |`);
    }
    L.push('', '_Prices are illustrative defaults; edit them to match your plan._');
    return L.join('\n');
  }

  function ascii(r, width) {
    width = width || 50;
    const max = Math.max(1, ...r.turns.map(t => t.prompt));
    return r.turns.map(t => {
      const n = (x) => Math.round(x / max * width);
      const rd = n(t.cacheRead), wr = n(t.cacheWrite), inp = Math.max(0, n(t.prompt) - rd - wr);
      return String(t.index).padStart(3) + ' ' + '█'.repeat(rd) + '▒'.repeat(wr) + '░'.repeat(inp) + (t.break ? '  ◄ BREAK ' + t.break.primary : '');
    }).join('\n');
  }

  return { analyze, extract, parseJsonl, toMarkdown, ascii, family, DEFAULT_PRICES, money, fmtDur };
});
