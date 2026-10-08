'use strict';
// Disposable local demo databases only. Does not reset project source or production.
const {spawnSync}=require('node:child_process');
(async()=>{const host=process.env.FIRESTORE_EMULATOR_HOST;if(process.env.GCLOUD_PROJECT!=='demo-technominds'||!/^127\.0\.0\.1:\d+$/.test(host||''))throw Error('Local demo emulator required');let failed=false;
for(const file of ['firebase-rules.emulator.test.js','session-auth.security.integration.test.js','portal-idor.security.integration.test.js','admin-authorization.security.integration.test.js','exam-recovery-v7007.security.integration.test.js']){
 const r=await fetch('http://'+host+'/emulator/v1/projects/demo-technominds/databases/(default)/documents',{method:'DELETE'});if(!r.ok)throw Error('Disposable demo reset failed');console.log('Suite: '+file);const run=spawnSync(process.execPath,['--test','scripts/'+file],{stdio:'inherit',env:process.env});if(run.error)throw run.error;failed=failed||run.status!==0;
}process.exitCode=failed?1:0;})().catch(e=>{console.error(e);process.exitCode=1;});
