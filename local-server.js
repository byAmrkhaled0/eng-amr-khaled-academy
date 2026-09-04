const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const cliArgs = process.argv.slice(2);
function cliValue(flag, fallback) {
  const index = cliArgs.indexOf(flag);
  return index >= 0 && cliArgs[index + 1] ? cliArgs[index + 1] : fallback;
}
const host = cliValue('--host', '127.0.0.1');
const requestedPort = Number(cliValue('--port', process.env.PORT || 5173));
const strictPort = cliArgs.includes('--strictPort');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function serve(port) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.normalize(path.join(root, urlPath));
    if (!filePath.startsWith(root)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(root, 'index.html'), (err2, fallback) => {
          if (err2) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fallback);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && !strictPort) serve(port + 1);
    else throw err;
  });
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    console.log(`موقع م. عمرو خالد يعمل الآن: http://${displayHost}:${port}`);
    console.log(`صفحة التدريبات والتحديات البرمجية: http://${displayHost}:${port}/materials.html`);
    console.log(`صفحة الاختبارات: http://${displayHost}:${port}/exams.html`);
    console.log(`بوابة الطالب: http://${displayHost}:${port}/student.html`);
    console.log(`صفحة التقييمات: http://${displayHost}:${port}/reviews.html`);
    console.log(`رابط صفحة المدرس الخاصة: http://${displayHost}:${port}/teacher-login.html`);
  });
}
serve(Number.isFinite(requestedPort) ? requestedPort : 5173);
