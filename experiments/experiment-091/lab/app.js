'use strict';
// LEDGERLEAK — deliberately vulnerable toy invoicing API. FOR TRAINING. LOCAL ONLY. NEVER DEPLOY.
// createApp({ patched: ['jwt','bola','ssrf','massassign'] }) switches individual fixes on.
const http = require('node:http');
const crypto = require('node:crypto');
const dns = require('node:dns');
const net = require('node:net');

const SECRET = crypto.randomBytes(32); // per-process; the bug is not a weak secret
const b64u = (b) => Buffer.from(b).toString('base64url');
const FLAGS = {
  jwt: 'LAB{never_trust_the_alg_header}',
  bola: 'LAB{check_the_owner_every_time}',
  ssrf: 'LAB{the_server_is_not_your_proxy}',
  massassign: 'LAB{allowlist_the_fields}',
};

function freshDb() {
  return {
    users: {
      1: { id: 1, name: 'alice', password: 'alice-pw', role: 'user', plan: 'free', displayName: 'Alice' },
      2: { id: 2, name: 'bob', password: 'bob-pw', role: 'user', plan: 'free', displayName: 'Bob' },
      3: { id: 3, name: 'root', password: crypto.randomBytes(12).toString('hex'), role: 'admin', plan: 'enterprise', displayName: 'Root' },
    },
    invoices: {
      101: { id: 101, ownerId: 1, amount: 120, note: 'alice: logo design' },
      102: { id: 102, ownerId: 1, amount: 80, note: 'alice: hosting' },
      201: { id: 201, ownerId: 2, amount: 999, note: 'bob: ' + FLAGS.bola },
    },
  };
}

function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url');
  return `${h}.${p}.${s}`;
}

function verify(token, patched) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { return null; }
  if (patched.has('jwt')) {
    if (header.alg !== 'HS256' || parts.length !== 3) return null;
  } else if (String(header.alg).toLowerCase() === 'none') {
    return payload; // BUG: the token tells us not to check its signature, and we agree.
  }
  if (parts.length !== 3) return null;
  const want = crypto.createHmac('sha256', SECRET).update(parts[0] + '.' + parts[1]).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  return payload;
}

// ---- SSRF helpers -------------------------------------------------------
function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' ) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]);
    return /^(fc|fd|fe[89ab])/.test(l);
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
// Validates the address the socket will REALLY connect to (defeats DNS rebinding / TOCTOU).
function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateAddress(a.address));
    if (ok.length === 0 || ok.length !== addrs.length) return cb(new Error('blocked: destination is not a public address'));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

function fetchPreview(rawUrl, patched, cb) {
  let u;
  try { u = new URL(rawUrl); } catch { return cb(400, { error: 'invalid url' }); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return cb(400, { error: 'only http/https allowed' });
  const opts = { method: 'GET', timeout: 3000 };
  if (patched.has('ssrf')) {
    opts.lookup = safeLookup;
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ''))) {
      return cb(400, { error: 'blocked: destination is not a public address' });
    }
  }
  const req = http.request(u, opts, (res) => {
    // Redirects are never followed in either mode; the fix is about the destination, not the hop.
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { if (body.length < 4096) body += c; });
    res.on('end', () => cb(200, { status: res.statusCode, snippet: body.slice(0, 2048) }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (e) => cb(502, { error: String(e.message) }));
  req.end();
}

// ---- the app --------------------------------------------------------------
function createApp({ patched = [] } = {}) {
  const P = new Set(patched);
  const db = freshDb();

  function auth(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const claims = m && verify(m[1], P);
    return claims && db.users[claims.sub] ? db.users[claims.sub] : null;
  }

  return http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = new URL(req.url, 'http://x');
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => {
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { return send(400, { error: 'bad json' }); } }
      const p = url.pathname;

      if (req.method === 'POST' && p === '/api/login') {
        const u = Object.values(db.users).find((x) => x.name === body.username && x.password === body.password);
        return u ? send(200, { token: sign({ sub: u.id, iat: Math.floor(Date.now() / 1000) }) }) : send(401, { error: 'bad credentials' });
      }
      const me = auth(req);
      if (!me) return send(401, { error: 'unauthenticated' });

      if (req.method === 'GET' && p === '/api/me') {
        const { password, ...safe } = me; return send(200, safe);
      }
      let m;
      if (req.method === 'GET' && (m = /^\/api\/invoices\/(\d+)$/.exec(p))) {
        const inv = db.invoices[m[1]];
        if (!inv) return send(404, { error: 'not found' });
        if (P.has('bola') && inv.ownerId !== me.id) return send(404, { error: 'not found' });
        return send(200, inv); // BUG (unpatched): any logged-in user can read any invoice id
      }
      if (req.method === 'GET' && p === '/api/invoices') {
        return send(200, Object.values(db.invoices).filter((i) => i.ownerId === me.id));
      }
      if (req.method === 'PATCH' && p === '/api/profile') {
        if (P.has('massassign')) {
          if (typeof body.displayName === 'string') me.displayName = body.displayName.slice(0, 60);
        } else {
          Object.assign(me, body); // BUG: client decides which fields to overwrite
        }
        const { password, ...safe } = me; return send(200, safe);
      }
      if (req.method === 'GET' && p === '/api/enterprise/report') {
        return me.plan === 'enterprise' ? send(200, { flag: FLAGS.massassign }) : send(402, { error: 'enterprise plan required' });
      }
      if (req.method === 'GET' && p === '/api/admin/flag') {
        return me.role === 'admin' ? send(200, { flag: FLAGS.jwt }) : send(403, { error: 'admins only' });
      }
      if (req.method === 'GET' && p === '/api/preview') {
        return fetchPreview(url.searchParams.get('url') || '', P, send);
      }
      return send(404, { error: 'no such route' });
    });
  });
}

// Internal-only service the SSRF challenge targets (stands in for a cloud metadata endpoint).
function createInternalService() {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('internal-metadata: ' + FLAGS.ssrf + '\n');
  });
}

module.exports = { createApp, createInternalService, FLAGS, isPrivateAddress, sign };
