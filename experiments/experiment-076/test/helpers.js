'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacklens-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();
  let n = 0;
  const commit = (msg, file) => { fs.writeFileSync(path.join(dir, file || `f${++n}.txt`), msg + '\n' + n + '\n'); g('add', '-A'); g('commit', '-q', '-m', msg); };
  g('init', '-q', '-b', 'main');
  g('config', 'core.logAllRefUpdates', 'true');
  commit('root');
  return { dir, g, commit };
}
module.exports = { repo };
