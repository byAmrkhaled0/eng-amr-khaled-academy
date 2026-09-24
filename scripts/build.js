const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const { version: releaseVersion } = require(path.join(root, 'package.json'));
const releaseCacheVersion = releaseVersion.replace(/\./g, '-');
const releaseCacheName = `technominds-v${releaseCacheVersion}-backend-compatibility`;
require('./sync-shared-assets');
const entriesToCopy = [
  'index.html',
  'learning-path.html',
  'about.html',
  'practical.html',
  'materials.html',
  'theory-lectures.html',
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
  'llms.txt',
  'site-manifest.json',
  'teacher-manifest.json',
  'service-worker.js',
  'offline.html',
  '404.html'
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

// Every changed script or stylesheet gets a fresh immutable URL.
const assetRevisions = Object.fromEntries(fs.readdirSync(path.join(dist, 'assets'))
  .filter(name => /\.(css|js)$/.test(name)).map(name => [
    `/assets/${name}`,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(dist, 'assets', name))).digest('hex').slice(0, 12)
  ]));

// Vercel serves /assets with a one-year immutable cache. Normalize every local
// CSS/JS reference at build time so a release can never mix stale asset URLs.
for (const name of fs.readdirSync(dist).filter(file => file.endsWith('.html'))) {
  const file = path.join(dist, name);
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('assets/theme-init.js')) {
    html = html.replace(/<head>/i, '<head>\n<script src="assets/theme-init.js"></script>');
  }
  const versioned = html.replace(/((?:src|href)=["'])(\/?assets\/[^"'?#]+\.(?:css|js))(?:\?v=[^"']*)?(["'])/g,
    (_, prefix, asset, quote) => {
      const revision = assetRevisions[`/${asset.replace(/^\//, '')}`];
      return `${prefix}${asset}?v=${releaseVersion}${revision ? `&rev=${revision}` : ''}${quote}`;
    });
  fs.writeFileSync(file, versioned);
}

const workerFile = path.join(dist, 'service-worker.js');
if (fs.existsSync(workerFile)) {
  const worker = fs.readFileSync(workerFile, 'utf8')
    .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "${releaseCacheName}";`)
    .replace('const ASSET_REVISIONS = {};', `const ASSET_REVISIONS = ${JSON.stringify(assetRevisions)};`)
    .replace(/const ASSET_VERSION = "[^"]+";/, `const ASSET_VERSION = "${releaseVersion}";`);
  fs.writeFileSync(workerFile, worker);
}

console.log(`Vercel build ready: static files copied to dist/ (v${releaseVersion})`);
