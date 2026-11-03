'use strict';
// Local demo only. A generated, disposable signing identity is never a real credential.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),project='demo-technominds';
const args=process.argv.slice(2),portIndex=args.indexOf('--port'),port=portIndex<0?5412:Number(args[portIndex+1]);
if(!(args.length===0||args.length===2&&args[0]==='--port')||!Number.isInteger(port)||port<1024||port>65535)throw Error('Usage: npm run local:review -- --port 5412');
if(Number(process.versions.node.split('.')[0])!==22)throw Error('Node.js 22 is required.');
const java=spawnSync('java',['-version'],{encoding:'utf8'});if(java.error||java.status!==0||!/(?:version |openjdk )"?(?:2[1-9]|[3-9][0-9])(?:[." ]|$)/.test((java.stderr||'')+(java.stdout||'')))throw Error('Java 21 or later is required for Firebase emulators.');
const cli=path.join(root,'node_modules/firebase-tools/lib/bin/firebase.js');
for(const file of [cli,path.join(root,'functions/node_modules/firebase-admin/package.json')])if(!fs.existsSync(file))throw Error('Install dependencies first: npm ci, then npm --prefix functions ci');
const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
const services=['auth','firestore','storage','functions'];
for(const service of services){const value=config.emulators?.[service];if(value?.host!=='127.0.0.1'||!Number.isInteger(value.port))throw Error('All demo emulator hosts must remain 127.0.0.1.');}
const ports=[port,...services.map(s=>config.emulators[s].port),config.emulators?.ui?.port||4001,4400];
if(new Set(ports).size!==ports.length)throw Error('Preview and emulator ports must be distinct.');
async function available(value){await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('Local port '+value+' is busy. Close the previous local demo with Ctrl+C in its terminal, then run npm start. Dependencies do not need reinstalling.')));server.listen(value,'127.0.0.1',()=>server.close(resolve));});}
(async()=>{
 for(const value of ports)await available(value);
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'technominds-demo-')),key=path.join(folder,'signing.json');
 const runtimeTmp=path.join(folder,'runtime');fs.mkdirSync(runtimeTmp);
 const cleanup=()=>{try{fs.unlinkSync(key);}catch(e){if(e.code!=='ENOENT')console.error('Remove the temporary demo key manually:',key);}try{fs.rmdirSync(folder);}catch(_){};};
 try{
 const {privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 fs.writeFileSync(key,JSON.stringify({type:'service_account',project_id:project,client_email:'local-only@demo-technominds.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})}),{mode:0o600});
 const env={...process.env,TMP:runtimeTmp,TEMP:runtimeTmp,TMPDIR:runtimeTmp,GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,GOOGLE_APPLICATION_CREDENTIALS:key,FUNCTIONS_DISCOVERY_TIMEOUT:process.env.FUNCTIONS_DISCOVERY_TIMEOUT||'60',CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'1',NO_GCE_CHECK:'true',TM_LOCAL_REVIEW_PORT:String(port),JUDGE0_BASE_URL:'disabled-local-review',JUDGE0_API_KEY:'',JUDGE0_RAPIDAPI_HOST:''};
 // Invalid local-only runner configuration fails closed before any provider fetch.
 const child=spawn(process.execPath,[cli,'emulators:exec','--project',project,'--only',services.join(','),'node scripts/local-review-session.js'],{cwd:root,env,stdio:'inherit'});
 child.once('error',error=>{cleanup();console.error(error.message);process.exitCode=1;});
 child.once('exit',code=>{cleanup();process.exitCode=code??1;});
 process.once('exit',cleanup);
 process.once('SIGINT',()=>{child.kill('SIGINT');cleanup();});
 process.once('SIGTERM',()=>{child.kill('SIGTERM');cleanup();});
 }catch(error){cleanup();throw error;}
})().catch(error=>{console.error(error.message);process.exitCode=1;});

