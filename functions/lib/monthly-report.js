'use strict';

const asNumber=value=>Number.isFinite(Number(value))?Number(value):null;
const clamp=value=>Math.max(0,Math.min(100,Math.round(Number(value)||0)));
const isComplete=row=>row?.completed===true||row?.approved===true||/^تم/.test(String(row?.status||''));
const scorePercent=row=>{
  const score=asNumber(row?.score),max=asNumber(row?.maxScore);
  if(score===null)return null;
  return max!==null&&max>0?clamp(score/max*100):clamp(score);
};
const average=values=>{
  const valid=values.filter(value=>value!==null&&Number.isFinite(Number(value))).map(Number);
  return valid.length?clamp(valid.reduce((sum,value)=>sum+value,0)/valid.length):null;
};
const weighted=components=>{
  const available=components.filter(item=>item.value!==null&&Number.isFinite(Number(item.value))&&item.weight>0);
  if(!available.length)return null;
  const weight=available.reduce((sum,item)=>sum+item.weight,0);
  return clamp(available.reduce((sum,item)=>sum+Number(item.value)*item.weight,0)/weight);
};
const levelLabel=value=>value===null?'بيانات غير كافية':value>=90?'ممتاز':value>=75?'جيد جدًا':value>=60?'جيد':'يحتاج متابعة';
const commitmentLabel=value=>value===null?'بيانات غير كافية':value>=80?'منتظم':value>=60?'مقبول':value>=40?'متقطع':'يحتاج متابعة';

function uniqueScoredRows(grades=[],examAttempts=[]){
  const rows=new Map();
  [...grades,...examAttempts].forEach((row,index)=>{
    const key=String(row?.id||`${row?.examId||row?.activityName||row?.examTitle||'result'}:${row?.submittedAt||row?.date||index}`);
    const existing=rows.get(key);
    if(!existing||scorePercent(existing)===null)rows.set(key,row);
  });
  return [...rows.values()];
}

