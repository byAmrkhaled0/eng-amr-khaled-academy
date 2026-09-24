'use strict';

const {scheduledTimeMillis}=require('./assignment-schedule');
const {isExamGradePending}=require('./portal-results');
const asNumber=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const average=values=>{const valid=values.filter(Number.isFinite);return valid.length?clamp(valid.reduce((s,v)=>s+v,0)/valid.length):null;};
const weighted=parts=>{const valid=parts.filter(p=>Number.isFinite(p.value));return valid.length?clamp(valid.reduce((s,p)=>s+p.value*p.weight,0)/valid.reduce((s,p)=>s+p.weight,0)):null;};
const pending=row=>row?.needsManualReview===true||['pending','pending_review','pending-review','pending_manual','started','in_progress','awaiting_review'].includes(row?.status)&&row?.approved!==true&&row?.reviewed!==true;
const rowScore=row=>asNumber(row?.score??row?.grade??row?.earnedScore);
const rowMaxScore=row=>asNumber(row?.maxScore??row?.totalMarks??row?.totalScore??row?.assignmentSnapshot?.maxScore??row?.assignmentSnapshot?.totalScore);
const scorePercent=(row,type='homework')=>{const score=rowScore(row),max=rowMaxScore(row);return !(type==='exam'?isExamGradePending(row):pending(row))&&score!==null&&max!==null&&max>0?Math.max(0,Math.min(100,score/max*100)):null;};
const levelLabel=value=>value===null?'بيانات غير كافية':value>=90?'ممتاز':value>=75?'جيد جدًا':value>=60?'جيد':'يحتاج متابعة';
const commitmentLabel=value=>value===null?'بيانات غير كافية':value>=80?'منتظم':value>=60?'مقبول':value>=40?'متقطع':'يحتاج متابعة';
function dateKey(value){
  if(!value)return '';
  if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const date=value?.toDate?value.toDate():new Date(value);if(!Number.isFinite(date.getTime()))return '';
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
function rowMatchesMonth(row={},fields=[],monthKey=''){
  if(!/^\d{4}-\d{2}$/.test(String(monthKey)))return false;
  const explicit=[...new Set(fields.filter(Boolean))].map(field=>dateKey(row[field])).filter(Boolean);
  if(explicit.length)return explicit.some(key=>key.slice(0,7)===monthKey);
  const fallback=dateKey(row.date||row.submittedAt||row.completedAt||row.lastOpenedAt||row.createdAt||row.updatedAt);
  return fallback.slice(0,7)===monthKey;
}
function membershipAt(student,transfers,date){
  const joined=dateKey(student.acceptedAt||student.activatedAt||student.enrolledAt||student.createdAt);
  if(joined&&date<joined)return null;
  let scheduleId=String(student.scheduleId||student.groupId||''),group=student.group||'';
  const history=transfers.filter(t=>t.status==='approved'&&dateKey(t.effectiveAt||t.reviewedAt)).sort((a,b)=>dateKey(b.effectiveAt||b.reviewedAt).localeCompare(dateKey(a.effectiveAt||a.reviewedAt)));
  for(const transfer of history){if(date<dateKey(transfer.effectiveAt||transfer.reviewedAt)){scheduleId=transfer.currentScheduleId;group=transfer.currentGroup;}}
  return {scheduleId,group};
}
function entitledSessions(student,sessions,transfers,monthKey,now){
  return sessions.filter(session=>{
    const date=dateKey(session.date),membership=membershipAt(student,transfers,date);
    return date.startsWith(monthKey)&&date<=dateKey(now)&&membership&&session.cancelled!==true&&session.status!=='cancelled'&&
      (session.scheduleId?session.scheduleId===membership.scheduleId:session.group===membership.group);
  });
}
function actualSessionsForStudent(student,sessions=[],attendance=[],transfers=[]){
  const result=[...sessions],days=new Set(result.map(row=>`${row.scheduleId||''}:${dateKey(row.date)}`));
  for(const row of attendance){
    const date=dateKey(row.date),membership=membershipAt(student,transfers,date);
    if(!date||!membership||row.scheduleId&&row.scheduleId!==membership.scheduleId)continue;
    const key=`${row.scheduleId||membership.scheduleId||''}:${date}`;
    if(days.has(key))continue;
    days.add(key);
    result.push({id:String(row.classSessionId||row.sessionId||`legacy_${key}`),scheduleId:membership.scheduleId,group:membership.group,date,status:'closed',legacyAttendance:true});
  }
  return result;
}
const sessionKey=row=>String(row.classSessionId||row.sessionId||row.sessionKey||`${row.scheduleId||row.group||''}:${dateKey(row.date)}`);
function normalizedAttendanceRows(rows=[]){
  const sessions=new Map(),aliases={'حاضر':'present','غائب':'absent','متأخر':'late','غياب بعذر':'excused','بعذر':'excused'};
  const millis=value=>value?.toMillis?.()||Date.parse(value?.toDate?.()||value||'')||0;
  for(const row of rows){const date=dateKey(row.date||row.createdAt),status=aliases[row.status]||row.status;if(!date||!['present','absent','late','excused','unrecorded'].includes(status))continue;
    const key=sessionKey(row),old=sessions.get(key),updatedAt=millis(row.updatedAt||row.recordedAt||row.createdAt);
    if(!old||updatedAt>=old._attendanceUpdatedAt)sessions.set(key,{...row,date,status,_attendanceUpdatedAt:updatedAt});
  }
  return [...sessions.values()].map(({_attendanceUpdatedAt,...row})=>row).sort((a,b)=>a.date.localeCompare(b.date));
}
function consecutiveAbsenceWarning(rows=[],threshold=2){
  const attendance=normalizedAttendanceRows(rows);let streak=[],warning=null;
  for(const row of attendance){streak=row.status==='absent'?[...streak,row]:[];if(streak.length>=threshold)warning={count:streak.length,dates:streak.map(x=>x.date),latestDate:row.date};}
  return warning?{...warning,active:attendance.at(-1)?.date===warning.latestDate,message:`تحذير غياب: غاب الطالب ${warning.count===2?'حصتين متتاليتين':`${warning.count} حصص متتالية`}`}:null;
}
function newestBy(rows,key){
  const result=new Map();for(const row of rows){const id=key(row);if(!id)continue;const old=result.get(id),attempt=Number(row.attemptNumber||row.attemptSequence||1),oldAttempt=Number(old?.attemptNumber||old?.attemptSequence||1);
    if(!old||attempt>oldAttempt||(attempt===oldAttempt&&String(row.reviewedAt||row.updatedAt||row.submittedAt||row.date||'')>=String(old.reviewedAt||old.updatedAt||old.submittedAt||old.date||'')))result.set(id,row);
  }return result;
}
function calculateMonthlyReport(input={}){
  const student=input.student||{},now=input.now||new Date(),monthKey=String(input.monthKey||''),transfers=input.transfers||[];
  const sessions=entitledSessions(student,input.sessions||[],transfers,monthKey,now);
  const recorded=normalizedAttendanceRows(input.attendance||[]).filter(row=>{const membership=membershipAt(student,transfers,row.date);return membership&&(!row.scheduleId||row.scheduleId===membership.scheduleId);});
  const usedAttendance=new Set();
  const attendance=(input.sessionsComplete===true||sessions.length)?sessions.map(session=>{
    const candidates=recorded.filter(row=>!usedAttendance.has(row)&&(sessionKey(row)===session.id||(!row.classSessionId&&!row.sessionId&&row.date===session.date&&(!row.scheduleId||row.scheduleId===session.scheduleId))));
    const timestamp=row=>row.updatedAt?.toMillis?.()||Date.parse(row.updatedAt?.toDate?.()||row.updatedAt||row.recordedAt?.toDate?.()||row.recordedAt||'')||0;
    const matching=candidates.sort((a,b)=>Number(sessionKey(b)===session.id)-Number(sessionKey(a)===session.id)||timestamp(b)-timestamp(a))[0];
    if(matching)usedAttendance.add(matching);
    return matching&&matching.status!=='unrecorded'?matching:{sessionId:session.id,date:session.date,time:session.time||'',status:'absent',method:'session_without_attendance'};
  }):recorded;
  const count=status=>attendance.filter(row=>row.status===status).length;
  const present=count('present'),late=count('late'),absent=count('absent'),excused=count('excused'),unrecorded=count('unrecorded');
  const entitlementKnown=input.sessionsComplete===true;
  const denominator=present+late+absent;
  // Applicable actual sessions with no valid attendance are absences. Days
  // without a class session never enter the denominator.
  const attendancePct=denominator>0?Math.round((present+late)/denominator*1000)/10:null;
  const attempts=newestBy((input.grades||[]).filter(row=>!['homework','practical'].includes(row.type)),row=>String(row.examId||row.id||''));
  // The exam attempt is authoritative when a legacy grade mirrors the same exam.
  for(const [id,row] of newestBy(input.examAttempts||[],row=>String(row.examId||row.id||'')))attempts.set(id,row);
  const exams=new Map((input.exams||[]).filter(e=>e.cancelled!==true&&e.archived!==true&&e.active!==false&&e.published!==false&&!['cancelled','archived','مسودة'].includes(e.status)).map(e=>[String(e.id||e.examId),e]));
  const rows=[];let required=0,available=0,started=0,submitted=0,missed=0,awaiting=0;
  for(const [id,exam] of exams){
    const row=attempts.get(id),isStarted=Boolean(row),isSubmitted=Boolean(row&&!['started','in_progress'].includes(row.status)&&row.status!=='absent');
    const open=!exam.openAt||Date.parse(exam.openAt)<=new Date(now).getTime(),finished=exam.finished===true||(exam.closeAt&&Date.parse(exam.closeAt)<=new Date(now).getTime());
    const isRequired=exam.required!==false&&exam.activityOnly!==true;
    if(isRequired)required++;if(open&&!finished)available++;if(isStarted)started++;if(isSubmitted)submitted++;
    const isMissed=isRequired&&row?.status==='absent'||finished&&isRequired&&!isSubmitted&&exam.submittedElsewhere!==true;
    if(isMissed)missed++;
    const percentage=isSubmitted?scorePercent(row,'exam'):null;
    const status=isSubmitted?(percentage===null?'pending_review':'graded'):isMissed?'absent':isStarted?'started':open?'available':'upcoming';
    if(status==='pending_review')awaiting++;
    rows.push({...row,examId:id,assessmentMode:exam.assessmentMode==='paper'?'paper':'online',activityName:exam.title||row?.activityName||'امتحان',date:row?.submittedAt||row?.date||row?.startedAt||exam.openAt||'',maxScore:rowMaxScore(row)||exam.totalScore||null,score:percentage===null?null:rowScore(row),percentage,status,attemptNumber:row?.attemptNumber||row?.attemptSequence||null,absent:isMissed});
    attempts.delete(id);
  }
  // Retain standalone/manual grades and legacy exams without inventing an entitlement.
  for(const row of attempts.values()){const percentage=scorePercent(row,'exam');rows.push({...row,percentage,score:percentage===null?null:rowScore(row),maxScore:rowMaxScore(row),status:percentage===null?'pending_review':'graded'});if(percentage===null)awaiting++;}
  const scored=rows.filter(row=>row.percentage!==null),gradeAvg=average(scored.map(row=>row.percentage));
  const assignmentIdentity=row=>String(row?.assignmentId||row?.homeworkId||row?.assignment?.id||row?.assignmentSnapshot?.id||row?.id||'');
  const assignments=input.assignments||[],latest=newestBy(input.homeworks||[],assignmentIdentity);
  const homeworkRows=assignments.map(assignment=>{
    const raw=latest.get(String(assignment.id)),percentage=raw?scorePercent(raw):null;
    const submission=raw?{...raw,score:percentage===null?null:rowScore(raw),maxScore:rowMaxScore(raw)||assignment.totalScore||null,percentage}:null;
    const due=assignment.dueDate?scheduledTimeMillis(assignment.dueDate.length===10?`${assignment.dueDate}T23:59:59`:assignment.dueDate):null;
    const late=Boolean(submission&&due&&Date.parse(submission.submittedAt)>due);
    const required=assignment.activityOnly!==true;
    return {assignment,submission,required,late,status:submission?'submitted':required&&(assignment.submissionClosed||due&&due<new Date(now).getTime())?'missing':'available'};
  });
  const knownAssignmentIds=new Set(assignments.map(row=>String(row.id||'')).filter(Boolean));
  // A corrected submission remains part of the student's record even when its
  // old assignment document was archived, deleted, or predates the current
  // assignment schema. It is activity-only, so it cannot inflate required work.
  for(const [identity,raw] of latest){
    if(knownAssignmentIds.has(identity))continue;
    const percentage=scorePercent(raw),maxScore=rowMaxScore(raw),title=raw.homeworkTitle||raw.assignmentTitle||raw.title||raw.assignmentSnapshot?.title||'واجب محفوظ';
    homeworkRows.push({
      assignment:{id:identity,title,totalScore:maxScore,dueDate:'',activityOnly:true,legacyRecord:true},
      submission:{...raw,score:percentage===null?null:rowScore(raw),maxScore,percentage},
      required:false,late:false,status:'submitted'
    });
  }
  const requiredHw=homeworkRows.filter(row=>row.required),submittedHw=homeworkRows.filter(row=>row.submission),submittedRequiredHw=requiredHw.filter(row=>row.submission),missingHw=homeworkRows.filter(row=>row.status==='missing'),lateHw=submittedHw.filter(row=>row.late);
  const homeworkGrades=submittedHw.map(row=>row.submission.percentage).filter(Number.isFinite),homeworkGradeAvg=homeworkGrades.length?Math.round(homeworkGrades.reduce((sum,grade)=>sum+grade,0)/homeworkGrades.length*100)/100:null;
  const homeworkCompletionPct=requiredHw.length?clamp(submittedRequiredHw.length/requiredHw.length*100):null;
  const timed=submittedHw.filter(row=>row.assignment.dueDate),onTimePct=timed.length?clamp((timed.length-lateHw.length)/timed.length*100):null;
  const progress=input.lectureProgress||[],materials=input.lectureMaterials||[],progressByLecture=new Map(progress.map(row=>[String(row.lectureId||row.id||''),row])),materialIds=new Set(materials.map(row=>String(row.id||'')));
  const lectureRows=[...materials.map(material=>{const progressRow=progressByLecture.get(String(material.id))||null;return {material,progress:progressRow,viewed:Boolean(progressRow&&(progressRow.viewed===true||Number(progressRow.percent)>0)),completed:Boolean(progressRow&&(progressRow.completionVerified===true||progressRow.completionEvidence==='assessment'))};}),...progress.filter(row=>!materialIds.has(String(row.lectureId||row.id||''))).map(progressRow=>({material:null,progress:progressRow,viewed:progressRow.viewed===true||Number(progressRow.percent)>0,completed:progressRow.completionVerified===true||progressRow.completionEvidence==='assessment'}))];
  const opened=lectureRows.filter(row=>row.viewed).length,verified=lectureRows.filter(row=>row.completed).length;
  const recitations=input.recitations||[],completedPractical=recitations.filter(row=>row.approved===true||row.completed===true).length;
  const lectureCompletionPct=lectureRows.length?clamp(verified/lectureRows.length*100):null;
  const academicScore=weighted([{value:gradeAvg,weight:70},{value:homeworkGradeAvg,weight:30}]);
  // Level uses scheduled attendance and assigned homework. Lecture browsing
  // remains a study metric and cannot change the academic level on its own.
  const commitmentScore=weighted([{value:attendancePct,weight:50},{value:homeworkCompletionPct,weight:30},{value:onTimePct,weight:10}]);
  const motivationRow=input.motivationSummary,attendancePoints=2*(present+late)-2*absent,manualPoints=Math.trunc(Number(motivationRow?.totalPoints||0));
  const motivation={totalPoints:manualPoints+attendancePoints,manualPoints,transactionCount:Math.max(0,Number(motivationRow?.transactionCount||0)),lastReason:String(motivationRow?.lastReason||''),attendancePoints};
  const baseOverallScore=weighted([{value:academicScore,weight:60},{value:commitmentScore,weight:40}]);
  const motivationBonus=baseOverallScore===null||!motivation?0:Math.max(-3,Math.min(3,Math.trunc(motivation.totalPoints/10)));
  const overallScore=baseOverallScore===null?null:clamp(baseOverallScore+motivationBonus);
  const strengths=[],concerns=[],recommendations=[];
  const absenceWarning=consecutiveAbsenceWarning(attendance);if(absenceWarning?.active){concerns.push(absenceWarning.message);recommendations.push('تواصل مع المعلم لتحديد سبب الغياب وخطة تعويض الحصص.');}
  if(gradeAvg!==null&&gradeAvg>=75)strengths.push('نتائج أكاديمية جيدة في الاختبارات المصححة');
  if(attendancePct!==null&&attendancePct>=85)strengths.push('حضور منتظم في الحصص المسجلة');
  if(missingHw.length){concerns.push(`${missingHw.length} واجب مستحق لم يُسلّم`);recommendations.push('راجع الواجبات الناقصة مع المعلم وحدد موعد استكمالها.');}
  if(missed){concerns.push(`${missed} امتحان مستحق دون تسليم`);recommendations.push('راجع سبب عدم تسليم الامتحانات مع المعلم.');}
  if(gradeAvg!==null&&gradeAvg<60){concerns.push('متوسط الاختبارات المصححة أقل من 60%');recommendations.push('راجع الأسئلة التي أخطأ فيها الطالب ثم نفذ تدريبًا قصيرًا عليها.');}
  if(materials.length&&opened<materials.length){concerns.push(`${materials.length-opened} محاضرة متاحة لم تُفتح`);recommendations.push('تابع المحاضرات المتاحة بصورة أكثر انتظامًا.');}
  const warnings=[];if(!entitlementKnown)warnings.push('سجل المواعيد الفعلية غير مكتمل؛ عدد الحصص المستحقة ونسبة الحضور غير مؤكدين.');if(unrecorded)warnings.push(`${unrecorded} حصة بلا حالة حضور؛ لم تُحوّل إلى غياب.`);
  if(opened)warnings.push('فتح المحاضرة أو تقدم المشغّل لا يثبت إكمالها أو فهمها.');
  const activityCount=recorded.length+submittedHw.length+rows.length+recitations.length+opened;
  const payment=input.payment;
  const summaryNote=attendancePct!==null&&attendancePct<70?'يحتاج الطالب إلى تحسين انتظام الحضور، لأن الغياب يؤثر على تقدمه.':missingHw.length&&gradeAvg!==null&&gradeAvg>=75?'نتائج الطالب في الامتحانات جيدة، لكنه يحتاج إلى انتظام أكبر في تسليم الواجبات.':missingHw.length?'يحتاج الطالب إلى استكمال الواجبات الناقصة والانتظام في التسليم.':materials.length&&opened<materials.length?'يحتاج إلى متابعة المحاضرات بصورة أكثر انتظامًا.':overallScore!==null&&overallScore>=75?'الطالب ملتزم ويحقق مستوى جيدًا ومستقرًا هذا الشهر.':overallScore===null?'البيانات المتاحة هذا الشهر لا تكفي لتقييم مستوى الطالب.':'يحتاج الطالب إلى متابعة المؤشرات الأضعف المسجلة هذا الشهر.';
  const gradedHomeworkCount=submittedHw.filter(row=>row.submission.percentage!==null).length;
  const academicEvidenceCount=scored.length+gradedHomeworkCount;
  const academicEvidenceSufficient=scored.length>=2||(scored.length>=1&&gradedHomeworkCount>=1);
  const sufficientData=academicEvidenceSufficient||(attendancePct!==null&&requiredHw.length>0);
  const monthlyTitle=activityCount&&overallScore!==null&&overallScore<45?'يحتاج تدخل سريع':attendancePct!==null&&attendancePct<60&&denominator>=2?'إنذار غياب':missingHw.length>=2?'متأخر في الواجبات':academicEvidenceSufficient&&overallScore>=90?'متفوق الشهر':academicEvidenceSufficient&&gradeAvg>=90?'مبرمج الشهر':attendancePct>=95&&denominator>=2?'نجم الحضور':homeworkCompletionPct===100&&homeworkGradeAvg>=80?'بطل الواجبات':academicEvidenceSufficient&&overallScore>=80?'المهندس البارع':activityCount&&overallScore!==null&&overallScore>=70?'نجم الالتزام':activityCount?'نجم التطور':'بيانات الشهر غير مكتملة';
  const monthlyTitleTone=/يحتاج|إنذار|متأخر/.test(monthlyTitle)?'negative':monthlyTitle==='بيانات الشهر غير مكتملة'?'neutral':'positive';
  return {schemaVersion:11,policyVersion:'monthly-v11-student-level',monthKey,student:{studentCode:String(student.studentCode||student.code||student.id||''),name:student.studentName||student.name||'',grade:student.grade||'',group:student.group||'',academicYear:student.academicYear||''},
    overallScore,baseOverallScore,motivationBonus,level:levelLabel(overallScore),monthlyTitle,monthlyTitleTone,academicScore,academicLevel:levelLabel(academicScore),academicEvidenceCount,academicEvidenceSufficient,commitmentScore,commitmentLevel:commitmentLabel(commitmentScore),activityCount,sufficientData,
    comparisonBasis:[gradeAvg!==null,homeworkGradeAvg!==null,attendancePct!==null,homeworkCompletionPct!==null,onTimePct!==null].join(','),
    attendance:{total:attendance.length,required:entitlementKnown?sessions.length:null,entitlementKnown,present,late,absent,excused,unrecorded,percentage:attendancePct,rows:attendance,consecutiveAbsenceWarning:consecutiveAbsenceWarning(attendance)},
    results:{count:rows.length,gradedCount:scored.length,gradedExams:scored.length,average:gradeAvg,examAverage:gradeAvg,rows,requiredExams:required,availableExams:available,startedExams:started,submittedExams:submitted,attendedExams:submitted,missedExams:missed,absentExams:missed,pendingReview:awaiting,retakePolicy:'أحدث محاولة؛ إن كانت تنتظر التصحيح تُستبعد من المتوسط حتى اعتمادها.'},
    homework:{required:requiredHw.length,submitted:submittedRequiredHw.length,activitySubmitted:submittedHw.length,submittedRequired:submittedRequiredHw.length,missing:missingHw.length,missingAssignments:requiredHw.length-submittedRequiredHw.length,available:requiredHw.filter(row=>row.status==='available').length,graded:submittedHw.filter(row=>row.submission.percentage!==null).length,late:lateHw.length,completionPercentage:homeworkCompletionPct,scorePercentage:homeworkGradeAvg,averageGrade:homeworkGradeAvg,onTimePercentage:onTimePct,rows:homeworkRows},
    practical:{count:recitations.length,completed:completedPractical,percentage:null,rows:recitations},study:{lecturesAvailable:lectureRows.length,lecturesOpened:opened,lecturesCompleted:verified,lectureCompletionPercentage:lectureCompletionPct,rows:lectureRows},
    payment:payment?{status:payment.status,expectedAmount:payment.expectedAmount,paidAmount:payment.paidAmount,remainingAmount:payment.remainingAmount}:null,motivation,
    strengths,concerns,recommendations,warnings,summaryNote,teacherNotes:String(input.teacherNotes||'')};
}
function attachTrend(current,previous){
  const comparable=current?.sufficientData&&previous?.sufficientData&&current.policyVersion===previous.policyVersion&&current.comparisonBasis===previous.comparisonBasis&&current.student?.grade===previous.student?.grade&&Number.isFinite(current.overallScore)&&Number.isFinite(previous.overallScore);
  if(!comparable)return {...current,trend:{status:'insufficient',label:'لا توجد بيانات كافية وقابلة للمقارنة',delta:null,previousScore:previous?.overallScore??null}};
  const delta=current.overallScore-previous.overallScore,status=delta>=5?'improved':delta<=-5?'declined':'stable';
  const titlePatch=delta<=-10&&current.overallScore<70?{monthlyTitle:'تراجع ملحوظ',monthlyTitleTone:'negative'}:{};
  return {...current,...titlePatch,trend:{status,delta,previousScore:previous.overallScore,label:status==='stable'?'النتائج مستقرة في حدود 4 نقاط':`${delta>0?'ارتفع':'انخفض'} التقييم ${Math.abs(delta)} نقطة مئوية عن الشهر السابق`}};
}
module.exports={calculateMonthlyReport,attachTrend,levelLabel,commitmentLabel,normalizedAttendanceRows,consecutiveAbsenceWarning,dateKey,rowMatchesMonth,membershipAt,entitledSessions,actualSessionsForStudent,scorePercent};
