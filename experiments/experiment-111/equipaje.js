#!/usr/bin/env node
'use strict';
/*
 * Equipaje — what leaves with your files.
 * Paste a list of files (git ls-files, every file in the folder, npm pack --dry-run,
 * or the listing of your hosting's public folder) plus, if you have them, your
 * .gitignore, .dockerignore, .npmignore, package.json and Dockerfile. Equipaje says
 * which files that usually hold passwords and keys would be committed, published to
 * npm, sent into a Docker image or served on your website, and the exact line that
 * stops each one. Offline, zero dependencies. It reads names, never file contents.
 *
 * Matching rules follow the vendor docs read on 2026-11-27:
 *   gitignore  https://git-scm.com/docs/gitignore
 *   dockerignore https://docs.docker.com/build/concepts/context/ and moby/patternmatcher
 *   npm files  https://docs.npmjs.com/cli/v11/configuring-npm/package-json (files, .npmignore)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Equipaje = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const VERSION = '1.0.0';

  // ---------------------------------------------------------------- glob engine
  function escapeRe(c) { return /[\\^$.*+?()[\]{}|\/]/.test(c) ? '\\' + c : c; }

  // flavor 'git': "**" is special only as "**/", "/**/" or "/**"; other runs act like "*".
  // flavor 'docker': Go filepath.Match plus "**" = any number of directories (moby/patternmatcher).
  function globToRe(pat, flavor) {
    let re = '';
    let i = 0;
    while (i < pat.length) {
      const c = pat[i];
      if (c === '\\' && i + 1 < pat.length) { re += escapeRe(pat[i + 1]); i += 2; continue; }
      if (c === '*') {
        if (pat[i + 1] === '*') {
          const atStart = i === 0 || pat[i - 1] === '/';
          const next = pat[i + 2];
          if (atStart && next === '/') { re += '(?:.*/)?'; i += 3; continue; }
          if (atStart && next === undefined) { re += '.*'; i += 2; continue; }
          if (flavor === 'docker') { re += '.*'; i += 2; continue; }
          while (pat[i] === '*') i++;
          re += '[^/]*';
          continue;
        }
        re += '[^/]*'; i++; continue;
      }
      if (c === '?') { re += '[^/]'; i++; continue; }
      if (c === '[') {
        const end = pat.indexOf(']', i + 2);
        if (end === -1) { re += '\\['; i++; continue; }
        let body = pat.slice(i + 1, end);
        if (body[0] === '!' || body[0] === '^') body = '^' + body.slice(1);
        re += '[' + body.replace(/\\/g, '\\\\') + ']';
        i = end + 1; continue;
      }
      re += escapeRe(c); i++;
    }
    return new RegExp('^' + re + '$');
  }

  const base = (p) => p.slice(p.lastIndexOf('/') + 1);
  const parents = (p) => { const parts = p.split('/'); const out = []; for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/')); return out; };

  // ---------------------------------------------------------------- .gitignore / .npmignore
  function compileGitignore(text) {
    const pats = [];
    String(text || '').split(/\r?\n/).forEach((raw, idx) => {
      let line = raw.replace(/(^|[^\\])\s+$/, '$1');
      if (!line || line[0] === '#') return;
      let neg = false;
      if (line[0] === '!') { neg = true; line = line.slice(1); }
      else if (line.startsWith('\\!') || line.startsWith('\\#')) line = line.slice(1);
      line = line.replace(/\\ /g, ' ');
      let dirOnly = false;
      if (line.endsWith('/')) { dirOnly = true; line = line.replace(/\/+$/, ''); }
      if (!line) return;
      const anchored = line.includes('/');
      if (line[0] === '/') line = line.slice(1);
      pats.push({ text: raw.trim(), line: idx + 1, neg, dirOnly, anchored, re: globToRe(line, 'git') });
    });
    return pats;
  }
  function gitMatch(p, isDir, pats) {
    let hit = null;
    for (const pat of pats) {
      if (pat.dirOnly && !isDir) continue;
      if (pat.re.test(pat.anchored ? p : base(p))) hit = pat;
    }
    return hit;
  }
  // A file is ignored if its last matching pattern ignores it, or if a parent directory is
  // ignored: "It is not possible to re-include a file if a parent directory of that file is excluded."
  function gitIgnored(p, pats) {
    for (const d of parents(p)) {
      const h = gitMatch(d, true, pats);
      if (h && !h.neg) return { ignored: true, by: h };
    }
    const h = gitMatch(p, false, pats);
    return { ignored: !!(h && !h.neg), by: h };
  }

  // ---------------------------------------------------------------- .dockerignore
  function compileDockerignore(text) {
    const pats = [];
    String(text || '').split(/\r?\n/).forEach((raw, idx) => {
      if (raw[0] === '#') return;
      let line = raw.trim();
      if (!line) return;
      let neg = false;
      if (line[0] === '!') { neg = true; line = line.slice(1).trim(); }
      line = line.replace(/\/+/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+|\/+$/g, '').replace(/\/\.\//g, '/');
      if (!line || line === '.') return;
      pats.push({ text: raw.trim(), line: idx + 1, neg, hasSlash: line.includes('/'), raw: line, re: globToRe(line, 'docker') });
    });
    return pats;
  }
  // moby/patternmatcher MatchesOrParentMatches: a pattern matches the path or any parent; last match wins.
  function dockerExcluded(p, pats) {
    let ex = false; let by = null;
    const ps = parents(p);
    for (const pat of pats) {
      if (pat.re.test(p) || ps.some((d) => pat.re.test(d))) { ex = !pat.neg; by = pat; }
    }
    return { excluded: ex, by };
  }

  // ---------------------------------------------------------------- npm pack simulation
  const NPM_ALWAYS_IGNORED = compileGitignore(['.git', 'CVS', '.svn', '.hg', '.lock-wscript', '.wafpickle-*', '.*.swp', '.DS_Store', '._*', 'npm-debug.log', '.npmrc', 'node_modules', 'config.gypi', '*.orig', '/package-lock.json', '/pnpm-lock.yaml', '/yarn.lock', '/bun.lockb'].join('\n'));
  function npmAlwaysIncluded(p, pj) {
    if (p === 'package.json' || /^(readme|licen[cs]e)(\..*)?$/i.test(p)) return true;
    const norm = (x) => String(x || '').replace(/^\.\//, '');
    if (pj && pj.main && norm(pj.main) === p) return true;
    if (pj && pj.bin) { const bins = typeof pj.bin === 'string' ? [pj.bin] : Object.values(pj.bin); if (bins.some((b) => norm(b) === p)) return true; }
    return false;
  }
  function npmPacked(files, opts) {
    const pj = opts.packageJson || null;
    let mode; let rules = null;
    if (pj && Array.isArray(pj.files)) mode = 'files';
    else if (opts.npmignore != null) { mode = 'npmignore'; rules = compileGitignore(opts.npmignore); }
    else if (opts.gitignore != null) { mode = 'gitignore'; rules = compileGitignore(opts.gitignore); }
    else mode = 'none';
    const entries = mode === 'files' ? pj.files.map((f) => String(f).replace(/^\.\//, '').replace(/\/+$/, '')).filter(Boolean) : [];
    const entryRes = entries.map((e) => (/[*?[]/.test(e) ? globToRe(e, 'git') : null));
    const packed = new Set();
    for (const p of files) {
      let inc;
      if (mode === 'files') inc = entries.some((e, i) => p === e || p.startsWith(e + '/') || (entryRes[i] && (entryRes[i].test(p) || parents(p).some((d) => entryRes[i].test(d)))));
      else if (rules) inc = !gitIgnored(p, rules).ignored;
      else inc = true;
      if (inc && gitIgnored(p, NPM_ALWAYS_IGNORED).ignored) inc = false;
      if (npmAlwaysIncluded(p, pj)) inc = true;
      if (inc) packed.add(p);
    }
    return { mode, packed };
  }

  // ---------------------------------------------------------------- what counts as a secret-bearing file
  // dest keys: git, npm, docker, web. A severity of null means "normal in that place, do not report".
  const H = 'high', M = 'medium', L = 'low';
  const CATALOG = [
    { id: 'env-example', ok: true, test: (b) => /^\.env\.(example|sample|template|dist|defaults?)$/i.test(b) || /^(example|sample)\.env$/i.test(b) },
    { id: 'env', test: (b) => b === '.env' || /^\.env\..+/i.test(b) || /\.env$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['.env', '.env.*', '*.env', '!.env.example'], rotate: true,
      en: 'Environment file: passwords, API keys and database access for the app', es: 'Archivo de entorno: contraseñas, claves de API y acceso a la base de datos' },
    { id: 'ssh-key', test: (b) => /^id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/i.test(b) || /\.ppk$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '*.ppk'], rotate: true,
      en: 'SSH private key: opens your server or your GitHub account', es: 'Clave privada SSH: abre tu servidor o tu cuenta de GitHub' },
    { id: 'cms-config', test: (b, p) => /^(wp-config\.php|configuration\.php|settings\.php|localsettings\.php|config\.inc\.php|parameters\.yml)$/i.test(b) || /(^|\/)app\/etc\/(env\.php|local\.xml)$/i.test(p) || /(^|\/)config\/(master\.key|secrets\.yml|database\.yml)$/i.test(p) || /(^|\/)config\/credentials\/[^/]+\.key$/i.test(p), sev: { git: H, npm: H, docker: M, web: null }, ignore: ['wp-config.php', 'config/master.key'], rotate: true,
      en: 'Site configuration with the database password and secret keys (WordPress, Joomla, Drupal, Magento, Rails)', es: 'Configuración del sitio con la contraseña de la base de datos y llaves secretas (WordPress, Joomla, Drupal, Magento, Rails)' },
    { id: 'cert-public', ok: true, test: (b) => /\.(pem|crt|cer)$/i.test(b) && /(cert|chain|fullchain|ca-bundle|cacert|\bca\b|public|pub)/i.test(b) && !/key|priv/i.test(b) },
    { id: 'private-key', test: (b) => /\.(pem|key|p12|pfx|p8|jks|keystore|asc|gpg)$/i.test(b) && !/^(pubring|trustdb)\.gpg$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['*.pem', '*.key', '*.p12', '*.pfx', '*.p8', '*.jks', '*.keystore'], rotate: true,
      en: 'Key or certificate bundle that can hold a private key (TLS, Apple, Android signing)', es: 'Llave o certificado que puede contener una clave privada (TLS, Apple, firma de Android)' },
    { id: 'cloud', test: (b, p) => /^(credentials|client_secret.*|service[-_]?account.*|application_default_credentials|.*-firebase-adminsdk-.*|gcp[-_]?key.*|google[-_]?credentials.*)\.json$/i.test(b) || /(^|\/)\.aws\/credentials$/i.test(p) || /\.publishsettings$/i.test(b) || /(^|\/)\.azure\//i.test(p), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['credentials.json', 'client_secret*.json', 'service-account*.json', '*-firebase-adminsdk-*.json', '.aws/'], rotate: true,
      en: 'Cloud service account or OAuth client secret (Google Cloud, Firebase, AWS, Azure)', es: 'Cuenta de servicio o secreto OAuth de la nube (Google Cloud, Firebase, AWS, Azure)' },
    { id: 'git-creds', test: (b) => /^(\.git-credentials|\.netrc|_netrc)$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['.git-credentials', '.netrc'], rotate: true,
      en: 'Saved Git or HTTP passwords in plain text', es: 'Contraseñas de Git o HTTP guardadas en texto plano' },
    { id: 'registry', test: (b, p) => /^(\.npmrc|\.pypirc|\.yarnrc\.yml)$/i.test(b) || /(^|\/)\.gem\/credentials$/i.test(p) || (b === 'auth.json' && !/node_modules\//.test(p)) || /(^|\/)\.docker\/config\.json$/i.test(p), sev: { git: M, npm: null, docker: M, web: H }, ignore: ['.npmrc', '.pypirc', 'auth.json'], rotate: false,
      en: 'Package registry or Docker login settings: often hold a publish token (check for _authToken, password, auth)', es: 'Configuración de registro de paquetes o de Docker: suele guardar un token de publicación (busca _authToken, password, auth)' },
    { id: 'ftp', test: (b, p) => /(^|\/)\.vscode\/sftp\.json$/i.test(p) || /^(sftp-config\.json|\.ftpconfig|sitemanager\.xml|recentservers\.xml|filezilla\.xml|\.ftppass|ftp-sync\.json)$/i.test(b) || /(^|\/)\.idea\/(webServers|deployment)\.xml$/i.test(p), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['.vscode/sftp.json', 'sftp-config.json', '.ftpconfig', 'sitemanager.xml', 'recentservers.xml'], rotate: true,
      en: 'FTP or SFTP client settings: the hosting password is stored in this file', es: 'Configuración de cliente FTP o SFTP: la contraseña del hosting está guardada en este archivo' },
    { id: 'cms-config-backup', test: (b) => /\.(php|inc|ini|conf|config|ya?ml|json|xml)[.~_-]?(bak|backup|old|orig|save|sav|swp|swo|tmp|txt|copy|dist|\d+)$/i.test(b) || /\.(php|inc|ini)~$/i.test(b) || /^(wp-config|configuration|settings|env|local|config|database)[._-](bak|backup|old|orig|save|copy|\d+)(\.php)?$/i.test(b) || /^\..*\.(php|inc)\.sw[op]$/i.test(b), sev: { git: M, npm: H, docker: M, web: H }, ignore: ['*.bak', '*.old', '*.orig', '*.save', '*.swp', '*~'], rotate: true,
      en: 'Copy of a config file with a new extension: the web server sends it as plain text instead of running it', es: 'Copia de un archivo de configuración con otra extensión: el servidor la entrega como texto en vez de ejecutarla' },
    { id: 'htpasswd', test: (b) => /^\.htpasswd$/i.test(b), sev: { git: H, npm: H, docker: M, web: H }, ignore: ['.htpasswd'], rotate: true,
      en: 'Password file for a protected folder', es: 'Archivo de contraseñas de una carpeta protegida' },
    { id: 'infra', test: (b, p) => /^terraform\.tfstate(\.backup)?$/i.test(b) || /\.tfvars$/i.test(b) || /(^|\/)\.kube\/config$/i.test(p) || /^kubeconfig(\.ya?ml)?$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['*.tfstate', '*.tfstate.backup', '*.tfvars', 'kubeconfig'], rotate: true,
      en: 'Infrastructure state or cluster access: stores passwords and keys in plain text', es: 'Estado de infraestructura o acceso al clúster: guarda contraseñas y llaves en texto plano' },
    { id: 'history', test: (b) => /^\.(bash|zsh|sh|mysql|psql|python|node_repl|rediscli)_history$/i.test(b) || /^\.sqlite_history$/i.test(b), sev: { git: H, npm: H, docker: H, web: H }, ignore: ['.*_history'], rotate: true,
      en: 'Shell or database history: commands typed with passwords in them', es: 'Historial de consola o de base de datos: comandos escritos con contraseñas' },
    { id: 'dump', test: (b) => /\.(sql|sql\.gz|sql\.zip|sql\.bz2|dump|mysql|pgsql|bak\.sql|sqlite|sqlite3|db3|mdb|accdb)$/i.test(b) || /\.wpress$/i.test(b), sev: { git: M, npm: H, docker: M, web: H }, ignore: ['*.sql', '*.sql.gz', '*.dump', '*.sqlite', '*.sqlite3', '*.wpress'], rotate: false,
      en: 'Database dump or site migration file: customers, orders and password hashes', es: 'Volcado de base de datos o archivo de migración: clientes, pedidos y contraseñas cifradas' },
    { id: 'archive', test: (b, p) => /\.(zip|tar|tar\.gz|tgz|gz|rar|7z|bz2)$/i.test(b) && (/(backup|respaldo|copia|bak|dump|old|site|sitio|www|public_html|htdocs|web|db|database|full|wordpress|wp)/i.test(b) || !p.includes('/')) && !/node_modules\//.test(p), sev: { git: L, npm: M, docker: L, web: H }, ignore: ['*.zip', '*.tar.gz', '*.tgz', '*.rar', '*.7z'], rotate: false,
      en: 'Archive that looks like a site or database backup', es: 'Archivo comprimido que parece un respaldo del sitio o de la base de datos' },
    { id: 'git-dir', dirTest: (p) => /(^|\/)\.git\//.test(p), sev: { git: null, npm: null, docker: M, web: H }, ignore: ['.git'], rotate: false,
      en: 'The .git folder: the whole history, including passwords that were deleted later', es: 'La carpeta .git: todo el historial, incluidas contraseñas que se borraron después' },
    { id: 'log', test: (b) => /^(debug\.log|error_log|error\.log|php_errors\.log|laravel\.log)$/i.test(b) || /\.log$/i.test(b), sev: { git: L, npm: L, docker: L, web: M }, ignore: ['*.log', 'error_log'], rotate: false,
      en: 'Log file: error messages can show paths, queries, emails and sometimes keys', es: 'Archivo de registro: los errores pueden mostrar rutas, consultas, correos y a veces claves' },
    { id: 'ds-store', test: (b) => b === '.DS_Store', sev: { git: null, npm: null, docker: null, web: L }, ignore: ['.DS_Store'], rotate: false,
      en: 'Mac folder index: lists the names of the other files in the folder', es: 'Índice de carpeta de Mac: muestra los nombres de los demás archivos' },
  ];
  const BY_ID = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

  function classify(p) {
    const b = base(p);
    for (const c of CATALOG) {
      if (c.dirTest ? c.dirTest(p) : c.test(b, p)) return c.ok ? null : c;
    }
    return null;
  }

  // ---------------------------------------------------------------- input parsing
  function parseList(text) {
    const raw = String(text || '').replace(/^\uFEFF/, '');
    let format = 'list';
    const trimmed = raw.trim();
    if (/^\[\s*\{/.test(trimmed) || /^\{\s*"/.test(trimmed)) {
      try {
        const j = JSON.parse(trimmed);
        const arr = Array.isArray(j) ? j : [j];
        const files = [];
        for (const pkg of arr) for (const f of (pkg && pkg.files) || []) if (f && f.path) files.push(norm(f.path));
        if (files.length) return { files: uniq(files), format: 'npm-json' };
      } catch (_) { /* not JSON, fall through */ }
    }
    let lines = raw.split(/\r?\n/);
    if (lines.some((l) => /^npm (notice|info)\b/.test(l))) {
      format = 'npm';
      const files = [];
      let inContents = false;
      for (const l of lines) {
        if (/Tarball Contents/i.test(l)) { inContents = true; continue; }
        if (/Tarball Details|Bundled Dependencies/i.test(l)) { inContents = false; continue; }
        const m = l.match(/^npm (?:notice|info)\s+([\d.]+\s?[kMG]?B)\s+(.+?)\s*$/);
        if (m && (inContents || true)) files.push(norm(m[2]));
      }
      return { files: uniq(files), format };
    }
    const out = [];
    let lsDir = null;
    for (let l of lines) {
      l = l.replace(/\s+$/, '');
      if (!l.trim()) { lsDir = null; continue; }
      if (/^total \d+/.test(l) || /^\s*(Directory of|Volume |Volume Serial| Directorio de|\d+ File\(s\)|\d+ Dir\(s\)|\d+ archivos|\d+ dirs)/i.test(l)) continue;
      const lsHeader = l.match(/^(\.?\/?[^\s:]*):$/);
      if (lsHeader) { lsDir = lsHeader[1].replace(/^\.\/?/, ''); continue; }
      const ls = l.match(/^([dl\-][rwxsStT\-]{9}[@+.]?)\s+\d+\s+\S+\s+\S+\s+[\d,.]+[KMG]?\s+\S+\s+\S+\s+\S+\s+(.+)$/);
      if (ls) {
        let name = ls[2].replace(/ -> .*$/, '');
        if (name === '.' || name === '..') continue;
        if (ls[1][0] === 'd') name += '/';
        out.push(lsDir ? lsDir + '/' + name : name);
        continue;
      }
      // git status --porcelain / git ls-files -s style prefixes
      const gs = l.match(/^(?:[ MADRCU?!]{2} |\d{6} [0-9a-f]{40} \d\t)(.+)$/);
      if (gs) { out.push(gs[1].replace(/^"|"$/g, '')); continue; }
      out.push(l.trim().replace(/^"|"$/g, ''));
    }
    let files = out.map((p) => p.replace(/\\/g, '/'));
    // Strip a common absolute prefix (find /home/u/public_html, dir /s /b C:\site)
    const abs = files.filter((p) => /^(\/|[A-Za-z]:\/)/.test(p));
    if (abs.length && abs.length === files.length) {
      let prefix = abs[0].slice(0, abs[0].lastIndexOf('/') + 1);
      for (const p of abs) while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, prefix.slice(0, -1).lastIndexOf('/') + 1);
      if (abs.length > 1 || prefix) files = files.map((p) => p.slice(prefix.length));
      format = 'absolute';
    }
    files = files.map(norm).filter((p) => p && !p.endsWith('/'));
    return { files: uniq(files), format };
  }
  function norm(p) { return String(p).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\/{2,}/g, '/'); }
  function uniq(a) { return Array.from(new Set(a)); }

  // ---------------------------------------------------------------- Dockerfile
  const SECRET_NAME = /(^|_)(PASS(WORD|WD)?|PWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIALS?|AUTH|DSN)(_|$)/i;
  function parseDockerfile(text) {
    const out = { copies: [], argsEnv: [], rmSecrets: [] };
    if (!text) return out;
    const joined = String(text).replace(/\\\r?\n/g, ' ').split(/\r?\n/);
    joined.forEach((raw, idx) => {
      const l = raw.trim();
      let m;
      if ((m = l.match(/^(COPY|ADD)\s+(.+)$/i))) {
        let rest = m[2];
        if (/--from=/i.test(rest)) return;
        rest = rest.replace(/--[a-z-]+(=\S+)?\s+/gi, '');
        let parts;
        if (/^\[/.test(rest)) { try { parts = JSON.parse(rest); } catch (_) { parts = rest.split(/\s+/); } } else parts = rest.split(/\s+/);
        const srcs = parts.slice(0, -1).map((s) => norm(s.replace(/^\.\/?$/, '.')) || '.');
        out.copies.push({ line: idx + 1, cmd: m[1].toUpperCase(), srcs, text: l });
      } else if ((m = l.match(/^(ARG|ENV)\s+(.+)$/i))) {
        const names = [];
        const body = m[2];
        const kv = body.match(/([A-Za-z_][A-Za-z0-9_]*)(?==|\s|$)/g) || [];
        if (/=/.test(body)) { for (const pair of body.match(/([A-Za-z_][A-Za-z0-9_]*)=/g) || []) names.push(pair.slice(0, -1)); }
        else if (kv[0]) names.push(kv[0]);
        for (const n of names) if (SECRET_NAME.test(n)) out.argsEnv.push({ line: idx + 1, kind: m[1].toUpperCase(), name: n });
      } else if ((m = l.match(/^RUN\s+(.+)$/i)) && /\brm\b/.test(m[1])) {
        for (const tok of m[1].split(/[\s;&|]+/)) {
          const t = norm(tok);
          if (t && !t.startsWith('-') && classify(t)) out.rmSecrets.push({ line: idx + 1, path: t });
        }
      }
    });
    return out;
  }
  function copiedIntoImage(p, df) {
    for (const c of df.copies) {
      for (const s of c.srcs) {
        if (s === '.' || s === '*' || s === '' ) return c;
        if (p === s || p.startsWith(s.replace(/\/$/, '') + '/')) return c;
        if (/[*?[]/.test(s)) { const re = globToRe(s, 'docker'); if (re.test(p) || parents(p).some((d) => re.test(d))) return c; }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- web server rules
  function parseWebRules(text) {
    const rules = [];
    if (!text) return rules;
    const s = String(text);
    let m;
    const fm = /<(FilesMatch|Files|LocationMatch|DirectoryMatch)\s+"?([^">]+)"?\s*>([\s\S]*?)<\/\1>/gi;
    while ((m = fm.exec(s))) {
      if (!/(Require\s+all\s+denied|Deny\s+from\s+all|Order\s+allow,deny\s*$)/im.test(m[3])) continue;
      const kind = m[1].toLowerCase();
      try {
        const re = kind === 'files' ? globToRe(m[2], 'git') : new RegExp(m[2], 'i');
        rules.push({ re, on: kind.startsWith('files') ? 'name' : 'path', text: m[0].split(/\r?\n/)[0].trim() });
      } catch (_) { /* bad regex, skip */ }
    }
    const rm = /^\s*Redirect(?:Match)?\s+(?:403|404|gone)\s+"?(\S+?)"?\s*$/gim;
    while ((m = rm.exec(s))) { try { rules.push({ re: new RegExp(m[1], 'i'), on: 'path', text: m[0].trim() }); } catch (_) {} }
    const rw = /^\s*RewriteRule\s+"?(\S+?)"?\s+-\s+\[[^\]]*\b(F|G|R=40[34])\b[^\]]*\]/gim;
    while ((m = rw.exec(s))) { try { rules.push({ re: new RegExp(m[1].replace(/^\^/, '^/?'), 'i'), on: 'relpath', text: m[0].trim() }); } catch (_) {} }
    const ng = /location\s+(~\*?)\s+([^\s{]+)\s*\{([^}]*)\}/gi;
    while ((m = ng.exec(s))) {
      if (!/(deny\s+all|return\s+40[34])/i.test(m[3])) continue;
      try { rules.push({ re: new RegExp(m[2], m[1] === '~*' ? 'i' : ''), on: 'path', text: ('location ' + m[1] + ' ' + m[2]).trim() }); } catch (_) {}
    }
    return rules;
  }
  function webBlocked(p, rules) {
    for (const r of rules) {
      const subject = r.on === 'name' ? base(p) : r.on === 'relpath' ? p : '/' + p;
      if (r.re.test(subject)) return r;
      if (r.on !== 'name' && parents(p).some((d) => r.re.test((r.on === 'relpath' ? '' : '/') + d + '/'))) return r;
    }
    return null;
  }

  // ---------------------------------------------------------------- texts
  const T = {
    en: {
      dest: { git: 'Git (your repository)', npm: 'npm (the published package)', docker: 'Docker (build context and image)', web: 'Your website (the public folder)' },
      verdict: { fix: 'FIX THIS FIRST', check: 'WORTH CHECKING', clean: 'NOTHING SECRET IS LEAVING', empty: 'NO FILE NAMES FOUND' },
      verdictText: {
        fix: 'Files that usually hold passwords or keys are leaving with the rest. Each FIX item says where they end up and the line that stops them.',
        check: 'Nothing obviously secret is leaving, but some files deserve a look.',
        clean: 'None of the file names you pasted is one that usually holds passwords or keys. Equipaje reads names, not contents: see Limitations.',
        empty: 'Paste a list of files: the output of git ls-files, npm pack --dry-run, a folder listing, or your hosting file manager.',
      },
      status: {
        committed: 'already committed: it is in the history, and every clone has it',
        wouldCommit: 'would be committed by "git add ."',
        published: 'is in the package that npm publishes',
        image: 'is copied into the image',
        context: 'is sent to the builder (not copied by your Dockerfile, but one COPY . . away from the image)',
        contextNoDf: 'is in the build context: if your Dockerfile copies the folder, it ends up in the image',
        served: 'is on the public website: anyone who types its address can download it',
        blocked: 'is on the public website, but a rule you pasted should block it',
      },
      fixes: {
        rotate: 'Change (rotate) the passwords and keys in it first: deleting the file does not undo a copy someone already has.',
        gitignore: (lines) => 'Add to .gitignore: ' + lines.join('  '),
        untrack: (p) => 'Stop tracking it, keep your copy: git rm --cached "' + p + '"  (then commit). The old commits still have it: see "remove it from the history".',
        history: 'If the repository was ever public or shared, remove it from the history with git filter-repo --sensitive-data-removal (GitHub guide: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).',
        npmignore: (lines) => 'Add to .npmignore: ' + lines.join('  ') + '   — or better, list only what to publish in "files" of package.json.',
        npmPublished: 'If this version is already on npm, assume the file is public: rotate, then publish a fixed version.',
        dockerignore: (lines) => 'Add to .dockerignore: ' + lines.join('  '),
        dockerSecret: 'Need it during the build? Use a secret mount instead: RUN --mount=type=secret,id=env ... (https://docs.docker.com/build/building/secrets/)',
        web: 'Move it out of the public folder (one level above public_html or www) or delete it from the server. Then rotate what was inside: bots request /.env and backups all day.',
        webBlocked: 'Open its address in a private window to confirm you get 403 or 404, not the file. Better still, move it out of the public folder.',
        checkRegistry: 'Open it: if it has _authToken, password or auth, rotate that token and keep the file out.',
      },
      traps: {
        npmReplaced: { title: 'Your .npmignore replaced your .gitignore', detail: (n) => 'When a package has an .npmignore, npm stops reading .gitignore. ' + n + ' file(s) that your .gitignore keeps out of Git would be published.' },
        dockerShallow: { title: 'A .dockerignore line only covers the top folder', detail: (pat, p) => '"' + pat + '" in .dockerignore excludes it only at the root of the build context; "' + p + '" in a subfolder still goes in. Docker rules are paths from the root, unlike .gitignore.' },
        trackedIgnored: { title: 'Ignored, but already committed', detail: (p, pat) => '"' + p + '" matches "' + pat + '" in your .gitignore, but .gitignore only affects files Git is not tracking yet. This one is in the repository.' },
        noDockerignore: { title: 'COPY . . with no .dockerignore', detail: (line) => 'Line ' + line + ' of your Dockerfile copies the whole folder and there is no .dockerignore: everything listed goes into the image.' },
        rmAfterCopy: { title: 'Deleting a secret in a later step does not remove it', detail: (line, p) => 'Line ' + line + ' runs rm on "' + p + '", but the earlier COPY layer still contains it; anyone with the image can extract it.' },
        argEnv: { title: 'Secret passed as ' , detail: (kind, name, line) => kind + ' ' + name + ' (line ' + line + '): build arguments and environment variables stay in the final image and its history.' },
      },
      words: { found: 'files read', secret: 'secret-bearing files found', fixFiles: 'Lines to add', limits: 'What Equipaje cannot see', from: 'Source', rule: 'rule', none: 'no rules pasted' },
      limits: [
        'It reads file names, not contents. A secret inside src/config.js is invisible here: use Derrame (experiment 104) or gitleaks on the content.',
        'Only the root .gitignore, .dockerignore and .npmignore you paste are applied; nested ignore files, global excludes and Dockerfile-specific .dockerignore files are not.',
        'npm: the packing rules follow the npm 11 docs (files field, .npmignore over .gitignore, always included and always ignored files); bundled dependencies and workspaces are not modelled. npm pack --dry-run is the ground truth: paste its output.',
        'Web: a rule you paste is matched as written; your server may read it differently. Confirm by opening the address in a private window.',
      ],
      sources: { git: 'git ls-files (tracked files)', folder: 'every file in the folder', npm: 'npm pack --dry-run', web: 'your hosting public folder' },
    },
    es: {
      dest: { git: 'Git (tu repositorio)', npm: 'npm (el paquete que se publica)', docker: 'Docker (contexto e imagen)', web: 'Tu sitio web (la carpeta pública)' },
      verdict: { fix: 'ARREGLA ESTO PRIMERO', check: 'CONVIENE REVISAR', clean: 'NO SALE NADA SECRETO', empty: 'NO ENCONTRÉ NOMBRES DE ARCHIVO' },
      verdictText: {
        fix: 'Hay archivos que suelen guardar contraseñas o claves saliendo junto con el resto. Cada punto ARREGLA dice adónde llegan y la línea que los detiene.',
        check: 'No sale nada claramente secreto, pero algunos archivos merecen una mirada.',
        clean: 'Ninguno de los nombres que pegaste es de los que suelen guardar contraseñas o claves. Equipaje lee nombres, no contenidos: mira los límites.',
        empty: 'Pega una lista de archivos: la salida de git ls-files, de npm pack --dry-run, un listado de la carpeta o el administrador de archivos de tu hosting.',
      },
      status: {
        committed: 'ya está en un commit: queda en el historial y lo tiene cada copia del repositorio',
        wouldCommit: 'entraría con "git add ."',
        published: 'va dentro del paquete que publica npm',
        image: 'se copia dentro de la imagen',
        context: 'se envía al constructor (tu Dockerfile no lo copia, pero queda a un COPY . . de la imagen)',
        contextNoDf: 'está en el contexto de construcción: si tu Dockerfile copia la carpeta, termina en la imagen',
        served: 'está en el sitio público: cualquiera que escriba su dirección lo descarga',
        blocked: 'está en el sitio público, pero una regla que pegaste debería bloquearlo',
      },
      fixes: {
        rotate: 'Primero cambia (rota) las contraseñas y claves que contiene: borrar el archivo no deshace una copia que alguien ya tenga.',
        gitignore: (lines) => 'Agrega a .gitignore: ' + lines.join('  '),
        untrack: (p) => 'Deja de rastrearlo y conserva tu copia: git rm --cached "' + p + '"  (y haz commit). Los commits antiguos lo siguen teniendo: mira «sácalo del historial».',
        history: 'Si el repositorio fue público o compartido alguna vez, sácalo del historial con git filter-repo --sensitive-data-removal (guía de GitHub: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).',
        npmignore: (lines) => 'Agrega a .npmignore: ' + lines.join('  ') + '   — o mejor, enumera solo lo que se publica en "files" de package.json.',
        npmPublished: 'Si esta versión ya está en npm, da el archivo por público: rota y publica una versión corregida.',
        dockerignore: (lines) => 'Agrega a .dockerignore: ' + lines.join('  '),
        dockerSecret: '¿Lo necesitas durante la construcción? Usa un montaje secreto: RUN --mount=type=secret,id=env ... (https://docs.docker.com/build/building/secrets/)',
        web: 'Sácalo de la carpeta pública (un nivel sobre public_html o www) o bórralo del servidor. Luego rota lo que tenía: hay robots pidiendo /.env y respaldos todo el día.',
        webBlocked: 'Abre su dirección en una ventana privada y confirma que recibes 403 o 404 y no el archivo. Mejor aún, sácalo de la carpeta pública.',
        checkRegistry: 'Ábrelo: si tiene _authToken, password o auth, rota ese token y deja el archivo fuera.',
      },
      traps: {
        npmReplaced: { title: 'Tu .npmignore reemplazó a tu .gitignore', detail: (n) => 'Cuando un paquete tiene .npmignore, npm deja de leer .gitignore. Se publicarían ' + n + ' archivo(s) que tu .gitignore deja fuera de Git.' },
        dockerShallow: { title: 'Una línea de .dockerignore solo cubre la carpeta principal', detail: (pat, p) => '"' + pat + '" en .dockerignore lo excluye solo en la raíz del contexto; "' + p + '", en una subcarpeta, entra igual. En Docker las reglas son rutas desde la raíz, a diferencia de .gitignore.' },
        trackedIgnored: { title: 'Ignorado, pero ya está en un commit', detail: (p, pat) => '"' + p + '" coincide con "' + pat + '" de tu .gitignore, pero .gitignore solo afecta a lo que Git todavía no rastrea. Este ya está en el repositorio.' },
        noDockerignore: { title: 'COPY . . sin .dockerignore', detail: (line) => 'La línea ' + line + ' de tu Dockerfile copia toda la carpeta y no hay .dockerignore: todo lo listado entra en la imagen.' },
        rmAfterCopy: { title: 'Borrar un secreto en un paso posterior no lo elimina', detail: (line, p) => 'La línea ' + line + ' ejecuta rm sobre "' + p + '", pero la capa del COPY anterior lo sigue teniendo; cualquiera con la imagen puede extraerlo.' },
        argEnv: { title: 'Secreto pasado como ', detail: (kind, name, line) => kind + ' ' + name + ' (línea ' + line + '): los argumentos de construcción y las variables de entorno quedan en la imagen final y en su historial.' },
      },
      words: { found: 'archivos leídos', secret: 'archivos con secretos encontrados', fixFiles: 'Líneas para agregar', limits: 'Lo que Equipaje no puede ver', from: 'Origen', rule: 'regla', none: 'sin reglas pegadas' },
      limits: [
        'Lee nombres de archivo, no su contenido. Un secreto dentro de src/config.js no se ve aquí: usa Derrame (experimento 104) o gitleaks sobre el contenido.',
        'Solo aplica el .gitignore, .dockerignore y .npmignore de la raíz que pegues; no lee archivos de exclusión en subcarpetas, exclusiones globales ni .dockerignore propios de cada Dockerfile.',
        'npm: las reglas siguen la documentación de npm 11 (campo files, .npmignore por sobre .gitignore, archivos que siempre entran y que siempre se excluyen); no modela dependencias empaquetadas ni workspaces. La verdad la tiene npm pack --dry-run: pega su salida.',
        'Web: una regla que pegues se compara tal como está escrita; tu servidor puede leerla distinto. Confírmalo abriendo la dirección en una ventana privada.',
      ],
      sources: { git: 'git ls-files (archivos rastreados)', folder: 'todos los archivos de la carpeta', npm: 'npm pack --dry-run', web: 'la carpeta pública del hosting' },
    },
  };

  // ---------------------------------------------------------------- ignore-line suggestion
  function ignoreLines(cat, p, flavor) {
    // The shortest line(s) from the catalog that cover this file; the exact path otherwise.
    const fam = cat.ignore || [];
    let lines = fam.filter((l) => !l.startsWith('!') && gitIgnored(p, compileGitignore(l)).ignored);
    if (!lines.length || ['archive', 'log', 'dump', 'cms-config-backup'].includes(cat.id)) lines = [p.includes('/') ? p : '/' + p];
    else lines = lines.slice(0, 1);
    for (const l of fam) if (l.startsWith('!')) lines.push(l);
    if (flavor === 'docker') lines = lines.map((l) => (l.startsWith('!') ? '!' + dockerize(l.slice(1)) : dockerize(l)));
    return lines;
  }
  function dockerize(l) { l = l.replace(/^\//, ''); return l.includes('/') && !l.endsWith('/') ? l : '**/' + l.replace(/\/$/, ''); }

  // ---------------------------------------------------------------- main analysis
  function analyze(input, opts) {
    opts = opts || {};
    const lang = opts.lang === 'es' ? 'es' : 'en';
    const t = T[lang];
    const parsed = parseList(input.list);
    let source = input.source || 'auto';
    if (source === 'auto') source = parsed.format === 'npm' || parsed.format === 'npm-json' ? 'npm' : 'folder';
    let pj = null; let pjError = null;
    if (input.packageJson) { try { pj = JSON.parse(input.packageJson); } catch (e) { pjError = String(e.message || e); } }
    const has = (k) => input[k] != null && String(input[k]).trim() !== '';
    const files = parsed.files;
    const res = { version: VERSION, lang, source, format: parsed.format, files: files.length, destinations: [], traps: [], verdict: 'clean', fixLines: { gitignore: [], dockerignore: [], npmignore: [] }, notes: [] };
    if (pjError) res.notes.push('package.json: ' + pjError);
    if (!files.length) { res.verdict = 'empty'; return res; }

    const secrets = [];
    const gitDirs = new Set();
    for (const p of files) {
      const cat = classify(p);
      if (!cat) continue;
      if (cat.id === 'git-dir') { const d = p.slice(0, p.search(/(^|\/)\.git\//) + (p.startsWith('.git/') ? 0 : 1)) + '.git/'; if (gitDirs.has(d)) continue; gitDirs.add(d); secrets.push({ p: d, cat, sample: p }); continue; }
      secrets.push({ p, cat });
    }
    const addLines = (key, lines) => { for (const l of lines) if (!res.fixLines[key].includes(l)) res.fixLines[key].push(l); };
    const mk = (id) => ({ id, title: t.dest[id], items: [], verdict: 'clean' });
    const push = (dest, s, sev, status, fixes, extra) => {
      if (!sev) return;
      dest.items.push(Object.assign({ path: s.p, kind: s.cat.id, sev, what: s.cat[lang], status, fixes }, extra || {}));
    };

    // Git
    const gitPats = has('gitignore') ? compileGitignore(input.gitignore) : [];
    if (source === 'git' || source === 'folder') {
      const d = mk('git');
      for (const s of secrets) {
        const sev = s.cat.sev.git;
        if (!sev) continue;
        if (source === 'git') {
          const fx = [];
          if (s.cat.rotate) fx.push(t.fixes.rotate);
          fx.push(t.fixes.untrack(s.p));
          fx.push(t.fixes.gitignore(ignoreLines(s.cat, s.p, 'git')));
          if (s.cat.rotate || sev === H) fx.push(t.fixes.history);
          push(d, s, sev === L ? L : H, t.status.committed, fx);
          addLines('gitignore', ignoreLines(s.cat, s.p, 'git'));
          const ig = gitPats.length ? gitIgnored(s.p, gitPats) : null;
          if (ig && ig.ignored) res.traps.push({ id: 'tracked-ignored', sev: H, title: t.traps.trackedIgnored.title, detail: t.traps.trackedIgnored.detail(s.p, ig.by.text), path: s.p });
        } else {
          const ig = gitIgnored(s.p, gitPats);
          if (ig.ignored) continue;
          const fx = [t.fixes.gitignore(ignoreLines(s.cat, s.p, 'git'))];
          if (s.cat.id === 'registry') fx.unshift(t.fixes.checkRegistry);
          push(d, s, sev, t.status.wouldCommit, fx);
          addLines('gitignore', ignoreLines(s.cat, s.p, 'git'));
        }
      }
      d.rules = has('gitignore') ? '.gitignore (' + gitPats.length + ')' : t.words.none;
      res.destinations.push(d);
    }

    // npm
    if (source === 'npm' || ((source === 'folder' || source === 'git') && (has('packageJson') || has('npmignore')))) {
      const d = mk('npm');
      let packed;
      if (source === 'npm') { packed = new Set(files); d.rules = 'npm pack --dry-run'; }
      else {
        const sim = npmPacked(files, { packageJson: pj, npmignore: has('npmignore') ? input.npmignore : null, gitignore: has('gitignore') ? input.gitignore : null });
        packed = sim.packed; d.rules = sim.mode === 'files' ? 'package.json "files"' : sim.mode === 'none' ? t.words.none : '.' + sim.mode;
        if (sim.mode === 'npmignore' && gitPats.length) {
          const leaked = secrets.filter((s) => packed.has(s.p) && gitIgnored(s.p, gitPats).ignored);
          if (leaked.length) res.traps.push({ id: 'npmignore-replaced', sev: H, title: t.traps.npmReplaced.title, detail: t.traps.npmReplaced.detail(leaked.length), paths: leaked.map((s) => s.p) });
        }
      }
      for (const s of secrets) {
        if (!packed.has(s.p)) continue;
        const fx = [];
        if (s.cat.id === 'registry') fx.push(t.fixes.checkRegistry);
        else if (s.cat.rotate) fx.push(t.fixes.npmPublished);
        fx.push(t.fixes.npmignore(ignoreLines(s.cat, s.p, 'git')));
        const sevN = s.cat.sev.npm || (source === 'npm' ? M : null);
        push(d, s, sevN, t.status.published, fx);
        if (sevN) addLines('npmignore', ignoreLines(s.cat, s.p, 'git'));
      }
      res.destinations.push(d);
    }

    // Docker
    if ((source === 'folder' || source === 'git') && (has('dockerignore') || has('dockerfile'))) {
      const d = mk('docker');
      const dPats = compileDockerignore(input.dockerignore);
      const df = parseDockerfile(input.dockerfile);
      d.rules = has('dockerignore') ? '.dockerignore (' + dPats.length + ')' : t.words.none;
      for (const s of secrets) {
        const ex = dockerExcluded(s.p, dPats);
        if (ex.excluded) continue;
        const sev0 = s.cat.sev.docker;
        if (!sev0) continue;
        let status; let sev = sev0; let line = null;
        if (has('dockerfile')) {
          const c = copiedIntoImage(s.p, df);
          if (c) { status = t.status.image; line = c.line; }
          else { status = t.status.context; sev = L; }
        } else status = t.status.contextNoDf;
        const fx = [t.fixes.dockerignore(ignoreLines(s.cat, s.p, 'docker'))];
        if (s.cat.id === 'env' && status === t.status.image) fx.push(t.fixes.dockerSecret);
        push(d, s, sev, status, fx, line ? { line } : null);
        addLines('dockerignore', ignoreLines(s.cat, s.p, 'docker'));
        // Shallow pattern trap: a slash-less pattern that would have matched the basename at the root.
        for (const pat of dPats) {
          if (pat.neg || pat.hasSlash || !s.p.includes('/')) continue;
          if (pat.re.test(base(s.p)) && !res.traps.some((x) => x.id === 'docker-shallow' && x.path === s.p)) {
            res.traps.push({ id: 'docker-shallow', sev: H, title: t.traps.dockerShallow.title, detail: t.traps.dockerShallow.detail(pat.text, s.p), path: s.p, fix: '**/' + pat.raw });
          }
        }
      }
      if (has('dockerfile')) {
        const copyAll = df.copies.find((c) => c.srcs.some((x) => x === '.' || x === '*'));
        if (copyAll && !has('dockerignore')) res.traps.push({ id: 'no-dockerignore', sev: secrets.length ? H : M, title: t.traps.noDockerignore.title, detail: t.traps.noDockerignore.detail(copyAll.line) });
        for (const r of df.rmSecrets) {
          const copied = df.copies.some((c) => c.line < r.line);
          if (copied) res.traps.push({ id: 'rm-after-copy', sev: H, title: t.traps.rmAfterCopy.title, detail: t.traps.rmAfterCopy.detail(r.line, r.path), fix: t.fixes.dockerSecret });
        }
        for (const a of df.argsEnv) res.traps.push({ id: 'arg-env-secret', sev: a.kind === 'ENV' ? H : M, title: t.traps.argEnv.title + a.kind, detail: t.traps.argEnv.detail(a.kind, a.name, a.line), fix: t.fixes.dockerSecret });
      }
      res.destinations.push(d);
    }

    // Web
    if (source === 'web') {
      const d = mk('web');
      const rules = parseWebRules(input.webconf);
      d.rules = has('webconf') ? rules.length + ' ' + t.words.rule + (rules.length === 1 ? '' : 's') : t.words.none;
      for (const s of secrets) {
        const sev = s.cat.sev.web;
        if (!sev) continue;
        const b = webBlocked(s.p, rules);
        if (b) push(d, s, sev === L ? L : M, t.status.blocked, [t.fixes.webBlocked], { blockedBy: b.text });
        else push(d, s, sev, t.status.served, s.cat.rotate ? [t.fixes.web] : [t.fixes.web.split('. ').slice(0, 1).join('') + '.'].map((x) => x));
      }
      res.destinations.push(d);
    }

    const rank = { high: 3, medium: 2, low: 1 };
    for (const d of res.destinations) {
      d.items.sort((a, b) => rank[b.sev] - rank[a.sev] || a.path.localeCompare(b.path));
      const top = d.items.reduce((m, i) => Math.max(m, rank[i.sev]), 0);
      d.verdict = top === 3 ? 'fix' : top === 2 ? 'check' : top === 1 ? 'check' : 'clean';
    }
    const topTrap = res.traps.reduce((m, x) => Math.max(m, rank[x.sev]), 0);
    const all = Math.max(topTrap, ...res.destinations.map((d) => (d.verdict === 'fix' ? 3 : d.verdict === 'check' ? 2 : 0)));
    res.verdict = all === 3 ? 'fix' : all >= 1 ? 'check' : 'clean';
    res.secretFiles = secrets.length;
    return res;
  }

  // ---------------------------------------------------------------- text report
  function wrap(s, width, indent) {
    const words = String(s).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    return lines.map((l, i) => (i ? indent : '') + l).join('\n');
  }
  function report(res) {
    const t = T[res.lang];
    const tag = { high: '[FIX]  ', medium: '[CHECK]', low: '[NOTE] ' };
    const out = [];
    out.push('Equipaje ' + res.version);
    out.push('');
    out.push('>> ' + t.verdict[res.verdict] + ' — ' + t.verdictText[res.verdict]);
    if (res.verdict === 'empty') return out.join('\n');
    out.push('');
    out.push(t.words.from + ': ' + t.sources[res.source] + ' · ' + res.files + ' ' + t.words.found + ' · ' + res.secretFiles + ' ' + t.words.secret);
    for (const x of res.traps) {
      out.push('');
      out.push(tag[x.sev] + ' ' + x.title);
      out.push('        ' + wrap(x.detail, 78, '        '));
      if (x.paths) out.push('        - ' + x.paths.join('\n        - '));
      if (x.fix) out.push('        → ' + wrap(x.fix, 76, '          '));
    }
    for (const d of res.destinations) {
      out.push('');
      out.push('== ' + d.title + '  (' + d.rules + ')');
      if (!d.items.length) { out.push('   ' + (res.lang === 'es' ? 'Nada secreto llega aquí.' : 'Nothing secret ends up here.')); continue; }
      for (const i of d.items) {
        out.push(tag[i.sev] + ' ' + i.path + (i.line ? (res.lang === 'es' ? '  (línea ' : '  (Dockerfile line ') + i.line + (res.lang === 'es' ? ' del Dockerfile)' : ')') : ''));
        out.push('        ' + wrap(i.what + ' — ' + i.status + '.', 78, '        '));
        if (i.blockedBy) out.push('        ' + (res.lang === 'es' ? 'regla: ' : 'rule: ') + i.blockedBy);
        for (const f of i.fixes) out.push('        → ' + wrap(f, 76, '          '));
      }
    }
    const fl = res.fixLines;
    if (fl.gitignore.length || fl.dockerignore.length || fl.npmignore.length) {
      out.push('');
      out.push('== ' + t.words.fixFiles);
      for (const k of ['gitignore', 'dockerignore', 'npmignore']) if (fl[k].length) { out.push('.' + k + ':'); for (const l of fl[k]) out.push('  ' + l); }
    }
    for (const n of res.notes) out.push('! ' + n);
    out.push('');
    out.push('== ' + t.words.limits);
    for (const l of t.limits) out.push('- ' + wrap(l, 78, '  '));
    return out.join('\n');
  }

  // ---------------------------------------------------------------- samples (invented)
  const SAMPLES = {
    folder: {
      source: 'folder',
      list: ['.dockerignore', '.env', '.env.example', '.gitignore', '.npmignore', '.vscode/sftp.json', 'Dockerfile', 'README.md', 'api/.env', 'api/server.js', 'backups/tienda-2026-11-01.sql', 'deploy/id_ed25519', 'deploy/id_ed25519.pub', 'firebase/tienda-demo-firebase-adminsdk-ab12c.json', 'package.json', 'public/index.html', 'src/app.js', 'src/cart.js'].join('\n'),
      gitignore: 'node_modules/\n.env\n*.log\n',
      dockerignore: 'node_modules\n.env\n.git\n',
      npmignore: 'test/\ndocs/\n',
      packageJson: '{ "name": "tienda-widget", "version": "1.2.0", "main": "src/app.js" }',
      dockerfile: 'FROM node:22-alpine\nWORKDIR /app\nARG STRIPE_SECRET_KEY\nCOPY . .\nRUN npm ci --omit=dev\nRUN rm .env\nCMD ["node", "api/server.js"]\n',
    },
    git: {
      source: 'git',
      list: ['.gitignore', '.env.production', 'README.md', 'composer.json', 'config/master.key', 'public/index.php', 'wp-config.php', 'wp-content/themes/tienda/style.css'].join('\n'),
      gitignore: '.env*\n!.env.example\nconfig/master.key\n',
    },
    npm: {
      source: 'npm',
      list: ['npm notice', 'npm notice 📦  tienda-widget@1.2.0', 'npm notice Tarball Contents', 'npm notice 1.1kB README.md', 'npm notice 412B .env', 'npm notice 2.3kB dist/index.js', 'npm notice 96B .npmrc', 'npm notice 18.4MB backups/site-backup.zip', 'npm notice 640B package.json', 'npm notice Tarball Details', 'npm notice name: tienda-widget'].join('\n'),
    },
    web: {
      source: 'web',
      list: ['/home/tienda/public_html/.env', '/home/tienda/public_html/.htaccess', '/home/tienda/public_html/index.php', '/home/tienda/public_html/wp-config.php', '/home/tienda/public_html/wp-config.php.bak', '/home/tienda/public_html/wp-content/debug.log', '/home/tienda/public_html/wp-content/ai1wm-backups/tienda-20261101.wpress', '/home/tienda/public_html/respaldo-sitio.zip', '/home/tienda/public_html/.git/config', '/home/tienda/public_html/.git/HEAD'].join('\n'),
      webconf: '<FilesMatch "^\\.">\n  Require all denied\n</FilesMatch>\n',
    },
  };

  return { VERSION, T, CATALOG, BY_ID, SAMPLES, analyze, report, classify, parseList, compileGitignore, gitIgnored, compileDockerignore, dockerExcluded, npmPacked, parseDockerfile, parseWebRules, webBlocked, globToRe };
});

// ---------------------------------------------------------------- CLI
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const E = module.exports;
  const argv = process.argv.slice(2);
  const usage = 'Usage: node equipaje.js <file-list.txt | -> [--from auto|git|folder|npm|web] [--gitignore F] [--dockerignore F] [--npmignore F] [--package F] [--dockerfile F] [--webconf F] [--lang en|es] [--json] [--fail-on high|medium|never]\n       node equipaje.js --dir <folder>      (reads the names and the ignore files in that folder; never file contents)\n       node equipaje.js --demo folder|git|npm|web';
  const opt = { from: 'auto', lang: 'en', failOn: 'high' };
  const input = {};
  let listFile = null; let demo = null; let dir = null; let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = () => { if (i + 1 >= argv.length) { console.error(usage); process.exit(2); } return argv[++i]; };
    if (a === '--from') opt.from = v();
    else if (a === '--lang') opt.lang = v();
    else if (a === '--json') json = true;
    else if (a === '--fail-on') opt.failOn = v();
    else if (a === '--demo') demo = v();
    else if (a === '--dir') dir = v();
    else if (['--gitignore', '--dockerignore', '--npmignore', '--package', '--dockerfile', '--webconf'].includes(a)) {
      const key = { '--gitignore': 'gitignore', '--dockerignore': 'dockerignore', '--npmignore': 'npmignore', '--package': 'packageJson', '--dockerfile': 'dockerfile', '--webconf': 'webconf' }[a];
      const f = v(); try { input[key] = fs.readFileSync(f, 'utf8'); } catch (e) { console.error('Cannot read ' + f + ': ' + e.message); process.exit(2); }
    } else if (a === '-h' || a === '--help') { console.log(usage); process.exit(0); }
    else if (!listFile) listFile = a;
    else { console.error(usage); process.exit(2); }
  }
  if (!['auto', 'git', 'folder', 'npm', 'web'].includes(opt.from) || !['high', 'medium', 'never'].includes(opt.failOn)) { console.error(usage); process.exit(2); }
  if (demo) {
    const s = E.SAMPLES[demo];
    if (!s) { console.error('Demos: ' + Object.keys(E.SAMPLES).join(', ')); process.exit(2); }
    Object.assign(input, s); opt.from = s.source;
  } else if (dir) {
    const rootDir = path.resolve(dir); const names = [];
    const skip = new Set(['node_modules', '.git']);
    (function walk(d, rel) {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of ents) {
        const r = rel ? rel + '/' + e.name : e.name;
        if (e.isDirectory()) { if (!skip.has(e.name)) walk(path.join(d, e.name), r); }
        else names.push(r);
        if (names.length > 50000) return;
      }
    })(rootDir, '');
    input.list = names.join('\n'); opt.from = 'folder';
    const rd = (n) => { try { return fs.readFileSync(path.join(rootDir, n), 'utf8'); } catch (_) { return undefined; } };
    for (const [k, n] of [['gitignore', '.gitignore'], ['dockerignore', '.dockerignore'], ['npmignore', '.npmignore'], ['packageJson', 'package.json'], ['dockerfile', 'Dockerfile']]) if (input[k] == null) { const c = rd(n); if (c != null) input[k] = c; }
  } else {
    if (!listFile) { console.error(usage); process.exit(2); }
    try { input.list = fs.readFileSync(listFile === '-' ? 0 : listFile, 'utf8'); } catch (e) { console.error('Cannot read ' + listFile + ': ' + e.message); process.exit(2); }
  }
  if (!demo) input.source = opt.from;
  const res = E.analyze(input, { lang: opt.lang });
  console.log(json ? JSON.stringify(res, null, 2) : E.report(res));
  const worst = res.verdict === 'fix' ? 'high' : res.verdict === 'check' ? 'medium' : 'none';
  const fail = opt.failOn === 'never' ? false : opt.failOn === 'high' ? worst === 'high' : worst === 'high' || worst === 'medium';
  process.exit(res.verdict === 'empty' ? 2 : fail ? 1 : 0);
}
