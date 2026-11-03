'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
// Shared safety policy is tested everywhere; the real PowerShell adapter is
// additionally executed on Windows. No test is marked skipped or forced green.
const files=['release-deployment-guard.test.js'];
if(process.platform==='win32')files.push('release-deployment-guard.windows.test.js');
for(const file of files){
 const result=spawnSync(process.execPath,['--test',path.join(__dirname,file)],{cwd:path.resolve(__dirname,'..'),stdio:'inherit',env:process.env});
 if(result.error){console.error(result.error.message);process.exit(1);}
 if(result.status!==0)process.exit(result.status||1);
}
