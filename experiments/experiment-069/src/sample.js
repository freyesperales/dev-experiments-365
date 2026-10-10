/* Deterministic synthetic app logs: a healthy run and an incident run. */
(function (root) {
  'use strict';
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function pick(r, a) { return a[Math.floor(r() * a.length)]; }
  function hex(r, n) { var o = ''; while (o.length < n) o += Math.floor(r() * 16).toString(16); return o; }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function uuid(r) { return hex(r, 8) + '-' + hex(r, 4) + '-4' + hex(r, 3) + '-a' + hex(r, 3) + '-' + hex(r, 12); }

  function gen(kind, n) {
    var bad = kind === 'bad', r = rng(bad ? 7 : 3), out = [];
    var t = Date.UTC(2026, 9, bad ? 10 : 9, 14, 0, 0);
    var users = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'];
    var routes = ['/api/orders', '/api/users', '/api/cart', '/healthz', '/api/search'];
    for (var i = 0; i < n; i++) {
      t += Math.floor(r() * 90) + 5;
      var ts = new Date(t).toISOString().replace('Z', '') + 'Z';
      var phase = i / n, x = r(), line;
      var incident = bad && phase > 0.45 && phase < 0.8;
      if (incident && x < 0.22) line = ts + ' ERROR pool Connection pool exhausted (' + (40 + Math.floor(r() * 3)) + '/40 in use), waiting ' + Math.floor(r() * 4000 + 500) + 'ms for a free connection';
      else if (incident && x < 0.40) line = ts + ' WARN upstream Retry ' + (1 + Math.floor(r() * 5)) + ' for https://billing.internal/v2/charge/' + hex(r, 10) + ' after timeout';
      else if (incident && x < 0.43) {
        line = ts + ' ERROR http Unhandled exception in ' + pick(r, routes) + ': TimeoutError: acquire timed out';
        line += '\n    at Pool.acquire (/srv/app/node_modules/pg-pool/index.js:' + (100 + Math.floor(r() * 9)) + ':11)\n    at async handler (/srv/app/src/routes/orders.js:58:19)';
      }
      else if (x < 0.46) line = ts + ' INFO auth User ' + pick(r, users) + ' logged in from ' + [10, Math.floor(r() * 255), Math.floor(r() * 255), Math.floor(r() * 255)].join('.');
      else if (x < 0.50) line = ts + ' WARN auth Failed login for ' + pick(r, users) + '@example.com (attempt ' + (1 + Math.floor(r() * 4)) + ')';
      else if (x < 0.56) line = ts + ' DEBUG cache Cache ' + (r() < 0.8 ? 'hit' : 'miss') + ' for key session:' + uuid(r);
      else if (x < 0.57 && !bad) line = ts + ' INFO cache Cache warmed with ' + Math.floor(r() * 500 + 2000) + ' entries in ' + Math.floor(r() * 300 + 800) + 'ms';
      else if (x < 0.62) line = ts + ' INFO db Query ' + pick(r, ['orders_by_user', 'cart_items', 'product_search']) + ' took ' + Math.floor(r() * (incident ? 4000 : 120)) + 'ms (' + Math.floor(r() * 200) + ' rows)';
      else if (x < 0.64 && bad && phase > 0.6) line = ts + ' WARN feature Flag checkout_v2 evaluated off for tenant ' + Math.floor(r() * 90);
      else line = ts + ' INFO http ' + pick(r, ['GET', 'GET', 'GET', 'POST', 'PUT']) + ' ' + pick(r, routes) + '/' + Math.floor(r() * 90000) + ' ' + pick(r, [200, 200, 200, 201, 204, 304, 404]) + ' ' + Math.floor(r() * (incident ? 3000 : 180)) + 'ms';
      out.push(line);
    }
    return out.join('\n') + '\n';
  }
  var api = { gen: gen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LogfoldSample = api;
})(typeof self !== 'undefined' ? self : globalThis);
