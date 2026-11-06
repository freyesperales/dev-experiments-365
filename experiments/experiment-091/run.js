#!/usr/bin/env node
'use strict';
// LEDGERLEAK runner. Binds to 127.0.0.1 only. FOR TRAINING — never deploy.
const { createApp, createInternalService } = require('./lab/app');
const hints = require('./hints.json');
const args = process.argv.slice(2);

if (args[0] === 'list') {
  hints.forEach((h) => console.log(`${h.n}. ${h.title} — ${h.goal}`));
} else if (args[0] === 'hint') {
  const h = hints.find((x) => String(x.n) === args[1]);
  if (!h) { console.error('usage: node run.js hint <1-4> [level 1-3]'); process.exit(2); }
  const lvl = Math.min(3, Math.max(1, Number(args[2]) || 1));
  console.log(`Hint ${lvl}/3 for "${h.title}":\n${h.hints[lvl - 1]}`);
  if (lvl < 3) console.log(`\n(next: node run.js hint ${h.n} ${lvl + 1})`);
} else {
  const patched = args.includes('--fixed') ? ['jwt', 'bola', 'ssrf', 'massassign'] : [];
  const port = Number(process.env.PORT) || 7091;
  const iport = Number(process.env.INTERNAL_PORT) || 7092;
  createInternalService().listen(iport, '127.0.0.1');
  createApp({ patched }).listen(port, '127.0.0.1', () => {
    console.log(`LEDGERLEAK ${patched.length ? 'FIXED' : 'VULNERABLE'} on http://127.0.0.1:${port}  (internal service on 127.0.0.1:${iport})`);
    console.log('Users: alice/alice-pw, bob/bob-pw.  FOR TRAINING — local only, never deploy.');
    console.log('Try: node run.js list');
  });
}
