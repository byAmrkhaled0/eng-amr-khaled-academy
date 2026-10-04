'use strict';
// Each suite owns a disposable database. No production endpoint is accepted.
const {spawnSync}=require('node:child_process');
const host=process.env.FIRESTORE_EMULATOR_HOST,project=process.env.GCLOUD_PROJECT;
if(project!=='demo-technominds'||!/^127\.0\.0\.1:\d+$/.test(host||''))throw new Error('Local demo emulator required.');
(async()=>{
 let failed=false;
 for(const file of ['firebase-rules.emulator.test.js','review.integration.test.js','production-hotfix-v7006.integration.test.js','question-banks.integration.test.js','student-grades.integration.test.js','attendance-concurrency.integration.test.js','content-access.security.integration.test.js','homework-upload.security.integration.test.js','owner.security.integration.test.js','xss-storage.security.integration.test.js','code-runner.security.integration.test.js','session-auth.security.integration.test.js','portal-idor.security.integration.test.js','admin-authorization.security.integration.test.js']){
  const response=await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});
  if(!response.ok)throw new Error('Could not reset disposable emulator database.');
  console.log(`Integration suite: ${file}`);
  const result=spawnSync(process.execPath,['--test',`scripts/${file}`],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  failed=failed||result.status!==0;
 }
 process.exitCode=failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
