'use strict';
// Tests for the rules added in Remitente 1.1. Local fixtures only: no network.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const R = require('../remitente.js');
const FX = n => path.join(__dirname, '..', 'fixtures', n);
const zone = n => JSON.parse(fs.readFileSync(FX(n), 'utf8'));
const ids = r => r.findings.map(f => f.id);
const run = (domain, z, extra) => R.analyze(domain, Object.assign({ resolver: R.fixtureResolver(z) }, extra || {}));
const CLI = path.join(__dirname, '..', 'remitente.js');
const base = (txt, extra) => Object.assign({ 'example.com': { MX: ['10 mx.example.com'], TXT: [].concat(txt) } }, extra || {});
const DM = { '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject; rua=mailto:d@example.com'] } };

test('tree walk targets match the worked example of RFC 9989 4.10 (8 queries at most)', () => {
  assert.deepStrictEqual(R.dmarcWalkTargets('a.b.c.d.e.f.g.h.i.j.mail.example.com'), ['g.h.i.j.mail.example.com', 'h.i.j.mail.example.com', 'i.j.mail.example.com', 'j.mail.example.com', 'mail.example.com', 'example.com', 'com']);
  assert.deepStrictEqual(R.dmarcWalkTargets('a.mail.example.com'), ['mail.example.com', 'example.com', 'com']);
  assert.deepStrictEqual(R.dmarcWalkTargets('example.com'), ['com']);
});

test('tree walk: a deep subdomain finds the record of the organisation (1.0 stopped two labels up)', async () => {
  const r = await run('news.mail.shop.example.com', zone('parked-zone.json'));
  assert.strictEqual(r.dmarc.inheritedFrom, 'example.com');
  assert.deepStrictEqual(r.dmarc.walk.map(w => w.name), ['news.mail.shop.example.com', 'mail.shop.example.com', 'shop.example.com', 'example.com', 'com']);
  assert.ok(!ids(r).includes('dmarc_missing'));
});

test('tree walk: inherited policy comes from sp=, and strict alignment is called out', async () => {
  const r = await run('news.mail.shop.example.com', zone('parked-zone.json'));
  assert.deepStrictEqual(r.dmarc.effective, { policy: 'none', from: 'sp', record: 'example.com' });
  const f = r.findings.find(x => x.id === 'dmarc_inherited');
  assert.match(f.msg.en, /policy for this subdomain is "none" \(taken from sp=\)/);
  assert.match(f.msg.es, /alineación estricta \(adkim=s, aspf=s\)/);
  assert.ok(!ids(r).some(id => id.startsWith('dmarc_strict_')), 'said once, in the inherited note');
});

test('tree walk: organisational domain selection (fewest labels, psd=n, psd=y) as in RFC 9989 4.10.2', async () => {
  const z = { 'a.mail.example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 ip4:192.0.2.1 -all'] }, '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=quarantine'] }, '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject'] } };
  assert.strictEqual((await run('a.mail.example.com', z)).dmarc.inheritedFrom, 'example.com');
  z['_dmarc.mail.example.com'] = { TXT: ['v=DMARC1; p=quarantine; psd=n'] };
  const n = await run('a.mail.example.com', z);
  assert.strictEqual(n.dmarc.inheritedFrom, 'mail.example.com');
  assert.deepStrictEqual(n.dmarc.walk.map(w => w.name), ['a.mail.example.com', 'mail.example.com']);
  const y = await run('a.mail.example.com', { 'a.mail.example.com': z['a.mail.example.com'], '_dmarc.com': { TXT: ['v=DMARC1; p=reject; psd=y'] } });
  assert.strictEqual(y.dmarc.orgDomain, 'example.com');
  assert.ok(ids(y).includes('dmarc_psd_policy'));
});

test('tree walk: two records at one name are discarded and the walk continues', async () => {
  const z = { 'a.mail.example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 ip4:192.0.2.1 -all'] }, '_dmarc.mail.example.com': { TXT: ['v=DMARC1; p=none', 'v=DMARC1; p=reject'] }, '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject'] } };
  const r = await run('a.mail.example.com', z);
  assert.strictEqual(r.dmarc.inheritedFrom, 'example.com');
  assert.strictEqual(r.dmarc.walk[1].records, 2);
});

