'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const s=require('./testing/security-emulator');
test('owner bootstrap rejects anonymous, email-only and unverified admin, ignores requested role',async()=>{
 for(const auth of [null,{uid:'owner-email',token:{email:'owner@example.test',email_verified:true}},{uid:'owner-unverified',token:{admin:true,email_verified:false}}])await s.deny(s.call('activateOwnerAccount',{role:'admin',email:'owner@example.test'},auth));
 const auth={uid:'owner-first-bootstrap',token:{admin:true,email_verified:true,email:'owner@example.test'}};assert.equal((await s.call('activateOwnerAccount',{role:'teacher'},auth)).role,'admin');assert.equal((await s.db.doc('users/'+auth.uid).get()).data().role,'admin');
});
for(const profile of [{role:'teacher',active:true},{role:'admin',active:false}])test('owner bootstrap cannot reverse server-side profile revocation '+JSON.stringify(profile),async()=>{
 const uid=profile.role==='teacher'?'owner-role-revoked':'owner-disabled';await s.db.doc('users/'+uid).set(profile);await s.deny(s.call('activateOwnerAccount',{role:'admin',active:true},{uid,token:{admin:true,email_verified:true}}));assert.deepEqual((await s.db.doc('users/'+uid).get()).data(),profile);
});
test('revoked claim cannot use the ordinary admin service or bootstrap',async()=>{await s.db.doc('users/owner-revoked-claim').set({role:'admin',active:true});const auth={uid:'owner-revoked-claim',token:{email_verified:true,admin:false}};await s.deny(s.call('getMotivationSettingsAdmin',{},auth));await s.deny(s.call('activateOwnerAccount',{},auth));});
