// Optional: serve index.html locally. (You can also just double-click index.html.)
const http = require('http'), fs = require('fs'), p = require('path').join(__dirname, 'index.html');
const port = process.env.PORT || 8066;
http.createServer((q, r) => { r.setHeader('content-type', 'text/html; charset=utf-8'); r.end(fs.readFileSync(p)); })
  .listen(port, () => console.log('EasyReadify on http://localhost:' + port));
