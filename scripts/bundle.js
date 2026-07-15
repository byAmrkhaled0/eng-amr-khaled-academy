'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets');
const vendor = path.join(assets, 'vendor');
fs.mkdirSync(vendor, { recursive: true });

async function copyFirebase(name) {
  const source = path.join(root, 'node_modules', 'firebase', `${name}.js`);
  if (!fs.existsSync(source)) throw new Error(`Firebase vendor file is missing: ${source}`);
  fs.copyFileSync(source, path.join(vendor, `${name}.js`));
}

async function main() {
  await Promise.all([
    esbuild.build({ entryPoints: [path.join(root, 'src', 'practical-editor.js')], outfile: path.join(assets, 'practical.js'), bundle: true, minify: true, format: 'iife', target: ['es2020'], legalComments: 'none' }),
    esbuild.build({ entryPoints: [path.join(root, 'src', 'qr-tools.js')], outfile: path.join(assets, 'qr-tools.js'), bundle: true, minify: true, format: 'iife', target: ['es2020'], legalComments: 'none' })
  ]);
  await Promise.all([
    'firebase-app-compat',
    'firebase-auth-compat',
    'firebase-firestore-compat',
    'firebase-storage-compat',
    'firebase-functions-compat'
  ].map(copyFirebase));
  console.log('Browser bundles and local Firebase SDK files are ready.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
