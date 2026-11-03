'use strict';
process.env.GCLOUD_PROJECT='demo-technominds';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8181';
process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199';
const admin=require('../functions/node_modules/firebase-admin');
if(!admin.apps.length)admin.initializeApp({projectId:'demo-technominds',storageBucket:'demo-technominds.appspot.com'});
(async()=>{
 const db=admin.firestore(),auth=admin.auth(),grade='أساسيات برمجة',group='phase6-group';
 const uid='phase6-local-owner',user={uid,email:'phase6-owner@example.test',password:'Local-Review-Only-6349',emailVerified:true};
 try{await auth.createUser(user);}catch(e){if(e.code!=='auth/uid-already-exists')throw e;await auth.updateUser(uid,{emailVerified:true,password:user.password});}
 await auth.setCustomUserClaims(uid,{admin:true});
 await db.doc('users/'+uid).set({role:'admin',active:true,name:'مراجعة محلية'});
 await db.doc('settings/platform').set({academicYear:'2026/2027',term:'الترم الأول',coursePrices:{[grade]:300}},{merge:true});
 await db.doc('groups/'+group).set({id:group,name:'مجموعة مراجعة محلية',grade,academicYear:'2026/2027',term:'الترم الأول',active:true,updatedAt:admin.firestore.Timestamp.now()});
 for(const code of ['123456','654321'])await db.doc('students/'+code).set({studentCode:code,parentCode:code,studentName:code==='123456'?'طالب مراجعة محلية':'طالب آخر',name:code==='123456'?'طالب مراجعة محلية':'طالب إضافي محلي',active:true,accessStatus:'approved',updatedAt:admin.firestore.Timestamp.now(),grade,group:'مجموعة مراجعة محلية',scheduleId:group,academicYear:'2026/2027',term:'الترم الأول',createdAt:'2026-09-01T00:00:00Z',contentAccessMode:'full',studentPhone:'01000000000',parentPhone:'01000000001'},{merge:true});
 await db.doc('units/phase6-unit').set({title:'وحدة اختبار المحاكيات',grade,active:true,published:true,status:'published',studentVisible:true,order:1,term:'الترم الأول',createdAt:admin.firestore.Timestamp.now(),updatedAt:admin.firestore.Timestamp.now()});
 for(let i=0;i<45;i++)await db.doc('student_progress/123456/lectures/phase6-old-'+String(i).padStart(2,'0')).set({sourceCollection:'materials',percent:100,viewed:true});
 await db.doc('lectures/zz-phase6-lecture').set({id:'zz-phase6-lecture',title:'محاضرة آمنة محلية',unitId:'phase6-unit',grade,active:true,published:true,status:'published',studentVisible:true,lectureNumber:1,order:1,term:'الترم الأول',createdAt:admin.firestore.Timestamp.now(),updatedAt:admin.firestore.Timestamp.now()});
 await db.doc('student_progress/123456/lectures/zz-phase6-lecture').set({sourceCollection:'lectures',percent:65,viewed:true,lastOpenedAt:admin.firestore.Timestamp.now()});
 console.log('Seeded demo emulators only.');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});

