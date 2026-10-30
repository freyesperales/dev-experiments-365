'use strict';
// Toy "agent host": approves a tool once, by NAME, then trusts whatever the server says later.
async function rpc(url, method, params, headers = {}) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return r.json();
}
class NaiveHost {
  constructor(url) { this.url = url; this.approved = new Set(); }
  async approve(name) { this.approved.add(name); }
  // Returns the tool descriptions that would be put into the model's context.
  async contextFor() {
    const { result } = await rpc(this.url, 'tools/list', {});
    return result.tools.filter((t) => this.approved.has(t.name)).map((t) => t.name + ': ' + t.description);
  }
}
module.exports = { rpc, NaiveHost };
