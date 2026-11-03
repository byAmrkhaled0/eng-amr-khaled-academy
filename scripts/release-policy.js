'use strict';
// Shared, offline release preflight. This module never calls Firebase or deploys.
const fs=require('node:fs'),path=require('node:path');
function availableFunctions(root){
 const source=fs.readFileSync(path.join(root,'functions/index.js'),'utf8'),entry=fs.readFileSync(path.join(root,'functions/entry.js'),'utf8');
 const names=new Set([...source.matchAll(/\bexports\.([A-Za-z0-9_]+)\s*=/g)].map(m=>m[1]));
 const extras=entry.match(/module\.exports\s*=\s*\{\.\.\.base,([^}]+)\}/);
 for(const name of (extras?.[1]||'').split(',').map(s=>s.trim()))if(/^[A-Za-z0-9_]+$/.test(name))names.add(name);
 const list=source.match(/const REPORT_STUDENT_SOURCES\s*=\s*\[([^\]]+)\]/);
 if(list)for(const m of list[1].matchAll(/'([^']+)'/g))names.add('invalidateReport_'+m[1]);
 for(const m of source.matchAll(/for\(const collection of \[([^\]]+)\]\)\{\s*exports\[`(invalidateReport_|notifyStudent_)\$\{collection\}`\]/g))for(const value of m[1].matchAll(/'([^']+)'/g))names.add(m[2]+value[1]);
 return [...names].sort();
}
function planRelease(root,options={}){
 const functions=[...new Set((options.functions||[]).flatMap(s=>String(s).split(',')).map(s=>s.trim()).filter(Boolean))].sort();
 if(!functions.length&&!options.rules&&!options.indexes)throw Error('Select -Functions, -DeployRules, or -DeployIndexes explicitly.');
 const allowed=new Set(availableFunctions(root));
 for(const name of functions)if(!/^[A-Za-z0-9_]+$/.test(name)||!allowed.has(name))throw Error('Unknown Function: '+name);
 const resources=functions.map(name=>'functions:'+name);
 if(options.rules)resources.push('firestore:rules,storage');if(options.indexes)resources.push('firestore:indexes');
 return{project:'eng-amr-khaled-academy',version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,resources,productionChanges:false,confirmationRequired:true};
}
function requireConfirmation(confirmed){if(confirmed!==true)throw Error('No deployment performed. Review -Plan, then explicitly pass -ConfirmProduction for the selected resources.');}
function prepareEnvironment(root,confirmed){
 requireConfirmation(confirmed);
 const file=path.join(root,'functions/.env'),template=path.join(root,'functions/.env.example');
 if(fs.existsSync(file))return{environment:'existing'};
 if(!fs.existsSync(template))return{environment:'absent'};
 // Exclusive creation prevents racing a real environment file into an overwrite.
 try{fs.copyFileSync(template,file,fs.constants.COPYFILE_EXCL);return{environment:'template'};}catch(error){if(error.code==='EEXIST')return{environment:'existing'};throw error;}
}
function main(args,root){
 const options={functions:[]};let plan=false,confirmed=false,prepare=false;
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--functions'){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing Function selection');options.functions.push(args[++i]);}
  else if(arg==='--rules')options.rules=true;else if(arg==='--indexes')options.indexes=true;
  else if(arg==='--plan')plan=true;else if(arg==='--confirm-production')confirmed=true;else if(arg==='--prepare-env')prepare=true;
  else throw Error('Unknown release option: '+arg);
 }
 const result=planRelease(root,options);
 if(plan){if(prepare)throw Error('Plan cannot prepare environment files');return result;}
 requireConfirmation(confirmed);
 return prepare?prepareEnvironment(root,confirmed):result;
}
if(require.main===module){try{console.log(JSON.stringify(main(process.argv.slice(2),path.resolve(__dirname,'..'))));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={availableFunctions,planRelease,requireConfirmation,prepareEnvironment,main};
