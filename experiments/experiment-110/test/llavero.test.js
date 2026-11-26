'use strict';
// All inputs are invented (example.com, zero client IDs) except the ChatGPT scope
// list, which is the one OpenAI publishes. Nothing is ever requested from a network.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const L = require('../llavero.js');
const S = require('../samples.js');
const GRAPH = require('../graph-permissions.js');

const GA = 'https://www.googleapis.com/auth/';
const CLI = path.join(__dirname, '..', 'llavero.js');
const run = (args, input) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
const shorts = (res) => res.scopes.map((s) => s.short);
const ids = (res) => res.findings.map((f) => f.id);

test('data: every Google scope has a vendor doc, a valid class and a rating', () => {
  for (const [k, e] of Object.entries(L.GOOGLE)) {
    assert.match(e.doc, /^https:\/\/(developers|support)\.google\.com\//, k);
    assert.ok([null, 'non-sensitive', 'sensitive', 'restricted'].includes(e.cls), k);
    assert.ok(['high', 'medium', 'low'].includes(e.power), k);
    assert.ok(e.en && e.es, k);
  }
});

test('data: Google classes match the vendor tables read on 2026-11-26', () => {
  const cls = (s) => L.GOOGLE[/^https|^(openid|email|profile)$/.test(s) ? s : GA + s].cls;
  assert.strictEqual(cls('https://mail.google.com/'), 'restricted');
  assert.strictEqual(cls('gmail.modify'), 'restricted');
  assert.strictEqual(cls('gmail.readonly'), 'restricted');
  assert.strictEqual(cls('gmail.send'), 'sensitive');
  assert.strictEqual(cls('gmail.labels'), 'non-sensitive');
  assert.strictEqual(cls('drive'), 'restricted');
  assert.strictEqual(cls('drive.file'), 'non-sensitive');
  assert.strictEqual(cls('drive.apps.readonly'), 'sensitive');
  assert.strictEqual(cls('spreadsheets'), 'sensitive');
  assert.strictEqual(cls('presentations.readonly'), 'sensitive');
  assert.strictEqual(cls('calendar'), null, 'the Calendar page publishes no class');
});

test('data: Google admin high-risk list', () => {
  assert.strictEqual(L.GOOGLE[GA + 'gmail.send'].highRisk, true);
  assert.strictEqual(L.GOOGLE['https://mail.google.com/'].highRisk, true);
  assert.strictEqual(L.GOOGLE[GA + 'spreadsheets'].highRisk, true);
  assert.strictEqual(L.GOOGLE[GA + 'drive.file'].highRisk, false);
  assert.strictEqual(L.GOOGLE[GA + 'calendar'].highRisk, false);
});

test('data: every Microsoft row has the official Graph text, and admin consent is copied', () => {
  for (const [k, e] of Object.entries(L.MS)) assert.ok(GRAPH[k] && e.official === GRAPH[k].del, k);
  assert.strictEqual(L.MS['Mail.Read'].delAdmin, false);
  assert.strictEqual(L.MS['Directory.Read.All'].delAdmin, true);
  assert.strictEqual(L.MS['Sites.FullControl.All'].delAdmin, true);
  assert.strictEqual(L.MS['Mail.Send'].officialApp, 'Send mail as any user');
  assert.strictEqual(L.MS['Files.Read'].officialApp, null);
});

test('data: every narrower alternative points to a scope Llavero knows', () => {
  for (const e of Object.values(L.GOOGLE)) for (const a of e.alt) assert.ok(L.GOOGLE[/^https/.test(a) ? a : GA + a], e.key + ' -> ' + a);
  for (const e of Object.values(L.MS)) for (const a of e.alt) assert.ok(L.MS[a], e.key + ' -> ' + a);
});

test('extract: URL lists, short names, Graph prefixes, any case, no duplicates', () => {
  const r = L.analyze('https://www.googleapis.com/auth/drive.readonly, gmail.send\nhttps://graph.microsoft.com/Mail.Read mail.read FILES.READ.ALL https://www.googleapis.com/auth/drive.readonly');
  assert.deepStrictEqual(shorts(r).sort(), ['Files.Read.All', 'Mail.Read', 'drive.readonly', 'gmail.send'].sort());
});

test('extract: ordinary words are not permissions', () => {
  const r = L.analyze('We use drive and mail every day; my email is on my profile. Calendar too.');
  assert.strictEqual(r.verdict, 'empty');
  assert.strictEqual(r.scopes.length, 0);
});

test('extract: a Google consent link is decoded and access_type=offline is seen', () => {
  const r = L.analyze(S.n8n);
  assert.deepStrictEqual(shorts(r).sort(), ['calendar', 'drive', 'https://mail.google.com/'].sort());
  assert.strictEqual(r.context.offline, true);
  assert.strictEqual(r.context.consentUrls, 1);
  assert.ok(ids(r).includes('offline'));
});

test('extract: a Microsoft consent link gives Microsoft sign-in scopes', () => {
  const r = L.analyze(S.outlook);
  assert.strictEqual(r.counts.google, 0);
  assert.ok(shorts(r).includes('openid') && shorts(r).includes('offline_access'));
  assert.ok(r.scopes.every((s) => s.provider === 'microsoft'));
});

test('extract: consent-screen text is recognised (Google and Microsoft)', () => {
  const r = L.analyze('This will allow the app to:\nRead, compose, send, and permanently delete all your email from Gmail\nSee and download all your Google Drive files\nSend mail as a user\nMaintain access to data you have given it access to');
  assert.deepStrictEqual(shorts(r).sort(), ['Mail.Send', 'drive.readonly', 'https://mail.google.com/', 'offline_access'].sort());
  assert.ok(r.scopes.filter((s) => s.short !== 'offline_access').every((s) => s.how === 'text'));
  assert.ok(!shorts(r).includes('email'), 'the word "email" in a sentence is not the email scope');
});

test('extract: openid/email next to written scopes count as sign-in scopes', () => {
  const r = L.analyze(S.tidy);
  assert.ok(shorts(r).includes('openid') && shorts(r).includes('email'));
  assert.strictEqual(r.verdict, 'clean');
});

test('unknown scopes are listed, never guessed', () => {
  const r = L.analyze('https://www.googleapis.com/auth/contacts.readonly https://graph.microsoft.com/Bookings.Manage.All');
  assert.strictEqual(r.scopes.length, 0);
  assert.deepStrictEqual(r.findings.find((f) => f.id === 'unknown').items, [GA + 'contacts.readonly', 'https://graph.microsoft.com/Bookings.Manage.All']);
  assert.notStrictEqual(r.verdict, 'empty');
});

test('.default is flagged: the list does not show what the app registered', () => {
  const r = L.analyze('scope=https://graph.microsoft.com/.default');
  assert.ok(ids(r).includes('default-scope'));
  assert.strictEqual(r.verdict, 'check');
});

test('verdicts of the four samples', () => {
  assert.strictEqual(L.analyze(S.n8n).verdict, 'fix');
  assert.strictEqual(L.analyze(S.chatgpt).verdict, 'check');
  assert.strictEqual(L.analyze(S.outlook).verdict, 'check');
  assert.strictEqual(L.analyze(S.tidy).verdict, 'clean');
  assert.strictEqual(L.analyze('').verdict, 'empty');
});

test('the ChatGPT sample has the 18 scopes OpenAI lists (12 known, 6 not in the list)', () => {
  const r = L.analyze(S.chatgpt);
  assert.strictEqual(r.scopes.length, 12);
  assert.strictEqual(r.counts.unknown, 6);
});

test('mail.google.com is FIX and suggests gmail.modify', () => {
  const s = L.analyze('https://mail.google.com/').scopes[0];
  assert.strictEqual(s.level, 'fix');
  assert.strictEqual(s.alternatives[0].scope, GA + 'gmail.modify');
  assert.ok(s.notes.some((n) => /delete email permanently/.test(n)));
});

test('directory-wide Microsoft write permissions are FIX', () => {
  for (const p of ['Directory.ReadWrite.All', 'RoleManagement.ReadWrite.Directory', 'AppRoleAssignment.ReadWrite.All', 'Sites.FullControl.All']) {
    assert.strictEqual(L.analyze(p).verdict, 'fix', p);
  }
});

test('read-and-send appears only when one connection can both read and send', () => {
  assert.ok(ids(L.analyze('gmail.modify')).includes('read-and-send'), 'modify reads and sends');
  assert.ok(ids(L.analyze('drive.readonly gmail.send')).includes('read-and-send'));
  assert.ok(!ids(L.analyze('gmail.send')).includes('read-and-send'), 'send alone cannot read');
  assert.ok(!ids(L.analyze('gmail.readonly drive.readonly')).includes('read-and-send'));
  assert.ok(ids(L.analyze('Chat.Read ChatMessage.Send')).includes('read-and-send'));
});

test('sharing is flagged for drive, calendar and calendar.acls, not for drive.file', () => {
  assert.ok(ids(L.analyze('https://www.googleapis.com/auth/drive')).includes('can-share'));
  assert.ok(ids(L.analyze('calendar.acls')).includes('can-share'), 'short name works too');
  assert.ok(ids(L.analyze(GA + 'calendar.acls')).includes('can-share'));
  assert.ok(!ids(L.analyze(GA + 'drive.file')).includes('can-share'));
});

test('offline: Google needs access_type=offline in the link; Microsoft offline_access', () => {
  assert.ok(!ids(L.analyze(GA + 'drive')).includes('offline'));
  assert.ok(ids(L.analyze('Mail.Read offline_access')).includes('offline'));
  const low = L.analyze('User.Read offline_access').findings.find((f) => f.id === 'offline');
  assert.strictEqual(low.level, 'info', 'offline with only sign-in scopes is just information');
});

test('Microsoft: delegated-or-application note and admin consent note', () => {
  const r = L.analyze('Mail.Send Directory.Read.All');
  assert.match(r.findings.find((f) => f.id === 'delegated-or-app').items.join('\n'), /Send mail as any user/);
  assert.deepStrictEqual(r.findings.find((f) => f.id === 'admin-consent').items, ['Directory.Read.All']);
});

test('how to take access back follows the provider', () => {
  const g = L.analyze(GA + 'drive').remove.map((x) => x.link).join(' ');
  assert.match(g, /myaccount\.google\.com\/linkedapps/);
  assert.doesNotMatch(g, /microsoft/);
  const m = L.analyze('Mail.Read').remove.map((x) => x.link).join(' ');
  assert.match(m, /my-apps-portal/);
  assert.doesNotMatch(m, /google/);
});

test('Spanish output: verdict, plain words and service names', () => {
  const r = L.analyze(S.outlook, { lang: 'es' });
  const txt = L.report(r);
  assert.match(txt, /CONVIENE REVISAR/);
  assert.match(txt, /Dicho simple, esta aplicación puede: leer tu correo/);
  assert.match(txt, /Correo de Outlook/);
  assert.match(txt, /\[REVISAR\]  /);
  assert.doesNotMatch(txt, /\bvos\b|\bpodés\b|\btenés\b/);
});

test('report prints the restricted-class explanation once, not per scope', () => {
  const txt = L.report(L.analyze(S.chatgpt));
  assert.strictEqual(txt.split('security assessment').length - 1, 1);
});

test('CLI: exit codes, --json, stdin, --es, bad input', () => {
  assert.strictEqual(run(['--demo', 'n8n']).status, 2);
  assert.strictEqual(run(['--demo', 'chatgpt']).status, 1);
  assert.strictEqual(run(['--demo', 'tidy']).status, 0);
  const j = run(['-', '--json'], 'gmail.send');
  assert.strictEqual(j.status, 1);
  assert.strictEqual(JSON.parse(j.stdout).scopes[0].short, 'gmail.send');
  assert.match(run(['-', '--es'], 'drive.file').stdout, /ACCESO ACOTADO/);
  assert.strictEqual(run(['-'], 'nothing here').status, 3);
  assert.strictEqual(run(['does-not-exist.txt']).status, 3);
  assert.strictEqual(run(['--demo', 'nope']).status, 3);
});
