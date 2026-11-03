'use strict';
const crypto=require('node:crypto');
// One targeted notice per 500 ranked accounts, reusing the existing inbox/index.
function monthlyRankNotices(period,rankings,now=Date.now()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period?.monthKey||'')||!period.monthName||!period.academicYear)throw Error('Invalid closed ranking period');
 const notices=[];
 for(const {grade,rows} of rankings){
  if(!grade||!Array.isArray(rows))throw Error('Invalid grade ranking');
  const valid=rows.filter(row=>/^[A-Z0-9_-]{6,40}$/.test(String(row.studentCode||''))&&Number.isInteger(row.rank)&&row.rank>0&&Number.isFinite(row.score)&&row.level!=='بيانات غير كافية');
  for(let offset=0;offset<valid.length;offset+=500){
   const slice=valid.slice(offset,offset+500),codes=slice.map(row=>row.studentCode),id=crypto.createHash('sha256').update('monthly-rank|'+period.monthKey+'|'+grade+'|'+offset/500).digest('hex').slice(0,48);
   notices.push({id,type:'GENERAL',title:'تهنئة بترتيبك الشهري 🎉',body:'نتيجة التحفيز عن '+period.monthName+' '+period.academicYear,actionTab:'motivation',priority:'normal',active:true,createdAt:now,createdBy:'monthly-leaderboard',expiresAt:now+120*86400000,target:{scope:'students',studentCodes:codes},audienceKeys:codes.map(code=>'student:'+code),monthlyRank:{grade,month:period.monthName,monthKey:period.monthKey,academicYear:period.academicYear,totalStudents:rows.length,ranks:Object.fromEntries(slice.map(row=>[row.studentCode,row.rank]))}});
  }
 }
 return notices;
}
function personalMonthlyRank(notice,student){
 const data=notice.monthlyRank,rank=data?.ranks?.[String(student?.studentCode||'')];
 if(!data||!Number.isInteger(rank)||rank<=0)return null;
 return {title:'مبروك مركزك '+rank+' في التحفيز الشهري 🎉',body:'يا '+String(student.name||student.studentName||'بطل')+'، حصلت على المركز '+rank+' من '+data.totalStudents+' داخل صف '+data.grade+' عن '+data.month+' '+data.academicYear+'. ترتيبك محسوب وقت إغلاق الشهر. كمّل اجتهادك مع TECHNO MINDS!',rank,monthKey:data.monthKey};
}
module.exports={monthlyRankNotices,personalMonthlyRank};
