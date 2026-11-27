'use strict';
// Every input is an invented file list. Nothing is read from a network; the --dir test
// creates empty files in a temporary folder and deletes them afterwards.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const E = require('../equipaje.js');

const CLI = path.join(__dirname, '..', 'equipaje.js');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
const gi = (rules, p) => E.gitIgnored(p, E.compileGitignore(rules)).ignored;
const di = (rules, p) => E.dockerExcluded(p, E.compileDockerignore(rules)).excluded;
const paths = (res, dest) => (res.destinations.find((d) => d.id === dest) || { items: [] }).items.map((i) => i.path);
const traps = (res) => res.traps.map((t) => t.id);

test('gitignore: a name without a slash matches at any depth (git-scm.com/docs/gitignore)', () => {
  assert.ok(gi('.env', '.env'));
  assert.ok(gi('.env', 'api/.env'));
  assert.ok(gi('*.pem', 'certs/deep/key.pem'));
  assert.ok(!gi('/.env', 'api/.env'), 'a leading slash anchors to the root');
  assert.ok(gi('/.env', '.env'));
  assert.ok(!gi('config/master.key', 'app/config/master.key'), 'a middle slash anchors too');
});

test('gitignore: directories, negation, and no re-include under an excluded parent', () => {
  assert.ok(gi('backups/', 'backups/db.sql'));
  assert.ok(!gi('backups/', 'backups'), 'a trailing slash only matches directories');
  assert.ok(!gi('.env*\n!.env.example', '.env.example'));
  assert.ok(gi('.env*\n!.env.example', '.env.local'));
  assert.ok(gi('secret/\n!secret/keep.txt', 'secret/keep.txt'), 'cannot re-include a file if a parent directory is excluded');
  assert.ok(gi('**/logs', 'a/b/logs/x.log'));
  assert.ok(gi('abc/**', 'abc/x/y.txt'));
  assert.ok(gi('a/**/b', 'a/b') && gi('a/**/b', 'a/x/y/b'));
  assert.ok(gi('\\#notes', '#notes'), 'an escaped # is a literal');
  assert.ok(!gi('# comment', '# comment'));
});

test('dockerignore: patterns are paths from the root (docs.docker.com/build/concepts/context)', () => {
  assert.ok(di('.env', '.env'));
  assert.ok(!di('.env', 'api/.env'), '".env" does not reach subfolders, unlike .gitignore');
  assert.ok(di('**/.env', 'api/.env'));
  assert.ok(di('**/.env', '.env'), '** matches zero directories');
  assert.ok(!di('*.md', 'docs/a.md') && di('*.md', 'a.md'), 'the docs example: *.md only at the top');
  assert.ok(!di('*.md\n!README.md', 'README.md'), 'the last matching line wins');
  assert.ok(di('.git', '.git/config'), 'a pattern that matches a parent excludes what is inside');
  assert.ok(di('/foo/bar/', 'foo/bar'), 'leading and trailing slashes are disregarded');
  assert.ok(di('*/temp*', 'somedir/temporary.txt') && !di('*/temp*', 'temporary.txt'));
});

test('classify: secret-bearing names, and the look-alikes that are fine', () => {
  const k = (p) => (E.classify(p) || { id: null }).id;
  assert.strictEqual(k('.env'), 'env');
  assert.strictEqual(k('api/.env.production'), 'env');
  assert.strictEqual(k('prod.env'), 'env');
  assert.strictEqual(k('.env.example'), null);
  assert.strictEqual(k('.env.sample'), null);
  assert.strictEqual(k('deploy/id_ed25519'), 'ssh-key');
  assert.strictEqual(k('deploy/id_ed25519.pub'), null);
  assert.strictEqual(k('ssl/privkey.pem'), 'private-key');
  assert.strictEqual(k('ssl/fullchain.pem'), null);
  assert.strictEqual(k('config/master.key'), 'cms-config');
  assert.strictEqual(k('wp-config.php'), 'cms-config');
  assert.strictEqual(k('wp-config.php.bak'), 'cms-config-backup');
  assert.strictEqual(k('wp-config-old.php'), 'cms-config-backup');
  assert.strictEqual(k('.vscode/sftp.json'), 'ftp');
  assert.strictEqual(k('tienda-firebase-adminsdk-ab12c.json'), 'cloud');
  assert.strictEqual(k('wp-content/ai1wm-backups/site.wpress'), 'dump');
  assert.strictEqual(k('respaldo-sitio.zip'), 'archive');
  assert.strictEqual(k('node_modules/x/dist/site.zip'), null);
  assert.strictEqual(k('.git/config'), 'git-dir');
  assert.strictEqual(k('src/app.js'), null);
  assert.strictEqual(k('package.json'), null);
});

