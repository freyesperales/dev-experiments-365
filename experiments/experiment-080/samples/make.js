// Generates samples/baseline.har and samples/release.har (a realistic checkout page, before and after a bad deploy).
const fs = require('fs'), path = require('path');
const T0 = Date.parse('2026-10-20T09:00:00.000Z');
function entry(o) {
  const u = new URL(o.url);
  const t = Object.assign({ blocked: 1, dns: -1, connect: -1, ssl: -1, send: 1, wait: 40, receive: 10 }, o.t || {});
  const time = ['blocked', 'dns', 'connect', 'ssl', 'send', 'wait', 'receive'].reduce((s, k) => s + Math.max(0, t[k]), 0);
  const body = o.body === undefined ? '' : o.body;
  return {
    startedDateTime: new Date(T0 + o.at).toISOString(), time, serverIPAddress: o.ip || '203.0.113.10', connection: '443',
    request: { method: o.method || 'GET', url: o.url, httpVersion: 'h2', headers: [{ name: ':authority', value: u.host }, { name: 'user-agent', value: 'Mozilla/5.0' }, { name: 'accept-encoding', value: 'gzip, br' }].concat(o.reqHeaders || []),
      queryString: [...u.searchParams].map(([name, value]) => ({ name, value })), cookies: o.cookies || [], headersSize: -1, bodySize: o.post ? o.post.text.length : 0, ...(o.post ? { postData: o.post } : {}) },
    response: { status: o.status || 200, statusText: o.statusText || 'OK', httpVersion: 'h2', headers: [{ name: 'content-type', value: o.mime }].concat(o.resHeaders || []), cookies: [], redirectURL: '',
      content: { size: o.size, mimeType: o.mime, text: body }, headersSize: 300, bodySize: o.size },
    cache: {}, timings: t
  };
}
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzQyIiwiZW1haWwiOiJhbmFAZXhhbXBsZS5jb20ifQ.c2lnbmF0dXJlLWJ5dGVzLWhlcmU';
const auth = [{ name: 'authorization', value: 'Bearer ' + JWT }, { name: 'cookie', value: 'session=9f8a7b6c5d4e3f; theme=dark' }];
function build(release) {
  const E = [];
  E.push(entry({ at: 0, url: 'https://shop.example.com/checkout', mime: 'text/html', size: 18400, t: { dns: 12, connect: 40, ssl: 30, wait: 120, receive: 25 }, body: '<!doctype html><title>Checkout</title>' }));
  E.push(entry({ at: 190, url: 'https://shop.example.com/static/app.css', mime: 'text/css', size: 41200, t: { wait: 35, receive: 18 } }));
  E.push(entry({ at: 192, url: 'https://shop.example.com/static/app.js', mime: 'application/javascript', size: release ? 612000 : 184000, t: { wait: 38, receive: release ? 210 : 70 } }));
  E.push(entry({ at: 195, url: 'https://shop.example.com/static/logo.svg', mime: 'image/svg+xml', size: 3100, t: { wait: 20, receive: 4 } }));
  E.push(entry({ at: 460, url: 'https://shop.example.com/api/cart?_=1729414800123', mime: 'application/json', size: 1900, reqHeaders: auth, t: { wait: 60, receive: 6 }, body: JSON.stringify({ items: [{ sku: 'A-100', qty: 2 }], customer: { email: 'ana@example.com' }, access_token: 'tok_live_abc123' }) }));
  E.push(entry({ at: 470, url: 'https://shop.example.com/api/me', mime: 'application/json', size: 420, reqHeaders: auth, t: { wait: release ? 780 : 45, receive: 3 }, body: JSON.stringify({ id: 'user_42', email: 'ana@example.com', name: 'Ana' }) }));
  E.push(entry({ at: 480, url: 'https://shop.example.com/api/shipping-options?zip=94107', mime: 'application/json', size: 2300, reqHeaders: auth, t: { wait: 90, receive: 8 }, body: '{"options":[{"id":"std","eta":"3d"}]}' }));
  if (release) E.push(entry({ at: 482, url: 'https://shop.example.com/api/shipping-options?zip=94107', mime: 'application/json', size: 2300, reqHeaders: auth, t: { wait: 95, receive: 8 }, body: '{"options":[{"id":"std","eta":"3d"}]}' }));
  E.push(entry({ at: 520, url: 'https://cdn.analytics.example.net/collect?tid=UA-1&key=pk_live_51Habcdef0123456789', mime: 'image/gif', size: 35, t: { dns: 20, connect: 35, ssl: 28, wait: 30, receive: 1 }, ip: '198.51.100.7' }));
  E.push(entry({ at: 900, method: 'POST', url: 'https://shop.example.com/api/checkout', mime: 'application/json', size: 640, status: release ? 500 : 201, statusText: release ? 'Internal Server Error' : 'Created',
    reqHeaders: auth.concat([{ name: 'content-type', value: 'application/json' }]), post: { mimeType: 'application/json', text: JSON.stringify({ cartId: 'c_991', card: { number: '4242424242424242', cvc: '123' }, password: 'hunter2' }) },
    t: { wait: release ? 1900 : 340, receive: 5 }, body: release ? '{"error":"upstream timeout","trace":"tok_live_abc123"}' : '{"orderId":"o_5521"}' }));
  if (!release) E.push(entry({ at: 1300, url: 'https://shop.example.com/api/recommendations', mime: 'application/json', size: 8800, t: { wait: 110, receive: 20 } }));
  E.push(entry({ at: 1320, url: 'https://shop.example.com/api/legacy-banner', mime: 'application/json', size: 0, status: 404, statusText: 'Not Found', t: { wait: 22, receive: 1 } }));
  return { log: { version: '1.2', creator: { name: 'HARbor sample generator', version: '1.0' }, pages: [{ id: 'page_1', startedDateTime: new Date(T0).toISOString(), title: 'https://shop.example.com/checkout', pageTimings: { onContentLoad: 640, onLoad: release ? 2900 : 1400 } }], entries: E } };
}
fs.writeFileSync(path.join(__dirname, 'baseline.har'), JSON.stringify(build(false), null, 1));
fs.writeFileSync(path.join(__dirname, 'release.har'), JSON.stringify(build(true), null, 1));
console.log('wrote samples/baseline.har, samples/release.har');
