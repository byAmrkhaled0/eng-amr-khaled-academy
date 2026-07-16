const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const entriesToCopy = [
  'index.html',
  'services.html',
  'learning-path.html',
  'about.html',
  'practical.html',
  'materials.html',
  'questions.html',
  'exams.html',
  'student.html',
  'parent.html',
  'reviews.html',
  'teacher-login.html',
  'privacy.html',
  'terms.html',
  'assets',
  'robots.txt',
  'sitemap.xml',
  'site.webmanifest',
  'teacher.webmanifest',
  'service-worker.js',
  'firebase-messaging-sw.js',
  'offline.html'
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const entry of entriesToCopy) {
  copyRecursive(path.join(root, entry), path.join(dist, entry));
}

console.log('Vercel build ready: static files copied to dist/');