test('data: every catalog entry has both languages and a severity for each destination', () => {
  for (const c of E.CATALOG) {
    if (c.ok) continue;
    assert.ok(c.en && c.es, c.id);
    for (const d of ['git', 'npm', 'docker', 'web']) assert.ok([null, 'high', 'medium', 'low'].includes(c.sev[d]), c.id + ' ' + d);
  }
  assert.deepStrictEqual(Object.keys(E.T.en.fixes).sort(), Object.keys(E.T.es.fixes).sort());
  assert.deepStrictEqual(Object.keys(E.T.en.traps).sort(), Object.keys(E.T.es.traps).sort());
  assert.strictEqual(E.T.en.limits.length, E.T.es.limits.length);
});

test('parseList: npm pack output (text and --json), absolute and Windows paths, ls -la, git status', () => {
  const npm = E.parseList('npm notice\nnpm notice 📦  x@1.0.0\nnpm notice Tarball Contents\nnpm notice 1.1kB README.md\nnpm notice 412B .env\nnpm notice Tarball Details\nnpm notice name: x');
  assert.strictEqual(npm.format, 'npm');
  assert.deepStrictEqual(npm.files, ['README.md', '.env']);
  const js = E.parseList(JSON.stringify([{ name: 'x', files: [{ path: 'package.json', size: 1 }, { path: '.npmrc', size: 2 }] }]));
  assert.strictEqual(js.format, 'npm-json');
  assert.deepStrictEqual(js.files, ['package.json', '.npmrc']);
  assert.deepStrictEqual(E.parseList('/home/u/public_html/.env\n/home/u/public_html/wp/x.php').files, ['.env', 'wp/x.php']);
  assert.deepStrictEqual(E.parseList('C:\\sitio\\.env\r\nC:\\sitio\\api\\.env\r\n').files, ['.env', 'api/.env']);
  const ls = E.parseList('total 12\ndrwxr-xr-x  2 u u 4096 Nov 27 10:00 .\n-rw-r--r--  1 u u  220 Nov 27 10:00 .env\ndrwxr-xr-x  8 u u 4096 Nov 27 10:00 .git\n-rw-r--r--  1 u u 1220 Nov 27 10:00 index.php');
  assert.deepStrictEqual(ls.files, ['.env', 'index.php'], 'directories are not files');
  assert.deepStrictEqual(E.parseList('?? .env\n M src/app.js').files, ['.env', 'src/app.js']);
  assert.deepStrictEqual(E.parseList('./a/.env\n./a/.env\n').files, ['a/.env'], 'deduplicated, ./ removed');
});

test('npm: .npmignore replaces .gitignore, and the trap says so (docs.npmjs.com package.json "files")', () => {
  const res = E.analyze({ source: 'folder', list: '.env\napi/.env\nindex.js\npackage.json', gitignore: '.env\n', npmignore: 'test/\n', packageJson: '{"name":"x","main":"index.js"}' });
  assert.deepStrictEqual(paths(res, 'npm').sort(), ['.env', 'api/.env']);
  assert.ok(traps(res).includes('npmignore-replaced'));
  assert.deepStrictEqual(paths(res, 'git'), [], 'Git itself ignores both');
  const noNpmignore = E.analyze({ source: 'folder', list: '.env\nindex.js', gitignore: '.env\n', packageJson: '{"name":"x"}' });
  assert.deepStrictEqual(paths(noNpmignore, 'npm'), [], 'without .npmignore npm uses .gitignore');
});