function calculateMonthlyReport(input={}){
  const student=input.student||{},attendance=input.attendance||[],assignments=input.assignments||[],homeworks=input.homeworks||[],recitations=input.recitations||[],lectureProgress=input.lectureProgress||[];
  const resultRows=uniqueScoredRows(input.grades||[],input.examAttempts||[]),scoredResults=resultRows.filter(row=>scorePercent(row)!==null);
  const present=attendance.filter(row=>['present','حاضر','متأخر'].includes(row.status)).length,absent=attendance.filter(row=>['absent','غائب'].includes(row.status)).length;
  const attendancePct=attendance.length?clamp(present/attendance.length*100):null;
  const latestSubmission=new Map();
  homeworks.forEach(row=>{const id=String(row.assignmentId||'');if(!id)return;const current=latestSubmission.get(id);if(!current||Number(row.attemptNumber||1)>=Number(current.attemptNumber||1))latestSubmission.set(id,row);});
  const assignmentRows=assignments.map(assignment=>({assignment,submission:latestSubmission.get(String(assignment.id))||null}));
  const submittedAssignments=assignmentRows.filter(row=>row.submission),missingAssignments=assignmentRows.filter(row=>!row.submission);
  const homeworkCompletionPct=assignments.length?clamp(submittedAssignments.length/assignments.length*100):null;
  const homeworkGradeAvg=average(homeworks.map(scorePercent));
  const onTimeRows=submittedAssignments.filter(row=>row.assignment.dueDate&&row.submission.submittedAt);
  const homeworkOnTimePct=onTimeRows.length?clamp(onTimeRows.filter(row=>String(row.submission.submittedAt).slice(0,10)<=String(row.assignment.dueDate).slice(0,10)).length/onTimeRows.length*100):null;
  const lectureOpened=lectureProgress.filter(row=>row.viewed===true||Number(row.percent)>0).length,lectureCompleted=lectureProgress.filter(row=>Number(row.percent)>=100||row.completed===true).length;
  const lectureCompletionPct=lectureOpened?clamp(lectureCompleted/lectureOpened*100):null;
  const classDates=new Set(attendance.map(row=>String(row.date||'').slice(0,10)).filter(Boolean));
  recitations.forEach(row=>{const date=String(row.date||row.createdAt||'').slice(0,10);if(date)classDates.add(date);});
  const completedPracticalDates=new Set(recitations.filter(isComplete).map(row=>String(row.date||row.createdAt||'').slice(0,10)).filter(Boolean));
  const practicalPct=classDates.size?clamp(completedPracticalDates.size/classDates.size*100):null;
  const gradeAvg=average(scoredResults.map(scorePercent));
  const academicScore=weighted([{value:gradeAvg,weight:70},{value:homeworkGradeAvg,weight:30}]);
  const commitmentScore=weighted([
    {value:attendancePct,weight:30},{value:homeworkCompletionPct,weight:35},{value:homeworkOnTimePct,weight:10},{value:lectureCompletionPct,weight:15},{value:practicalPct,weight:10}
  ]);
  const overallScore=weighted([{value:academicScore,weight:60},{value:commitmentScore,weight:40}]);
  const activityCount=attendance.length+homeworks.length+resultRows.length+recitations.length+lectureOpened;
  const concerns=[];
  if(missingAssignments.length)concerns.push(`${missingAssignments.length} واجب لم يتم تسليمه`);
  if(absent)concerns.push(`${absent} غياب خلال الشهر`);
  if(lectureProgress.length&&!lectureOpened)concerns.push('لا يوجد نشاط مسجل في المحاضرات');
  if(gradeAvg!==null&&gradeAvg<60)concerns.push('متوسط الدرجات يحتاج مراجعة');
  const strengths=[];
  if(attendancePct!==null&&attendancePct>=85)strengths.push('حضور منتظم');
  if(homeworkCompletionPct!==null&&homeworkCompletionPct>=85)strengths.push('التزام جيد بتسليم الواجبات');
  if(gradeAvg!==null&&gradeAvg>=75)strengths.push('مستوى أكاديمي جيد');
  if(lectureCompleted)strengths.push(`أكمل ${lectureCompleted} محاضرة`);
  const payment=input.payment||null;
  return {
    schemaVersion:1,monthKey:String(input.monthKey||''),student:{studentCode:String(student.studentCode||student.code||student.id||''),name:String(student.studentName||student.name||''),grade:String(student.grade||''),group:String(student.group||''),parentPhone:String(student.parentPhone||'')},
    overallScore,level:levelLabel(overallScore),academicScore,academicLevel:levelLabel(academicScore),commitmentScore,commitmentLevel:commitmentLabel(commitmentScore),activityCount,
    attendance:{total:attendance.length,present,absent,percentage:attendancePct,rows:attendance},
    results:{count:resultRows.length,gradedCount:scoredResults.length,average:gradeAvg,rows:resultRows},
    homework:{required:assignments.length,submitted:submittedAssignments.length,missing:missingAssignments.length,completionPercentage:homeworkCompletionPct,averageGrade:homeworkGradeAvg,onTimePercentage:homeworkOnTimePct,rows:assignmentRows.map(row=>({assignment:row.assignment,submission:row.submission,status:row.submission?'submitted':'missing'}))},
    practical:{count:recitations.length,completed:recitations.filter(isComplete).length,percentage:practicalPct,rows:recitations},
    study:{lecturesOpened:lectureOpened,lecturesCompleted:lectureCompleted,lectureCompletionPercentage:lectureCompletionPct,rows:lectureProgress},
    payment:payment?{status:String(payment.status||''),expectedAmount:Number(payment.expectedAmount||0),paidAmount:Number(payment.paidAmount||0),remainingAmount:Number(payment.remainingAmount||0)}:null,
    strengths,concerns,teacherNotes:String(input.teacherNotes||student.notes||''),sufficientData:overallScore!==null&&activityCount>=2
  };
}

function attachTrend(current,previous){
  const currentScore=current?.overallScore,previousScore=previous?.overallScore;
  if(currentScore===null||currentScore===undefined||previousScore===null||previousScore===undefined)return {...current,trend:{status:'insufficient',label:'لا توجد بيانات كافية للمقارنة',delta:null,previousScore:previousScore??null}};
  const delta=Math.round(Number(currentScore)-Number(previousScore));
  const status=delta>=5?'improved':delta<=-5?'declined':'stable';
  const label=status==='improved'?`تحسن ${Math.abs(delta)}% عن الشهر السابق`:status==='declined'?`انخفض ${Math.abs(delta)}% عن الشهر السابق`:'مستواه مستقر مقارنة بالشهر السابق';
  return {...current,trend:{status,label,delta,previousScore:Number(previousScore)}};
}

module.exports={calculateMonthlyReport,attachTrend,levelLabel,commitmentLabel};
