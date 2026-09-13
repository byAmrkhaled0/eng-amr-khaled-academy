// Read every grade page for the students already loaded in the admin screen.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TMGradeRecords=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 async function load(codes,readPage){
  const students=[...new Set((codes||[]).map(code=>String(code||'').trim().toUpperCase()).filter(Boolean))];
  if(students.length>200)throw new Error('Grade reads must follow the current student page.');
  const definitions=[['grades','grades','studentCode'],['grades','grades','code'],['attempts','exam_attempts','studentCode'],['homeworks','homework_submissions','studentCode']];
  const jobs=[],rows={grades:new Map(),attempts:new Map(),homeworks:new Map()};
  for(let i=0;i<students.length;i+=30)for(const [key,collection,field] of definitions)jobs.push({key,collection,field,codes:students.slice(i,i+30)});
  await Promise.all(Array.from({length:Math.min(3,jobs.length)},async()=>{
   while(jobs.length){const job=jobs.shift();let cursor=null;
    do{const page=await readPage({...job,cursor,pageSize:250});
     if(!Array.isArray(page.rows))throw new Error('Invalid grade page.');
     page.rows.forEach(row=>rows[job.key].set(row.id,row));
     if(page.nextCursor&&page.nextCursor===cursor)throw new Error('Grade page cursor did not advance.');
     cursor=page.nextCursor||null;
    }while(cursor);
   }
  }));
  return Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,[...value.values()]]));
 }
 return {load};
});
