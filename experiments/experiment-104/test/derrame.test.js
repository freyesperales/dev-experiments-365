'use strict';
// Every key in these tests is fake and assembled at run time (see fakeKeys in derrame.js),
// so the repository never holds a string in a real key format.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const D = require('../derrame.js');

const K = D._fakeKeys();
const S = D.samples();
const CLI = path.join(__dirname, '..', 'derrame.js');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { input, encoding: 'utf8' });
const rules = (r) => r.findings.map((f) => f.rule);
const byName = (r, n) => r.findings.find((f) => f.name === n);

test('env sample: finds each provider and says act now', () => {
  const r = D.analyze(S.env);
  assert.strictEqual(r.kind, 'dotenv');
  assert.strictEqual(r.verdict, 'act');
  for (const id of ['stripe-live-secret-key', 'stripe-publishable-key', 'openai-api-key', 'google-api-key', 'sendgrid-api-key', 'database-url', 'aws-access-key-id', 'aws-secret-access-key', 'supabase-legacy-service-role-jwt', 'named-secret']) {
    assert.ok(rules(r).includes(id), 'missing ' + id);
  }
  assert.strictEqual(r.placeholdersSkipped, 1);
});

test('raw key values never appear in text, JSON or plan output', () => {
  const secrets = [K.stripeLive, K.stripePub, K.github, K.awsId, K.awsSecret, K.google, K.sendgrid, K.openai, K.shopify, K.dbPass, K.jwtService, K.salt(1)];
  for (const name of Object.keys(S)) {
    const r = D.analyze(S[name]);
    const outputs = [JSON.stringify(r), D.render(r, 'en'), D.render(r, 'es'), D.planText(r, 'es').join('\n')];
    for (const out of outputs) for (const s of secrets) assert.ok(!out.includes(s), 'leaked a raw value in output of ' + name);
  }
});

test('masking keeps at most a quarter of the value', () => {
  const m = D._mask('abcdefghijklmnopqrstuvwxyz012345', 12);
  assert.ok(m.startsWith('abcdefgh…'));
  assert.ok(m.endsWith('(32)'));
  assert.strictEqual(D._mask('short', 4), 's… (5)');
});

test('a publishable Stripe key is public by design, also under NEXT_PUBLIC_', () => {
  const r = D.analyze('NEXT_PUBLIC_STRIPE_KEY=' + K.stripePub);
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].severity, 'info');
  assert.deepStrictEqual(r.findings[0].notes, ['publicByDesign', 'publicPrefixOk']);
  assert.strictEqual(r.verdict, 'clear');
  assert.strictEqual(r.plan.needed, false);
});

test('a secret under NEXT_PUBLIC_, VITE_ or REACT_APP_ is shipped to the browser', () => {
  for (const prefix of ['NEXT_PUBLIC_', 'VITE_', 'REACT_APP_']) {
    const r = D.analyze(prefix + 'STRIPE=' + K.stripeLive + '\n' + prefix + 'API_SECRET=' + D._fake(20, null, 77));
    assert.strictEqual(r.findings.length, 2);
    for (const f of r.findings) {
      assert.strictEqual(f.severity, 'high');
      assert.ok(f.notes.includes('shippedToBrowser'));
      assert.strictEqual(f.publicPrefix, prefix);
    }
  }
  const t = D.analyze('VITE_STRIPE=' + K.stripeTest);
  assert.strictEqual(t.findings[0].severity, 'high', 'even a test key should not ship in the bundle');
  const server = D.analyze('PUBLIC_SITE_NAME=shop\nSTRIPE=' + K.stripeLive);
  assert.ok(!server.findings[0].notes.includes('shippedToBrowser'));
});

test('placeholders and example files produce no findings', () => {
  const r = D.analyze(S.clean);
  assert.strictEqual(r.findings.length, 0);
  assert.strictEqual(r.verdict, 'clear');
  assert.ok(r.placeholdersSkipped >= 5);
  for (const v of ['', 'changeme', 'your_key_here', '<token>', '${TOKEN}', '{{ secret }}', 'xxxxxxxx', '********', 'process.env.TOKEN', '$TOKEN', 'tu_clave_aqui']) {
    assert.ok(D._isPlaceholder(v), 'should be a placeholder: ' + v);
  }
  assert.ok(!D._isPlaceholder('N7r!kQ2z#Lp'));
});

