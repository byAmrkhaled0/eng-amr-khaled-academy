(function(){
  'use strict';
  const FALLBACK=[
    {key:'python',name:'Python 3',template:"print('Hello, Techno Minds!')"},
    {key:'javascript',name:'JavaScript (Node.js)',template:"console.log('Hello, Techno Minds!');"},
    {key:'typescript',name:'TypeScript',template:"const message: string = 'Hello, Techno Minds!';\nconsole.log(message);"},
    {key:'c',name:'C',template:'#include <stdio.h>\nint main(void) {\n  printf("Hello, Techno Minds!\\n");\n  return 0;\n}'},
    {key:'cpp',name:'C++',template:'#include <iostream>\nint main() {\n  std::cout << "Hello, Techno Minds!\\n";\n  return 0;\n}'},
    {key:'java',name:'Java',template:'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Techno Minds!");\n  }\n}'},
    {key:'csharp',name:'C#',template:'using System;\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello, Techno Minds!");\n  }\n}'},
    {key:'go',name:'Go',template:'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello, Techno Minds!") }'},
    {key:'php',name:'PHP',template:'<?php\necho "Hello, Techno Minds!\\n";'},
    {key:'ruby',name:'Ruby',template:"puts 'Hello, Techno Minds!'"},
    {key:'rust',name:'Rust',template:'fn main() {\n  println!("Hello, Techno Minds!");\n}'},
    {key:'kotlin',name:'Kotlin',template:'fun main() {\n  println("Hello, Techno Minds!")\n}'}
  ];
  const $=id=>document.getElementById(id);
  const editor=$('codeEditor'),language=$('codeLanguage'),stdin=$('codeStdin'),output=$('codeOutput'),runButton=$('runCodeButton');
  const LOCAL_HOSTS=['localhost','127.0.0.1','0.0.0.0'];
  const FUNCTIONS_BASE=LOCAL_HOSTS.includes(location.hostname)?'https://eng-amr-khaled-academy.web.app/api/code':'/api/code';
  let languages=FALLBACK;
  const storageKey=key=>`tm_code_v60_${key}`;
  function visitorId(){const key='tm_public_code_visitor_v1';try{let value=localStorage.getItem(key);if(!value){value=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;localStorage.setItem(key,value);}return value;}catch(_){return'session-visitor';}}
  function notify(message){if(typeof window.toast==='function')window.toast(message);else{const box=$('toast');if(box){box.textContent=message;box.classList.add('show');setTimeout(()=>box.classList.remove('show'),2800);}}}
  function item(){return languages.find(entry=>entry.key===language.value)||languages[0];}
  function save(){try{localStorage.setItem(storageKey(language.value),editor.value);}catch(_){}}
  function loadTemplate(force=false){const entry=item();let saved='';try{saved=localStorage.getItem(storageKey(entry.key))||'';}catch(_){}if(force||!editor.value)editor.value=saved||entry.template||'';}
  function renderLanguages(){language.innerHTML=languages.map(entry=>`<option value="${entry.key}">${entry.name}</option>`).join('');language.value=languages[0]?.key||'python';loadTemplate(true);}
  function errorMessage(error){const raw=`${error?.code||''} ${error?.message||''}`,detail=String(error?.message||'').replace(/^FirebaseError:\s*/,'').trim();if(/resource-exhausted|429|too many/i.test(raw))return 'عدد محاولات التشغيل كبير. انتظر دقيقة وحاول مرة أخرى.';if(/invalid-argument/i.test(raw))return detail.split(':').pop().trim()||'راجع الكود والبيانات المدخلة.';if(/انتهت مهلة|خدمة تشغيل الأكواد/i.test(detail))return detail;if(/unavailable|internal|network|fetch|timeout|abort/i.test(raw))return 'تعذر الوصول لخادم تشغيل الأكواد مؤقتًا. حاول مرة أخرى بعد لحظات.';return detail||'تعذر تشغيل الكود. راجع الكود وحاول مرة أخرى.';}
  async function publicCallable(name,data){
    let lastError;
    for(let attempt=0;attempt<2;attempt+=1){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),38000);
      try{
        const response=await fetch(`${FUNCTIONS_BASE}/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:data||{}}),signal:controller.signal});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||payload.error){const error=new Error(payload.error?.message||`HTTP ${response.status}`);error.code=payload.error?.status||response.status;throw error;}
        if(payload.result===undefined&&payload.data===undefined)throw new Error('استجابة خادم التشغيل غير صالحة. انشر Hosting وFunctions من النسخة الجديدة.');
        return payload.result??payload.data??payload;
      }catch(error){lastError=error;if(attempt===0&&/fetch|network|internal|unavailable|abort|5\d\d/i.test(`${error?.code||''} ${error?.message||''}`)){await new Promise(resolve=>setTimeout(resolve,650));continue;}throw error;}
      finally{clearTimeout(timer);}
    }
    throw lastError;
  }
  function runJavascriptFallback(source,input){
    return new Promise((resolve,reject)=>{
      const workerSource=`const send=(type,value)=>postMessage({type,value:String(value)});console.log=(...v)=>send('out',v.join(' '));console.error=(...v)=>send('err',v.join(' '));console.warn=console.log;self.fetch=()=>Promise.reject(new Error('Network is disabled'));self.XMLHttpRequest=undefined;self.WebSocket=undefined;self.importScripts=()=>{throw new Error('External scripts are disabled')};const stdin=${JSON.stringify(input)};try{const value=(0,eval)(${JSON.stringify(source)});if(value&&typeof value.then==='function')value.then(v=>{if(v!==undefined)send('out',v);send('done','0')}).catch(e=>{send('err',e&&e.stack||e);send('done','1')});else{if(value!==undefined)send('out',value);send('done','0')}}catch(e){send('err',e&&e.stack||e);send('done','1')}`;
      const url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})),worker=new Worker(url),stdout=[],stderr=[];
      const timer=setTimeout(()=>{worker.terminate();URL.revokeObjectURL(url);reject(new Error('timeout'));},3500);
      worker.onmessage=event=>{const data=event.data||{};if(data.type==='out')stdout.push(data.value);if(data.type==='err')stderr.push(data.value);if(data.type==='done'){clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);resolve({status:data.value==='0'?'Accepted':'Runtime Error',stdout:stdout.join('\n'),stderr:stderr.join('\n'),time:'local',memory:0,exitCode:Number(data.value)});}};
      worker.onerror=event=>{clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);reject(new Error(event.message||'worker-error'));};
    });
  }
  function showResult(result){const blocks=[];if(result.stdout)blocks.push(result.stdout);if(result.compileOutput)blocks.push(`Compile output:\n${result.compileOutput}`);if(result.stderr)blocks.push(`Error:\n${result.stderr}`);if(result.message)blocks.push(result.message);output.textContent=blocks.join('\n\n')||'انتهى البرنامج بدون مخرجات.';$('runStatus').textContent=result.status||'تم';$('runTime').textContent=result.time?`${result.time}s`:'—';$('runMemory').textContent=result.memory?`${Math.round(Number(result.memory)/1024)} MB`:'—';$('runExit').textContent=result.exitCode??'—';}
  async function run(){if(!editor.value.trim())return notify('اكتب الكود قبل التشغيل.');save();runButton.disabled=true;runButton.classList.add('is-loading');output.textContent='جاري إرسال الكود ثم انتظار النتيجة…';$('runStatus').textContent='جاري التشغيل';try{let result;try{result=await publicCallable('submitCodeExecution',{visitorId:visitorId(),language:language.value,sourceCode:editor.value,stdin:stdin.value});}catch(error){if(language.value!=='javascript'||!/unavailable|internal|network|fetch|timeout|abort|5\d\d/i.test(`${error?.code||''} ${error?.message||''}`))throw error;result=await runJavascriptFallback(editor.value,stdin.value);result.message='تم التشغيل محليًا لأن خادم التشغيل غير متاح.';}showResult(result);}catch(error){output.textContent=errorMessage(error);$('runStatus').textContent='فشل التشغيل';$('runTime').textContent='—';$('runMemory').textContent='—';$('runExit').textContent='—';}finally{runButton.disabled=false;runButton.classList.remove('is-loading');}}
  async function copy(){try{await navigator.clipboard.writeText(editor.value);notify('تم نسخ الكود');}catch(_){editor.select();document.execCommand('copy');notify('تم نسخ الكود');}}
  function download(){const ext={python:'py',javascript:'js',typescript:'ts',c:'c',cpp:'cpp',java:'java',csharp:'cs',go:'go',php:'php',ruby:'rb',rust:'rs',kotlin:'kt'}[language.value]||'txt';const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([editor.value],{type:'text/plain;charset=utf-8'}));link.download=`techno-minds-code.${ext}`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  editor.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');save();}if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();run();}});editor.addEventListener('input',save);
  language.addEventListener('change',()=>{editor.value='';loadTemplate();});runButton.addEventListener('click',run);$('copyCodeButton').addEventListener('click',copy);$('downloadCodeButton').addEventListener('click',download);$('clearCodeButton').addEventListener('click',()=>{if(confirm('مسح الكود الحالي؟')){editor.value='';save();editor.focus();}});
  renderLanguages();
  window.addEventListener('load',async()=>{try{const remote=await publicCallable('getCodeLanguages',{});if(Array.isArray(remote?.languages)&&remote.languages.length){const current=language.value,currentCode=editor.value;languages=remote.languages;language.innerHTML=languages.map(entry=>`<option value="${entry.key}">${entry.name}</option>`).join('');language.value=languages.some(entry=>entry.key===current)?current:languages[0].key;if(!currentCode.trim())loadTemplate(true);}}catch(_){}});
})();
