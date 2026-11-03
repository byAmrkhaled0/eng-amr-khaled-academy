/* Pure presentation math over already authorized curriculum payloads. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TMLearningProgress=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const percent=row=>Math.max(0,Math.min(100,Number(row.progress||0)||0));
 function rows(student,data){
  const units=new Map((data?.units||[]).map(u=>[u.id,u]));
  const legacy=(student?.materials||[]).filter(r=>['theory','practical'].includes(r.lectureCategory)||['theory','practical'].includes(r.materialType)||['class-link','theory-lecture','practical-lecture'].includes(r.resourceType)).map(r=>({...r,sourceCollection:'materials',unitTitle:r.unit||'محاضرات عامة',term:r.term||'الترم الأول'}));
  const native=(data?.lectures||[]).map(r=>({...r,sourceCollection:'lectures',unitTitle:units.get(r.unitId)?.title||'محاضرات عامة',unitOrder:units.get(r.unitId)?.order||0,term:r.term||units.get(r.unitId)?.term||'الترم الأول'}));
  return [...new Map([...legacy,...native].map(r=>[r.sourceCollection+':'+r.id,r])).values()].sort((a,b)=>Number(a.unitOrder||0)-Number(b.unitOrder||0)||Number(a.lectureNumber||a.order||0)-Number(b.lectureNumber||b.order||0)||String(a.id).localeCompare(String(b.id)));
 }
 function summary(items){const completed=items.filter(r=>percent(r)>=100).length;return {completed,total:items.length,percent:items.length?Math.round(completed/items.length*100):0};}
 function units(items){
  const groups=new Map();for(const r of items){const key=r.sourceCollection+':'+(r.unitId||r.unitTitle)+':'+r.term;if(!groups.has(key))groups.set(key,{key,title:r.unitTitle,term:r.term,number:Number(r.unitOrder||r.unitNumber||0),rows:[]});groups.get(key).rows.push(r);}
  return [...groups.values()].map(g=>({...g,...summary(g.rows)}));
 }
 function openedMillis(value){if(typeof value==='number')return value;if(typeof value?.toMillis==='function')return value.toMillis();if(value?.seconds!==undefined||value?._seconds!==undefined)return Number(value.seconds??value._seconds)*1000;return Date.parse(value||'')||0;}
 function state(row){return percent(row)>=100?'completed':percent(row)>0||row.viewed===true||openedMillis(row.lastOpenedAt)>0?'started':'new';}
 function next(items){const pending=items.filter(r=>state(r)!=='completed');return pending.filter(r=>state(r)==='started').sort((a,b)=>openedMillis(b.lastOpenedAt)-openedMillis(a.lastOpenedAt))[0]||pending[0]||null;}
 function resourceUrl(row){
  for(const value of [row.linkUrl,row.fileUrl]){const raw=String(value||'');if(!raw||/[\u0000-\u0020\u007f]/.test(raw))continue;
   try{const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password)return raw;}catch(_){}
  }
  return '';
 }
 function category(row){return String(row.lectureCategory||row.materialType||'').toLowerCase()==='practical'||row.resourceType==='practical-lecture'?'practical':'theory';}
 function resources(row){
  const result=[],seen=new Set();
  function add(value,kind,label){const url=resourceUrl({linkUrl:value});if(url&&!seen.has(url)){seen.add(url);result.push({url,kind,label});}}
  const link=resourceUrl({linkUrl:row.linkUrl});if(link)add(link,'link',['drive.google.com','docs.google.com'].includes(new URL(link).hostname)?'فتح Drive':'فتح الرابط');
  const pdf=/pdf/i.test(String(row.fileType||row.contentType||''))||/\.pdf(?:[?#]|$)/i.test(String(row.fileName||row.fileUrl||''));
  if(row.fileUrl)add(row.fileUrl,'file',pdf?'فتح PDF':'فتح ملف المحاضرة');
  else if(row.hasFile||row.filePath)result.push({kind:'file',secure:true,label:pdf?'فتح PDF':'فتح ملف المحاضرة'});
  return result;
 }
 function contentType(row){
  const url=resourceUrl(row);if(url&&['drive.google.com','docs.google.com'].includes(new URL(url).hostname))return 'Drive';
  const type=String(row.fileType||row.contentType||row.type||'');if(/pdf/i.test(type)||/\.pdf(?:[?#]|$)/i.test(url))return 'PDF';
  if(/video/i.test(type)||/youtu\.?be|vimeo/i.test(url))return 'فيديو';
  return url?'رابط':row.hasFile||row.filePath?'ملف':'محتوى داخلي';
 }
 return {percent,state,rows,summary,units,next,resourceUrl,contentType,resources,category};
});