test('tree walk never asks more than 8 DMARC questions', async () => {
  const long = 'a.b.c.d.e.f.g.h.i.j.mail.example.com';
  const asked = [];
  const resolver = async (name, type) => {
    if (name.startsWith('_dmarc.')) asked.push(name);
    if (name !== long) return { status: 'NXDOMAIN', answers: [], cname: [] };
    return { status: 'NOERROR', answers: type === 'TXT' ? ['v=spf1 ip4:192.0.2.1 -all'] : type === 'MX' ? ['10 mx.example.com'] : [], cname: [] };
  };
  const r = await R.analyze(long, { resolver });
  assert.strictEqual(r.dmarc.walk.length, 8);
  assert.strictEqual(asked[1], '_dmarc.g.h.i.j.mail.example.com');
  assert.strictEqual(asked.filter(n => !n.endsWith(long + '.' + long)).length, 8);
});

test('DMARC at the wrong name: on the bare domain, or doubled by the DNS panel', async () => {
  const a = await run('example.com', base(['v=spf1 ip4:192.0.2.1 -all', 'v=DMARC1; p=reject; rua=mailto:d@example.com']));
  const f = a.findings.find(x => x.id === 'dmarc_wrong_name');
  assert.ok(f); assert.strictEqual(f.sev, 'high'); assert.ok(!ids(a).includes('dmarc_missing'));
  assert.strictEqual(a.dmarc.suggested, 'v=DMARC1; p=reject; rua=mailto:d@example.com');
  const b = await run('example.com', base('v=spf1 ip4:192.0.2.1 -all', { '_dmarc.example.com.example.com': { TXT: ['v=DMARC1; p=none'] } }));
  assert.match(b.findings.find(x => x.id === 'dmarc_wrong_name').msg.en, /_dmarc\.example\.com\.example\.com/);
});

test('DMARC that does not start with v=DMARC1, bad characters and repeated tags', async () => {
  const a = await run('example.com', base('v=spf1 ip4:192.0.2.1 -all', { '_dmarc.example.com': { TXT: ['“v=DMARC1; p=reject”'] } }));
  assert.ok(ids(a).includes('dmarc_malformed_start')); assert.ok(!ids(a).includes('dmarc_missing'));
  const b = await run('example.com', base('v=spf1 ip4:192.0.2.1 -all', { '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject; p=none; rua=mailto:d@example.com '] } }));
  assert.ok(ids(b).includes('dmarc_dup_tag')); assert.ok(ids(b).includes('dmarc_bad_chars'));
});

test('SPF pasted with a line break: flagged, and still counted (case seen in a November 2026 support thread)', async () => {
  const r = await run('example.com', base('v=spf1 include:_spf.example.net -all\n', Object.assign({ '_spf.example.net': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] } }, DM)));
  const f = r.findings.find(x => x.id === 'spf_control_chars');
  assert.ok(f); assert.match(f.msg.en, /line feed/);
  assert.strictEqual(r.spf.lookups, 1);
  assert.strictEqual(r.requirements.allSenders.spf, false);
});

test('SPF with typographic quotes or a non-breaking space', async () => {
  const a = await run('example.com', base('“v=spf1 ip4:192.0.2.1 -all”', DM));
  const f = a.findings.find(x => x.id === 'spf_malformed_start');
  assert.ok(f); assert.match(f.fix.en, /Probably: v=spf1 ip4:192\.0\.2\.1 -all$/); assert.ok(!ids(a).includes('spf_missing'));
  const b = await run('example.com', base('v=spf1 ip4:192.0.2.1 -all', DM));
  assert.ok(ids(b).includes('spf_non_ascii'));
});

test('SPF copy-paste damage: v=spf1 twice, "include domain" with a space, "~all" glued to an IP', async () => {
  const a = await run('example.com', base('v=spf1 ip4:192.0.2.1 v=spf1 include:_spf.example.net ~all', Object.assign({ '_spf.example.net': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] } }, DM)));
  assert.ok(ids(a).includes('spf_dup_version'));
  const b = await run('example.com', base('v=spf1 +a +mx include websitewelcome.example ?all', DM));
  const f = b.findings.find(x => x.id === 'spf_include_empty');
  assert.match(f.fix.en, /include:websitewelcome\.example$/); assert.ok(!ids(b).includes('spf_syntax'));
  assert.strictEqual(b.spf.lookups, 2);
  const c = await run('example.com', base('v=spf1 ip4:192.0.2.81~all', DM));
  const g = c.findings.find(x => x.id === 'spf_glued');
  assert.strictEqual(g.fix.en, 'Write: ip4:192.0.2.81 ~all'); assert.ok(!ids(c).includes('spf_syntax'));
});

