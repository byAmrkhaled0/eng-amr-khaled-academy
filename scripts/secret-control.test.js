'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {scanPublicSecrets,assertPublicSecrets}=require('./secret-control');
function fixture(files,run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tm-secret-control-'));try{for(const [name,value] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),value);}run(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('nested environment and credential containers are blocked without echoing values',()=>fixture({'assets/nested/.env.local':'DO_NOT_PRINT_THIS_VALUE','assets/service-account-test.json':'{}'},dir=>{assert.equal(scanPublicSecrets(dir).length,2);assert.throws(()=>assertPublicSecrets(dir),error=>!error.message.includes('DO_NOT_PRINT_THIS_VALUE'));}));
test('private keys embedded in public JS are blocked',()=>fixture({'assets/unsafe.js':'-----BEGIN '+'PRIVATE KEY-----'},dir=>assert.equal(scanPublicSecrets(dir)[0].kind,'private-key')));
test('renamed service account JSON is blocked',()=>fixture({'assets/unrelated.json':JSON.stringify({type:'service_account',private_key:'synthetic'})},dir=>assert.equal(scanPublicSecrets(dir)[0].kind,'service-account')));
test('provider tokens are blocked',()=>fixture({'assets/key.js':'gh'+'p_'+'x'.repeat(36)},dir=>assert.equal(scanPublicSecrets(dir)[0].kind,'provider-credential')));
test('embedded server API key is blocked and redacted',()=>fixture({'assets/server.js':'JUDGE0_API_KEY="'+'synthetic-key-value'+'"'},dir=>assert.throws(()=>assertPublicSecrets(dir),error=>!error.message.includes('synthetic-key-value'))));
test('public Firebase configuration and normal assets remain allowed',()=>fixture({'assets/firebase-config.js':'const config={apiKey:"AIza-public-browser-key",projectId:"demo-test"};','assets/site.css':'body{color:navy}'},dir=>assert.deepEqual(scanPublicSecrets(dir),[])));
test('public allowlist excludes backend environment files',()=>fixture({'functions/.env':'synthetic','index.html':'<main>Safe</main>'},dir=>assert.deepEqual(scanPublicSecrets(dir,['index.html']),[])));
