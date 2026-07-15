const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
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
    if (err.code === 'EADDRINUSE') serve(port + 1);
    else throw err;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`موقع تيكنو مايندز يعمل الآن: http://127.0.0.1:${port}`);
    console.log(`صفحة الخدمات: http://127.0.0.1:${port}/services.html`);
    console.log(`صفحة Materials والتدريبات: http://127.0.0.1:${port}/materials.html`);
    console.log(`صفحة الامتحانات: http://127.0.0.1:${port}/exams.html`);
    console.log(`بوابة الطالب: http://127.0.0.1:${port}/student.html`);
    console.log(`صفحة التقييمات: http://127.0.0.1:${port}/reviews.html`);
    console.log(`رابط صفحة إدارة Techno Minds: http://127.0.0.1:${port}/teacher-login.html`);
  });
}
serve(5173);
