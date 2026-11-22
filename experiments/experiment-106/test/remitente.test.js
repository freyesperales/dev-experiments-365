'use strict';
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

test('normalizeDomain accepts URLs and emails, rejects junk', () => {
  assert.strictEqual(R.normalizeDomain('https://Shop.Example.com/path?x=1'), 'shop.example.com');
  assert.strictEqual(R.normalizeDomain('ventas@example.com'), 'example.com');
  assert.strictEqual(R.normalizeDomain('example.com.'), 'example.com');
  assert.strictEqual(R.normalizeDomain('not a domain'), null);
  assert.strictEqual(R.normalizeDomain('localhost'), null);
});

test('joinTxt concatenates DoH quoted strings (RFC 7208 3.3)', () => {
  assert.strictEqual(R.joinTxt('"v=spf1 include:a.example" " ~all"'), 'v=spf1 include:a.example ~all');
  assert.strictEqual(R.joinTxt('"say \\"hi\\""'), 'say "hi"');
  assert.strictEqual(R.joinTxt('unquoted'), 'unquoted');
});

test('good zone: A+, no findings, every requirement met', async () => {
  const r = await run('example.org', zone('good-zone.json'), { policy: fs.readFileSync(FX('mta-sts-good.txt'), 'utf8'), selectors: ['s1'] });
  assert.deepStrictEqual(r.findings, []);
  assert.strictEqual(r.grade, 'A+');
  assert.strictEqual(r.spf.lookups, 1);
  assert.strictEqual(r.dkim[0].bits, 2048);
  assert.strictEqual(r.requirements.bulkSenders.ok, true);
});

test('bad zone: SPF over the 10-lookup limit, counted the way receivers count it', async () => {
  const r = await run('example.com', zone('bad-zone.json'));
  // a(1) mx(1) crm(1+3) news(1+2) helpdesk(1+2) shop(1) crm again(1+3) ptr(1) = 18
  assert.strictEqual(r.spf.lookups, 18);
  assert.strictEqual(r.spf.voids, 4);
  for (const id of ['spf_multiple', 'spf_too_many', 'spf_voids', 'spf_include_none', 'spf_ptr', 'spf_dup_include', 'spf_ip_typo']) assert.ok(ids(r).includes(id), id);
  assert.strictEqual(r.grade, 'F');
  assert.strictEqual(r.requirements.allSenders.spf, false);
});

test('merged SPF suggestion: one record, ip: fixed to ip4:, ptr dropped, no duplicates', () => {
  const m = R.mergeSpf(['v=spf1 include:a.example ptr include:a.example ~all', 'v=spf1 ip:203.0.113.5 -all']);
  assert.strictEqual(m, 'v=spf1 include:a.example ip4:203.0.113.5 ~all');
  assert.ok(!/\+all/.test(R.mergeSpf(['v=spf1 +all', 'v=spf1 a'])));
});

test('SPF: +all, ?all, missing all and bad syntax', async () => {
  const a = { 'example.com': { MX: ['10 mx.example.com'], TXT: [] } };
  a['example.com'].TXT = ['v=spf1 ip4:192.0.2.1 +all'];
  assert.ok(ids(await run('example.com', a)).includes('spf_plus_all'));
  a['example.com'].TXT = ['v=spf1 ip4:192.0.2.1 ?all'];
  assert.ok(ids(await run('example.com', a)).includes('spf_neutral_all'));
  a['example.com'].TXT = ['v=spf1 ip4:192.0.2.1'];
  assert.ok(ids(await run('example.com', a)).includes('spf_no_all'));
  a['example.com'].TXT = ['v=spf1 ip4:192.0.2.999 -all'];
  assert.ok(ids(await run('example.com', a)).includes('spf_syntax'));
});

