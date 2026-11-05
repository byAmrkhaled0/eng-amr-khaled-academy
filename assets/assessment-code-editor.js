(function(){
 'use strict';
 if(window.TMAssessmentEditor)return;
 const css=new URL('assessment-code-editor.css?rev=20261105b',document.currentScript?.src||document.baseURI);
 const link=document.createElement('link');link.rel='stylesheet';link.href=css.href;let cssReady=false,cssFailed=false;const pending=new Set();
 link.addEventListener('load',()=>{cssReady=true;for(const root of pending)if(root.isConnected||root===document)enhance(root);pending.clear();});
 link.addEventListener('error',()=>{cssFailed=true;pending.clear();});document.head.appendChild(link);
 const tokenPattern=/(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(?:def|class|return|if|elif|else|for|while|in|import|from|as|try|except|finally|with|lambda|pass|break|continue|and|or|not|is|True|False|None|async|await|const|let|var|function|new|throw|catch|switch|case|default|export|public|private|static|void|int|float|double|char|bool|boolean|null|true|false|print|console|log|range|len)\b|\b\d+(?:\.\d+)?\b/g;
 function highlight(value){
  const fragment=document.createDocumentFragment();let offset=0;
  tokenPattern.lastIndex=0;
  for(const match of value.matchAll(tokenPattern)){
   fragment.append(document.createTextNode(value.slice(offset,match.index)));
   const span=document.createElement('span');span.className='tm-assessment-code-'+(match[1]?'comment':match[2]?'string':/^\d/.test(match[0])?'number':'keyword');span.textContent=match[0];fragment.append(span);offset=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(value.slice(offset)));return fragment;
 }
 function enhance(root=document){
  if(cssFailed)return;
  if(!cssReady){pending.add(root);return;}
  root.querySelectorAll('[data-assessment-code-prompt]').forEach(prompt=>{if(prompt.dataset.codeHighlighted)return;prompt.dataset.codeHighlighted='true';prompt.classList.add('tm-assessment-code-prompt');prompt.replaceChildren(highlight(prompt.textContent));});
  root.querySelectorAll('textarea[data-assessment-code-editor]').forEach(area=>{
   if(area.dataset.codeEnhanced)return;area.dataset.codeEnhanced='true';
   const shell=document.createElement('span');shell.className='tm-assessment-code-editor';shell.dir='ltr';
   const bar=document.createElement('span');bar.className='tm-assessment-code-editor-bar';
   const language=document.createElement('span');language.textContent=area.dataset.codeLanguage||'Code';
   const hint=document.createElement('span');hint.dir='rtl';hint.textContent='Tab: مسافة بادئة · Esc ثم Tab للخروج';bar.append(language,hint);
   const viewport=document.createElement('span');viewport.className='tm-assessment-code-viewport';
   const gutter=document.createElement('span');gutter.className='tm-assessment-code-gutter';gutter.setAttribute('aria-hidden','true');
   const lines=document.createElement('span');gutter.append(lines);
   const stack=document.createElement('span');stack.className='tm-assessment-code-stack';
   const paint=document.createElement('pre');paint.className='tm-assessment-code-paint';paint.setAttribute('aria-hidden','true');
   area.before(shell);shell.append(bar,viewport);viewport.append(gutter,stack);stack.append(paint,area);
   area.wrap='off';area.autocapitalize='off';area.autocomplete='off';area.setAttribute('autocorrect','off');area.dir='ltr';area.spellcheck=false;
   // The existing form has high-specificity dark textarea rules. The overlay
   // requires a transparent native input in both themes, without changing it.
   area.style.setProperty('background','transparent','important');
   area.style.setProperty('border-radius','0','important');
   let frame=0,escapeTab=false,composing=false;
   const scroll=()=>{paint.style.transform=`translate(${-area.scrollLeft}px,${-area.scrollTop}px)`;lines.style.transform=`translateY(${-area.scrollTop}px)`;};
   const render=()=>{frame=0;if(!area.isConnected)return;paint.replaceChildren(highlight(area.value+'\n'));const count=area.value.split('\n').length;lines.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');scroll();};
   const update=()=>{if(!frame)frame=requestAnimationFrame(render);};
   const replace=(text,start,end,selectionStart,selectionEnd)=>{
    if(area.maxLength>=0&&area.value.length-(end-start)+text.length>area.maxLength)return;
    area.setRangeText(text,start,end,'end');if(selectionStart!==undefined)area.setSelectionRange(selectionStart,selectionEnd);
    area.dispatchEvent(new Event('input',{bubbles:true}));
   };
   area.addEventListener('input',update);area.addEventListener('scroll',scroll,{passive:true});
   area.addEventListener('compositionstart',()=>composing=true);area.addEventListener('compositionend',()=>{composing=false;update();});
   area.addEventListener('keydown',event=>{
    if(area.disabled||area.readOnly||event.isComposing||composing)return;
    if(event.key==='Escape'){escapeTab=true;event.preventDefault();event.stopPropagation();return;}
    if(event.key==='Tab'&&escapeTab){escapeTab=false;return;}escapeTab=false;
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const start=area.selectionStart,end=area.selectionEnd,value=area.value;
    const lineStart=start===0?0:value.lastIndexOf('\n',start-1)+1;
    if(event.key==='Tab'){
     event.preventDefault();
     if(start===end&&!event.shiftKey){const spaces=' '.repeat(4-(start-lineStart)%4);replace(spaces,start,end);return;}
     const blockEnd=end>start&&value[end-1]==='\n'?end-1:end;
     const block=value.slice(lineStart,blockEnd),parts=block.split('\n');let delta=0,firstDelta=0;
     const changed=parts.map((line,index)=>{const size=event.shiftKey?-(line.match(/^(?: {1,4}|\t)/)?.[0].length||0):4;delta+=size;if(!index)firstDelta=size;return size<0?line.slice(-size):size>0?'    '+line:line;}).join('\n');
     replace(changed,lineStart,blockEnd,Math.max(lineStart,start+firstDelta),Math.max(lineStart,end+delta));return;
    }
    if(event.key==='Enter'){
     const before=value.slice(lineStart,start),indent=before.match(/^\s*/)?.[0]||'',extra=/[:{[(]\s*$/.test(before)?'    ':'';
     if(indent||extra){event.preventDefault();replace('\n'+indent+extra,start,end);}
    }
   });
   area.__tmCodeRefresh=update;render();
  });
 }
 document.addEventListener('reset',event=>requestAnimationFrame(()=>event.target.querySelectorAll('textarea[data-assessment-code-editor]').forEach(area=>area.__tmCodeRefresh?.())),true);
 window.TMAssessmentEditor={enhance};
})();
