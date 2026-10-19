#!/usr/bin/env node
// cronwise CLI:  node cli.js "30 2 * * *" --tz America/New_York [--dialect vixie|k8s|quartz|eventbridge]
//                [--policy strict|once] [--count 10] [--from 2026-10-19T00:00:00Z] [--hazards] [--days 400] [--also Europe/London,UTC] [--json]
const C = require('./src/core.js');
const argv = process.argv.slice(2);
const opt = { tz: 'UTC', dialect: 'vixie', policy: 'strict', count: 10, days: 400, also: [], hazards: false, json: false, from: null };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], need = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
  if (a === '--tz') opt.tz = need(); else if (a === '--dialect') opt.dialect = need(); else if (a === '--policy') opt.policy = need();
  else if (a === '--count') opt.count = parseInt(need(), 10); else if (a === '--days') opt.days = parseInt(need(), 10);
  else if (a === '--from') opt.from = need(); else if (a === '--also') opt.also = need().split(',').filter(Boolean);
  else if (a === '--hazards') opt.hazards = true; else if (a === '--json') opt.json = true;
  else if (a === '-h' || a === '--help') { help(); process.exit(0); } else pos.push(a);
}
function die(m) { console.error('cronwise: ' + m); process.exit(2); }
function help() {
  console.log('usage: cronwise "<cron expr>" [--tz ZONE] [--dialect vixie|k8s|quartz|eventbridge] [--policy strict|once]\n' +
    '                [--count N] [--from ISO] [--hazards] [--days N] [--also ZONE,ZONE] [--json]');
}
if (pos.length !== 1) { help(); process.exit(2); }
if (!['strict', 'once'].includes(opt.policy)) die('--policy must be strict or once');
if (!(opt.count > 0) || !(opt.days > 0)) die('--count and --days must be positive integers');
try {
  const from = opt.from ? Date.parse(opt.from) : Date.now();
  if (Number.isNaN(from)) die(`cannot parse --from "${opt.from}"`);
  const c = C.parse(pos[0], opt.dialect);
  const o = { zone: opt.tz, from, policy: opt.policy, limit: opt.count, days: opt.days };
  const fires = opt.hazards ? C.hazards(c, o) : C.simulate(c, o);
  if (opt.json) {
    console.log(JSON.stringify(fires.map((f) => Object.assign({}, f, { utc: f.instant == null ? null : new Date(f.instant).toISOString(), note: C.KIND_TEXT[f.kind] })), null, 2));
  } else {
    console.log(`${pos[0]}  [${opt.dialect}]  zone=${opt.tz}  policy=${opt.policy}${c.fixed ? '' : '  (wildcard job: follows real elapsed time, no DST hazards)'}`);
    if (!fires.length) console.log(opt.hazards ? `no DST hazards in the next ${opt.days} days` : 'no fires in range');
    fires.forEach((f, i) => {
      const when = f.instant == null ? `${f.wall}  (never)` : C.fmtInZone(f.instant, opt.tz) + `  = ${new Date(f.instant).toISOString().replace('.000Z', 'Z')}`;
      const also = f.instant == null ? '' : opt.also.map((z) => `  ${z}: ${C.fmtInZone(f.instant, z)}`).join('');
      console.log(`${String(i + 1).padStart(3)}  ${when}${also}${f.kind === 'normal' ? '' : '   <-- ' + C.KIND_TEXT[f.kind]}`);
    });
  }
  process.exit(opt.hazards && fires.length ? 1 : 0);
} catch (e) {
  if (e instanceof C.CronError) die(e.message);
  throw e;
}