test('fixture files are clean through the CLI (exit 0)', () => {
  for (const f of ['clean.env.example', 'docker-compose.yml']) {
    const p = run([path.join(__dirname, '..', 'fixtures', f)]);
    assert.strictEqual(p.status, 0, f + ': ' + p.stdout);
    assert.match(p.stdout, /No keys found/);
  }
});

test('git diff: a removed line is still in the history', () => {
  const r = D.analyze(S.diff);
  assert.strictEqual(r.kind, 'diff');
  const gh = r.findings.find((f) => f.rule === 'github-pat');
  assert.strictEqual(gh.diff, 'removed');
  assert.ok(gh.notes.includes('removedStillInHistory'));
  assert.strictEqual(gh.line, 7);
  const added = D.analyze('diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n@@ -0,0 +1 @@\n+TOKEN=' + K.github);
  assert.strictEqual(added.findings[0].diff, 'added');
  assert.ok(!added.findings[0].notes.includes('removedStillInHistory'));
  assert.strictEqual(added.findings[0].name, 'TOKEN');
});

test('wp-config: database password and salts, placeholder salt ignored', () => {
  const r = D.analyze(S.wpconfig);
  assert.strictEqual(r.kind, 'wp-config');
  assert.strictEqual(byName(r, 'DB_PASSWORD').provider, 'wordpress_db');
  assert.strictEqual(r.findings.filter((f) => f.rule === 'wordpress-salt').length, 4);
  assert.ok(!byName(r, 'AUTH_SALT'), 'the stock placeholder phrase is not a leak');
  assert.ok(!byName(r, 'DB_NAME') && !byName(r, 'DB_USER') && !byName(r, 'WP_DEBUG'));
  assert.strictEqual(byName(r, 'WPMS_SMTP_PASS').provider, 'sendgrid');
  assert.deepStrictEqual(r.plan.providers.map((p) => p.id), ['wordpress_db', 'wordpress_salts', 'sendgrid']);
});

test('JWT: service_role is secret, anon is public, expired is info, garbage is ignored', () => {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sig = D._fake(43, null, 5);
  const mk = (payload) => b({ alg: 'HS256', typ: 'JWT' }) + '.' + b(payload) + '.' + sig;
  const now = '2026-11-20T00:00:00Z';
  const service = D.analyze('KEY=' + mk({ iss: 'supabase', role: 'service_role', exp: 2015000000 }), { now });
  assert.strictEqual(service.findings[0].provider, 'supabase');
  assert.strictEqual(service.findings[0].severity, 'high');
  const anon = D.analyze('KEY=' + mk({ iss: 'supabase', role: 'anon', exp: 2015000000 }), { now });
  assert.strictEqual(anon.findings[0].severity, 'info');
  assert.ok(anon.findings[0].notes.includes('supabaseAnon'));
  const expired = D.analyze('SESSION=' + mk({ sub: 'user-000001', exp: 1600000000 }), { now });
  assert.strictEqual(expired.findings[0].severity, 'info');
  assert.strictEqual(expired.findings[0].expires, '2020-09-13');
  const live = D.analyze('SESSION=' + mk({ sub: 'user-000001' }), { now });
  assert.strictEqual(live.findings[0].severity, 'high');
  assert.ok(live.findings[0].notes.includes('jwtNoExp'));
  const garbage = D.analyze('X=eyAAAAAAAAAAAAAAAAAAAA.eyBBBBBBBBBBBBBBBBBBBB.CCCCCCCCCCCCCCCC');
  assert.strictEqual(garbage.findings.length, 0);
});

