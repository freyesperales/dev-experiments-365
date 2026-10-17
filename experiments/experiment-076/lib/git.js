'use strict';
const { execFileSync, spawnSync } = require('child_process');

function makeGit(cwd) {
  const run = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).replace(/\n$/, '');
  // Like run, but returns null on non-zero exit instead of throwing.
  const tryRun = (args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    return r.status === 0 ? r.stdout.replace(/\n$/, '') : null;
  };
  const ok = (args) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0;
  return { run, tryRun, ok };
}

module.exports = { makeGit };
