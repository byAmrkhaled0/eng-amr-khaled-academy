'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {learningContentAccessAllowed,reusableContentAccessAllowed,reusableLearningContentIsVisible}=require('../functions/lib/content-visibility');
const {learningTargetMatchesStudent}=require('../functions/lib/academic-targeting');
const {buildPaymentDashboard}=require('../functions/lib/payment-dashboard');
const {resolveExpectedAmount}=require('../functions/payment-domain');
const student={studentCode:'ST1',grade:'أساسيات برمجة',scheduleId:'G1',createdAt:'2026-09-13',contentAccessMode:'from_joining'};
const old={grade:student.grade,scheduleId:'G1',createdAt:'2026-09-01',published:true,status:'published'};
for(const kind of ['lectures','materials','lecture_materials','units'])test(`${kind}: new and legacy students receive historical in-scope learning content`,()=>{
 for(const s of [student,{...student,contentAccessMode:undefined}])assert(learningContentAccessAllowed(old,s,kind));
 assert.equal(reusableContentAccessAllowed(old,student),false);
});
for(const patch of [{grade:'أولى ثانوي'},{scheduleId:'G2'},{targetStudentCodes:['OTHER']},{academicYear:'2025/2026'}])test('academic targeting remains mandatory '+JSON.stringify(patch),()=>{assert(!learningTargetMatchesStudent({...old,...patch},{...student,academicYear:'2026/2027'}));});
for(const patch of [{status:'hidden'},{hidden:true},{status:'archived'},{archived:true},{published:false},{active:false}])test('publication remains mandatory '+JSON.stringify(patch),()=>assert(!(reusableLearningContentIsVisible({...old,...patch})&&learningContentAccessAllowed({...old,...patch},student,'materials'))));
for(const kind of ['exams','assignments','monthly_exams','assignments_v2','bank_questions','question_banks','unknown'])test(`${kind}: historical enrolment restriction remains`,()=>assert.equal(learningContentAccessAllowed(old,student,kind),false));
function row(summary,prices={'أساسيات برمجة':500},st=student){return buildPaymentDashboard({students:[st],summaries:summary?[{studentCode:'ST1',course:st.grade,month:'سبتمبر',academicYear:'2026/2027',...summary}]:[],todayTransactions:[],prices,filters:{month:'سبتمبر',academicYear:'2026/2027',grade:'all',status:'all'}}).rows[0];}
test('payment A: configured price without a summary',()=>assert.equal(row().expected,500));
test('payment B: empty legacy zero summary uses configured price',()=>assert.equal(row({expectedAmount:0,paidAmount:0}).expected,500));
test('payment C: meaningful monthly price stays locked',()=>assert.equal(row({expectedAmount:500},{'أساسيات برمجة':600}).expected,500));
test('payment D: configured free zero is distinct from missing configuration',()=>{assert.equal(row(null,{'أساسيات برمجة':0}).expected,0);assert.equal(row(null,{'أساسيات برمجة':0}).priceConfigured,true);assert.equal(row(null,{}).priceConfigured,false);});
test('payment E/F: partial and fully paid balances',()=>{assert.equal(row({expectedAmount:500,paidAmount:200}).remaining,300);assert.equal(row({expectedAmount:500,paidAmount:500}).remaining,0);assert.equal(row({expectedAmount:500,paidAmount:500}).status,'paid');});
test('zero with recorded financial activity is not reinterpreted as a blank summary',()=>assert.equal(resolveExpectedAmount({expectedAmount:0,transactionCount:1},500),0));
test('payment H: transferred student uses current course; previous course retains its own configured price',()=>{
 const st={...student,grade:'أولى ثانوي بكالوريا'},dash=buildPaymentDashboard({students:[st],summaries:[{studentCode:'ST1',course:student.grade,month:'سبتمبر',academicYear:'2026/2027',expectedAmount:0}],todayTransactions:[],prices:{[student.grade]:500,[st.grade]:700},filters:{month:'سبتمبر',academicYear:'2026/2027',grade:'all',status:'all'}});
 assert.equal(dash.rows.find(x=>!x.summary).expected,700);assert.equal(dash.rows.find(x=>x.summary).expected,500);
});