test('npm: the files field, always-ignored .npmrc and always-included README/main', () => {
  const sim = E.npmPacked(['dist/index.js', 'dist/.env', 'src/a.js', 'README.md', 'LICENSE', '.npmrc', 'bin/cli.js', 'package.json', 'package-lock.json'], { packageJson: { files: ['dist'], bin: { x: './bin/cli.js' } } });
  assert.strictEqual(sim.mode, 'files');
  assert.deepStrictEqual(Array.from(sim.packed).sort(), ['LICENSE', 'README.md', 'bin/cli.js', 'dist/.env', 'dist/index.js', 'package.json']);
  const all = E.npmPacked(['.npmrc', 'sub/.npmrc', 'a.js'], {});
  assert.deepStrictEqual(Array.from(all.packed), ['a.js'], '.npmrc is never packed');
  const glob = E.npmPacked(['lib/a.js', 'lib/a.test.js', 'x.js'], { packageJson: { files: ['lib/*.js'] } });
  assert.deepStrictEqual(Array.from(glob.packed).sort(), ['lib/a.js', 'lib/a.test.js']);
});

test('npm pack listing: .npmrc that still shows up is a "check", archives are medium', () => {
  const res = E.analyze({ list: E.SAMPLES.npm.list });
  assert.strictEqual(res.source, 'npm', 'npm notice lines are detected');
  assert.deepStrictEqual(paths(res, 'npm'), ['.env', '.npmrc', 'backups/site-backup.zip']);
  assert.deepStrictEqual(res.destinations[0].items.map((i) => i.sev), ['high', 'medium', 'medium']);
  assert.strictEqual(res.verdict, 'fix');
});

test('docker: shallow .dockerignore line, COPY . ., rm after COPY, ARG with a secret name', () => {
  const res = E.analyze(E.SAMPLES.folder);
  const d = res.destinations.find((x) => x.id === 'docker');
  assert.ok(d.items.some((i) => i.path === 'api/.env' && i.line === 4));
  assert.ok(!d.items.some((i) => i.path === '.env'), 'the root .env is excluded by ".env"');
  const shallow = res.traps.find((t) => t.id === 'docker-shallow');
  assert.strictEqual(shallow.path, 'api/.env');
  assert.strictEqual(shallow.fix, '**/.env');
  assert.ok(traps(res).includes('rm-after-copy'));
  assert.ok(res.traps.some((t) => t.id === 'arg-env-secret' && /STRIPE_SECRET_KEY/.test(t.detail)));
  assert.ok(res.fixLines.dockerignore.includes('**/.env'));
});

test('docker: no .dockerignore, selective COPY, COPY --from and exec-form COPY', () => {
  const list = '.env\nsrc/app.js\npackage.json';
  const all = E.analyze({ source: 'folder', list, dockerfile: 'FROM node:22\nCOPY . /app\n' });
  assert.ok(traps(all).includes('no-dockerignore'));
  assert.strictEqual(all.destinations.find((d) => d.id === 'docker').items[0].sev, 'high');
  const sel = E.analyze({ source: 'folder', list, dockerfile: 'FROM node:22\nCOPY package.json ./\nCOPY src/ ./src/\nCOPY --from=build /out /app\n' });
  const it = sel.destinations.find((d) => d.id === 'docker').items[0];
  assert.strictEqual(it.path, '.env');
  assert.strictEqual(it.sev, 'low', 'sent to the builder but not copied');
  assert.ok(!traps(sel).includes('no-dockerignore'));
  const exec = E.parseDockerfile('COPY ["src", "/app/src"]\nENV DB_PASSWORD=x API_URL=y\nARG VERSION\n');
  assert.deepStrictEqual(exec.copies[0].srcs, ['src']);
  assert.deepStrictEqual(exec.argsEnv.map((a) => a.name), ['DB_PASSWORD']);
});