test('null MX mixed with a real MX, and null MX with a preference other than 0 (RFC 7505)', async () => {
  const a = await run('example.com', { 'example.com': { MX: ['0 .', '10 mx.example.com'], TXT: ['v=spf1 ip4:192.0.2.1 -all'] }, '_dmarc.example.com': DM['_dmarc.example.com'] });
  assert.ok(ids(a).includes('null_mx_mixed')); assert.deepStrictEqual(a.mx.hosts.map(h => h.host), ['mx.example.com']);
  const b = await run('example.com', { 'example.com': { MX: ['10 .'], TXT: ['v=spf1 -all'] }, '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject'] } });
  assert.ok(ids(b).includes('null_mx_pref')); assert.strictEqual(b.mx.nullMx, true);
});

test('domain that sends no mail: SPF -all is not enough without DMARC reject', async () => {
  const r = await run('parked.example', zone('parked-zone.json'));
  const f = r.findings.find(x => x.id === 'nomail_dmarc');
  assert.strictEqual(f.sev, 'high'); assert.match(f.msg.en, /policy is "none"/);
  for (const id of ['dmarc_none', 'dmarc_none_no_rua', 'dmarc_missing', 'dkim_not_found', 'no_mx']) assert.ok(!ids(r).includes(id), id);
  assert.ok(ids(r).includes('nomail_no_null_mx'));
  assert.strictEqual(r.lockdown.declared, true);
  assert.deepStrictEqual(r.lockdown.records.filter(x => !x.optional).map(x => [x.type, x.ok]), [['TXT', true], ['TXT', false], ['MX', false]]);
});

test('fully locked domain gets A+, and a domain with mail gets no lockdown block', async () => {
  const r = await run('locked.example', zone('parked-zone.json'));
  assert.strictEqual(r.grade, 'A+');
  assert.deepStrictEqual(ids(r), ['null_mx']);
  assert.strictEqual(r.queries, 5, 'no DKIM selector guessing on a domain that sends nothing');
  assert.ok(r.lockdown.records.filter(x => !x.optional).every(x => x.ok === true));
  assert.strictEqual((await run('example.org', zone('good-zone.json'), { selectors: ['s1'], policy: fs.readFileSync(FX('mta-sts-good.txt'), 'utf8') })).lockdown, null);
});

test('no MX and no SPF: the lockdown records are offered, not assumed; SPF -all with MX is only a note', async () => {
  const r = await run('example.net', { 'example.net': { TXT: ['some-verification=1'] } });
  assert.strictEqual(r.lockdown.declared, false);
  assert.ok(ids(r).includes('spf_missing')); assert.ok(ids(r).includes('no_mx')); assert.ok(!ids(r).includes('nomail_dmarc'));
  const m = await run('example.com', base('v=spf1 -all', DM));
  assert.strictEqual(m.findings.find(x => x.id === 'nomail_spf_with_mx').sev, 'info'); assert.strictEqual(m.lockdown, null);
});

test('CLI prints the tree walk and the lockdown checklist in Spanish; version is 1.1.0', () => {
  const p = spawnSync(process.execPath, [CLI, 'parked.example', '--zone', FX('parked-zone.json'), '--lang', 'es'], { encoding: 'utf8' });
  assert.strictEqual(p.status, 1);
  assert.match(p.stdout, /Dominio que no envía correo: lista de cierre/); assert.match(p.stdout, /FALTA +_dmarc\.parked\.example +TXT +v=DMARC1; p=reject/);
  const s = spawnSync(process.execPath, [CLI, 'news.mail.shop.example.com', '--zone', FX('parked-zone.json'), '--lang', 'es', '--fail-on', 'never'], { encoding: 'utf8' });
  assert.match(s.stdout, /recorrido del árbol: .*_dmarc\.example\.com \[found\].*política aquí: none \(sp=\)/);
  assert.strictEqual(spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' }).stdout.trim(), '1.1.0');
});
