'use strict';
const {isIP}=require('node:net');
const dns=require('node:dns').promises;

function integerEnv(name,fallback,min,max,env=process.env){
 const raw=env[name];if(raw===undefined||raw==='')return fallback;
 const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,Math.round(value))):fallback;
}
function privateAddress(address){
 const v=address.toLowerCase().replace(/^\[|\]$/g,'');
 if(isIP(v)===4){const [a,b]=v.split('.').map(Number);return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19);}
 if(isIP(v)===6){if(v.startsWith('::ffff:')){const tail=v.slice(7);if(isIP(tail)===4)return privateAddress(tail);const words=tail.split(':');if(words.length===2){const n=parseInt(words[0],16),m=parseInt(words[1],16);return privateAddress(`${n>>8}.${n&255}.${m>>8}.${m&255}`);}}return v==='::'||v==='::1'||/^f[cd]/.test(v)||/^fe[89abcdef]/.test(v)||/^ff/.test(v);}
 return false;
}
function endpointConfig(env){
 const raw=String(env.JUDGE0_BASE_URL||'https://ce.judge0.com');
 if(raw.length>2048||/[\u0000-\u0020\u007f\\%]/.test(raw))throw new Error('invalid-runner-configuration');
 const u=new URL(raw);if(u.username||u.password||u.search||u.hash||!['https:','http:'].includes(u.protocol))throw new Error('invalid-runner-configuration');
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(!isIP(host)&&host!=='localhost'&&(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(host)||host.endsWith('.')))throw new Error('invalid-runner-configuration');
 const origins=String(env.JUDGE0_ALLOWED_ORIGINS||'').split(',').map(v=>v.trim()).filter(Boolean);
 if(origins.length>8||!(u.origin==='https://ce.judge0.com'||origins.includes(u.origin)))throw new Error('invalid-runner-configuration');
 const allowPrivate=env.JUDGE0_ALLOW_PRIVATE_ENDPOINT==='true'&&origins.includes(u.origin);
 const local=privateAddress(host)||/^(localhost|metadata\.google\.internal)$/i.test(host)||/\.(local|internal|localhost)$/i.test(host);
 if(local&&!allowPrivate||u.protocol!=='https:'&&!(local&&allowPrivate))throw new Error('invalid-runner-configuration');
 if(u.port&&!allowPrivate&&!origins.includes(u.origin))throw new Error('invalid-runner-configuration');
 // A custom prefix is deployment-owned, never constructed from request data.
 if(!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(u.pathname))throw new Error('invalid-runner-configuration');
 return{baseUrl:u.href.replace(/\/+$/,''),hostname:host,allowPrivate};
}
function codeRunnerConfig(env=process.env){
 const endpoint=endpointConfig(env),apiKey=String(env.JUDGE0_API_KEY||''),apiKeyHeader=String(env.JUDGE0_API_KEY_HEADER||'X-Auth-Token'),rapidHost=String(env.JUDGE0_RAPIDAPI_HOST||'');
 if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/.test(apiKeyHeader)||/^(?:host|cookie|connection|content-.*|accept|origin|referer|forwarded|proxy-.*|x-forwarded-.*|sec-.*|transfer-encoding|te|trailer|upgrade)$/i.test(apiKeyHeader)||apiKey.length>4096||/[\u0000-\u001f\u007f]/.test(apiKey)||rapidHost&&!/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(rapidHost))throw new Error('invalid-runner-configuration');
 return{...endpoint,apiKey,apiKeyHeader,rapidHost,codeMax:integerEnv('CODE_MAX_BYTES',65536,1024,262144,env),stdinMax:integerEnv('STDIN_MAX_BYTES',16384,0,65536,env),outputMax:integerEnv('OUTPUT_MAX_BYTES',32768,1024,131072,env),cpuSeconds:integerEnv('CODE_CPU_SECONDS',5,1,15,env),wallSeconds:integerEnv('CODE_WALL_SECONDS',10,2,30,env),memoryKb:integerEnv('CODE_MEMORY_KB',131072,32768,262144,env),maxProcesses:integerEnv('CODE_MAX_PROCESSES',128,64,256,env),ipRuns:integerEnv('CODE_IP_RUNS_PER_MINUTE',60,20,120,env)};
}
async function validateEndpointAddresses(config,lookup=dns.lookup){
 if(config.allowPrivate)return;
 const result=isIP(config.hostname)?[{address:config.hostname}]:await lookup(config.hostname,{all:true});
 if(!result.length||result.some(row=>!isIP(row.address)||privateAddress(row.address)))throw new Error('invalid-runner-configuration');
}
function limitedOutput(value,maxBytes){
 const raw=typeof value==='string'?value:'',bytes=Buffer.from(raw,'utf8');if(bytes.length<=maxBytes)return raw;
 const suffix='\n… تم اختصار المخرجات',limit=Math.max(0,maxBytes-Buffer.byteLength(suffix));let end=limit;
 while(end>0&&(bytes[end]&0xc0)===0x80)end--;
 return bytes.subarray(0,end).toString('utf8')+suffix;
}
async function boundedJson(response,maxBytes){
 const length=Number(response.headers.get('content-length'));if(length>maxBytes){await response.body?.cancel();throw new Error('judge0-response-size');}
 if(!response.body)throw new Error('judge0-invalid-response');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('judge0-response-size');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
 const data=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('judge0-invalid-response');return data;
}
function statusId(data){const id=data.status?.id;if(!Number.isInteger(id)||id<1||id>14)throw new Error('judge0-invalid-status');return id;}
function submissionToken(value){if(typeof value!=='string'||! /^[A-Za-z0-9_-]{1,100}$/.test(value))throw new Error('judge0-invalid-token');return value;}
function numericResult(value,min,max,integer=false){const n=typeof value==='number'||typeof value==='string'&&/^(?:\d+)(?:\.\d+)?$/.test(value)?Number(value):NaN;return Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n))?n:null;}
module.exports={integerEnv,codeRunnerConfig,privateAddress,validateEndpointAddresses,limitedOutput,boundedJson,statusId,submissionToken,numericResult};

function assertProviderCapabilities(data,config){
 const limits={max_cpu_time_limit:config.cpuSeconds,max_wall_time_limit:config.wallSeconds,max_memory_limit:config.memoryKb,max_max_file_size:1024,max_max_processes_and_or_threads:config.maxProcesses};
 for(const [name,limit]of Object.entries(limits))if(typeof data[name]!=='number'||!Number.isFinite(data[name])||data[name]<limit)throw new Error('judge0-provider-limits');
 if(data.enable_network!==false)throw new Error('judge0-provider-network-policy');
}
module.exports.assertProviderCapabilities=assertProviderCapabilities;