test('git: tracked secrets are "already committed", and ignoring them later does not untrack them', () => {
  const res = E.analyze(E.SAMPLES.git);
  assert.deepStrictEqual(paths(res, 'git').sort(), ['.env.production', 'config/master.key', 'wp-config.php']);
  assert.ok(res.destinations[0].items.every((i) => i.sev === 'high'));
  assert.strictEqual(res.traps.filter((t) => t.id === 'tracked-ignored').length, 2);
  assert.ok(res.destinations[0].items[0].fixes.some((f) => f.includes('git rm --cached')));
});

test('web: a FilesMatch dotfile rule blocks /.env but not files inside .git/; nginx location covers .git', () => {
  const res = E.analyze(E.SAMPLES.web);
  const items = res.destinations[0].items;
  const env = items.find((i) => i.path === '.env');
  assert.strictEqual(env.sev, 'medium');
  assert.ok(env.blockedBy);
  const git = items.find((i) => i.path === '.git/');
  assert.strictEqual(git.sev, 'high', 'Apache FilesMatch sees "config", not ".git"');
  assert.ok(!items.some((i) => i.path === 'wp-config.php'), 'wp-config.php runs as PHP on the web: normal there');
  assert.ok(items.some((i) => i.path === 'wp-config.php.bak' && i.sev === 'high'));
  const ng = E.analyze({ source: 'web', list: '.git/HEAD\n.env\nbackup.sql', webconf: 'location ~ /\\. {\n  deny all;\n}\n' });
  assert.ok(ng.destinations[0].items.filter((i) => i.blockedBy).length === 2);
  assert.ok(ng.destinations[0].items.some((i) => i.path === 'backup.sql' && !i.blockedBy));
});

test('verdicts: clean list, empty list, Spanish output', () => {
  const clean = E.analyze({ source: 'folder', list: 'src/app.js\nREADME.md\n.env.example', gitignore: '.env' });
  assert.strictEqual(clean.verdict, 'clean');
  assert.strictEqual(E.analyze({ list: '   \n' }).verdict, 'empty');
  const es = E.report(E.analyze(E.SAMPLES.folder, { lang: 'es' }));
  assert.match(es, /ARREGLA ESTO PRIMERO/);
  assert.match(es, /Tu \.npmignore reemplazó a tu \.gitignore/);
  assert.doesNotMatch(es, /\bvos\b|tenés|podés/);
});

test('CLI: demos, exit codes, stdin, --json and --dir', () => {
  const d = run(['--demo', 'folder']);
  assert.strictEqual(d.status, 1);
  assert.match(d.stdout, /FIX THIS FIRST/);
  assert.strictEqual(run(['-', '--from', 'folder'], 'src/app.js\n').status, 0);
  assert.strictEqual(run(['-'], '\n').status, 2);
  assert.strictEqual(run(['--demo', 'nope']).status, 2);
  assert.strictEqual(run(['--demo', 'web', '--fail-on', 'never']).status, 0);
  const j = JSON.parse(run(['--demo', 'npm', '--json']).stdout);
  assert.strictEqual(j.source, 'npm');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'equipaje-'));
  try {
    fs.mkdirSync(path.join(tmp, 'api'));
    for (const f of ['api/.env', '.env', 'index.js']) fs.writeFileSync(path.join(tmp, f), '');
    fs.writeFileSync(path.join(tmp, '.gitignore'), '.env\n');
    fs.writeFileSync(path.join(tmp, '.dockerignore'), '.env\n');
    const r = run(['--dir', tmp, '--json']);
    const res = JSON.parse(r.stdout);
    assert.deepStrictEqual(paths(res, 'git'), [], '.gitignore covers both');
    assert.deepStrictEqual(paths(res, 'docker'), ['api/.env']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
