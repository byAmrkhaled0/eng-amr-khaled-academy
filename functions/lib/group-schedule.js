'use strict';
// Existing group fields stay intact when older clients omit optional values.
function groupScheduleFields(body,previous={}){
 const value=(key,max)=>String(Object.hasOwn(body,key)?body[key]??'':previous[key]??'').trim().slice(0,max);
 const startTime=value('startTime',20),endTime=value('endTime',20);
 const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 if((startTime&&!clock.test(startTime))||(endTime&&!clock.test(endTime)))throw new Error('وقت الموعد غير صحيح. استخدم ساعة ودقيقة.');
 if(startTime&&endTime&&endTime<=startTime)throw new Error('وقت النهاية يجب أن يكون بعد وقت البداية.');
 const capacity=Number(Object.hasOwn(body,'capacity')?body.capacity||0:previous.capacity||0);
 if(!Number.isInteger(capacity)||capacity<0||capacity>500)throw new Error('سعة المجموعة يجب أن تكون عددًا صحيحًا من 0 إلى 500.');
 return {days:value('days',100),startTime,endTime,location:value('location',200),capacity,note:value('note',800)};
}
module.exports={groupScheduleFields};
