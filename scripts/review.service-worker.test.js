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

test('waiting service-worker update cannot auto-activate over an open workflow',async()=>{
 const source=fs.readFileSync('assets/app.js','utf8'),start=source.indexOf('function registerServiceWorker(){'),end=source.indexOf('function setupPWAInstall()',start),events={},messages=[],notices=[];
 const registration={waiting:{postMessage:msg=>messages.push(msg)},update:async()=>{},addEventListener:()=>{}};
 const context={location:{hostname:'demo.test',protocol:'https:',pathname:'/parent.html'},navigator:{serviceWorker:{register:async()=>registration,controller:{},addEventListener:()=>{}}},window:{addEventListener:(name,fn)=>events[name]=fn},toast:value=>notices.push(value)};
 vm.runInNewContext(source.slice(start,end)+';registerServiceWorker();',context);await events.load();
 assert.equal(messages.length,0);assert.equal(notices.length,1);
});