test('AWS: key id plus secret by name are one provider; temporary keys are low', () => {
  const r = D.analyze('aws_access_key_id = ' + K.awsId + '\naws_secret_access_key = ' + K.awsSecret);
  assert.deepStrictEqual(rules(r), ['aws-access-key-id', 'aws-secret-access-key']);
  assert.strictEqual(r.plan.providers.length, 1);
  assert.strictEqual(r.plan.providers[0].keys.length, 2);
  const tmp = D.analyze('AWS_ACCESS_KEY_ID=' + 'AS' + 'IA' + D._fake(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', 3));
  assert.strictEqual(tmp.findings[0].severity, 'low');
  assert.strictEqual(tmp.verdict, 'minor');
});

test('Stripe test key is low, Google key is medium (restrict), restricted live key is high', () => {
  assert.strictEqual(D.analyze('K=' + K.stripeTest).findings[0].severity, 'low');
  assert.strictEqual(D.analyze('K=' + K.google).findings[0].severity, 'medium');
  assert.strictEqual(D.analyze('K=' + K.google).findings[0].level, 'restrict');
  assert.strictEqual(D.analyze('K=' + 'rk' + '_live_' + D._fake(24, null, 9)).findings[0].rule, 'stripe-live-secret-key');
});

test('other providers by format', () => {
  const cases = {
    'anthropic-api-key': K.anthropic, 'slack-token': K.slack, 'supabase-secret-key': K.supabaseSecret,
    'supabase-publishable-key': K.supabasePub, 'npm-access-token': K.npm, 'mailchimp-api-key': K.mailchimp,
    'shopify-token': K.shopify, 'github-fine-grained-pat': 'github' + '_pat_' + D._fake(82, null, 31),
    'gitlab-pat': 'gl' + 'pat-' + D._fake(20, null, 32), 'huggingface-token': 'h' + 'f_' + D._fake(34, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 33),
    'digitalocean-pat': 'dop' + '_v1_' + D._fake(64, '0123456789abcdef', 34),
    'slack-webhook-url': 'https://hooks.slack' + '.com/services/' + D._fake(9, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 35) + '/' + D._fake(11, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 36) + '/' + D._fake(24, null, 37)
  };
  for (const [rule, value] of Object.entries(cases)) {
    const r = D.analyze('Here is the value we use in production: ' + value + ' (do not share)');
    assert.deepStrictEqual(rules(r), [rule], rule);
    assert.strictEqual(r.kind, 'text');
  }
});

test('database URL: password masked, host hidden, no-credential URLs ignored', () => {
  const r = D.analyze('DATABASE_URL="mysql://shop:' + K.dbPass + '@db.example.internal:3306/shop"');
  assert.strictEqual(r.findings.length, 1);
  assert.ok(!r.findings[0].masked.includes('db.example.internal'));
  assert.ok(!r.findings[0].masked.includes(K.dbPass.slice(0, 3)));
  assert.strictEqual(D.analyze('REDIS_URL=redis://localhost:6379/0').findings.length, 0);
  assert.strictEqual(D.analyze('DB=postgres://user:password@localhost/app').findings.length, 0);
});

test('name-based findings: real values flagged, public names and paths are not', () => {
  const v = D._fake(24, null, 50);
  const r = D.analyze(['SESSION_SECRET=' + v, 'MAIL_PASSWORD=Tr4vel', 'JWT_PUBLIC_KEY=' + v, 'API_KEY_ID=' + v, 'TOKEN_URL=https://auth.example/token',
    'PRIVATE_KEY_FILE=/etc/ssl/private/site.key', 'OAUTH_CLIENT_ID=' + v, 'PASSWORD_MIN_LENGTH=12', 'API_TOKEN=abc'].join('\n'));
  assert.deepStrictEqual(r.findings.map((f) => f.name), ['SESSION_SECRET', 'MAIL_PASSWORD']);
  assert.ok(r.findings.every((f) => f.severity === 'medium' && f.notes.includes('byName')));
  assert.strictEqual(r.verdict, 'review');
});

test('JSON, YAML and PHP variable forms', () => {
  const v = D._fake(24, null, 51);
  assert.strictEqual(D.analyze('{\n  "stripeSecret": "' + K.stripeLive + '",\n  "apiSecret": "' + v + '"\n}').findings.length, 2);
  assert.strictEqual(D.analyze('mail:\n  smtp_password: ' + v + '\n  host: smtp.example').findings[0].name, 'smtp_password');
  assert.strictEqual(D.analyze("<?php $db_password = '" + v + "';").findings[0].name, 'db_password');
  assert.strictEqual(D.analyze('export GITHUB_TOKEN="' + K.github + '" # deploy').findings[0].name, 'GITHUB_TOKEN');
});

test('private key block is one finding and its body is not scanned', () => {
  const body = Array.from({ length: 6 }, (_, i) => D._fake(64, null, 60 + i)).join('\n');
  const text = 'SSH_KEY_NAME=deploy\n-----BEGIN OPENSSH ' + 'PRIVATE KEY-----\n' + body + '\n-----END OPENSSH ' + 'PRIVATE KEY-----\nAFTER_PASSWORD=' + D._fake(12, null, 70);
  const r = D.analyze(text);
  assert.deepStrictEqual(rules(r), ['private-key', 'named-secret']);
  assert.strictEqual(r.findings[1].name, 'AFTER_PASSWORD');
  assert.ok(!D.render(r, 'en').includes(body.slice(0, 20)));
});

test('the same key twice is one finding with a repeat count', () => {
  const r = D.analyze('A=' + K.github + '\nB=' + K.github + '\nC=' + K.github);
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].repeats, 3);
});

