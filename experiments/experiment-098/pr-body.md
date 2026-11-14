The "install without curl_cffi" page downloads `requirements.txt` from `main`, but that file was removed when the dependencies moved to `pyproject.toml`, so the command now fails:

```
$ curl -fsSL https://raw.githubusercontent.com/ranaroussi/yfinance/main/requirements.txt
curl: (22) The requested URL returned error: 404
```

The next line, `pip install --no-deps yfinance`, still succeeds, so you end up with yfinance installed but without pandas, numpy or requests (`import yfinance` -> `ModuleNotFoundError: No module named 'numpy'`).

This changes the instructions to a normal install followed by removing curl_cffi. Checked in a clean venv with yfinance 1.8.0 (Python 3.13, Windows): `import yfinance` works, `yfinance._http.HAS_CURL_CFFI` is `False`, the backend is `requests`, and the existing fallback warning is printed. `pip check` reports curl-cffi as a missing requirement, which is expected because it is still a declared dependency.
