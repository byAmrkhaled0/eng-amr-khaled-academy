'use strict';
// Never store free-form error messages, URLs, answers, tokens, UA or form values.
const ROUTES=new Set(['index.html','about.html','student.html','parent.html','teacher-login.html','exams.html','learning-path.html','practical.html','materials.html','theory-lectures.html','questions.html','reviews.html','privacy.html','terms.html','offline.html','404.html']);
const KINDS=new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','URIError','EvalError','UnhandledRejection']);
function safeClientError(input){
 const body=input&&typeof input==='object'?input:{};
 let page='/unknown';
 try{const url=new URL(String(body.page||'').slice(0,2000),'https://local.invalid');const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(ROUTES.has(name))page='/'+name;}catch(_){}
 const coordinate=value=>Number.isInteger(value)&&value>=0&&value<=1000000?value:0;
 const kind=KINDS.has(body.kind)?body.kind:'Error';
 return {page,kind,message:kind+' on '+page,line:coordinate(body.line),column:coordinate(body.column)};
}
module.exports={safeClientError};
