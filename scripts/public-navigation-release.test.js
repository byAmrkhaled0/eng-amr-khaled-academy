'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const src=fs.readFileSync(path.join(__dirname,'../assets/app.js'),'utf8'),fn=src.slice(src.indexOf('function setupActiveNavigation(){'),src.indexOf('function bindLocalizedDigits(){'));
for(const [route,href]of [['learning-path.html','index.html#tracks'],['reviews.html','reviews.html'],['about.html','about.html']])test('public active navigation reflects '+route,()=>{const dom=new JSDOM('<body><nav class="navlinks"><a href="index.html">الرئيسية</a><a href="index.html#tracks">المسارات</a><a href="reviews.html">الآراء</a><a href="about.html">عن</a></nav></body>',{url:'http://localhost/'+route,runScripts:'outside-only'});try{dom.window.eval(fn+';setupActiveNavigation();');const active=dom.window.document.querySelectorAll('.navlinks .active');assert.equal(active.length,1);assert.equal(active[0].getAttribute('href'),href);assert.equal(active[0].getAttribute('aria-current'),'page');}finally{dom.window.close();}});

test('dedicated reviews page shows 12 reviews, retries the same page, then appends the rest',async()=>{
  const html=fs.readFileSync(path.join(__dirname,'../reviews.html'),'utf8');
  const dom=new JSDOM(html,{runScripts:'outside-only'});
  try{
    const {window}=dom,document=window.document;
    const rows=Array.from({length:14},(_,i)=>({id:String(i),approved:true,name:'Reviewer '+i,text:'<img src=x>',rating:5}));
    const calls=[];
    window.hydrateIcons=()=>{};
    window.esc=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    window.MFCloud={getApprovedReviewsPage:async cursor=>{
      calls.push(cursor);
      if(!cursor)return {rows:rows.slice(0,12),nextCursor:'11'};
      if(calls.length===2)throw new Error('Network error');
      return {rows:rows.slice(12).concat({id:'pending',approved:false,text:'Private'}),nextCursor:null};
    }};
    const tick=()=>new Promise(resolve=>setImmediate(resolve));
    window.eval(src.slice(src.indexOf('function reviewCardHTML('),src.indexOf('function attachmentHtml('))+';setupReviewsPage();');
    await tick();
    const button=document.getElementById('reviewsPageMore'),box=document.getElementById('reviewsList');
    assert.equal(box.querySelectorAll('article').length,12);
    button.click();
    await tick();
    assert.equal(box.querySelectorAll('article').length,12);
    assert.match(button.textContent,/إعادة المحاولة/);
    button.click();
    await tick();
    assert.deepEqual(calls,[null,'11','11']);
    assert.equal(box.querySelectorAll('article').length,14);
    assert.equal(button.hidden,true);
    assert.equal(box.querySelector('img'),null);
    assert.doesNotMatch(box.textContent,/Private/);
  }finally{dom.window.close();}
});
