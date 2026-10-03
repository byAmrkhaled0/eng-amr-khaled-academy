'use strict';
// Execute only application handlers in a test VM. Student input is never evaluated.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {requestIp}=require('../../functions/lib/request-ip');
function harness({root=path.resolve(__dirname,'../..'),env={},fetchImpl=fetch,fast=true}={}){
 const source=fs.readFileSync(path.join(root,'functions/index.js'),'utf8'),start=source.indexOf('const CODE_LANGUAGES ='),end=source.indexOf('// Curriculum V61:',start);const records=new Map(),rates=[],counts=new Map();
 class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const db={collection(name){return {
  doc(id){return {async set(value){records.set(name+'/'+id,value);}, async get(){return {exists:records.has(name+'/'+id),data:()=>records.get(name+'/'+id)};}};},
  limit(){return {get:async()=>({docs:[]})};}
 };}};
 async function rateLimitPublic(action,identity,request,identityLimit,ipLimit){rates.push({identity,ip:requestIp(request,env),identityLimit,ipLimit});for(const [key,limit]of [[action+identity,identityLimit],[action+'ip'+requestIp(request,env),ipLimit]]){const n=(counts.get(key)||0)+1;counts.set(key,n);if(n>limit)throw new HttpsError('resource-exhausted','limited');}}
 const context={exports:{},require:n=>n==='./lib/code-runner-policy'?(()=>{const p=require(path.join(root,'functions/lib/code-runner-policy'));return {...p,codeRunnerConfig:()=>p.codeRunnerConfig(env),validateEndpointAddresses:c=>p.validateEndpointAddresses(c,async()=>[{address:'203.0.113.42'}])};})():require(n),process:{env},Buffer,URL,crypto,fetch:fetchImpl,AbortController,HttpsError,CALLABLE_OPTIONS:{},PLATFORM_VERSION:'test',onCall:(_,fn)=>fn,onRequest:(_,fn)=>fn,db,requestIp:r=>requestIp(r,env),rateLimitPublic,text:(v,n)=>String(v??'').trim().slice(0,n),hash:v=>crypto.createHash('sha256').update(String(v)).digest('hex'),FieldValue:{serverTimestamp:()=>new Date()},Timestamp:{fromMillis:n=>({toMillis:()=>n})},setTimeout:(fn,ms)=>setTimeout(fn,fast&&ms===450?0:ms),clearTimeout,console};
 vm.runInNewContext(source.slice(start,end),context,{filename:'actual-runner-handler.js'});return{functions:context.exports,records,rates,context,request:(patch={},ip='198.51.100.23')=>({data:{language:'javascript',sourceCode:"console.log('test')",stdin:'',visitorId:'visitor',...patch},rawRequest:{socket:{remoteAddress:ip},headers:{}}})};
}
module.exports={harness};
