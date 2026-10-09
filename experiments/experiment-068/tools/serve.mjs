// Tiny static server for index.html (the page also works by just opening the file).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)));
const port = +process.env.PORT || 8065;
createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); })
  .listen(port, '127.0.0.1', () => console.log(`Spoolslip on http://127.0.0.1:${port}`));
