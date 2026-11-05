'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,args=process.argv.slice(2);
const value=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const host=value('--host','127.0.0.1'),port=Number(value('--port',process.env.PORT||5173));
const demo=args.includes('--emulators'),loopback=new Set(['127.0.0.1','localhost','::1']);
if(demo&&!loopback.has(host))throw Error('Demo emulators must bind to loopback.');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8'};
const runtime={projectId:'demo-technominds',auth:9099,firestore:8181,functions:5002,storage:9199};
const localCsp="default-src 'self'; script-src 'self'; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: http://127.0.0.1:9199; connect-src 'self' http://127.0.0.1:5002 http://127.0.0.1:8181 http://127.0.0.1:9099 http://127.0.0.1:9199 ws://127.0.0.1:8181; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";
function send(req,res,status,type,data){
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':localCsp});res.end(req.method==='HEAD'?'':data);
}
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method))return send(req,res,405,'text/plain','Local preview is read-only HTTP. Use callable emulators.');
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch(_){return send(req,res,400,'text/plain','Invalid path');}
 // Decode before validating: encoded Windows separators must never escape assets.
 if(pathname.includes('\\')||pathname.includes('\0'))return send(req,res,400,'text/plain','Invalid path');
 if(pathname==='/__local/runtime.js')return send(req,res,200,mime['.js'],'window.TM_LOCAL_PREVIEW=true;window.TM_LOCAL_EMULATORS='+JSON.stringify(demo?runtime:null)+';');
 let file;
 if(pathname.startsWith('/__local/sdk/')){
  const name=pathname.slice('/__local/sdk/'.length);
  if(!/^firebase-(app|auth|firestore|functions|storage|messaging)-compat\.js$/.test(name))return send(req,res,404,'text/plain','SDK not available');
  file=path.join(root,'node_modules/firebase',name);
 }else{
  if(pathname==='/')pathname='/index.html';
  const rel=pathname.slice(1);
  if(rel.split('/').some(p=>p.startsWith('.')||['functions','node_modules','scripts','api'].includes(p))||!(/^assets\/|^[^/]+\.html$|^(site-manifest\.json|teacher-manifest\.json|service-worker\.js|manifest\.webmanifest|robots\.txt|sitemap\.xml|llms\.txt)$/.test(rel)))return send(req,res,404,'text/plain','Not a public preview asset');
  file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return send(req,res,403,'text/plain','Forbidden');
 }
 fs.readFile(file,(err,buffer)=>{
  if(err)return send(req,res,404,'text/plain','Not found');
  if(path.extname(file)==='.html'){
   let html=buffer.toString('utf8').replace(/<head>/i,'<head><script src="/__local/runtime.js"></script>');
   html=html.replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/(firebase-[a-z-]+-compat\.js)/g,'/__local/sdk/$1');
   // Never register a production service worker in local emulator/offline review.
   html=html.replace(/<script([^>]*)src="assets\/theme-init[^"]*"([^>]*)><\/script>/,'<script$1src="assets/theme-init.js"$2></script>');
   buffer=Buffer.from(html);
  }
  send(req,res,200,mime[path.extname(file)]||'application/octet-stream',buffer);
 });
});
if(!demo)console.log('UI preview only. To run the local backend and demo accounts: npm start');
server.listen(port,host,()=>console.log('TECHNO MINDS '+(demo?'DEMO EMULATORS':'OFFLINE PREVIEW')+' http://'+host+':'+port));

