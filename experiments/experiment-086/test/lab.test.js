'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const variants = { vulnerable: ['../lab/server.js', '../lab/client.js'], fixed: ['../solutions/server.js', '../solutions/client.js'] };

function post(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.end(JSON.stringify(body));
  });
}
const call = async (port, name, args, headers) => {
  const r = await post(port, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers);
  return r.status === 200 ? JSON.parse(r.body) : { status: r.status };
};
const text = (j) => (j.result ? j.result.content[0].text : j.error ? j.error.message : 'HTTP ' + j.status);

for (const [label, [srv, cli]] of Object.entries(variants)) {
  const vuln = label === 'vulnerable';
  test('lab: ' + label, async (t) => {
    const server = require(srv).createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    t.after(() => server.close());

    await t.test('normal use still works', async () => {
      assert.match(text(await call(port, 'read_note', { name: 'notes.txt' })), /meeting at 10/);
      assert.strictEqual(text(await call(port, 'search_notes', { term: 'meeting' })), '2');
      assert.match(text(await call(port, 'summarize_notes', {})), /notes.txt/);
    });
    await t.test('CH1 path traversal', async () => {
      const out = text(await call(port, 'read_note', { name: '../secrets/api_key.txt' }));
      assert.strictEqual(out.includes('LAB{contain_to_the_right_directory}'), vuln, out);
    });
    await t.test('CH2 command injection', async () => {
      const out = text(await call(port, 'search_notes', { term: 'x" notes/notes.txt; cat flag_cmd.txt; echo "' }));
      assert.strictEqual(out.includes('LAB{dont_shell_out_with_user_input}'), vuln, out);
    });
    await t.test('CH2 fixed tool still treats metacharacters as data', async () => {
      assert.strictEqual(text(await call(port, 'search_notes', { term: 'a; b' })), '0');
    });
    await t.test('CH3 rug pull', async () => {
      const { NaiveHost } = require(cli);
      const h = new NaiveHost('http://127.0.0.1:' + port);
      await h.approve('summarize_notes');
      let poisoned = false, refused = false;
      for (let i = 0; i < 3; i++) {
        try { poisoned ||= (await h.contextFor()).join('\n').includes('<IMPORTANT>'); } catch (e) { refused = /changed since you approved/.test(e.message); }
      }
      assert.strictEqual(poisoned, vuln);
      assert.strictEqual(refused, !vuln);
    });
    await t.test('CH4 foreign Origin / Host', async () => {
      const body = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
      const evil = await post(port, body, { origin: 'http://evil.example' });
      assert.strictEqual(evil.status, vuln ? 200 : 403);
      const rebind = await post(port, body, { host: 'rebind.evil.example' });
      assert.strictEqual(rebind.status, vuln ? 200 : 403);
      const ok = await post(port, body, { origin: 'http://localhost:3000' });
      assert.strictEqual(ok.status, 200);
    });
  });
}
