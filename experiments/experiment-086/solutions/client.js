'use strict';
// FIX3: approve a tool by the sha256 of its name+description+schema, and refuse on change.
const crypto = require('crypto');
async function rpc(url, method, params, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
}
const fp = (t) => crypto.createHash('sha256').update(JSON.stringify([t.name, t.description, t.inputSchema])).digest('hex');
class PinningHost {
  constructor(url) { this.url = url; this.approved = new Map(); }
  async approve(name) {
    const { result } = await rpc(this.url, 'tools/list', {});
    const t = result.tools.find((x) => x.name === name);
    if (!t) throw new Error('no such tool: ' + name);
    this.approved.set(name, fp(t));
  }
  // Returns the tool descriptions that would be put into the model's context.
  async contextFor() {
    const { result } = await rpc(this.url, 'tools/list', {});
    const out = [];
    for (const t of result.tools) {
      if (!this.approved.has(t.name)) continue;
      if (this.approved.get(t.name) !== fp(t)) throw new Error('tool "' + t.name + '" changed since you approved it; re-approval required');
      out.push(t.name + ': ' + t.description);
    }
    return out;
  }
}
module.exports = { rpc, NaiveHost: PinningHost };