test('plan: providers in severity order, each with an https link and both languages', () => {
  const r = D.analyze(S.env);
  const sev = r.plan.providers.map((p) => p.severity);
  assert.deepStrictEqual(sev, sev.slice().sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a] - { high: 0, medium: 1, low: 2 }[b])));
  for (const [id, p] of Object.entries(D.PROVIDERS)) {
    assert.match(p.link, /^https:\/\//, id);
    assert.ok(p.how.en.length > 30 && p.how.es.length > 30, id);
    if (p.warn) assert.ok(p.warn.en && p.warn.es, id);
  }
  for (const rule of D.RULES) assert.ok(D.PROVIDERS[rule.provider], rule.id);
  assert.strictEqual(new Set(D.RULES.map((x) => x.id)).size, D.RULES.length);
  const es = D.render(r, 'es');
  assert.match(es, /Qué hacer, en este orden/);
  assert.match(es, /Revoca o rota cada clave/);
  assert.ok(!/Whoever has it|Do this first/.test(es));
  const stripeAt = es.indexOf('• Stripe'), cleanAt = es.indexOf('4. Recién ahora');
  assert.ok(stripeAt > 0 && cleanAt > stripeAt, 'revoking comes before cleaning');
});

test('Spanish and English texts have the same keys', () => {
  const keys = (o) => Object.keys(o).sort();
  assert.deepStrictEqual(keys(D.T.en), keys(D.T.es));
  for (const k of ['level', 'note', 'verdict', 'sev', 'kind']) assert.deepStrictEqual(keys(D.T.en[k]), keys(D.T.es[k]), k);
  assert.strictEqual(D.T.en.steps.length, D.T.es.steps.length);
  assert.strictEqual(D.T.en.clean.length, D.T.es.clean.length);
  assert.strictEqual(D.T.en.prevent.length, D.T.es.prevent.length);
});

test('CRLF, BOM, empty and odd input', () => {
  const r = D.analyze('﻿TOKEN=' + K.github + '\r\nOTHER=1\r\n');
  assert.strictEqual(r.findings.length, 1);
  assert.strictEqual(r.findings[0].line, 1);
  assert.strictEqual(D.analyze('').kind, 'empty');
  assert.strictEqual(D.analyze(null).findings.length, 0);
  assert.strictEqual(D.analyze('just a normal sentence, no keys.').verdict, 'clear');
});

test('a very long line does not hang', () => {
  const start = Date.now();
  const long = 'X="' + 'a:b@c '.repeat(40000) + '"\nPASSWORD=' + 'p='.repeat(100000);
  D.analyze(long);
  assert.ok(Date.now() - start < 3000, 'took ' + (Date.now() - start) + ' ms');
});

test('CLI: exit codes, --json, --lang, stdin, --fail-on', () => {
  const env = run(['--demo', 'env']);
  assert.strictEqual(env.status, 1);
  assert.match(env.stdout, /Act now/);
  const json = run(['--demo', 'env', '--json', '--fail-on', 'never']);
  assert.strictEqual(json.status, 0);
  const parsed = JSON.parse(json.stdout);
  assert.strictEqual(parsed.tool, 'derrame');
  assert.strictEqual(parsed.counts.high, 7);
  assert.strictEqual(run(['--demo', 'clean']).status, 0);
  assert.match(run(['--demo', 'wpconfig', '--lang', 'es']).stdout, /Actúa ahora/);
  const stdin = run(['-'], 'MAIL_PASSWORD=Tr4vel-2026');
  assert.strictEqual(stdin.status, 0, 'medium does not fail by default');
  assert.strictEqual(run(['-', '--fail-on', 'medium'], 'MAIL_PASSWORD=Tr4vel-2026').status, 1);
  assert.strictEqual(run(['--nope']).status, 2);
  assert.strictEqual(run([]).status, 2);
  assert.strictEqual(run(['does-not-exist.env']).status, 2);
  assert.strictEqual(run(['--lang', 'fr', '--demo', 'env']).status, 2);
});
