'use strict';
// A narrow cascade inspector, NOT a browser layout or screenshot replacement.
const fs=require('node:fs'),path=require('node:path'),postcss=require('postcss'),{calculate}=require('specificity');
const root=path.join(__dirname,'../..');
function cascade({width=1440,read=file=>fs.readFileSync(path.join(root,file),'utf8')}={}){
 const html=read('teacher-login.html'),rules=[];
 for(const [,file] of html.matchAll(/href="(assets\/[^?"\s]+\.css)\?/g)){
  postcss.parse(read(file)).walkRules(rule=>{
   for(let parent=rule.parent;parent;parent=parent.parent){
    if(parent.type==='atrule'&&parent.name==='media'){
     if(/print|prefers-reduced-motion|orientation:landscape/.test(parent.params))return;
     const max=parent.params.match(/max-width:\s*(\d+)px/),min=parent.params.match(/min-width:\s*(\d+)px/);
     if(max&&width>+max[1]||min&&width<+min[1])return;
    }
    if(parent.type==='atrule'&&/keyframes/.test(parent.name))return;
   }
   for(const selector of rule.selectors){
    if(/::|:hover|:focus|:active/.test(selector))continue;
    let specificity;try{const {A,B,C}=calculate(selector);specificity=[A,B,C];}catch{return;}
    const declarations=rule.nodes.filter(node=>node.type==='decl');
    rules.push({selector,specificity,declarations,file});
   }
  });
 }
 const cache=new WeakMap();
 function style(element){
  if(!element)return {};if(cache.has(element))return cache.get(element);
  const parent=style(element.parentElement),result={};
  for(const key of Object.keys(parent))if(key.startsWith('--')||key==='color'||key==='font-size')result[key]=parent[key];
  const candidates=[];
  for(const rule of rules){let matches=false;try{matches=element.matches(rule.selector);}catch{}if(matches)for(const d of rule.declarations)candidates.push({prop:d.prop,value:d.value,rank:[d.important?1:0,...rule.specificity],file:rule.file});}
  for(const prop of Array.from(element.style))candidates.push({prop,value:element.style.getPropertyValue(prop),rank:[element.style.getPropertyPriority(prop)?1:0,1000,0,0],file:'inline'});
  candidates.sort((a,b)=>{for(let i=0;i<4;i++)if(a.rank[i]!==b.rank[i])return a.rank[i]-b.rank[i];return 0;});
  for(const candidate of candidates)result[candidate.prop]=candidate.value==='inherit'?parent[candidate.prop]:candidate.value;
  for(const key of Object.keys(result))if(!key.startsWith('--')){
   for(let i=0;i<8&&/var\(/.test(result[key]||'');i++)result[key]=result[key].replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g,(_,name,fallback)=>result[name]||fallback||'');
  }
  cache.set(element,result);return result;
 }
 return style;
}
function contrast(a,b){
 const rgb=hex=>{hex=hex.replace('#','');if(hex.length===3)hex=[...hex].map(c=>c+c).join('');if(!/^[a-f\d]{6}$/i.test(hex))throw Error('Expected opaque hex, got '+hex);return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);};
 const lum=c=>rgb(c).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const [x,y]=[lum(a),lum(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05);
}
module.exports={cascade,contrast};
