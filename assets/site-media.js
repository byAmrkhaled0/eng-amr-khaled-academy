/* Site image contract and DOM binding. No Firebase work or observers. */
(function(root,factory){'use strict';if(typeof module==='object'&&module.exports)module.exports=factory(null);else root.TMSiteMedia=factory(root);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 'use strict';
 const DEFAULT_BUCKET='eng-amr-khaled-academy.firebasestorage.app';
 const SLOTS=[
  {id:'logo',title:'شعار الموقع',src:'assets/technominds-logo.webp',max:640,fit:'contain',alt:'Techno Minds'},
  {id:'homeHero',title:'الصورة الرئيسية',src:'assets/student-laptop-hero-v2.webp',max:1920,fit:'cover',alt:'التعلّم والتطبيق في Techno Minds'},
  {id:'ownerHome',title:'صورتك في الرئيسية',src:'assets/amr-khaled-home.webp',max:1280,fit:'cover',alt:'المهندس عمرو خالد'},
  {id:'ownerAbout',title:'صورتك في صفحة عن المدرس',src:'assets/amr-khaled-home.webp',max:1280,fit:'cover',alt:'المهندس عمرو خالد'},
  {id:'certificateIti',title:'شهادة ITI',src:'assets/certificates/iti-ai-ml.jpg',max:1800,fit:'contain',alt:'شهادة ITI'},
  {id:'certificateNvidia',title:'شهادة NVIDIA',src:'assets/certificates/nvidia-deep-learning.jpg',max:1800,fit:'contain',alt:'شهادة NVIDIA'},
  {id:'certificateVision',title:'شهادة Computer Vision',src:'assets/certificates/kaggle-computer-vision.jpg',max:1800,fit:'contain',alt:'شهادة Computer Vision'},
  {id:'certificateDeep',title:'شهادة Deep Learning',src:'assets/certificates/kaggle-intro-deep-learning.jpg',max:1800,fit:'contain',alt:'شهادة Deep Learning'}
 ];
 const MAX_INPUT=10*1024*1024,MAX_OUTPUT=1500*1024,states=new WeakMap();
 let settings={},bucket=DEFAULT_BUCKET;
 const local=()=>root?.MF_FIREBASE_CONFIG?.emulators?.projectId==='demo-technominds'&&['127.0.0.1','localhost','[::1]'].includes(root?.location?.hostname);
 const isSlot=id=>SLOTS.some(s=>s.id===id)||/^track_[a-z0-9][a-z0-9-]{1,59}$/.test(String(id));
 function safeURL(value,expectedBucket=DEFAULT_BUCKET,emulator=false){
  if(typeof value!=='string'||value.length>1800)return '';
  if(/^assets\/[A-Za-z0-9_/-]+\.(webp|png|jpe?g)$/i.test(value))return value;
  try{const u=new URL(value),host=u.hostname==='firebasestorage.googleapis.com'&&u.protocol==='https:'&&!u.port,dev=emulator&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port==='9199';if((!host&&!dev)||u.username||u.password||u.hash)return '';const match=u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);if(!match||decodeURIComponent(match[1])!==expectedBucket)return '';const object=decodeURIComponent(match[2]);if(!/^public\/uploads\/site-[a-z0-9_-]+\.(webp|png|jpe?g)$/.test(object)||u.searchParams.get('alt')!=='media'||[...u.searchParams.keys()].some(k=>!['alt','token'].includes(k)))return '';return u.href;}catch(_){return '';}
 }
 function normalize(id,value,expectedBucket=DEFAULT_BUCKET,emulator=false){
  if(!isSlot(id))throw new Error('مكان الصورة غير صحيح.');
  if(value===null||value?.url==='')return {url:'',path:'',alt:'',fit:'cover',x:50,y:50,width:0,height:0,contentType:'image/webp'};
  const url=safeURL(value?.url,expectedBucket,emulator);if(!url)throw new Error('اختر صورة محلية أو ارفع صورة من لوحة الإدارة.');
  const path=url.startsWith('assets/')?'':decodeURIComponent(new URL(url).pathname.split('/o/')[1]);
  if(value.path&&value.path!==path)throw new Error('مسار الصورة لا يطابق ملف الرفع.');
  const width=Number(value.width||0),height=Number(value.height||0),x=Number(value.x??50),y=Number(value.y??50);
  if(![width,height,x,y].every(Number.isFinite)||width<0||height<0||width>12000||height>12000||x<0||x>100||y<0||y>100)throw new Error('أبعاد أو موضع الصورة غير صحيح.');
  if(value.fit&&!['cover','contain'].includes(value.fit))throw new Error('طريقة عرض الصورة غير صحيحة.');
  const contentType=value.contentType||(/\.png(?:\?|$)/i.test(url)?'image/png':/\.jpe?g(?:\?|$)/i.test(url)?'image/jpeg':'image/webp');
  if(!['image/webp','image/png','image/jpeg'].includes(contentType))throw new Error('نوع الصورة غير مدعوم.');
  return {url,path,alt:String(value.alt||'').trim().slice(0,180),fit:value.fit||'cover',x,y,width,height,contentType};
 }
 function slots(siteSettings={}){return [...SLOTS,...(Array.isArray(siteSettings.learningTracks)?siteSettings.learningTracks:root?.TMAccountDomain?.DEFAULT_TRACKS||[]).filter(t=>/^track_[a-z0-9][a-z0-9-]{1,59}$/.test('track_'+t.id)).map(t=>({id:'track_'+t.id,title:'مسار: '+t.title,src:safeURL(t.image)||'',max:1200,fit:'cover',alt:t.title,trackId:t.id}))];}
 function current(id){try{const entry=settings.siteMedia?.[id];return entry?.url?normalize(id,entry,bucket,local()):null;}catch(_){return null;}}
 function remember(img){let state=states.get(img);if(state)return state;state={src:img.getAttribute('src'),alt:img.getAttribute('alt'),fit:img.style.objectFit,position:img.style.objectPosition,transform:img.style.transform,sources:[...img.closest('picture')?.querySelectorAll('source')||[]].map(n=>({node:n,src:n.getAttribute('srcset'),type:n.getAttribute('type')})),url:'',failed:''};states.set(img,state);img.addEventListener('error',()=>{if(!state.url)return;state.failed=state.url;restore(img,state);if(img.hasAttribute('data-site-media-owned'))img.hidden=true;});return state;}
 function attr(node,key,value){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value);}
 function restore(img,state){state.url='';attr(img,'src',state.src);attr(img,'alt',state.alt);img.style.objectFit=state.fit;img.style.objectPosition=state.position;img.style.transform=state.transform;for(const s of state.sources){attr(s.node,'srcset',s.src);attr(s.node,'type',s.type);}}
 function paint(img,id){const state=remember(img),entry=current(id);if(!entry){if(state.url)restore(img,state);return;}if(state.url===entry.url&&state.altValue===entry.alt&&state.fitValue===entry.fit&&state.positionValue===entry.x+'% '+entry.y+'%')return;if(state.failed===entry.url)return;img.hidden=false;state.url=entry.url;state.altValue=entry.alt;state.fitValue=entry.fit;state.positionValue=entry.x+'% '+entry.y+'%';for(const s of state.sources){s.node.srcset=entry.url;s.node.type=entry.contentType;}img.src=entry.url;if(entry.alt)img.alt=entry.alt;img.style.objectFit=entry.fit;img.style.objectPosition=state.positionValue;if(id==='ownerHome')img.style.transform='none';}
 function apply(siteSettings={}){
  if(!root?.document)return;settings=siteSettings||{};bucket=root.MF_FIREBASE_CONFIG?.storageBucket||root.MFCloud?.app?.options?.storageBucket||DEFAULT_BUCKET;
  const doc=root.document,bind=(selector,id)=>{for(const img of doc.querySelectorAll(selector))img.dataset.siteMedia=id;};
  bind('.site-header .logo img,.footer .logo img','logo');bind('#home .teacher-photo img','homeHero');bind('#home .tm-owner-photo img','ownerHome');bind('.tm-about-profile .about-photo img','ownerAbout');
  SLOTS.filter(s=>s.id.startsWith('certificate')).forEach(s=>bind('img[src="'+s.src+'"]',s.id));
  for(const el of doc.querySelectorAll('.logo-mark')){const entry=current('logo');let img=el.querySelector('img[data-site-media-logo]');if(entry){if(!img){img=doc.createElement('img');img.dataset.siteMediaLogo='';img.dataset.siteMedia='logo';img.src=SLOTS[0].src;img.alt='';img.style.cssText='width:100%;height:100%;object-fit:contain;display:block';el.append(img);}el.style.backgroundImage='none';}else if(img){img.remove();el.style.backgroundImage='';}}
  for(const card of doc.querySelectorAll('[data-site-track]')){const id='track_'+card.dataset.siteTrack,entry=current(id);let img=card.querySelector(':scope>img');if(entry&&!img){img=doc.createElement('img');img.dataset.siteMediaOwned='';img.width=240;img.height=120;img.loading='lazy';img.decoding='async';img.alt='';card.append(img);}if(img){if(!entry&&img.hasAttribute('data-site-media-owned')){img.remove();continue;}img.dataset.siteMedia=id;}}
  for(const img of doc.querySelectorAll('img[data-site-media]'))paint(img,img.dataset.siteMedia);
 }
 async function prepare(file,slot){
  if(!root?.document||!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<=0||file.size>MAX_INPUT)throw new Error('اختر JPG أو PNG أو WebP بحجم لا يزيد عن 10MB.');
  const spec=slots().find(s=>s.id===slot)||{max:1200};if(!isSlot(slot))throw new Error('مكان الصورة غير صحيح.');
  const url=root.URL.createObjectURL(file),img=new root.Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('الملف ليس صورة صالحة.'));img.src=url;});if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>24000000)throw new Error('أبعاد الصورة كبيرة جدًا؛ اختر صورة أقل من 24 ميجابكسل.');const scale=Math.min(1,spec.max/Math.max(img.naturalWidth,img.naturalHeight)),canvas=docCanvas();canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);let blob;for(const quality of [.86,.76,.64]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<=MAX_OUTPUT)break;}if(!blob||blob.type!=='image/webp'||blob.size>MAX_OUTPUT)throw new Error('تعذر تجهيز نسخة خفيفة للصورة. جرّب صورة أصغر.');return {file:new root.File([blob],'site-'+slot.toLowerCase()+'-'+root.crypto.randomUUID().replace(/-/g,'')+'.webp',{type:'image/webp'}),width:canvas.width,height:canvas.height};}finally{root.URL.revokeObjectURL(url);}
 }
 function docCanvas(){return root.document.createElement('canvas');}
 return {SLOTS,MAX_INPUT,MAX_OUTPUT,DEFAULT_BUCKET,isSlot,safeURL,normalize,slots,apply,prepare};
});
