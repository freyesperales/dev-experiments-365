// Optional: `npm start` serves index.html on http://localhost:8080 (the file also works via file://).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url));
const port = +process.env.PORT || 8080;
createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); })
  .listen(port, () => console.log(`Hashboard on http://localhost:${port}`));
