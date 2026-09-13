'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function runFetch(source,url){
 const listeners={},pending=[];let requests=0,response;
 const cached={ok:true,source:'cache',clone(){return this;}},cache={match:async()=>cached,put:async()=>{}};
 vm.runInNewContext(source,{URL,Request,self:{location:{origin:'https://demo.test'},addEventListener:(name,fn)=>listeners[name]=fn},caches:{open:async()=>cache,match:async()=>cached},fetch:async()=>{requests++;return{ok:true,source:'network',clone(){return this;}};}});
 listeners.fetch({request:{url,method:'GET',mode:'cors'},respondWith:value=>response=value,waitUntil:value=>pending.push(value)});await response;await Promise.all(pending);return requests;
}
test('versioned cached assets avoid network; API responses do not enter asset cache',async()=>{
 const source=fs.readFileSync('service-worker.js','utf8'),version=require('../package.json').version;
 assert.equal(await runFetch(source,`https://demo.test/assets/app.js?v=${version}`),0);
 assert.equal(await runFetch(source,'https://demo.test/assets/app.js'),1);
 assert.equal(await runFetch(source,'https://demo.test/api/student'),0);
});
module.exports={runFetch};

test('CSS hotfix build changes the stylesheet URL and precaches that exact URL without changing backend version',async()=>{
 const path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-css-build-'));
 try{
  fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'assets'));
  fs.copyFileSync('scripts/build.js',path.join(root,'scripts/build.js'));
  fs.copyFileSync('scripts/sync-shared-assets.js',path.join(root,'scripts/sync-shared-assets.js'));
  fs.mkdirSync(path.join(root,'functions/lib'),{recursive:true});
  fs.copyFileSync('functions/lib/portal-results.js',path.join(root,'functions/lib/portal-results.js'));
  fs.copyFileSync('service-worker.js',path.join(root,'service-worker.js'));
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'67.8.5'}));
  fs.writeFileSync(path.join(root,'index.html'),'<head><link href="assets/v55.css?v=old" rel="stylesheet"><script src="assets/app.js?v=old"></script></head>');
  fs.writeFileSync(path.join(root,'assets/app.js'),'// unchanged script');
  fs.writeFileSync(path.join(root,'assets/v55.css'),'.attendance-control-card{display:flex}');
  const build=()=>{execFileSync(process.execPath,[path.join(root,'scripts/build.js')]);return fs.readFileSync(path.join(root,'dist/index.html'),'utf8');};
  const beforeHtml=build(),before=beforeHtml.match(/href="([^"]+)"/)[1];
  fs.writeFileSync(path.join(root,'assets/v55.css'),'.attendance-control-card{display:grid}');
  const afterHtml=build(),after=afterHtml.match(/href="([^"]+)"/)[1];
  assert.notEqual(before,after);assert.equal(new URL(after,'https://demo.test').searchParams.get('v'),'67.8.5');
  assert.equal(afterHtml.match(/src="(assets\/app.js[^"]+)"/)[1],beforeHtml.match(/src="(assets\/app.js[^"]+)"/)[1]);
  const listeners={},added=[];let installed;
  const worker=fs.readFileSync(path.join(root,'dist/service-worker.js'),'utf8');
  class LocalRequest{constructor(url){this.url=url;}}
  vm.runInNewContext(worker,{Request:LocalRequest,self:{addEventListener:(name,fn)=>listeners[name]=fn},caches:{open:async()=>({add:async request=>added.push(request.url)})}});
  listeners.install({waitUntil:value=>installed=value});await installed;
  assert.ok(added.includes('/'+after));assert.ok(!added.includes('/'+before));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('waiting service-worker update cannot auto-activate over an open workflow',async()=>{
 const source=fs.readFileSync('assets/app.js','utf8'),start=source.indexOf('function registerServiceWorker(){'),end=source.indexOf('function setupPWAInstall()',start),events={},messages=[],notices=[];
 const registration={waiting:{postMessage:msg=>messages.push(msg)},update:async()=>{},addEventListener:()=>{}};
 const context={location:{hostname:'demo.test',protocol:'https:',pathname:'/parent.html'},navigator:{serviceWorker:{register:async()=>registration,controller:{},addEventListener:()=>{}}},window:{addEventListener:(name,fn)=>events[name]=fn},toast:value=>notices.push(value)};
 vm.runInNewContext(source.slice(start,end)+';registerServiceWorker();',context);await events.load();
 assert.equal(messages.length,0);assert.equal(notices.length,1);
});
