'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const s=require('./testing/security-emulator');const {inventory}=require('./testing/authorization-inventory');const endpoints=inventory();const results=[];
test('inventory covers every actual exported function, with no unclassified endpoint',()=>{assert.deepEqual(endpoints.map(r=>r.name).sort(),Object.keys(s.functions).sort());for(const row of endpoints)assert(['PUBLIC','ADMIN','PORTAL-STUDENT','PORTAL-PARENT','INTERNAL/TRIGGER/SCHEDULED'].includes(row.category));});
const denied=[['anonymous',null,null],['no-claim',{uid:'matrix-no-claim',token:{email_verified:true}},{role:'admin',active:true}],['unverified',{uid:'matrix-unverified',token:{admin:true,email_verified:false}},{role:'admin',active:true}],['wrong-role',{uid:'matrix-role',token:{admin:true,email_verified:true}},{role:'teacher',active:true}],['inactive',{uid:'matrix-inactive',token:{admin:true,email_verified:true}},{role:'admin',active:false}]];
test.before(async()=>{await s.seed();for(const [,identity,profile] of denied)if(identity)await s.db.doc('users/'+identity.uid).set(profile);});
for(const row of endpoints.filter(r=>r.category==='ADMIN')){
 for(const [label,identity] of denied)test(`${row.name}: ${label} denied`,async()=>{await assert.rejects(s.call(row.name,{},identity),error=>{results.push({endpoint:row.name,scenario:label,result:'DENY',code:error.code});return ['unauthenticated','permission-denied'].includes(error.code);});});
 test(`${row.name}: verified active admin passes authorization boundary`,async()=>{
  // Empty payload intentionally probes authorization, not a blanket claim of CRUD coverage.
  try{await s.call(row.name,{},s.auth);results.push({endpoint:row.name,scenario:'verified-active-admin',result:'AUTHORIZATION_ACCEPTED',businessResult:'returned'});}catch(error){results.push({endpoint:row.name,scenario:'verified-active-admin',result:'AUTHORIZATION_ACCEPTED',businessResult:error.code||'domain-error'});assert(!['unauthenticated','permission-denied'].includes(error.code),`${row.name} rejected its authorized admin: ${error.message}`);}
 });
}
test('representative valid admin operations are allowed after the complete claim/profile boundary',async()=>{assert((await s.call('getMotivationSettingsAdmin',{},s.auth)));assert((await s.call('searchStudentsAdmin',{query:s.code},s.auth)));await s.call('saveStudentPrivateNote',{studentCode:s.code,note:'test-only',title:'test'},s.auth);});

test.after(()=>{require('node:fs').writeFileSync(require('node:path').join(__dirname,'../docs/PHASE2_1_ADMIN_AUTHORIZATION_MATRIX.json'),JSON.stringify({method:'actual callable run handlers with Firestore emulator; authorization boundary, not all business operations',results},null,2)+'\n');});