test('SPF: 9 lookups warns, include loop is detected, redirect is followed', async () => {
  const z = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 ' + Array.from({ length: 9 }, (_, i) => `include:s${i}.example.net`).join(' ') + ' -all'] } };
  for (let i = 0; i < 9; i++) z[`s${i}.example.net`] = { TXT: ['v=spf1 ip4:198.51.100.' + i + ' -all'] };
  const r = await run('example.com', z);
  assert.strictEqual(r.spf.lookups, 9); assert.ok(ids(r).includes('spf_near_limit'));
  const loop = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 include:l.example.net -all'] }, 'l.example.net': { TXT: ['v=spf1 include:example.com -all'] } };
  assert.ok(ids(await run('example.com', loop)).includes('spf_loop'));
  const red = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 redirect=_spf.example.net'] }, '_spf.example.net': { TXT: ['v=spf1 ip4:198.51.100.1 -all'] } };
  const rr = await run('example.com', red);
  assert.strictEqual(rr.spf.lookups, 1); assert.ok(!ids(rr).includes('spf_no_all'));
});

test('DMARC (RFC 9989): obsolete pct/rf/ri, pct=0 -> t=y, invalid values dropped from suggestion', async () => {
  const z = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] }, '_dmarc.example.com': { TXT: ['v=DMARC1; p=quarantine; pct=0; rf=afrf; ri=3600; aspf=x; rua=mailto:d@example.com'] } };
  const r = await run('example.com', z);
  for (const id of ['dmarc_pct0', 'dmarc_obsolete_rf', 'dmarc_obsolete_ri', 'dmarc_bad_aspf', 'dmarc_quarantine']) assert.ok(ids(r).includes(id), id);
  assert.strictEqual(r.dmarc.suggested, 'v=DMARC1; p=quarantine; rua=mailto:d@example.com; t=y');
});

test('DMARC: missing, p=none without rua, weak sp, multiple records, unknown tag', async () => {
  const base = () => ({ 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] } });
  let z = base();
  assert.ok(ids(await run('example.com', z)).includes('dmarc_missing'));
  z = base(); z['_dmarc.example.com'] = { TXT: ['v=DMARC1; p=none'] };
  assert.ok(ids(await run('example.com', z)).includes('dmarc_none_no_rua'));
  z = base(); z['_dmarc.example.com'] = { TXT: ['v=DMARC1; p=reject; sp=none; rua=mailto:d@example.com'] };
  assert.ok(ids(await run('example.com', z)).includes('dmarc_weak_sp'));
  z = base(); z['_dmarc.example.com'] = { TXT: ['v=DMARC1; p=reject', 'v=DMARC1; p=none'] };
  assert.ok(ids(await run('example.com', z)).includes('dmarc_multiple'));
  z = base(); z['_dmarc.example.com'] = { TXT: ['v=DMARC1; p=reject; rua=mailto:d@example.com; ruf=mailto:f@example.com; fo=1; np=reject; foo=1'] };
  const r = await run('example.com', z);
  assert.ok(ids(r).includes('dmarc_unknown_tag')); assert.ok(!ids(r).includes('dmarc_bad_np'));
});

test('DMARC: external rua needs the authorisation record; subdomain inherits from parent', async () => {
  const z = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] }, '_dmarc.example.com': { TXT: ['v=DMARC1; p=reject; rua=mailto:r@reports.example.net'] } };
  assert.ok(ids(await run('example.com', z)).includes('dmarc_ext_auth'));
  z['example.com._report._dmarc.reports.example.net'] = { TXT: ['v=DMARC1'] };
  assert.ok(!ids(await run('example.com', z)).includes('dmarc_ext_auth'));
  z['shop.example.com'] = { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] };
  const r = await run('shop.example.com', z);
  assert.strictEqual(r.dmarc.inheritedFrom, 'example.com'); assert.ok(ids(r).includes('dmarc_inherited'));
});

test('DKIM: key size read from the DER public key, selector taken from pasted headers', async () => {
  const z = zone('bad-zone.json');
  const r = await run('example.com', z, { headers: fs.readFileSync(FX('headers-bad.txt'), 'utf8') });
  assert.deepStrictEqual(r.dkim.map(k => [k.selector, k.bits]), [['old', 512]]);
  assert.ok(ids(r).includes('dkim_weak'));
  const r2 = await run('example.com', z, { selectors: ['legacy'] });
  assert.strictEqual(r2.dkim[0].bits, 1024); assert.ok(ids(r2).includes('dkim_1024'));
  assert.deepStrictEqual(R.selectorsFromHeaders('DKIM-Signature: v=1; a=rsa-sha256; d=Example.com;\n s=sel1; b=x'), [{ selector: 'sel1', domain: 'example.com' }]);
  assert.strictEqual(R.rsaBits('not base64!!'), null);
});

