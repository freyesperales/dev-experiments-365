const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const C = require('../src/core.js');
const SAMPLE = fs.readFileSync(path.join(__dirname, '../samples/production.conf'), 'utf8');
const CLI = path.join(__dirname, '../cli.js');
const run = (args, input) => cp.spawnSync('node', [CLI, ...args], { encoding: 'utf8', input });
const conv = s => C.convert(s);
const srv = body => 'server { listen 80; server_name a.test;\n' + body + '\n}';
const has = (r, re) => assert.match(r.caddyfile, re);
const kinds = r => r.report.filter(x => x.kind !== 'ok').map(x => x.kind + ':' + x.directive.split(' ')[0]);

test('tokenizer: quotes, comments, ${var}, escapes', () => {
  const ast = C.parse('# c\nadd_header X "a b # not comment"; set $x ${y}z; return 200 \'it\\\'s\';');
  assert.deepEqual(ast[0].args, ['X', 'a b # not comment']);
  assert.equal(ast[1].args[1], '${y}z');
  assert.equal(ast[2].args[1], "it's");
});
test('parser: clear errors for broken configs', () => {
  assert.throws(() => C.parse('server { listen 80;'), /never closed/);
  assert.throws(() => C.parse('}'), /Unexpected "}" on line 1/);
  assert.throws(() => C.parse('listen 80'), /missing its closing/);
  assert.throws(() => C.parse('add_header X "oops'), /Unterminated quoted/);
});
test('http->https redirect server is dropped, www redirect is kept', () => {
  const r = conv('http { server { listen 80; server_name a.test; return 301 https://$host$request_uri; }\n server { listen 443 ssl; server_name b.test; return 301 https://a.test$request_uri; } }');
  assert.equal(r.sites.filter(s => s.dropped).length, 1);
  has(r, /b\.test \{\n\tredir https:\/\/a\.test\{uri\} 301/);
  assert.doesNotMatch(r.caddyfile, /http:\/\/a\.test/);
});
test('proxy_pass: plain, headers, timeouts, websockets are no-ops', () => {
  const r = conv(srv('location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header Upgrade $http_upgrade; proxy_read_timeout 60s; }'));
  has(r, /reverse_proxy 127\.0\.0\.1:8080 \{/); has(r, /header_up X-Real-IP \{remote_host\}/); has(r, /read_timeout 60s/);
  assert.doesNotMatch(r.caddyfile, /header_up Host/);
  assert.ok(r.report.some(x => x.kind === 'noop' && /WebSocket/.test(x.message)));
});
test('proxy_pass with URI strips and re-prefixes the location', () => {
  const r = conv(srv('location /api/ { proxy_pass http://127.0.0.1:1/v2/; }'));
  has(r, /handle_path \/api\/\* \{\n\t\trewrite \* \/v2\{uri\}/);
  const r2 = conv(srv('location /api/ { proxy_pass http://127.0.0.1:1/; }'));
  has(r2, /handle_path \/api\/\* \{\n\t\treverse_proxy 127\.0\.0\.1:1/);
});
test('upstream: servers, least_conn, max_fails, https scheme, unix socket', () => {
  const r = conv('http { upstream u { least_conn; server a:1; server b:2 max_fails=2 fail_timeout=10s; }\n server { server_name x.test; location / { proxy_pass https://u; } } }');
  has(r, /reverse_proxy https:\/\/a:1 https:\/\/b:2 \{\n\t+lb_policy least_conn\n\t+max_fails 2\n\t+fail_duration 10s/);
  has(conv(srv('location / { proxy_pass http://unix:/run/app.sock:/; }')), /reverse_proxy unix\/\/run\/app\.sock/);
});
test('proxy_pass with a variable is reported manual, not guessed', () => {
  const r = conv(srv('location / { proxy_pass http://$backend; }'));
  assert.ok(kinds(r).includes('manual:proxy_pass'));
});
test('location kinds: exact, ^~, regex (case-insens), ordering', () => {
  const r = conv(srv('location /a/ { return 200 a; } location /a/b/ { return 200 b; } location = /x { return 200 x; } location ~* \\.png$ { return 200 p; }'));
  const iX = r.caddyfile.indexOf('handle /x '), iAB = r.caddyfile.indexOf('/a/b/*'), iA = r.caddyfile.indexOf('handle /a/*');
  assert.ok(iX > 0 && iX < iAB && iAB < iA, 'exact before long prefix before short prefix');
  has(r, /path_regexp r\d+ \(\?i\)\\\.png\$/);
});
test('regex with lookahead is rejected (RE2)', () => {
  const r = conv(srv('location ~ ^/(?!api) { return 200 x; }'));
  assert.ok(kinds(r).includes('manual:location'));
});
test('return / rewrite / redirects', () => {
  const r = conv(srv('location /a { return 302 /b; } location /c { return 404; } location /d { return 444; } location /e { rewrite ^/old/(.*)$ /new/$1 permanent; } location /f { rewrite ^/x/(.*)$ /y/$1 last; }'));
  has(r, /redir \/b 302/); has(r, /respond 404/); has(r, /\tabort/);
  has(r, /redir @rw\d+ \/new\/\{re\.rw\d+\.1\} 301/); has(r, /rewrite @rw\d+ \/y\/\{re\.rw\d+\.1\}/);
  assert.ok(r.report.some(x => x.kind === 'differs' && /last/.test(x.message)));
});
test('static: root, index, autoindex, try_files, error_page, expires, headers, gzip', () => {
  const r = conv(srv('root /var/www/a; autoindex on; gzip on; add_header X-A "b c" always; expires 1h; try_files $uri $uri/ /index.html; error_page 404 /404.html;'));
  has(r, /root \* \/var\/www\/a/); has(r, /encode zstd gzip/); has(r, /header X-A "b c"/); has(r, /max-age=3600/);
  has(r, /try_files \{path\} \{path\}\/ \/index\.html/); has(r, /file_server browse/);
  has(r, /handle_errors \{[\s\S]*in \[404\][\s\S]*rewrite \* \/404\.html/);
});
test('php: fastcgi location is hoisted to php_fastcgi and index.php try_files is folded', () => {
  const r = conv(srv('root /var/www/wp; location / { try_files $uri $uri/ /index.php?$args; } location ~ \\.php$ { include fastcgi_params; fastcgi_pass unix:/run/php/fpm.sock; }'));
  has(r, /php_fastcgi unix\/\/run\/php\/fpm\.sock/); has(r, /\n\tfile_server/);
  assert.doesNotMatch(r.caddyfile, /try_files/);
  assert.doesNotMatch(r.caddyfile, /handle @r/);
});
test('alias translates to handle_path + root; mismatched slashes are manual', () => {
  has(conv(srv('location /s/ { alias /data/s/; }')), /handle_path \/s\/\* \{\n\t\troot \* \/data\/s\n\t\tfile_server/);
  assert.ok(kinds(conv(srv('location /s/ { alias /data/s; }'))).includes('manual:alias'));
});
test('allow/deny: allow-list, deny-list, bare deny all, odd orders', () => {
  has(conv(srv('location /a { allow 10.0.0.0/8; deny all; return 200 x; }')), /not remote_ip 10\.0\.0\.0\/8/);
  has(conv(srv('location /a { deny 1.2.3.4; return 200 x; }')), /@blocked\d+ remote_ip 1\.2\.3\.4/);
  has(conv(srv('location /a { deny all; }')), /respond 403/);
  assert.ok(kinds(conv(srv('location /a { deny 1.1.1.1; allow all; }'))).includes('manual:deny'));
});
test('basic auth is flagged manual (htpasswd cannot be read)', () => {
  const r = conv(srv('location /a { auth_basic "x"; auth_basic_user_file /etc/h; return 200 y; }'));
  assert.ok(kinds(r).includes('manual:auth_basic_user_file')); has(r, /# TODO basic_auth/);
});
test('tls: certs, protocol clamp, certbot hint', () => {
  const r = conv('server { listen 443 ssl; server_name s.test; ssl_certificate /etc/letsencrypt/live/s/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/s/privkey.pem; ssl_protocols TLSv1 TLSv1.2; return 200 x; }');
  has(r, /tls \/etc\/letsencrypt.*privkey\.pem \{\n\t\tprotocols tls1\.2 tls1\.2/); // clamped
  assert.ok(r.report.some(x => /certbot/.test(x.message)) && r.report.some(x => /TLS 1\.0/.test(x.message)));
});
test('addresses: ports, wildcard dot-names, default server, regex names', () => {
  const r = conv('http { server { listen 8080; server_name .x.test; return 200 a; } server { listen 80 default_server; server_name _; return 200 b; } server { server_name ~^w\\d+\\.y$; return 200 c; } }');
  has(r, /http:\/\/x\.test:8080, http:\/\/\*\.x\.test:8080 \{/); has(r, /\n:80 \{/);
  assert.ok(kinds(r).includes('manual:server_name'));
});
test('unknown & manual directives never vanish silently', () => {
  const r = conv(srv('limit_req zone=a; proxy_cache c; if ($x) { return 403; } frobnicate on;'));
  const k = kinds(r); ['manual:limit_req', 'manual:proxy_cache', 'manual:if', 'manual:frobnicate'].forEach(x => assert.ok(k.includes(x), x));
});
test('unknown variable is reported', () => {
  assert.ok(conv(srv('add_header X $ssl_cipher_foo;')).report.some(x => x.kind === 'manual' && /ssl_cipher_foo/.test(x.message)));
});
test('includes: unresolved -> manual; resolver splices; standard includes are no-ops', () => {
  assert.ok(kinds(conv('http { include sites/*.conf; }')).includes('manual:include'));
  const r = C.convert('http { include sites/*.conf; include mime.types; }', { readInclude: p => p === 'sites/*.conf' ? [{ name: 'a', text: 'server { server_name i.test; root /r; }' }] : [] });
  has(r, /http:\/\/i\.test \{\n\troot \* \/r\n\tfile_server/); assert.equal(r.stats.manual, 0);
});
test('duplicate site addresses are flagged', () => {
  const r = conv('http { server { server_name d.test; return 200 a; } server { server_name d.test; return 200 b; } }');
  assert.ok(r.report.some(x => /same Caddy site address/.test(x.message)));
});
test('production sample: shape, balance, no manual-free lies', () => {
  const r = conv(SAMPLE);
  assert.deepEqual(C.checkCaddyfile(r.caddyfile), []);
  assert.equal(r.sites.filter(s => s.dropped).length, 1);
  assert.ok(r.stats.manual >= 4 && r.stats.ok > 40);
  has(r, /example\.com \{/); has(r, /app\.example\.com \{/);
  assert.doesNotMatch(r.caddyfile, /\$[a-z]/i, 'no nginx variables leak into output');
  assert.doesNotMatch(r.caddyfile, /http:\/\/example\.com, /);
  // .ht files must be denied, not served
  has(r, /handle @r\d+ \{\n\t\trespond 403/);
});
test('garbage input does not crash the converter', () => {
  for (const g of ['', '   ', '# only a comment', 'server {}', 'http {}', 'location / {}']) assert.doesNotThrow(() => conv(g));
});
test('checkCaddyfile catches imbalance', () => {
  assert.equal(C.checkCaddyfile('a {\n b {\n}').length, 1); assert.equal(C.checkCaddyfile('a {\n}\n}').length, 1); assert.deepEqual(C.checkCaddyfile('a {\n respond "}" \n reverse_proxy {host}\n}'), []);
});
test('CLI: stdout Caddyfile, report on stderr, -o, --json, --strict', () => {
  const f = path.join(__dirname, '../samples/production.conf');
  const r = run([f]); assert.equal(r.status, 0); assert.match(r.stdout, /app\.example\.com \{/); assert.match(r.stderr, /caddify report: \d+ translated/); assert.match(r.stderr, /MANUAL/);
  assert.equal(run([f, '--strict', '--quiet']).status, 2);
  const j = JSON.parse(run([f, '--json']).stdout); assert.ok(j.caddyfile && j.stats && Array.isArray(j.report));
  const out = path.join(require('os').tmpdir(), 'caddify-test-' + process.pid); assert.equal(run([f, '-o', out, '--quiet']).status, 0); assert.match(fs.readFileSync(out, 'utf8'), /example\.com/); fs.unlinkSync(out);
});
test('CLI: stdin, includes resolved by glob, errors have exit code 1', () => {
  assert.match(run(['-'], 'server { server_name s.test; root /r; }').stdout, /s\.test/);
  const r = run([path.join(__dirname, '../samples/includes/main.conf'), '--quiet']); assert.match(r.stdout, /blog\.test \{\n\troot \* \/var\/www\/blog\n\tfile_server browse/);
  const bad = run(['-'], 'server {'); assert.equal(bad.status, 1); assert.match(bad.stderr, /never closed/);
  assert.equal(run(['/no/such/file']).status, 1); assert.equal(run([]).status, 1);
});
test('index.html is up to date with src (run `node build.js`)', () => {
  const idx = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.ok(idx.includes(fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8').slice(0, 2000)));
  assert.ok(!idx.includes('/*__CORE__*/'));
});
