'use strict';
const { makeGit } = require('./git');

const SEP = '\x1f';
const TRUNK_GUESSES = ['main', 'master', 'trunk', 'develop'];

function detectTrunk(git, branches, wanted) {
  if (wanted) {
    if (!git.ok(['rev-parse', '--verify', '--quiet', wanted + '^{commit}'])) {
      throw new Error(`trunk "${wanted}" does not resolve to a commit`);
    }
    return wanted;
  }
  const head = git.tryRun(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (head) {
    const local = head.replace(/^origin\//, '');
    if (branches.includes(local)) return local;
    return head;
  }
  for (const g of TRUNK_GUESSES) if (branches.includes(g)) return g;
  throw new Error('could not detect the trunk branch; pass --trunk <ref>');
}

function analyze(cwd, opts = {}) {
  const git = makeGit(cwd);
  if (!git.ok(['rev-parse', '--git-dir'])) throw new Error(`not a git repository: ${cwd}`);
  const fmt = ['%(refname:short)', '%(objectname)', '%(upstream:short)', '%(upstream:track,nobracket)', '%(committerdate:unix)', '%(subject)', '%(HEAD)'].join(SEP);
  const raw = git.run(['for-each-ref', '--format=' + fmt, 'refs/heads']);
  const all = raw ? raw.split('\n').map((l) => {
    const [name, sha, upstream, track, ts, subject, head] = l.split(SEP);
    return { name, sha, upstream: upstream || null, track: track || '', ts: Number(ts), subject, current: head === '*' };
  }) : [];
  if (all.length === 0) throw new Error('repository has no local branches (no commits yet?)');
  const trunk = detectTrunk(git, all.map((b) => b.name), opts.trunk);
  const trunkSha = git.run(['rev-parse', trunk + '^{commit}']);

  const isAnc = (a, b) => git.ok(['merge-base', '--is-ancestor', a, b]);
  const count = (range) => Number(git.run(['rev-list', '--count', range]));

  const merged = [];
  const live = [];
  for (const b of all) {
    if (b.name === trunk) continue;
    if (isAnc(b.sha, trunkSha)) { merged.push({ name: b.name, why: 'tip is reachable from trunk' }); continue; }
    const cherry = git.run(['cherry', trunk, b.sha]);
    const lines = cherry ? cherry.split('\n') : [];
    if (lines.length > 0 && lines.every((l) => l.startsWith('-'))) {
      merged.push({ name: b.name, why: 'every commit already in trunk (rebase/cherry-pick merge)' });
      continue;
    }
    live.push(b);
  }

  // Candidate parents for each live branch.
  const cands = new Map();
  for (const b of live) {
    const list = [];
    const tb = git.tryRun(['merge-base', trunk, b.sha]);
    if (tb) list.push({ parent: trunk, base: tb, own: count(`${tb}..${b.sha}`), clean: tb === trunkSha, kind: 'trunk' });
    for (const c of live) {
      if (c === b || c.sha === b.sha) continue;
      if (c.sha !== trunkSha && isAnc(c.sha, b.sha)) {
        const own = count(`${c.sha}..${b.sha}`);
        if (own > 0) list.push({ parent: c.name, base: c.sha, own, clean: true, kind: 'branch' });
      } else {
        const fp = git.tryRun(['merge-base', '--fork-point', 'refs/heads/' + c.name, b.sha]);
        if (fp && !isAnc(fp, trunkSha) && fp !== c.sha) {
          const own = count(`${fp}..${b.sha}`);
          if (own > 0) list.push({ parent: c.name, base: fp, own, clean: false, kind: 'branch' });
        }
      }
    }
    list.sort((x, y) => x.own - y.own || (y.clean - x.clean) || (x.parent < y.parent ? -1 : 1));
    cands.set(b.name, list);
  }

  // Assign parents, guarding against cycles (possible only with rewritten-parent candidates).
  const parentOf = new Map();
  const reaches = (from, target) => {
    let cur = from; const seen = new Set();
    while (cur && !seen.has(cur)) { if (cur === target) return true; seen.add(cur); cur = parentOf.get(cur) && parentOf.get(cur).parent; }
    return false;
  };
  const order = [...live].sort((a, b) => cands.get(a.name)[0].own - cands.get(b.name)[0].own || (a.name < b.name ? -1 : 1));
  for (const b of order) {
    const pick = cands.get(b.name).find((c) => c.parent === trunk || !reaches(c.parent, b.name));
    parentOf.set(b.name, pick);
  }

  const nodes = new Map();
  nodes.set(trunk, { name: trunk, sha: trunkSha, trunk: true, parent: null, children: [], current: all.some((b) => b.name === trunk && b.current) });
  for (const b of live) {
    const p = parentOf.get(b.name);
    const pSha = p.parent === trunk ? trunkSha : live.find((x) => x.name === p.parent).sha;
    const ahead = count(`${pSha}..${b.sha}`);
    const behind = count(`${b.sha}..${pSha}`);
    const unpushed = /ahead (\d+)/.exec(b.track);
    nodes.set(b.name, {
      name: b.name, sha: b.sha, subject: b.subject, ts: b.ts, current: b.current,
      upstream: b.upstream, track: b.track, unpushed: unpushed ? Number(unpushed[1]) : (b.upstream ? 0 : null),
      parent: p.parent, base: p.base, parentSha: pSha, ahead, behind,
      ownDrift: !p.clean, parentKind: p.kind, children: [],
      sameTipAs: live.filter((x) => x.sha === b.sha && x !== b).map((x) => x.name),
    });
  }
  for (const n of nodes.values()) if (n.parent) nodes.get(n.parent).children.push(n.name);
  for (const n of nodes.values()) n.children.sort();

  // Rebase planning: a node needs rebasing if it drifted itself or its parent is being rewritten.
  const plan = [];
  const visit = (name, parentRewritten) => {
    const n = nodes.get(name);
    if (!n.trunk) {
      n.needsRebase = n.ownDrift || parentRewritten;
      if (n.needsRebase) {
        n.oldBase = n.ownDrift ? n.base : n.parentSha;
        n.reason = n.ownDrift
          ? (n.parentKind === 'trunk' ? `trunk moved ${n.behind} commit${n.behind === 1 ? '' : 's'} ahead` : `parent "${n.parent}" was rewritten or advanced (${n.behind} commit${n.behind === 1 ? '' : 's'} not in this branch)`)
          : `parent "${n.parent}" will be rebased first`;
        plan.push({ branch: n.name, onto: n.parent, oldBase: n.oldBase, reason: n.reason });
      }
    } else n.needsRebase = false;
    for (const c of n.children) visit(c, n.trunk ? false : n.needsRebase);
  };
  visit(trunk, false);

  return {
    trunk, trunkSha, nodes: Object.fromEntries(nodes), root: trunk, merged, plan,
    current: (all.find((b) => b.current) || {}).name || null,
    stale: plan.length,
  };
}

function shq(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function planScript(report) {
  const lines = ['#!/bin/sh', '# Generated by stacklens. Review, then run from the repository root.', 'set -e',
    'git diff --quiet && git diff --cached --quiet || { echo "working tree is dirty; commit or stash first" >&2; exit 1; }',
    'START=$(git rev-parse --abbrev-ref HEAD)'];
  if (report.plan.length === 0) lines.push('echo "stack is already in order"');
  for (const s of report.plan) {
    lines.push(`# ${s.reason}`);
    lines.push(`git rebase --onto ${shq(s.onto)} ${s.oldBase} ${shq(s.branch)}`);
  }
  lines.push('git checkout "$START"');
  return lines.join('\n') + '\n';
}

module.exports = { analyze, planScript, shq };
