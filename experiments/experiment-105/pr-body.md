The "SQLite C API" link in the `class Statement` note of `docs/api.md` points to `https://www.sqlite.org/c3ref`, which returns 404 (that directory has no index page). This links to the introduction page of the same reference instead.

```
$ curl -s -o /dev/null -w '%{http_code}\n' https://www.sqlite.org/c3ref
404
$ curl -s -o /dev/null -w '%{http_code}\n' https://www.sqlite.org/c3ref/intro.html
200
```

One-line change, docs only.
