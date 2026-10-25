// Caddify core — nginx.conf parser + Caddyfile generator + translation report. Zero dependencies, Node and browser.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Caddify = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- tokenizer + parser
  function tokenize(src) {
    const toks = []; let i = 0, line = 1; const n = src.length;
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '{' || c === '}' || c === ';') { toks.push({ t: c, line }); i++; continue; }
      if (c === '"' || c === "'") {
        const q = c, start = line; let s = ''; i++;
        while (i < n && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < n) { const nx = src[i + 1]; if (nx === q || nx === '\\') { s += nx; i += 2; continue; } s += src[i++]; continue; }
          if (src[i] === '\n') line++;
          s += src[i++];
        }
        if (i >= n) throw new Error('Unterminated quoted string starting on line ' + start);
        i++; toks.push({ t: 'w', v: s, q: true, line: start }); continue;
      }
      let s = ''; const start = line;
      while (i < n && !/\s/.test(src[i]) && src[i] !== ';' && src[i] !== '{' && src[i] !== '}') {
        if (src[i] === '$' && src[i + 1] === '{') { const e = src.indexOf('}', i); if (e < 0) throw new Error('Unterminated ${ on line ' + line); s += src.slice(i, e + 1); i = e + 1; continue; }
        if (src[i] === '\\' && i + 1 < n) { s += src[i] + src[i + 1]; i += 2; continue; }
        s += src[i++];
      }
      toks.push({ t: 'w', v: s, line: start });
    }
    return toks;
  }

  function parse(src) {
    const toks = tokenize(String(src).replace(/^﻿/, '')); let p = 0;
    function block(close) {
      const out = [];
      for (;;) {
        const t = toks[p];
        if (!t) { if (close) throw new Error('Missing "}" — a block opened earlier is never closed'); return out; }
        if (t.t === '}') { if (!close) throw new Error('Unexpected "}" on line ' + t.line); p++; return out; }
        if (t.t === ';') { p++; continue; }
        if (t.t === '{') throw new Error('Unexpected "{" on line ' + t.line);
        const node = { name: t.v, args: [], qargs: [], line: t.line, children: null }; p++;
        for (;;) {
          const a = toks[p];
          if (!a) throw new Error('Directive "' + node.name + '" (line ' + node.line + ') is missing its closing ";"');
          if (a.t === 'w') { node.args.push(a.v); node.qargs.push(!!a.q); p++; continue; }
          if (a.t === ';') { p++; break; }
          if (a.t === '{') { p++; node.children = block(true); break; }
          throw new Error('Directive "' + node.name + '" (line ' + node.line + ') is missing its closing ";"');
        }
        out.push(node);
      }
    }
    return block(false);
  }

  // ---------------------------------------------------------------- helpers
  const KNOWN_INCLUDES = /(^|\/)(mime\.types|fastcgi(_params|\.conf)?|scgi_params|uwsgi_params|proxy_params|fastcgi-php\.conf|snippets\/fastcgi-php\.conf)$/;
  const NOOP = {
    worker_processes: 'Caddy manages its own concurrency.', worker_connections: 'Caddy manages its own concurrency.', worker_rlimit_nofile: 'Not needed.',
    user: 'Run Caddy under its own service user.', pid: 'Not needed.', events: 'Not needed.', error_log: 'Caddy logs to stderr by default; use a global `log` block to change it.',
    sendfile: 'Handled by Go.', tcp_nopush: 'Handled by Go.', tcp_nodelay: 'Handled by Go.', keepalive_timeout: 'Defaults are sane; tune with `servers { timeouts { idle … } }`.',
    keepalive_requests: 'Not needed.', types_hash_max_size: 'Not needed.', server_names_hash_bucket_size: 'Not needed.', default_type: 'Caddy sniffs content types.',
    types: 'Caddy has a built-in MIME table.', charset: 'Caddy adds charset for text types automatically.', ssl_session_cache: 'Handled by Caddy.', ssl_session_timeout: 'Handled by Caddy.',
    ssl_session_tickets: 'Handled by Caddy.', ssl_prefer_server_ciphers: 'Caddy picks modern TLS defaults.', ssl_ciphers: 'Caddy picks modern cipher suites by default.',
    ssl_stapling: 'Caddy staples OCSP automatically.', ssl_stapling_verify: 'Caddy staples OCSP automatically.', ssl_dhparam: 'Not needed (ECDHE only).', ssl_ecdh_curve: 'Caddy picks curves.',
    resolver: 'Caddy uses the system resolver (dynamic upstreams: see `dynamic a`).', resolver_timeout: 'Not needed.', gzip_vary: 'Handled by `encode`.', gzip_proxied: '`encode` applies to proxied responses too.',
    gzip_comp_level: 'Tune with `encode gzip { level N }` if needed.', gzip_min_length: 'Tune with `encode { minimum_length N }` if needed.', gzip_types: '`encode` has a sensible default type list; narrow it with `encode { match { header Content-Type … } }`.',
    gzip_disable: 'Not supported; rarely needed.', gzip_buffers: 'Not needed.', gzip_http_version: 'Not needed.', open_file_cache: 'Not needed.', open_file_cache_valid: 'Not needed.',
    open_file_cache_min_uses: 'Not needed.', open_file_cache_errors: 'Not needed.', client_body_buffer_size: 'Not needed.', client_header_buffer_size: 'Not needed.', large_client_header_buffers: 'Not needed.',
    client_body_timeout: 'Defaults are sane; tune with `servers { timeouts { read_body … } }`.', client_header_timeout: 'Defaults are sane; tune with `servers { timeouts { read_header … } }`.',
    send_timeout: 'Defaults are sane; tune with `servers { timeouts { write … } }`.', reset_timedout_connection: 'Not needed.', proxy_http_version: 'Caddy negotiates HTTP/1.1/2 upstream automatically (websockets included).',
    proxy_buffering: null, proxy_request_buffering: 'Not needed.', proxy_buffer_size: 'Not needed.', proxy_buffers: 'Not needed.', proxy_busy_buffers_size: 'Not needed.', proxy_max_temp_file_size: 'Not needed.',
    proxy_pass_header: 'Caddy passes upstream headers through by default.', proxy_ignore_client_abort: 'Not needed.', fastcgi_index: 'Handled by `php_fastcgi`.', fastcgi_param: '`php_fastcgi` sets the standard FastCGI params (SCRIPT_FILENAME, PATH_INFO …).',
    fastcgi_split_path_info: '`php_fastcgi` does the path split itself.', fastcgi_intercept_errors: 'Use `handle_errors` / `intercept` if you need it.', fastcgi_buffers: 'Not needed.', fastcgi_buffer_size: 'Not needed.',
    fastcgi_read_timeout: 'Set `transport fastcgi { read_timeout … }` inside `php_fastcgi` if you need a non-default.', fastcgi_connect_timeout: 'Set `transport fastcgi { dial_timeout … }` inside `php_fastcgi` if needed.',
    fastcgi_send_timeout: 'Set `transport fastcgi { write_timeout … }` inside `php_fastcgi` if needed.', index: 'Caddy `file_server` serves index.html / index.txt by default; use `file_server { index … }` for others.',
    log_format: 'Caddy logs JSON by default; use `log { format … }` for another encoding.', add_header_inherit: 'Not needed.', access_log: null, absolute_redirect: 'Not needed.', server_name_in_redirect: 'Not needed.',
    port_in_redirect: 'Not needed.', output_buffers: 'Not needed.', postpone_output: 'Not needed.', directio: 'Not needed.', aio: 'Not needed.', log_not_found: 'Not needed.', underscores_in_headers: 'Not needed.',
    ignore_invalid_headers: 'Not needed.', merge_slashes: 'Caddy does not merge slashes; use `rewrite` or a path_regexp matcher if you rely on it.', lingering_close: 'Not needed.', if_modified_since: 'Handled by `file_server`.',
    etag: 'Handled by `file_server`.', ssl_verify_client: null, ssl_client_certificate: null
  };
  const MANUAL = {
    if: 'nginx `if` has no Caddyfile equivalent. Rewrite it as a named matcher (`@x { header … }` / `expression …`) and a `handle @x { … }`.',
    map: 'Use Caddy named matchers/`map` directive (`map {host} {my_var} { … }`) — semantics differ, review by hand.',
    geo: 'No built-in equivalent; use `remote_ip` matchers or a GeoIP module.', set: 'Use the `vars` directive or a `map` block.',
    limit_req: 'Rate limiting needs the third-party `caddy-ratelimit` module.', limit_req_zone: 'Rate limiting needs the third-party `caddy-ratelimit` module.', limit_req_status: 'Rate limiting needs the third-party `caddy-ratelimit` module.',
    limit_conn: 'No built-in equivalent.', limit_conn_zone: 'No built-in equivalent.', limit_rate: 'No built-in equivalent.',
    proxy_cache: 'Caching needs the third-party `cache-handler` module.', proxy_cache_path: 'Caching needs the third-party `cache-handler` module.', proxy_cache_valid: 'Caching needs the third-party `cache-handler` module.',
    proxy_cache_key: 'Caching needs the third-party `cache-handler` module.', proxy_cache_use_stale: 'Caching needs the third-party `cache-handler` module.', proxy_cache_bypass: 'Caching needs the third-party `cache-handler` module.',
    fastcgi_cache: 'Caching needs the third-party `cache-handler` module.', fastcgi_cache_path: 'Caching needs the third-party `cache-handler` module.', fastcgi_cache_valid: 'Caching needs the third-party `cache-handler` module.',
    fastcgi_cache_key: 'Caching needs the third-party `cache-handler` module.', sub_filter: 'Needs the third-party `replace-response` module.', sub_filter_once: 'Needs the third-party `replace-response` module.',
    sub_filter_types: 'Needs the third-party `replace-response` module.', auth_request: 'Use `forward_auth <url>` (built in).', stream: 'TCP/UDP proxying needs the `caddy-l4` module.',
    mirror: 'No built-in equivalent.', ssi: 'No Server Side Includes in Caddy; use `templates`.', perl: 'Not supported.', perl_set: 'Not supported.', real_ip_header: 'Use global `servers { trusted_proxies static <cidrs> }`.',
    set_real_ip_from: 'Use global `servers { trusted_proxies static <cidrs> }`.', real_ip_recursive: 'Use global `servers { trusted_proxies_strict }`.', proxy_redirect: 'Use `header_down Location <from> <to>` inside `reverse_proxy`.',
    proxy_next_upstream: 'Use `lb_try_duration` / `lb_retries` / `lb_retry_match` inside `reverse_proxy`.', proxy_next_upstream_tries: 'Use `lb_retries` inside `reverse_proxy`.', proxy_next_upstream_timeout: 'Use `lb_try_duration` inside `reverse_proxy`.',
    proxy_ssl_certificate: 'Use `transport http { tls_client_auth <cert> <key> }`.', proxy_ssl_certificate_key: 'Use `transport http { tls_client_auth <cert> <key> }`.', proxy_ssl_trusted_certificate: 'Use `transport http { tls_trusted_ca_certs … }`.',
    proxy_ssl_server_name: 'Use `transport http { tls_server_name … }`.', ssl_verify_client_x: '', secure_link: 'No equivalent.', image_filter: 'No equivalent.', js_import: 'njs is not supported.', js_content: 'njs is not supported.',
    ssl_verify_client: 'Use `tls { client_auth { mode … } }`.', ssl_client_certificate: 'Use `tls { client_auth { trusted_ca_cert_file … } }`.', add_after_body: 'No equivalent.', add_before_body: 'No equivalent.',
    more_set_headers: 'Use `header` / `request_header`.', more_clear_headers: 'Use `header -Name`.', rewrite_log: 'Not needed.', uninitialized_variable_warn: 'Not needed.'
  };
  const VARS = {
    host: '{host}', server_name: '{host}', remote_addr: '{remote_host}', remote_port: '{remote_port}', scheme: '{scheme}', request_uri: '{uri}', uri: '{path}', document_uri: '{path}',
    args: '{query}', query_string: '{query}', request_method: '{method}', http_host: '{hostport}', server_port: '{server_port}', proxy_host: '{upstream_hostport}', request_id: '{http.request.uuid}',
    content_type: '{header.Content-Type}', remote_user: '{http.auth.user.id}', proxy_add_x_forwarded_for: '{header.X-Forwarded-For}', server_protocol: '{http.request.proto}', request_time: '{http.request.duration}'
  };
  const INHERIT = new Set(['gzip', 'add_header', 'server_tokens', 'client_max_body_size', 'ssl_certificate', 'ssl_certificate_key', 'ssl_protocols', 'expires', 'access_log', 'root', 'error_page', 'autoindex', 'proxy_set_header', 'proxy_read_timeout', 'proxy_connect_timeout', 'proxy_send_timeout', 'proxy_buffering', 'proxy_hide_header', 'auth_basic', 'auth_basic_user_file', 'allow', 'deny', 'fastcgi_pass']);
  const hdr = s => s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-');

  // quote a Caddyfile token only when needed
  function q(s) {
    s = String(s);
    if (s === '') return '""';
    if (/[\s"'`]/.test(s)) return '"' + s.replace(/"/g, '\\"') + '"';
    return s;
  }
  function size(v) { const m = /^(\d+)([kKmMgG]?)$/.exec(v || ''); if (!m) return null; const u = { '': '', k: 'KB', m: 'MB', g: 'GB' }[m[2].toLowerCase()]; return m[1] + u; }
  function seconds(v) {
    if (v === 'max') return 315360000;
    const m = /^(-?\d+)(ms|s|m|h|d|w|M|y)?$/.exec(v || ''); if (!m) return null;
    const mul = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, M: 2592000, y: 31536000 }[m[2] || 's'];
    return Math.round(+m[1] * mul);
  }
  function dur(v) { const m = /^(\d+)(ms|s|m|h|d)?$/.exec(v || ''); return m ? m[1] + (m[2] || 's') : null; }
  function isPhpRegex(p) { return /\\\.php/.test(p) || /\.php\b/.test(p); }
  function re2Problem(p) {
    if (/\(\?[=!<]/.test(p)) return 'lookahead/lookbehind';
    if (/\\[1-9]/.test(p)) return 'back-references';
    if (/(\*|\+|\})\+/.test(p) && /\(\?>/.test(p)) return 'possessive/atomic groups';
    return null;
  }

  // ---------------------------------------------------------------- converter
  function convert(src, opts) {
    opts = opts || {};
    const report = []; const seen = new Set();
    const stat = { ok: 0, differs: 0, noop: 0, manual: 0 };
    function rec(kind, node, msg, hint) {
      const key = node.line + '|' + node.name + '|' + kind + '|' + msg;
      if (seen.has(key)) return; seen.add(key); stat[kind]++;
      report.push({ kind, line: node.line, directive: (node.name + ' ' + node.args.join(' ')).trim(), message: msg || '', hint: hint || '' });
    }
    const ok = n => rec('ok', n, '');
    const manual = (n, m, h) => rec('manual', n, m, h);
    const differs = (n, m, h) => rec('differs', n, m, h);
    const noop = (n, m) => rec('noop', n, m);

    let ast = parse(src);

    function expand(nodes, depth) {
      const out = [];
      nodes.forEach(nd => {
        if (nd.name === 'include' && nd.children === null) {
          const pat = nd.args[0] || '';
          if (KNOWN_INCLUDES.test(pat)) { noop(nd, 'Standard nginx include; Caddy needs nothing equivalent.'); return; }
          if (opts.readInclude && depth < 8) {
            let files = [];
            try { files = opts.readInclude(pat) || []; } catch (e) { files = []; }
            if (files.length) {
              files.forEach(f => { let sub; try { sub = parse(f.text); } catch (e) { throw new Error('In included file ' + f.name + ': ' + e.message); } out.push(...expand(sub, depth + 1)); });
              ok(nd); return;
            }
          }
          manual(nd, 'Included file "' + pat + '" was not available, so its contents were not translated.', 'Paste the included file into the input (or run the CLI where the file exists) and convert again.');
          return;
        }
        if (nd.children) nd.children = expand(nd.children, depth);
        out.push(nd);
      });
      return out;
    }
    ast = expand(ast, 0);

    // ---- translate nginx variables -> Caddy placeholders
    function tv(s, node, sc) {
      return String(s).replace(/\$\{?(\w+)\}?/g, (m, name) => {
        if (/^\d+$/.test(name)) { if (sc && sc.reName) return '{re.' + sc.reName + '.' + name + '}'; manual(node, 'Capture group $' + name + ' used without a regex location/rewrite to take it from.'); return m; }
        if (VARS[name]) return VARS[name];
        let mm;
        if ((mm = /^http_(.+)$/.exec(name))) return '{header.' + hdr(mm[1]) + '}';
        if ((mm = /^cookie_(.+)$/.exec(name))) return '{cookie.' + mm[1] + '}';
        if ((mm = /^arg_(.+)$/.exec(name))) return '{query.' + mm[1] + '}';
        manual(node, 'Variable $' + name + ' has no Caddy placeholder.', 'Find the matching placeholder at caddyserver.com/docs/caddyfile/concepts#placeholders or compute it with `map`/`vars`.');
        return m;
      });
    }
    const hasVar = s => /\$/.test(s);

    // ---- gather upstreams
    const upstreams = {};
    (function collect(nodes) {
      nodes.forEach(nd => {
        if (nd.name === 'upstream' && nd.children) {
          const u = { servers: [], policy: null, node: nd };
          nd.children.forEach(c => {
            if (c.name === 'server') u.servers.push(c);
            else if (c.name === 'least_conn') u.policy = 'least_conn';
            else if (c.name === 'ip_hash') u.policy = 'ip_hash';
            else if (c.name === 'random') u.policy = 'random';
            else if (c.name === 'hash') u.policy = 'hash';
            else if (c.name === 'keepalive' || c.name === 'keepalive_timeout' || c.name === 'keepalive_requests' || c.name === 'zone') noop(c, 'Caddy pools upstream connections automatically.');
            else manual(c, 'Unsupported upstream directive.');
          });
          upstreams[nd.args[0]] = u;
        } else if (nd.children && (nd.name === 'http' || nd.name === 'events')) collect(nd.children);
      });
    })(ast);

    // ---- listen / server_name -> site addresses
    function addresses(server) {
      const names = []; let sawName = false;
      const ports = [];
      server.children.forEach(c => {
        if (c.name === 'server_name') {
          sawName = true; ok(c);
          c.args.forEach(nm => {
            if (nm === '_' || nm === '""' || nm === '') return;
            if (nm[0] === '~') { manual(c, 'Regex server_name "' + nm + '" cannot be a site address.', 'List the concrete hostnames, or use a wildcard site (`*.example.com`) with `@x host_regexp` inside.'); return; }
            if (nm[0] === '.') { names.push(nm.slice(1)); names.push('*' + nm); return; }
            names.push(nm);
          });
        }
        if (c.name === 'listen') {
          ok(c);
          const a = c.args[0] || ''; let port = 80, unix = false;
          if (/^unix:/.test(a)) { unix = true; manual(c, 'Unix-socket listener.', 'Use a global `servers { … }` or `bind unix//path` in the site block.'); }
          else { const m = /(\d+)$/.exec(a); if (m) port = +m[1]; else if (/^\[?[\da-f:.]+\]?$/i.test(a) && !/^\d+$/.test(a)) port = 80; }
          if (!unix) ports.push({ port, ssl: c.args.includes('ssl') || port === 443, dflt: c.args.includes('default_server') });
        }
      });
      if (!ports.length) ports.push({ port: 80, ssl: false });
      const uniq = []; ports.forEach(p => { if (!uniq.some(x => x.port === p.port)) uniq.push(p); });
      const out = [];
      const has443 = uniq.some(p => p.port === 443 || (p.ssl && p.port !== 80));
      uniq.forEach(p => {
        if (names.length === 0) { out.push(':' + p.port); return; }
        names.forEach(nm => {
          if (p.port === 443) { if (!out.includes(nm)) out.push(nm); }
          else if (p.port === 80) { if (!has443) out.push('http://' + nm); }
          else out.push((p.ssl ? '' : 'http://') + nm + ':' + p.port);
        });
      });
      return { list: [...new Set(out)], names, sawName, has443, ports: uniq };
    }

    // ---- scope translator: converts the simple directives of one server/location
    let matcherN = 0;
    function scope(dirs, sc) {
      const B = { tls: [], root: [], enc: [], hdr: [], body: [], log: [], acl: [], auth: [], route: [], content: [], errors: [] };
      const px = { up: [], down: [], timeouts: {}, flush: false, insecure: false };
      let target = null, root = null, alias = null, autoindex = false, tryFiles = null, fastcgi = null, allow = [], deny = [], errPages = [];
      const res = { lines: [], content: null, strip: null, sawRoot: null, php: null, tryNode: null };
      let tlsCert = null, tlsKey = null, tlsProto = null, uri = null, proxyNode = null, tokensOff = false;

      dirs.forEach(d => {
        const a = d.args, nm = d.name;
        if (nm === 'listen' || nm === 'server_name' || nm === 'location' || nm === 'upstream') return;
        switch (nm) {
          case 'root': root = a[0]; res.sawRoot = a[0]; if (hasVar(a[0])) manual(d, 'Variables in root are not supported.'); else ok(d); break;
          case 'alias': alias = d; break;
          case 'autoindex': if (a[0] === 'on') { autoindex = true; ok(d); } else noop(d, 'Directory listing is off by default in Caddy.'); break;
          case 'try_files': tryFiles = d; break;
          case 'gzip': if (a[0] === 'on') { B.enc.push('encode zstd gzip'); ok(d); } else noop(d, 'Compression is off unless you add `encode`.'); break;
          case 'brotli': case 'brotli_static': case 'gzip_static': noop(d, 'Caddy has no built-in brotli; `encode zstd gzip` is used. Use `file_server { precompressed br gzip }` for pre-compressed files.'); break;
          case 'add_header': {
            if (a.length < 2) { manual(d, 'add_header with no value.'); break; }
            const val = tv(a[1], d, sc);
            B.hdr.push('header ' + a[0] + ' ' + q(val)); ok(d);
            if (!a.includes('always')) differs(d, 'nginx only adds this header on 2xx/3xx responses; Caddy adds it to every response.', 'Usually harmless. Add a `@ok status 2xx 3xx` matcher if you need the old behaviour.');
            break;
          }
          case 'expires': {
            const v = a[0];
            if (v === 'off') { noop(d, 'No-op.'); break; }
            if (v === 'epoch') { B.hdr.push('header Cache-Control "no-cache"'); ok(d); break; }
            const s = seconds(v === 'max' ? 'max' : v.replace(/^modified\s*/, ''));
            if (s === null) { manual(d, 'Cannot interpret expires value "' + a.join(' ') + '".'); break; }
            B.hdr.push(s < 0 ? 'header Cache-Control "no-cache"' : 'header Cache-Control ' + q('max-age=' + s)); ok(d);
            differs(d, 'nginx also sets an Expires header; Caddy only sets Cache-Control (preferred by all modern clients).');
            break;
          }
          case 'server_tokens': if (a[0] === 'off') { B.hdr.push('header -Server'); ok(d); } else noop(d, 'No-op.'); break;
          case 'client_max_body_size': { const s = size(a[0]); if (s === null && a[0] !== '0') { manual(d, 'Cannot interpret size "' + a[0] + '".'); break; } if (a[0] === '0') { noop(d, 'Caddy has no request body limit by default.'); break; } B.body.push('request_body {\n\tmax_size ' + s + '\n}'); ok(d); break; }
          case 'access_log': if (a[0] === 'off') noop(d, 'Caddy does not log requests unless a `log` block exists.'); else if (hasVar(a[0])) manual(d, 'Variables in access_log path.'); else { B.log.push('log {\n\toutput file ' + q(a[0]) + '\n}'); ok(d); differs(d, 'Caddy writes JSON access logs, not the nginx combined format.', 'Add `format console` inside `log { }` for a human-readable line format.'); } break;
          case 'ssl_certificate': tlsCert = d; break;
          case 'ssl_certificate_key': tlsKey = d; break;
          case 'ssl_protocols': tlsProto = d; break;
          case 'allow': allow.push(d); break;
          case 'deny': deny.push(d); break;
          case 'auth_basic': if (a[0] === 'off') { noop(d, 'No-op.'); break; } B.auth.push('# TODO basic_auth {\n#\t<user> <bcrypt-hash>   # generate with: caddy hash-password\n# }'); manual(d, 'Basic auth: Caddy cannot read an .htpasswd file.', 'Add `basic_auth { user <bcrypt hash> }` using `caddy hash-password` (htpasswd -B hashes are compatible).'); break;
          case 'auth_basic_user_file': manual(d, 'Password file is not read by Caddy.', 'Copy each `user:bcrypt-hash` line into a `basic_auth { }` block (htpasswd -B / $2y$ hashes work; MD5/crypt hashes do not).'); break;
          case 'error_page': errPages.push(d); break;
          case 'proxy_pass': proxyNode = d; target = a[0]; break;
          case 'fastcgi_pass': fastcgi = d; break;
          case 'proxy_set_header': {
            const name = a[0], val = a[1] === undefined ? '' : a[1];
            if (/^(upgrade|connection)$/i.test(name)) { noop(d, 'Caddy proxies WebSocket upgrades automatically.'); break; }
            if (/^host$/i.test(name)) { if (/^\$(host|http_host)$/.test(val)) { noop(d, 'Caddy already forwards the original Host header.'); break; } if (val === '$proxy_host') { px.up.push('header_up Host {upstream_hostport}'); ok(d); break; } }
            if (/^x-forwarded-for$/i.test(name) && /proxy_add_x_forwarded_for/.test(val)) { noop(d, 'Caddy appends X-Forwarded-For by default.'); break; }
            if (/^x-forwarded-proto$/i.test(name) && val === '$scheme') { noop(d, 'Caddy sets X-Forwarded-Proto by default.'); break; }
            if (/^x-forwarded-host$/i.test(name) && /^\$(host|http_host)$/.test(val)) { noop(d, 'Caddy sets X-Forwarded-Host by default.'); break; }
            if (/^x-real-ip$/i.test(name) && val === '$remote_addr') { px.up.push('header_up X-Real-IP {remote_host}'); ok(d); break; }
            if (val === '') { px.up.push('header_up -' + name); ok(d); break; }
            px.up.push('header_up ' + name + ' ' + q(tv(val, d, sc))); ok(d); break;
          }
          case 'proxy_hide_header': px.down.push('header_down -' + a[0]); ok(d); break;
          case 'proxy_read_timeout': { const t = dur(a[0]); if (t) { px.timeouts.read_timeout = t; ok(d); } else manual(d, 'Cannot interpret timeout.'); break; }
          case 'proxy_connect_timeout': { const t = dur(a[0]); if (t) { px.timeouts.dial_timeout = t; ok(d); } else manual(d, 'Cannot interpret timeout.'); break; }
          case 'proxy_send_timeout': { const t = dur(a[0]); if (t) { px.timeouts.write_timeout = t; ok(d); } else manual(d, 'Cannot interpret timeout.'); break; }
          case 'proxy_ssl_verify': if (a[0] === 'off') { px.insecure = true; ok(d); differs(d, 'Maps to `tls_insecure_skip_verify` — disables upstream certificate checks.'); } else noop(d, 'Caddy verifies upstream certs by default.'); break;
          case 'proxy_buffering': if (a[0] === 'off') { px.flush = true; ok(d); } else noop(d, 'Default.'); break;
          case 'limit_except': {
            const inner = d.children || [];
            if (inner.length === 1 && inner[0].name === 'deny' && inner[0].args[0] === 'all') { B.acl.push('@lx' + (++matcherN) + ' not method ' + a.join(' ') + '\nrespond @lx' + matcherN + ' 405'); ok(d); }
            else manual(d, 'limit_except with rules other than `deny all`.', 'Build a `not method` matcher and apply `basic_auth` / `remote_ip` inside a `handle @x`.');
            break;
          }
          case 'return': {
            const code = /^\d{3}$/.test(a[0]) ? +a[0] : null;
            if (code === null) { B.route.push('redir ' + q(tv(a[0], d, sc)) + ' 302'); ok(d); break; }
            const body = a[1] === undefined ? null : tv(a[1], d, sc);
            if (code === 444) { B.route.push('abort'); ok(d); differs(d, '`abort` closes the connection like nginx 444.'); }
            else if (code >= 300 && code < 400 && body !== null) { B.route.push('redir ' + q(body) + ' ' + code); ok(d); }
            else if (body !== null) { B.route.push('respond ' + q(body) + ' ' + code); ok(d); }
            else { B.route.push('respond ' + code); ok(d); }
            res.content = res.content || 'respond'; res.terminal = true; break;
          }
          case 'rewrite': {
            const [pat, repl, flag] = a; const rn = 'rw' + (++matcherN);
            if (!pat || !repl) { manual(d, 'Malformed rewrite.'); break; }
            const prob = re2Problem(pat);
            if (prob) { manual(d, 'Regex uses ' + prob + ', which Go (RE2) does not support.', 'Rewrite the pattern without it.'); break; }
            const r2 = repl.replace(/\$(\d)/g, (m, n) => '{re.' + rn + '.' + n + '}');
            const target2 = tv(r2, d, sc);
            B.route.push('@' + rn + ' path_regexp ' + rn + ' ' + q(pat));
            if (flag === 'permanent' || flag === 'redirect') B.route.push('redir @' + rn + ' ' + q(target2) + ' ' + (flag === 'permanent' ? 301 : 302));
            else B.route.push('rewrite @' + rn + ' ' + q(target2));
            ok(d);
            if (flag === 'last' || flag === 'break' || !flag) differs(d, 'nginx `' + (flag || 'no flag') + '` controls whether later rewrite rules / location matching run again; Caddy applies each `rewrite` once, in directive order.', 'Check any rewrites that were meant to chain.');
            if (/\?/.test(repl) === false && !/redirect|permanent/.test(flag || '') && false) noop(d, '');
            break;
          }
          default: {
            if (Object.prototype.hasOwnProperty.call(NOOP, nm) && NOOP[nm]) { noop(d, NOOP[nm]); break; }
            if (Object.prototype.hasOwnProperty.call(MANUAL, nm) && MANUAL[nm]) { manual(d, MANUAL[nm]); break; }
            if (d.children) manual(d, 'Unknown block "' + nm + '".'); else manual(d, 'No known Caddy equivalent for "' + nm + '".', 'Check whether a Caddy module covers it: caddyserver.com/docs/modules');
          }
        }
      });

      // tls
      if (tlsCert || tlsKey) {
        if (tlsCert && tlsKey) {
          const bad = hasVar(tlsCert.args[0]) || hasVar(tlsKey.args[0]);
          if (bad) manual(tlsCert, 'Variables in certificate path.');
          else {
            let line = 'tls ' + q(tlsCert.args[0]) + ' ' + q(tlsKey.args[0]);
            if (tlsProto) {
              const vs = tlsProto.args.map(x => x.replace(/^TLSv/, '')).map(x => x === '1' ? '10' : x.replace('.', '')).filter(x => /^1[0-3]$/.test(x)).map(Number);
              const lo = Math.max(12, Math.min(...vs)), hi = Math.max(...vs);
              if (vs.length && !(lo === 12 && hi >= 13)) line += ' {\n\tprotocols tls' + (lo === 12 ? '1.2' : '1.3') + ' tls' + (hi >= 13 ? '1.3' : '1.2') + '\n}';
              if (vs.some(v => v < 12)) differs(tlsProto, 'Caddy does not support TLS 1.0/1.1; clients limited to those will fail.');
              ok(tlsProto);
            }
            B.tls.push(line); ok(tlsCert); ok(tlsKey);
            if (/letsencrypt/.test(tlsCert.args[0])) differs(tlsCert, 'These look like certbot certificates. Caddy can obtain and renew its own — you can usually delete this `tls` line.', 'Keep it only if certbot must stay in charge.');
          }
        } else manual(tlsCert || tlsKey, 'ssl_certificate and ssl_certificate_key must both be present.');
      } else if (tlsProto) { noop(tlsProto, 'Caddy defaults to TLS 1.2+1.3.'); }

      // allow / deny
      if (allow.length || deny.length) {
        const denyAll = deny.some(x => x.args[0] === 'all'), lastIsDenyAll = dirs.filter(x => x.name === 'allow' || x.name === 'deny').slice(-1)[0];
        const ip = list => list.map(x => x.args[0]).filter(x => x !== 'all' && !hasVar(x)).join(' ');
        if (denyAll && allow.length && lastIsDenyAll.name === 'deny' && lastIsDenyAll.args[0] === 'all') {
          B.acl.push('@blocked' + (++matcherN) + ' not remote_ip ' + ip(allow) + '\nrespond @blocked' + matcherN + ' 403'); allow.concat(deny).forEach(ok);
        } else if (denyAll && !allow.length && deny.length === 1) {
          B.acl.push('respond 403'); ok(deny[0]); res.content = res.content || 'respond';
        } else if (!allow.length && deny.length && !denyAll) {
          B.acl.push('@blocked' + (++matcherN) + ' remote_ip ' + ip(deny) + '\nrespond @blocked' + matcherN + ' 403'); deny.forEach(ok);
        } else allow.concat(deny).forEach(x => manual(x, 'This allow/deny order is not a plain allow-list or deny-list.', 'Express it with `remote_ip` matchers evaluated first-match-wins.'));
      }

      // root / alias
      let staticRoot = root;
      if (alias) {
        if (sc.kind === 'location' && sc.mod !== '~' && sc.mod !== '~*' && sc.prefix) {
          const a0 = alias.args[0]; const lp = sc.prefix;
          if (hasVar(a0)) manual(alias, 'Variables in alias.');
          else if ((lp.endsWith('/') && a0.endsWith('/')) || (!lp.endsWith('/') && !a0.endsWith('/'))) { res.strip = lp.replace(/\/?$/, '') + '*'; if (lp.endsWith('/')) res.strip = lp + '*'; staticRoot = a0.replace(/(.)\/$/, '$1'); res.aliasOK = true; ok(alias); }
          else manual(alias, 'alias and location differ in trailing slash, which changes how paths map.', 'Make both end in "/" and convert again.');
        } else manual(alias, 'alias outside a plain prefix location.', 'Use `handle_path /prefix/* { root * <dir>; file_server }`.');
      }
      if (staticRoot && sc.kind === 'location') B.root.push('root * ' + q(staticRoot));
      else if (staticRoot) B.root.push('root * ' + q(staticRoot));

      // try_files
      let hasPhpFallback = false;
      if (tryFiles) {
        const ta = tryFiles.args.slice(); let last = ta[ta.length - 1];
        if (/^=\d{3}$/.test(last)) { ta.pop(); } else if (last && last[0] === '@') {
          manual(tryFiles, 'try_files falls back to the named location ' + last + '.', 'Caddy has no named locations: put the fallback in the same `handle`, e.g. `try_files {path} {path}/` then `reverse_proxy …`.'); ta.length = 0;
        }
        if (ta.length) {
          hasPhpFallback = /index\.php/.test(ta[ta.length - 1]);
          res.tryNode = tryFiles; res.tryArgs = ta.map(x => tv(x, tryFiles, sc));
          res.tryPhp = hasPhpFallback;
        }
        if (!ta.length && !(last && last[0] === '@')) noop(tryFiles, 'Plain "serve the file or 404" is what `file_server` does already.');
      }

      // errors
      if (errPages.length) {
        const lines = [];
        errPages.forEach(d => {
          const a = d.args.slice(); const dest = a.pop(); const codes = a.filter(x => /^\d{3}$/.test(x)); const eq = a.find(x => /^=/.test(x));
          if (!dest || !codes.length) { manual(d, 'Malformed error_page.'); return; }
          if (dest[0] === '@') { manual(d, 'error_page to a named location ' + dest + '.', 'Inside `handle_errors`, use `reverse_proxy` or `rewrite` directly.'); return; }
          if (/^https?:\/\//.test(dest)) { lines.push('@e' + codes.join('_') + ' expression {http.error.status_code} in [' + codes.join(', ') + ']\nredir @e' + codes.join('_') + ' ' + q(dest)); ok(d); return; }
          lines.push('@e' + codes.join('_') + ' expression {http.error.status_code} in [' + codes.join(', ') + ']\nhandle @e' + codes.join('_') + ' {\n\trewrite * ' + q(dest) + '\n\tfile_server\n}');
          ok(d);
          if (eq) differs(d, 'Status override ' + eq + ' is not applied; Caddy keeps the original error status.', 'Add `respond` with the status you want inside the handle.');
          if (!res.sawRoot && sc.kind === 'server') differs(d, 'The error page is served with `file_server` — make sure a `root` is set for this site.');
        });
        if (lines.length) B.errors.push('handle_errors {\n' + lines.join('\n').split('\n').map(l => '\t' + l).join('\n') + '\n}');
      }

      // content handler
      let phpTarget = null;
      if (fastcgi) {
        const a0 = fastcgi.args[0];
        if (hasVar(a0)) manual(fastcgi, 'Variables in fastcgi_pass.');
        else { phpTarget = /^unix:/.test(a0) ? 'unix/' + a0.slice(5) : a0; ok(fastcgi); }
      }
      if (target) {
        const um0 = /^(https?):\/\/unix:([^:]+)(?::(\/.*)?)?$/.exec(target);
        const m = um0 ? [target, um0[1], 'unix:' + um0[2] + (um0[3] ? ':' + um0[3] : ''), undefined] : /^(https?):\/\/([^/]*)(\/.*)?$/.exec(target);
        if (hasVar(target)) manual(proxyNode, 'proxy_pass with variables ("' + target + '") resolves the upstream per request.', 'Use `reverse_proxy` with `dynamic a` / `map`, or inline the fixed target.');
        else if (!m) manual(proxyNode, 'Cannot parse proxy_pass target "' + target + '".');
        else {
          const scheme = m[1], hostpart = m[2]; uri = m[3] === undefined ? null : m[3];
          let ups;
          if (upstreams[hostpart]) {
            const u = upstreams[hostpart];
            ups = u.servers.filter(s => !s.args.includes('down')).map(s => {
              const w = s.args.find(x => /^weight=/.test(x)); if (w && w !== 'weight=1') differs(s, 'Server weights are not supported by Caddy load balancing.', 'Repeat the server in the list, or use `lb_policy weighted_round_robin` (Caddy 2.9+).');
              if (s.args.includes('backup')) manual(s, '`backup` servers have no direct equivalent.', 'Use a second `reverse_proxy` in a fallback handle.');
              let h = s.args[0]; const um = /^unix:(.*)$/.exec(h); const t = um ? 'unix/' + um[1] : (scheme === 'https' ? 'https://' : '') + h; ok(s);
              return t;
            });
            if (!ups.length) manual(u.node, 'Every server in upstream "' + hostpart + '" is marked down.');
            px.policy = u.policy;
            if (u.policy === 'ip_hash') differs(u.node, '`ip_hash` maps to `lb_policy ip_hash` (client_ip based) — distribution may differ slightly.');
            if (u.policy === 'hash') differs(u.node, '`hash $key` maps to `lb_policy uri_hash`/`header` — set the policy matching your key.');
      u.servers.forEach(sv => sv.args.forEach(x => { if (/^max_fails=/.test(x) && !px.maxFails) px.maxFails = x.split('=')[1]; if (/^fail_timeout=/.test(x) && !px.failDur) px.failDur = x.split('=')[1]; }));
          } else if (/^unix:/.test(hostpart)) { const um = /^unix:([^:]+)(?::(.*))?$/.exec(hostpart); ups = ['unix/' + (um ? um[1] : hostpart.slice(5))]; uri = um && um[2] ? um[2] : uri; }
          else ups = [(scheme === 'https' ? 'https://' : '') + hostpart];
          if (ups && ups.length) {
            res.proxy = { ups, uri, px };
            ok(proxyNode);
            if (uri !== null && !(sc.kind === 'location' && sc.mod !== '~' && sc.mod !== '~*' && sc.mod !== '=' && sc.prefix)) differs(proxyNode, 'proxy_pass with a URI part in a regex/exact/server context passes the URI literally.', 'Check the upstream path with `rewrite` before `reverse_proxy`.');
          }
        }
      }
      res.phpTarget = phpTarget; res.fastcgi = fastcgi;

      // assemble
      const out = [];
      ['tls', 'root', 'enc', 'hdr', 'body', 'log', 'acl', 'auth', 'route'].forEach(k => B[k].forEach(x => out.push(x)));
      res.pre = out; res.errors = B.errors; res.autoindex = autoindex; res.staticRoot = staticRoot;
      return res;
    }

    function proxyBlock(p) {
      const px = p.px; const inner = [];
      if (px.policy) inner.push('lb_policy ' + (px.policy === 'hash' ? 'uri_hash' : px.policy));
      if (px.maxFails) inner.push('max_fails ' + px.maxFails);
      if (px.failDur) inner.push('fail_duration ' + px.failDur);
      if (px.flush) inner.push('flush_interval -1');
      px.up.forEach(x => inner.push(x)); px.down.forEach(x => inner.push(x));
      const tk = Object.keys(px.timeouts);
      if (tk.length || px.insecure) {
        inner.push('transport http {'); tk.forEach(k => inner.push('\t' + k + ' ' + px.timeouts[k]));
        if (px.insecure) inner.push('\ttls_insecure_skip_verify'); inner.push('}');
      }
      const head = 'reverse_proxy ' + p.ups.join(' ');
      return inner.length ? [head + ' {', ...inner.map(x => '\t' + x), '}'] : [head];
    }

    // ---- server -> site
    const sites = [];
    function indentLines(ls) { return ls.map(l => l === '' ? l : '\t' + l); }
    function flat(arr) { const o = []; arr.forEach(x => String(x).split('\n').forEach(l => o.push(l))); return o; }

    function serverToSite(server, inherited) {
      const addr = addresses(server);
      const ownNames = new Set(server.children.map(c => c.name));
      const own = server.children.filter(d => d.name !== 'location');
      const ownBoiler = own.filter(d => !['listen', 'server_name', 'access_log', 'error_log', 'include', 'ssl_certificate', 'ssl_certificate_key', 'ssl_protocols'].includes(d.name));
      const redirOnly = ownBoiler.length === 1 && ownBoiler[0].name === 'return' && !server.children.some(d => d.name === 'location');
      const dirs = redirOnly ? own : own.concat(inherited.filter(h => !ownNames.has(h.name)));
      const locs = server.children.filter(c => c.name === 'location');
      const site = { addresses: addr.list, lines: [], confidence: 'high', manual: 0, differs: 0, locations: locs.length, src: server.line };
      const mark = { m: stat.manual, d: stat.differs };

      // pure http->https redirect server? let Caddy's automatic redirect replace it
      const simple = own.filter(d => !['listen', 'server_name', 'access_log', 'error_log', 'include'].includes(d.name));
      if (simple.length === 1 && simple[0].name === 'return' && /^30[1278]$/.test(simple[0].args[0]) && /^https:\/\/(\$host|\$server_name|\$http_host)(\$request_uri|\$uri)?$/.test(simple[0].args[1] || '') && !locs.length && !addr.has443) {
        ok(simple[0]); rec('noop', simple[0], 'HTTP→HTTPS redirect: Caddy redirects to HTTPS automatically for any site with a hostname, so this server block is dropped.');
        site.dropped = true; return site;
      }

      const top = scope(dirs, { kind: 'server' });
      const body = []; const matchersTop = [];
      let siteHasContent = false, sitePhp = null;

      // php detection across locations
      const entries = locs.map(l => {
        let mod = '', pat = l.args[0];
        if (l.args.length > 1) { mod = l.args[0]; pat = l.args[1]; }
        return { node: l, mod, pat };
      });
      entries.forEach(e => {
        if (e.pat && e.pat[0] === '@') { manual(e.node, 'Named location ' + e.pat + ' is not translated.', 'Inline its contents where it is referenced (try_files / error_page).'); e.skip = true; }
        if (e.node.children && e.node.children.some(c => c.name === 'location')) manual(e.node, 'Nested locations are not translated.', 'Flatten them into separate `handle` blocks.');
      });
      const ord = { '=': 0, '^~': 1, '~': 2, '~*': 2, '': 3 };
      const sorted = entries.filter(e => !e.skip).sort((x, y) => {
        const ox = ord[x.mod], oy = ord[y.mod]; if (ox !== oy) return ox - oy;
        if (ox === 3 || ox === 1 || ox === 0) return y.pat.length - x.pat.length; return x.node.line - y.node.line;
      });
      const hasRegexAndPrefix = sorted.some(e => e.mod === '~' || e.mod === '~*') && sorted.some(e => e.mod === '');
      if (hasRegexAndPrefix) rec('noop', server, 'This server mixes regex and prefix locations; Caddy `handle` blocks are matched by specificity, not nginx\'s regex-wins-over-prefix rule.');

      if (!sitePhp) entries.forEach(e => { if (!e.skip && (e.mod === '~' || e.mod === '~*') && isPhpRegex(e.pat)) { const f = (e.node.children || []).find(c => c.name === 'fastcgi_pass'); if (f && !hasVar(f.args[0])) sitePhp = /^unix:/.test(f.args[0]) ? 'unix/' + f.args[0].slice(5) : f.args[0]; } });
      const handles = []; const rootLines = [];
      sorted.forEach(e => {
        const n = e.node; let ma = null, matcherDef = null, reName = null;
        if (e.mod === '~' || e.mod === '~*') {
          reName = 'r' + (++matcherN);
          const prob = re2Problem(e.pat);
          if (prob) { manual(n, 'Regex uses ' + prob + ', which Go (RE2) does not support.', 'Rewrite the pattern without it.'); return; }
          matcherDef = '@' + reName + ' path_regexp ' + reName + ' ' + q((e.mod === '~*' ? '(?i)' : '') + e.pat); ma = '@' + reName;
        }
        const inner = scope(n.children || [], { kind: 'location', mod: e.mod, prefix: e.pat, reName });
        if (n.children && inner.php === null) { /* noop */ }
        ok(n);
        // php location → hoist to site level
        if (inner.phpTarget && (e.mod === '~' || e.mod === '~*') && isPhpRegex(e.pat)) {
          sitePhp = inner.phpTarget; siteHasContent = true; matcherN--; return;
        }
        let kind = null; const lines = []; const isRoot = e.mod === '' && e.pat === '/';
        inner.pre.forEach(x => lines.push(x));
        const phpTry = inner.tryArgs && inner.tryPhp && sitePhp && !isRoot;
        if (phpTry) { rec('noop', inner.tryNode, '`php_fastcgi` replaces this try_files fallback to index.php.'); lines.push('php_fastcgi ' + sitePhp); kind = 'phpfs'; }
        else if (inner.tryArgs) lines.push('try_files ' + inner.tryArgs.join(' '));
        if (inner.errors.length) inner.errors.forEach(x => lines.push(x));
        if (inner.proxy) {
          let ps = proxyBlock(inner.proxy); kind = 'proxy';
          if (inner.proxy.uri !== null && inner.proxy.uri !== '/' && e.mod !== '~' && e.mod !== '~*' && e.mod !== '=') {
            const pre = inner.proxy.uri.replace(/\/$/, '');
            inner.strip = e.pat.endsWith('/') ? e.pat + '*' : e.pat + '*';
            lines.push('rewrite * ' + q(pre + '{uri}'));
          } else if (inner.proxy.uri === '/' && e.mod !== '~' && e.mod !== '~*' && e.mod !== '=') inner.strip = e.pat + (e.pat.endsWith('/') ? '*' : '*');
          lines.push(...ps);
        } else if (inner.phpTarget) { lines.push('php_fastcgi ' + inner.phpTarget); kind = 'php'; }
        else if (inner.res === undefined && (inner.content === 'respond')) kind = 'respond';
        else if (kind === 'phpfs') { lines.push('file_server'); }
        else if (inner.staticRoot || inner.sawRoot || top.sawRoot || top.staticRoot) { lines.push(inner.autoindex || top.autoindex ? 'file_server browse' : 'file_server'); kind = 'static'; }
        else if (!inner.content && !lines.length && !inner.pre.length) { /* empty */ }
        if (isRoot && kind !== 'proxy' && kind !== 'respond' && !inner.strip) {
          // contributes to site level
          siteHasContent = true;
          if (inner.tryPhp) { rec('noop', inner.tryNode, '`php_fastcgi` already does the "try the file, fall back to index.php" routing that this try_files performed.'); const i = lines.findIndex(x => /^try_files/.test(x)); if (i >= 0) lines.splice(i, 1); }
          rootLines.push(...lines); return;
        }
        let head;
        if (inner.strip) head = 'handle_path ' + inner.strip;
        else if (isRoot) head = 'handle';
        else if (ma) head = 'handle ' + ma;
        else head = 'handle ' + (e.mod === '=' ? e.pat : (e.pat.endsWith('/') ? e.pat + '*' : e.pat + '*'));
        if (matcherDef) matchersTop.push(matcherDef);
        if (inner.aliasOK) { /* strip set above */ }
        handles.push([head + ' {', ...indentLines(flat(lines)), '}']);
        if (kind !== 'proxy') {/* ok */}
        // trailing-slash prefix: nginx "/foo/" also matches "/foo"? no. fine
      });

      // assemble site body
      top.pre.forEach(x => body.push(x));
      matchersTop.forEach(x => body.push(x));
      if (top.errors.length) top.errors.forEach(x => body.push(x));
      if (top.tryArgs && !(top.tryPhp && sitePhp)) body.push('try_files ' + top.tryArgs.join(' '));
      if (top.tryPhp && sitePhp && top.tryNode) rec('noop', top.tryNode, '`php_fastcgi` already does this routing.');
      if (top.proxy) { body.push(...proxyBlock(top.proxy)); siteHasContent = true; }
      if (top.phpTarget) { sitePhp = sitePhp || top.phpTarget; siteHasContent = true; }
      handles.forEach(h => body.push(...h));
      if (rootLines.length) rootLines.forEach(x => body.push(x));
      if (sitePhp) body.push('php_fastcgi ' + sitePhp);
      const rootKnown = !!(top.staticRoot || top.sawRoot);
      if (rootKnown && !body.some(x => /^file_server/.test(x)) && !top.proxy && top.content !== 'respond') body.push(top.autoindex ? 'file_server browse' : 'file_server');
      // if both a file root and a catch-all handle exist, nothing more needed
      if (!body.length) body.push('# (empty server block — nothing to serve)');
      // dedupe consecutive identical file_server lines
      site.lines = flat(body);
      site.manual = stat.manual - mark.m; site.differs = stat.differs - mark.d;
      site.confidence = site.manual ? 'low' : site.differs ? 'medium' : 'high';
      return site;
    }

    // ---- walk the tree
    const globalNoise = [];
    function walkTop(nodes, inherited) {
      nodes.forEach(nd => {
        if (nd.name === 'server' && nd.children) { sites.push(serverToSite(nd, inherited)); ok(nd); return; }
        if (nd.name === 'http' && nd.children) {
          ok(nd);
          const inh = nd.children.filter(c => !c.children && INHERIT.has(c.name));
          nd.children.filter(c => !c.children).forEach(c => {
            if (!inh.includes(c)) {
              if (Object.prototype.hasOwnProperty.call(NOOP, c.name) && NOOP[c.name]) noop(c, NOOP[c.name]);
              else if (Object.prototype.hasOwnProperty.call(MANUAL, c.name)) manual(c, MANUAL[c.name]);
              else if (c.name !== 'include') noop(c, 'Handled elsewhere / ignored.');
            }
          });
          walkTop(nd.children.filter(c => c.children), inh); return;
        }
        if (nd.name === 'upstream') return;
        if (nd.name === 'events') { noop(nd, 'Not needed.'); return; }
        if (nd.name === 'stream' && nd.children) { manual(nd, MANUAL.stream); return; }
        if (nd.name === 'location' && nd.children) {
          const wrap = { name: 'server', args: [], qargs: [], line: nd.line, children: [{ name: 'listen', args: ['80'], line: nd.line, children: null }, nd] };
          const s = serverToSite(wrap, inherited); s.addresses = [':80']; s.synthetic = true; sites.push(s);
          rec('noop', nd, 'A bare `location` was found outside a server block; it was placed in a catch-all `:80` site.'); return;
        }
        if (nd.children) { manual(nd, 'Unknown top-level block "' + nd.name + '".'); return; }
        if (Object.prototype.hasOwnProperty.call(NOOP, nd.name) && NOOP[nd.name]) noop(nd, NOOP[nd.name]);
        else if (Object.prototype.hasOwnProperty.call(MANUAL, nd.name) && MANUAL[nd.name]) manual(nd, MANUAL[nd.name]);
        else if (nd.name === 'include') { /* handled */ }
        else if (inherited && inherited.length >= 0 && ['gzip', 'add_header', 'root', 'server_tokens', 'client_max_body_size', 'ssl_certificate', 'ssl_certificate_key', 'ssl_protocols', 'expires', 'access_log', 'error_page', 'autoindex'].includes(nd.name)) globalNoise.push(nd);
        else manual(nd, 'No known Caddy equivalent for "' + nd.name + '".');
      });
    }
    walkTop(ast, []);
    // top-level inheritable directives appearing in a snippet with servers: apply to sites lacking them is not attempted
    globalNoise.forEach(n => noop(n, 'Top-level directive outside http{}; not applied to any server block.'));

    // ---- duplicate site addresses
    const addrSeen = {};
    sites.forEach(s => (s.addresses || []).forEach(a => {
      if (s.dropped) return;
      if (addrSeen[a]) { s.confidence = 'low'; s.manual++; report.push({ kind: 'manual', line: s.src, directive: 'server', message: 'Two server blocks produce the same Caddy site address "' + a + '"; Caddy refuses duplicate addresses.', hint: 'Merge them into one site block.' }); stat.manual++; }
      addrSeen[a] = true;
    }));

    // ---- render
    const out = [];
    out.push('# Generated by Caddify from nginx.conf — review the report before deploying.');
    sites.filter(s => !s.dropped).forEach(s => {
      out.push('');
      const conf = s.confidence === 'high' ? '' : '  # ' + s.confidence + ' confidence';
      out.push((s.addresses.length ? s.addresses.join(', ') : ':80') + ' {' + conf);
      s.lines.forEach(l => out.push(l === '' ? '' : '\t' + l));
      out.push('}');
    });
    const caddyfile = out.join('\n') + '\n';
    report.sort((a, b) => a.line - b.line);
    return { caddyfile, report, stats: stat, sites: sites.map(s => ({ addresses: s.addresses, confidence: s.confidence, dropped: !!s.dropped, manual: s.manual, differs: s.differs, line: s.src })), ast };
  }

  function checkCaddyfile(text) {
    // structural sanity check (NOT a substitute for `caddy validate`)
    const problems = []; let depth = 0;
    text.split('\n').forEach((l, i) => {
      const s = l.replace(/#.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\{[\w.$@-]+\}/g, 'P');
      for (const c of s) { if (c === '{') depth++; if (c === '}') { depth--; if (depth < 0) { problems.push('line ' + (i + 1) + ': unmatched }'); depth = 0; } } }
    });
    if (depth) problems.push('unclosed {');
    return problems;
  }

  return { tokenize, parse, convert, checkCaddyfile, q, size, seconds };
});
