#!/usr/bin/env node
// cuepoint CLI — fix subtitle timing from the terminal. Zero dependencies.
const fs = require('fs'), path = require('path');
const C = require('./src/core.js');
function help() {
  console.log(`usage: cuepoint <file...> [options]
  --shift <t>            constant shift, e.g. +2.5 or -0:00:01.2
  --anchor <from=to>     "this cue is at <from> but should be at <to>" (repeat; 2+ anchors fix drift)
  --mode smooth|step     smooth = linear stretch between anchors (default); step = per-segment offsets (fixes jumps)
  --fps <from:to>        e.g. 25:23.976 (subtitle was made for 25 fps video, yours plays at 23.976)
  --to srt|vtt|ass|sub   output format (default: same as input)   --sub-fps <n>  fps for MicroDVD .sub (default 23.976)
  --encoding <name>      force input encoding (default: auto; UTF-8 then windows-1252)
  --strip-hi  --strip-tags  --strip-watermarks   remove [sounds]/SPEAKER: labels, <i> tags, ad/credit cues
  --no-repair            skip sort/overlap/zero-length repair
  --merge <file> --merge-offset <t>   append a second part (CD2) shifted by <t>
  -o <file|dir>          output (default: <name>.synced.<ext>; with several inputs, a directory)
  --info                 only print what the file contains   --stdout   print result instead of writing
  Times accept 62.5, 1:02.5, 01:02:03,500 with optional +/-.`);
}
function die(m) { console.error('cuepoint: ' + m); process.exit(2); }
const argv = process.argv.slice(2);
const o = { files: [], anchors: [], mode: 'smooth', repair: true, subFps: 23.976 };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], need = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
  if (a === '-h' || a === '--help') { help(); process.exit(0); }
  else if (a === '--shift') o.shift = need();
  else if (a === '--anchor') o.anchors.push(need());
  else if (a === '--mode') o.mode = need();
  else if (a === '--fps') o.fps = need();
  else if (a === '--to') o.to = need();
  else if (a === '--sub-fps') o.subFps = parseFloat(need());
  else if (a === '--encoding') o.encoding = need();
  else if (a === '--strip-hi') o.stripHI = true;
  else if (a === '--strip-tags') o.stripTags = true;
  else if (a === '--strip-watermarks') o.stripWatermarks = true;
  else if (a === '--no-repair') o.repair = false;
  else if (a === '--merge') o.merge = need();
  else if (a === '--merge-offset') o.mergeOffset = need();
  else if (a === '-o') o.out = need();
  else if (a === '--info') o.info = true;
  else if (a === '--stdout') o.stdout = true;
  else if (a.startsWith('-') && a.length > 1) die(`unknown option ${a} (try --help)`);
  else o.files.push(a);
}
if (!o.files.length) { help(); process.exit(2); }
if (!['smooth', 'step'].includes(o.mode)) die('--mode must be smooth or step');
if (!(o.subFps > 0)) die('--sub-fps must be positive');
if (o.stdout && o.files.length > 1) die('--stdout works with a single input file');

const T = (s, what) => { const v = C.parseTime(s); if (v == null) die(`cannot parse ${what} "${s}"`); return v; };
const anchors = o.anchors.map((s) => {
  const [f, t] = s.split('=');
  if (t === undefined) die(`--anchor needs from=to, got "${s}"`);
  return { from: T(f, 'anchor source time'), to: T(t, 'anchor target time') };
});
function load(file) {
  let bytes;
  try { bytes = fs.readFileSync(file); } catch (e) { die(`cannot read ${file}: ${e.code || e.message}`); }
  const d = C.decode(new Uint8Array(bytes), o.encoding);
  const mj = C.fixMojibake(d.text);
  const p = C.parse(mj.text, { fps: o.subFps, format: path.extname(file).toLowerCase() === '.sub' ? 'sub' : 'auto' });
  return { cues: p.cues, format: p.format, encoding: d.encoding, mojibake: mj.fixed };
}
let failed = 0;
for (const file of o.files) {
  try {
    const src = load(file);
    const last = src.cues[src.cues.length - 1];
    if (o.info) {
      console.log(`${file}: ${src.format.toUpperCase()}, ${src.cues.length} cues, ${C.fmtTime(src.cues[0].start)} -> ${C.fmtTime(last.end)}, encoding ${src.encoding}${src.mojibake ? ' (mojibake detected, will repair)' : ''}`);
      continue;
    }
    let cues = src.cues; const log = [];
    if (o.fps) {
      const [f, t] = o.fps.split(':').map(parseFloat);
      if (!(f > 0 && t > 0)) die('--fps needs <from:to>, e.g. 25:23.976');
      cues = C.fpsConvert(cues, f, t); log.push(`fps ${f}→${t}`);
    }
    if (o.shift !== undefined) { cues = C.shift(cues, T(o.shift, '--shift')); log.push(`shift ${o.shift}`); }
    if (anchors.length) { cues = C.retime(cues, anchors, o.mode); log.push(C.describeFix(anchors, o.mode)); }
    if (o.merge) {
      const part2 = load(o.merge);
      cues = C.merge(cues, part2.cues, o.mergeOffset ? T(o.mergeOffset, '--merge-offset') : cues[cues.length - 1].end + 1000);
      log.push(`merged ${o.merge}`);
    }
    const res = C.clean(cues, { repair: o.repair, stripHI: o.stripHI, stripTags: o.stripTags, stripWatermarks: o.stripWatermarks });
    const r = res.report;
    const bits = Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`);
    if (src.mojibake) bits.push('mojibake repaired');
    const fmt = o.to || src.format;
    if (!['srt', 'vtt', 'ass', 'sub'].includes(fmt)) die('--to must be srt, vtt, ass or sub');
    const text = C.stringify(res.cues, fmt, { fps: o.subFps });
    if (o.stdout) { process.stdout.write(text); continue; }
    const base = path.basename(file, path.extname(file));
    let outPath;
    if (o.out && (o.files.length === 1 && !(fs.existsSync(o.out) && fs.statSync(o.out).isDirectory()))) outPath = o.out;
    else outPath = path.join(o.out || path.dirname(file), `${base}.synced.${fmt}`);
    fs.writeFileSync(outPath, text);
    console.log(`${file} → ${outPath}  [${log.join('; ') || 'no timing change'}]${bits.length ? '  cleaned: ' + bits.join(', ') : ''}`);
  } catch (e) {
    if (e instanceof C.SubError) { console.error(`cuepoint: ${file}: ${e.message}`); failed = 1; } else throw e;
  }
}
process.exit(failed);
