# Saturday OSS — better-sqlite3 docs link fix

The better-sqlite3 API docs linked to a SQLite page that returns 404; this contribution points the link at the page that exists, and records the second "broken" link that turned out to be a false alarm.

En español: la documentación de better-sqlite3 enlazaba a una página de SQLite que da error 404. Esta contribución corrige ese enlace (una línea) y deja anotado otro enlace que parecía roto y no lo estaba, para no enviar un arreglo innecesario.

**Pull request:** https://github.com/WiseLibs/better-sqlite3/pull/1536 (against `master`, opened 2026-11-21)

## The problem
`docs/api.md`, in the note under `class Statement`:

```md
> NOTE: If you've used the [SQLite C API](https://www.sqlite.org/c3ref), you might expect there to be a "finalize" method…
```

`https://www.sqlite.org/c3ref` is a directory without an index page, so the link returns 404.

## The fix
```diff
-[SQLite C API](https://www.sqlite.org/c3ref)
+[SQLite C API](https://www.sqlite.org/c3ref/intro.html)
```
`c3ref/intro.html` is the introduction page of the same reference, and the neighbouring links in that file already use `c3ref/<page>.html`. Diff: [`change.patch`](change.patch) — 1 line in one file.

## Verification
```
$ curl -s -o /dev/null -w '%{http_code}\n' https://www.sqlite.org/c3ref
404
$ curl -s -o /dev/null -w '%{http_code}\n' https://www.sqlite.org/c3ref/intro.html
200
```
Full log in [`test-log.txt`](test-log.txt): 98 external URLs from `README.md` and `docs/` requested once each, plus relative links and heading anchors in the 13 Markdown files.

## The link that was not broken
Last Saturday's shortlist listed a second dead link in the same file (an issue comment under the repository's old owner). With `curl` it returns 404; with a browser user agent GitHub answers 301 to the current repository. A person clicking it arrives fine, so it stayed out of the PR. Lesson kept for the next link checks: confirm every 404 with a browser user agent before calling it broken.

## Why this one
Francisco's `whenfree` project depends on better-sqlite3. Candidate selection, the projects ruled out and the follow-up on last week's pull request are in [`RESEARCH.md`](RESEARCH.md). PR text: [`pr-body.md`](pr-body.md). Contribution notes: [`CONTRIBUTION.md`](CONTRIBUTION.md).

## Limitations
It is a one-line documentation change. The maintainers may change or decline it; this folder records what was sent, not the outcome. Links were checked from one network on one day.

---
Daily Security Lab · Experiment 105 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
