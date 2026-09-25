'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const backend=fs.readFileSync(require.resolve('../functions/index.js'),'utf8'),app=fs.readFileSync(require.resolve('../assets/app.js'),'utf8'),admin=fs.readFileSync(require.resolve('../assets/admin.js'),'utf8');
const {calculateMonthlyReport,membershipAt}=require('../functions/lib/monthly-report');
const {normalizeUnifiedResults}=require('../functions/lib/portal-results');
const report={schemaVersion:11,policyVersion:'monthly-v11-student-level-homework-progress',monthKey:'2026-09',student:{name:'محمد أحمد',studentCode:'80463690'},level:'جيد جدًا',overallScore:85,attendance:{percentage:100},results:{average:80,rows:[]},homework:{required:4,missing:1,averageGrade:90},practical:{count:3,completed:2},strengths:['أدى جيدًا في التمارين'],concerns:['واجب يحتاج استكمال'],recommendations:['سلّم الواجب قبل الحصة القادمة']};
function parentHarness({share=false,cancel=false,delay=false}={}){
  const events={opens:[],downloads:0,share:null,notices:[],resolved:!delay};let release;
  const image=delay?new Promise(resolve=>{release=()=>{events.resolved=true;resolve(new Blob(['png'],{type:'image/png'}));};}):Promise.resolve(new Blob(['png'],{type:'image/png'}));
  const context={window:{open:url=>{const popup={opener:null,closed:false,location:{href:''},close(){this.closed=true;}};events.opens.push({url,popup});return popup;}},navigator:{share:async payload=>{events.share=payload;if(cancel)throw Object.assign(new Error('cancel'),{name:'AbortError'});},canShare:()=>share,clipboard:{writeText:async()=>{}}},confirm:()=>true,parentReportImageBlob:()=>image,whatsappPhone:v=>v,whatsappLink:(phone,message)=>`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    compatibleMonthlyReport:()=>true,reportMonthLabel:()=> 'سبتمبر ٢٠٢٦',parentReportTrend:()=>({status:'insufficient',detail:'لا بيانات سابقة'}),toast:()=>{},File:class{constructor(parts,name,{type}){this.name=name;this.type=type;this.parts=parts;}},URL:{createObjectURL:()=> 'blob:png',revokeObjectURL:()=>{}},setTimeout:()=>{},document:{body:{appendChild:()=>{}},createElement:()=>({click:()=>events.downloads++,remove:()=>{}})}};
  vm.runInNewContext(app.slice(app.indexOf('function parentReportFeedback('),app.indexOf('let parentReportLogoPromise=')),context);
  vm.runInNewContext(app.slice(app.indexOf('window.reserveParentWhatsAppWindow='),app.indexOf('let parentReportSharePending=')),context);
  return {context,events,release,send:(firstDelivery=true)=>context.window.deliverParentMonthlyReport(report,'201001234567',message=>events.notices.push(message),{firstDelivery})};
}
test('1: popup reserves synchronously before the first image await',async()=>{const h=parentHarness({delay:true}),pending=h.send();assert.equal(h.events.opens.length,1);assert.equal(h.events.resolved,false);h.release();assert.equal(await pending,true);});
test('2: first delivery includes founder introduction, student code and actual report focus',()=>{const h=parentHarness(),message=h.context.parentReportWhatsAppIntro(report,true);assert.match(message,/مؤسس Techno Minds/);assert.match(message,/80463690/);assert.match(message,/واجب يحتاج استكمال/);});
test('3: later delivery uses concise message',()=>{const h=parentHarness(),message=h.context.parentReportWhatsAppIntro(report,false);assert.match(message,/مرفق تقرير محمد أحمد/);assert.doesNotMatch(message,/مع حضرتك م\. عمرو خالد، مدرس/);});
test('4: feedback uses real attendance, homework, grades and recommendation',()=>{const f=parentHarness().context.parentReportFeedback(report);assert.match(f.summary,/محمد أحمد.*85%/);assert.ok(f.strengths.join(' ').includes('الحضور')||f.strengths.includes(report.strengths[0]));assert.match(f.focus.join(' '),/واجب/);assert.equal(f.plan,report.recommendations[0]);});
test('5: missing academic evidence yields no invented strengths',()=>{const f=parentHarness().context.parentReportFeedback({student:{name:'طالب'},attendance:{},results:{},homework:{},practical:{}});assert.match(f.summary,/البيانات المتاحة.*غير كافية/);assert.equal(f.strengths.length,0);assert.equal(f.focus.length,0);});
test('6: desktop uses reserved popup, PNG download and attachment instruction',async()=>{const h=parentHarness();assert.equal(await h.send(),true);assert.equal(h.events.opens.length,1);assert.equal(h.events.downloads,1);assert.match(h.events.opens[0].popup.location.href,/wa\.me/);assert.match(h.events.notices.at(-1),/أرفق الصورة/);assert.doesNotMatch(h.events.notices.at(-1),/تم إرسال الصورة/);});
test('7: system share sends PNG plus text; cancellation never reports success',async()=>{const ok=parentHarness({share:true});assert.equal(await ok.send(),true);assert.equal(ok.events.share.files[0].type,'image/png');assert.match(ok.events.share.text,/محمد أحمد/);assert.equal(ok.events.downloads,0);const no=parentHarness({share:true,cancel:true});assert.equal(await no.send(),false);assert.equal(no.context.window.parentReportDeliveryMode,'');});
test('7b: admin reserves once, blocks repeated click and logs delivery only on successful handoff',async()=>{
  const source=admin.slice(admin.indexOf('window.sendParentMonthlyReport=async function('),admin.indexOf('\n',admin.indexOf('window.sendParentMonthlyReport=async function(')));
  let resume,opens=0,logs=0,success=false;
  const context={window:{reserveParentWhatsAppWindow:()=>{opens++;return {confirmed:true,popup:{close(){}}};},deliverParentMonthlyReport:async()=>success,parentReportDeliveryMode:'whatsapp-opened',MFCloud:{recordParentReportDeliveryAdmin:async()=>{logs++;}}},adminData:{students:[{studentCode:'80463690',parentPhone:'201001234567'}]},parentReportDeliveryPending:new Set(),stCode:st=>st.studentCode,adminWhatsAppPhone:x=>x,aToast:()=>{},loadAccurateMonthlyReport:()=>new Promise(resolve=>{resume=resolve;}),adminActionErrorMessage:()=>'',console,Date,Math};
  vm.runInNewContext(source,context);const pending=context.window.sendParentMonthlyReport('80463690');assert.equal(opens,1);await context.window.sendParentMonthlyReport('80463690');assert.equal(opens,1);resume({...report,deliveryState:{firstDelivery:true}});await pending;assert.equal(logs,0);
  success=true;const second=context.window.sendParentMonthlyReport('80463690');resume({...report,deliveryState:{firstDelivery:false}});await second;assert.equal(logs,1);
});
function paperHarness(){
  const docs=new Map(),students=[{studentCode:'80463690',name:'محمد أحمد',grade:'برمجة',group:'A',scheduleId:'group-A',academicYear:'2026/2027',term:'الترم الأول',active:true,createdAt:'2026-08-01'},{studentCode:'12345678',name:'أحمد',grade:'برمجة',group:'A',scheduleId:'group-A',academicYear:'2026/2027',term:'الترم الأول',active:true,createdAt:'2026-08-01'}],audits=[],transfers=new Map();let dirty=0,commits=0,transferReads=0;
  const ref=(col,id)=>({id:id||'paper-1',get:async()=>({exists:docs.has(`${col}/${id||'paper-1'}`),data:()=>docs.get(`${col}/${id||'paper-1'}`)}),set:(data,options)=>{const key=`${col}/${id||'paper-1'}`;docs.set(key,options?.merge?{...docs.get(key),...data}:data);}});
  const db={collection:col=>({doc:id=>ref(col,id),where:(field,op,value)=>({limit(){return this;},get:async()=>{const matches=[...docs].filter(([key,row])=>key.startsWith(`${col}/`)&&row[field]===value).map(([key,row])=>({id:key.split('/')[1],data:()=>row}));return {docs:matches,size:matches.length};}})}),runTransaction:async fn=>{const writes=[],tx={getAll:async(...refs)=>Promise.all(refs.map(ref=>ref.get())),set:(item,data,opts)=>writes.push(()=>item.set(data,opts)),create:(item,data)=>writes.push(()=>{if(docs.has(item.key))throw Error('duplicate transaction');item.set(data);})};const result=await fn(tx);for(const write of writes)write();commits++;return result;}};
  const originalRef=ref;db.collection=col=>({doc:id=>{const item=originalRef(col,id);item.key=`${col}/${item.id}`;const save=item.set;item.set=(data,opts)=>{if(col==='_system'&&item.id==='leaderboard')dirty++;save(data,opts);};return item;},where:(field,op,value)=>({limit(){return this;},get:async()=>{const matches=[...docs].filter(([key,row])=>key.startsWith(`${col}/`)&&row[field]===value).map(([key,row])=>({id:key.split('/')[1],data:()=>row}));return {docs:matches,size:matches.length};}})});
  const context={exports:{},db,CALLABLE_OPTIONS:{},onCall:(_opts,fn)=>fn,requireStaff:async()=>({uid:'admin-1',email:'admin@example.com'}),text:(v,n)=>String(v??'').slice(0,n||100),normalizeCode:v=>String(v??''),canonicalAcademicLabel:v=>v,cleanDocId:v=>String(v||''),validLegacyOrStrongCode:v=>/^\d{8}$/.test(v),validPaymentAcademicYear:v=>v==='2026/2027',PAYMENT_MONTH_NAMES:['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],leaderboardPeriod:(_year,month)=>({monthKey:month==='أكتوبر'?'2026-10':'2026-09'}),motivationPeriodId:(code,_year,month)=>`period_${code}_${month}`,hash:v=>require('node:crypto').createHash('sha256').update(v).digest('hex'),leaderboardStateRef:db.collection('_system').doc('leaderboard'),invalidateStudentReportInTransaction:(tx,code,_year,_month,reason)=>tx.set(db.collection('monthly_reports').doc(`${code}_${_month==='أكتوبر'?'2026-10':'2026-09'}`),{invalidationReason:reason},{merge:true}),fetchAllCollectionDocuments:async()=>({docs:students.map(row=>({id:row.studentCode,data:()=>row}))}),attendanceTransferHistoryBatch:async()=>{transferReads++;return transfers;},membershipAt,learningTargetMatchesStudent:(ex,st)=>ex.grade===st.grade&&ex.scheduleId===st.scheduleId,academicAudienceKeysForItem:()=>['grade:برمجة'],FieldValue:{serverTimestamp:()=> '2026-09-25',increment:v=>v},HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},serverActivity:async(_staff,action)=>audits.push(action)};
  vm.runInNewContext(backend.slice(backend.indexOf('exports.savePaperExamGradesAdmin ='),backend.indexOf('exports.getExamDashboard =')),context);
  const payload={title:'امتحان السنتر',examDate:'2026-09-12',totalScore:20,grade:'برمجة',group:'A',scheduleId:'group-A',academicYear:'2026/2027',term:'الترم الأول',required:true,results:[{studentCode:'80463690',score:17,status:'corrected'},{studentCode:'12345678',status:'absent'}]};
  return {context,docs,payload,students,transfers,audits,save:data=>context.exports.savePaperExamGradesAdmin({data}),stats:()=>({dirty,commits,transferReads})};
}
test('paper exam targets historical membership and persists the group at exam date with one transfer batch',async()=>{
  const h=paperHarness(),student=h.students[0];student.group='B';student.scheduleId='group-B';
  h.transfers.set(student.studentCode,[{studentCode:student.studentCode,status:'approved',currentScheduleId:'group-A',currentGroup:'A',targetScheduleId:'group-B',targetGroup:'B',effectiveAt:'2026-09-24'}]);
  const result=await h.save({...h.payload,examDate:'2026-09-22',results:[{studentCode:student.studentCode,score:17,status:'corrected'}]});
  const attempt=h.docs.get(`exam_attempts/${result.examId}_${student.studentCode}_paper`);
  assert.equal(attempt.scheduleId,'group-A');assert.equal(attempt.group,'A');assert.equal(h.stats().transferReads,1);
  attempt.scheduleId='group-B';attempt.group='B';
  await h.save({...h.payload,examId:result.examId,examDate:'2026-09-22',results:[{studentCode:student.studentCode,score:17,status:'corrected'}]});
  assert.equal(h.docs.get(`exam_attempts/${result.examId}_${student.studentCode}_paper`).scheduleId,'group-A');assert.equal(h.docs.get(`exam_attempts/${result.examId}_${student.studentCode}_paper`).group,'A');
  assert.equal([...h.docs.values()].filter(row=>row.source==='paper_exam').length,1);
  await assert.rejects(h.save({...h.payload,examId:'paper-after',examDate:'2026-09-25',results:[{studentCode:student.studentCode,score:17,status:'corrected'}]}),error=>error.code==='permission-denied');
  assert.equal(h.stats().transferReads,3);assert.equal(h.stats().commits,2);
  const later=await h.save({...h.payload,examId:'paper-after',examDate:'2026-09-25',group:'B',scheduleId:'group-B',results:[{studentCode:student.studentCode,score:17,status:'corrected'}]});
  assert.equal(h.docs.get(`exam_attempts/${later.examId}_${student.studentCode}_paper`).scheduleId,'group-B');
});
test('8: paper exam persists official exams and exam_attempts in one batch',async()=>{const h=paperHarness(),r=await h.save(h.payload);assert.equal(r.saved,2);assert.equal(h.stats().commits,1);assert.equal(h.docs.get(`exams/${r.examId}`).assessmentMode,'paper');assert.equal(h.docs.get(`exam_attempts/${r.examId}_80463690_paper`).score,17);});
test('9: repeat save updates deterministic attempt without duplicate',async()=>{const h=paperHarness(),r=await h.save(h.payload);await h.save({...h.payload,examId:r.examId,results:[{studentCode:'80463690',score:18,status:'corrected'}]});assert.equal([...h.docs.keys()].filter(key=>key.includes('80463690_paper')).length,1);assert.equal(h.docs.get(`exam_attempts/${r.examId}_80463690_paper`).score,18);});
test('10: absent score is null, never zero',async()=>{const h=paperHarness(),r=await h.save(h.payload);const absent=h.docs.get(`exam_attempts/${r.examId}_12345678_paper`);assert.equal(absent.score,null);assert.equal(absent.status,'absent');});
function paperReport(h,id,code){return calculateMonthlyReport({monthKey:'2026-09',now:'2026-10-01',student:h.students.find(st=>st.studentCode===code),exams:[{...h.docs.get(`exams/${id}`),id}],examAttempts:[h.docs.get(`exam_attempts/${id}_${code}_paper`)],sessionsComplete:true});}
test('11: corrected paper result appears in canonical monthly report',async()=>{const h=paperHarness(),{examId}=await h.save(h.payload);const result=paperReport(h,examId,'80463690');assert.equal(result.results.rows[0].assessmentMode,'paper');assert.equal(result.results.rows[0].percentage,85);});
test('12: paper 17/20 and electronic 8/10 average as percentages',()=>{const p=calculateMonthlyReport({monthKey:'2026-09',now:'2026-10-01',student:{},sessionsComplete:true,exams:[{id:'p',title:'ورقي',assessmentMode:'paper',openAt:'2026-09-10',closeAt:'2026-09-11',totalScore:20},{id:'e',title:'إلكتروني',openAt:'2026-09-10',closeAt:'2026-09-11',totalScore:10}],examAttempts:[{examId:'p',submittedAt:'2026-09-10',score:17,maxScore:20,status:'corrected'},{examId:'e',submittedAt:'2026-09-10',score:8,maxScore:10,status:'corrected'}]});assert.equal(p.results.average,83);});
test('13: absent paper exam counts missed once and never enters grade average',async()=>{const h=paperHarness(),{examId}=await h.save(h.payload);const r=paperReport(h,examId,'12345678');assert.equal(r.results.rows[0].status,'absent');assert.equal(r.results.rows[0].score,null);assert.equal(r.results.average,null);assert.equal(r.results.missedExams,1);});
test('14: dashboard excludes paper exams from online start offers',async()=>{const ctx={exports:{},onCall:(_opts,fn)=>fn,EXAM_ENTRY_OPTIONS:{},normalizeCode:v=>v,requirePortalSession:async()=>{},rateLimitStudentAction:async()=>{},getStudentPortalByCode:async()=>({data:{studentCode:'80463690'}}),requireApprovedStudent:()=>{},targetedLearningDocs:async()=>[{id:'paper-1',data:()=>({assessmentMode:'paper'})},{id:'online-1',data:()=>({title:'online'})}],examIsPublished:()=>true,examMatchesStudent:()=>true,contentAvailableAfterStudentJoined:()=>true,text:v=>String(v||''),canonicalAcademicLabel:v=>v,safePublicUrl:v=>v,examScheduleState:()=> 'open',scheduledTimeMillis:()=>0,parseExamQuestions:()=>[],attemptSummaries:async()=>[],studentRecords:async()=>({}),portalResponse:()=>({}),Promise};vm.runInNewContext(backend.slice(backend.indexOf('exports.getExamDashboard ='),backend.indexOf('async function finalizeExamAbsenceRecords()')),ctx);const r=await ctx.exports.getExamDashboard({data:{studentCode:'80463690'}});assert.equal(r.exams.length,1);assert.equal(r.exams[0].id,'online-1');});
test('15: startExam rejects paper mode even when manually invoked',async()=>{const ctx={exports:{},onCall:(_opts,fn)=>fn,EXAM_ENTRY_OPTIONS:{},normalizeCode:v=>v,cleanDocId:v=>v,requirePortalSession:async()=>{},getStudentPortalByCode:async()=>({data:{}}),requireApprovedStudent:()=>{},db:{collection:()=>({doc:()=>({get:async()=>({exists:true,id:'paper-1',data:()=>({assessmentMode:'paper'})})})})},HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}}};vm.runInNewContext(backend.slice(backend.indexOf('exports.startExam ='),backend.indexOf('exports.saveExamProgress =')),ctx);await assert.rejects(ctx.exports.startExam({data:{examId:'paper-1',studentCode:'80463690'}}),error=>error.code==='failed-precondition');});
test('16: editing a paper grade invalidates original report month and marks leaderboard dirty',async()=>{const h=paperHarness(),{examId}=await h.save(h.payload);const n=h.stats().dirty;await h.save({...h.payload,examId,results:[{studentCode:'80463690',score:15,status:'corrected'}]});assert.equal(h.docs.get('monthly_reports/80463690_2026-09').invalidationReason,'paper-exam-grades');assert.equal(h.stats().dirty,n+1);assert.ok(h.audits.some(a=>a.includes('تعديل')));});
test('17: parent report HTML and PNG label paper exams',()=>{assert.match(app,/assessmentMode==='paper'\?'ورقي':'إلكتروني'/);assert.match(app,/تقييم حالة الطالب هذا الشهر/);assert.match(app,/parentReportFeedback\(report\)/);});
test('18: student results retain paper label and explicit absence',()=>{const rows=normalizeUnifiedResults({examAttempts:[{examId:'paper-1',assessmentMode:'paper',score:17,maxScore:20,status:'corrected',submittedAt:'2026-09-12'},{examId:'paper-2',assessmentMode:'paper',score:null,maxScore:20,status:'absent',submittedAt:'2026-09-12'}]});assert.equal(rows[0].typeLabel,'امتحان ورقي');assert.ok(rows.some(row=>row.status==='absent'&&row.percentage===null));});
test('19: electronic exam dashboard and result normalization retain current flow',()=>{const rows=normalizeUnifiedResults({examAttempts:[{examId:'online',score:8,maxScore:10,status:'corrected',submittedAt:'2026-09-12'}]});assert.equal(rows[0].typeLabel,'امتحان');assert.equal(rows[0].percentage,80);});
test('paper score revisions are one transactional delta per exam and student',async()=>{
  const h=paperHarness(),code='80463690',period=`motivation_monthly/period_${code}_سبتمبر`,transactions=()=>[...h.docs].filter(([key,row])=>key.startsWith('motivation_transactions/')&&row.source==='paper_exam').map(([,row])=>row),
    save=async(examId,score,status='corrected')=>h.save({...h.payload,examId,...(examId?{}:{}),results:[{studentCode:code,score,status}]});
  const first=await save(undefined,17);assert.equal(h.docs.get(period).totalPoints,17);assert.equal(h.docs.get(period).paperExamPoints,17);assert.deepEqual(transactions().map(row=>row.points),[17]);
  await save(first.examId,17);assert.equal(h.docs.get(period).totalPoints,17);assert.equal(transactions().length,1);
  await save(first.examId,19);assert.equal(h.docs.get(period).totalPoints,19);assert.deepEqual(transactions().map(row=>row.points).sort((a,b)=>a-b),[2,17]);
  await save(first.examId,14);assert.equal(h.docs.get(period).totalPoints,14);assert.ok(transactions().some(row=>row.points===-5));
  await save(first.examId,null,'absent');assert.equal(h.docs.get(period).paperExamPoints,0);assert.ok(transactions().some(row=>row.points===-14));
  await save(first.examId,null,'absent');assert.equal(transactions().length,4);
  await save(first.examId,15);assert.equal(h.docs.get(period).paperExamPoints,15);assert.equal(transactions().length,5);
  const second=await save('paper-second',8);assert.notEqual(second.examId,first.examId);
  assert.equal(h.docs.get(period).paperExamPoints,23);assert.equal(transactions().length,6);
  assert.ok(transactions().every(row=>row.periodId===`period_${code}_سبتمبر`&&row.referenceId&&row.source==='paper_exam'));
});
test('paper September contribution combines with manual and attendance without affecting October',async()=>{
  const h=paperHarness(),code='80463690',period=`motivation_monthly/period_${code}_سبتمبر`;
  h.docs.set(period,{studentCode:code,academicYear:'2026/2027',month:'سبتمبر',totalPoints:5,transactionCount:1});
  const {examId}=await h.save({...h.payload,results:[{studentCode:code,score:17,status:'corrected'}]});
  assert.equal(h.docs.get(period).totalPoints,22);assert.equal(h.docs.has(`motivation_monthly/period_${code}_أكتوبر`),false);
  const r=calculateMonthlyReport({monthKey:'2026-09',now:'2026-10-01',student:h.students[0],exams:[{...h.docs.get(`exams/${examId}`),id:examId}],examAttempts:[h.docs.get(`exam_attempts/${examId}_${code}_paper`)],sessions:[{id:'s1',date:'2026-09-22',scheduleId:'group-A'}],attendance:[{classSessionId:'s1',date:'2026-09-22',scheduleId:'group-A',status:'present'}],motivationSummary:h.docs.get(period),sessionsComplete:true});
  assert.equal(r.motivation.manualPoints,5);assert.equal(r.motivation.paperExamPoints,17);assert.equal(r.motivation.attendancePoints,2);assert.equal(r.motivation.totalPoints,24);
  assert.equal(r.results.rows[0].percentage,85);
  assert.match(backend,/manualMotivationPoints=monthlyEvaluation\.motivation\.manualPoints/);
  assert.match(backend,/fetchAllCollectionDocuments\('motivation_monthly',query=>query\.where\('academicYear'/);
  assert.doesNotMatch(backend.slice(backend.indexOf('async function leaderboardRowsForPeriod('),backend.indexOf('async function currentLeaderboardRows()')),/source==='paper_exam'/);
});
test('online grading never writes a paper-exam motivation transaction',()=>{
  const online=backend.slice(backend.indexOf('exports.startExam ='),backend.indexOf('exports.savePaperExamGradesAdmin ='));
  assert.doesNotMatch(online,/source:'paper_exam'/);
  assert.match(backend.slice(backend.indexOf('exports.savePaperExamGradesAdmin ='),backend.indexOf('function examMatchesStudent(')),/source:'paper_exam'/);
});
test('deliveryState uses exactly one limit(1) read only on send request',async()=>{
  let reads=0,limit=0,exists=false;
  const ctx={exports:{},onCall:(_opt,handler)=>handler,CALLABLE_OPTIONS:{},requireStaff:async()=>({}),normalizeCode:v=>v,text:v=>String(v||''),validLegacyOrStrongCode:()=>true,getStudentPortalByCode:async()=>({data:{studentCode:'80463690'}}),buildStudentMonthlyReport:async()=>report,studentReportRanking:async()=>null,db:{collection:()=>({where:()=>({limit:n=>{limit=n;return {get:async()=>{reads++;return {empty:!exists};}};}})})}};
  vm.runInNewContext(backend.slice(backend.indexOf('exports.getStudentMonthlyReportAdmin ='),backend.indexOf('exports.getParentMonthlyReport =')),ctx);
  const call=includeDeliveryState=>ctx.exports.getStudentMonthlyReportAdmin({data:{studentCode:'80463690',monthKey:'2026-09',includeDeliveryState}});
  assert.equal((await call(false)).deliveryState,undefined);assert.equal(reads,0);
  assert.equal((await call(true)).deliveryState.firstDelivery,true);assert.equal(reads,1);assert.equal(limit,1);
  exists=true;assert.equal((await call(true)).deliveryState.firstDelivery,false);assert.equal(reads,2);
});
test('paper grade validation rejects duplicate codes, out-of-range score and wrong audience',async()=>{
  const h=paperHarness();await assert.rejects(h.save({...h.payload,results:[h.payload.results[0],h.payload.results[0]]}),error=>error.code==='invalid-argument');
  await assert.rejects(h.save({...h.payload,results:[{studentCode:'80463690',score:21,status:'corrected'}]}),error=>error.code==='invalid-argument');
  await assert.rejects(h.save({...h.payload,results:[{studentCode:'99999999',score:17,status:'corrected'}]}),error=>error.code==='permission-denied');
  assert.equal(h.stats().commits,0);
});
test('paper exam admin uses existing student roster and one bulk callable for 50 grades',async()=>{
  assert.match(admin,/function paperExamAudience\(form\)/);
  assert.match(admin,/adminData\.students\|\|\[\]/);
  assert.match(admin,/savePaperExamGradesAdmin\(\{\.\.\.paperExamFields\(form\),results:selected\}\)/);
  const h=paperHarness(),results=[];
  for(let i=0;i<50;i++){const code=String(90000000+i);h.students.push({...h.students[0],studentCode:code});results.push({studentCode:code,score:15,status:'corrected'});}
  const response=await h.save({...h.payload,results});assert.equal(response.saved,50);assert.equal(h.stats().commits,1);
});
