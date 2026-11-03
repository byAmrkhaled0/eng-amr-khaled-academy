'use strict';
// Isolated owner preview. No Firebase SDK/config, production traffic, or service worker.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),port=Number(process.env.TM_REVIEW_PORT||5188);
const teacher=fs.readFileSync(path.join(root,'teacher-login.html'),'utf8');
const css=[...teacher.matchAll(/<link[^>]*href="(assets\/[^"?]+\.css)[^"]*"[^>]*>/g)].map(m=>`<link rel="stylesheet" href="/${m[1]}">`).join('');
const adminScripts=[...teacher.matchAll(/<script\s+defer\b[^>]*\bsrc="(assets\/[^?]+)\?/g)].map(m=>m[1]).filter(s=>!/firebase-(config|sync)|offline-attendance/.test(s)).map(s=>`<script defer src="/${s}"></script>`).join('');
const banner='<aside style="padding:8px;background:#061e35;color:white;font:13px system-ui;text-align:center" dir="rtl">معاينة محلية ببيانات تجريبية فقط · كود البوابات: 123456 · <a href="/admin-local.html" style="color:#70def4">الإدارة</a> · <a href="/student.html" style="color:#70def4">الطالب</a> · <a href="/parent.html" style="color:#70def4">ولي الأمر</a></aside>';
const admin=`<!doctype html><html lang="ar" dir="rtl" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${css}</head><body>${banner}<div id="adminRoot"></div><div id="toast"></div>${adminScripts}<script defer src="/scripts/browser/attendance-fixture.js"></script><script defer src="/scripts/browser/phase3c-dense-fixture.js"></script><script defer src="/scripts/browser/final-local-admin.js"></script></body></html>`;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);res.end('Read-only local preview');return;}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
 if(name.startsWith('/api/')||name==='/service-worker.js'){res.writeHead(403);res.end('Production services disabled');return;}
 if(name==='/')name='/index.html';
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; frame-src 'none'; worker-src 'none'; form-action 'self'; base-uri 'self'; object-src 'none'");
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(name==='/admin-local.html'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(admin);return;}
 const file=path.resolve(root,'.'+name),relative=path.relative(root,file);
 if(relative.startsWith('..')||path.isAbsolute(relative)||/^(?:functions|node_modules|sources)(?:[\\/]|$)/.test(relative)||relative.startsWith('.')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
 if(file.endsWith('.html')){
  let html=fs.readFileSync(file,'utf8').replace(/<script\b[^>]*src="(?:https?:[^"']+|assets\/firebase-[^"']+)"[^>]*>\s*<\/script>/g,'');
  html=html.replace('<head>','<head><script src="/scripts/browser/final-local-services.js"></script>').replace(/(<body[^>]*>)/,'$1'+banner);
  res.setHeader('Content-Type',mime['.html']);res.end(html);return;
 }
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
});
server.listen(port,'127.0.0.1',()=>console.log(`Isolated local review: http://127.0.0.1:${port}\nAdmin: /admin-local.html | Portal code: 123456 | All data synthetic.`));