test('DKIM: not found on common selectors is info, not an error; explicit selector missing is high', async () => {
  const z = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] } };
  const f = (await run('example.com', z)).findings.find(x => x.id === 'dkim_not_found');
  assert.strictEqual(f.sev, 'info');
  const g = (await run('example.com', z, { selectors: ['nope'] })).findings.find(x => x.id === 'dkim_not_found');
  assert.strictEqual(g.sev, 'high');
});

test('MTA-STS: policy parsing, wildcard covers one label, MX mismatch, bad id, TLS-RPT', async () => {
  assert.ok(R.mxMatches('*.example.com', 'mx1.example.com'));
  assert.ok(!R.mxMatches('*.example.com', 'a.b.example.com'));
  assert.ok(!R.mxMatches('*.example.com', 'example.com'));
  const p = R.parseStsPolicy(fs.readFileSync(FX('mta-sts-bad.txt'), 'utf8'));
  assert.strictEqual(p.mode, 'enforce'); assert.strictEqual(p.max_age, 3600);
  const r = await run('example.com', zone('bad-zone.json'), { policy: fs.readFileSync(FX('mta-sts-bad.txt'), 'utf8') });
  for (const id of ['mtasts_bad_id', 'mtasts_mx_mismatch', 'mtasts_short_age', 'tlsrpt_missing']) assert.ok(ids(r).includes(id), id);
  assert.strictEqual(r.findings.find(x => x.id === 'mtasts_mx_mismatch').sev, 'high');
});

test('DNS failure is reported as an error, never as "record missing"', async () => {
  await assert.rejects(() => run('example.com', { 'example.com': 'SERVFAIL' }), e => e.code === 'DNS_FAILED');
  const z2 = { 'example.com': { MX: ['10 mx.example.com'], TXT: ['v=spf1 -all'] }, '_dmarc.example.com': 'SERVFAIL' };
  const r = await run('example.com', z2);
  assert.ok(ids(r).includes('dmarc_dns')); assert.ok(!ids(r).includes('dmarc_missing'));
});

test('DoH resolver parses Cloudflare JSON (NXDOMAIN, CNAME-chained TXT) with an injected fetch', async () => {
  const replies = {
    'a.example.com|TXT': { Status: 0, Answer: [{ type: 5, data: 'b.example.net.' }, { type: 16, data: '"v=DKIM1; p=" "AB"' }] },
    'x.example.com|TXT': { Status: 3 }
  };
  const fakeFetch = async (url) => {
    const u = new URL(url); const key = u.searchParams.get('name') + '|' + u.searchParams.get('type');
    return { ok: true, json: async () => replies[key] };
  };
  const res = R.dohResolver({ fetch: fakeFetch });
  const a = await res('a.example.com', 'TXT');
  assert.deepStrictEqual(a.answers, ['v=DKIM1; p=AB']); assert.deepStrictEqual(a.cname, ['b.example.net']);
  assert.strictEqual((await res('x.example.com', 'TXT')).status, 'NXDOMAIN');
  const down = R.dohResolver({ fetch: async () => { throw new Error('offline'); } });
  assert.strictEqual((await down('a.example.com', 'TXT')).status, 'SERVFAIL');
});

test('Spanish output and CLI exit codes', () => {
  const bad = spawnSync(process.execPath, [CLI, 'example.com', '--zone', FX('bad-zone.json'), '--lang', 'es'], { encoding: 'utf8' });
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /nota F/); assert.match(bad.stdout, /consultas DNS: 18\/10/);
  const good = spawnSync(process.execPath, [CLI, 'example.org', '--zone', FX('good-zone.json'), '--selector', 's1', '--policy', FX('mta-sts-good.txt'), '--json'], { encoding: 'utf8' });
  assert.strictEqual(good.status, 0);
  assert.strictEqual(JSON.parse(good.stdout).grade, 'A+');
  assert.strictEqual(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
  assert.strictEqual(spawnSync(process.execPath, [CLI, 'example.com', '--zone', FX('bad-zone.json'), '--fail-on', 'never'], { encoding: 'utf8' }).status, 0);
});
