'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..'),origin='https://eng-amr-khaled-academy.vercel.app';
const publicPages=['index.html','learning-path.html','about.html','practical.html','materials.html','theory-lectures.html','questions.html','exams.html','reviews.html','privacy.html','terms.html'];
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('public pages have unique titles, descriptions, one H1, canonical and social metadata',()=>{
 const titles=new Set();for(const file of publicPages){const dom=new JSDOM(read(file)),d=dom.window.document;
  assert(d.title.trim(),file);assert(!titles.has(d.title),file);titles.add(d.title);
  assert(d.querySelector('meta[name="description"]')?.content.trim(),file);
  assert.equal(d.querySelectorAll('h1').length,1,file);
  assert.equal(d.querySelector('link[rel="canonical"]')?.href,origin+'/'+(file==='index.html'?'':file),file);
  assert(d.querySelector('meta[property="og:title"]')?.content,file);
  assert(!/noindex/.test(d.querySelector('meta[name="robots"]')?.content||''),file);dom.window.close();
 }
});
test('sitemap lists real public canonical pages and excludes private portals',()=>{
 const urls=[...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 assert.equal(new Set(urls).size,urls.length);for(const file of publicPages)assert(urls.includes(origin+'/'+(file==='index.html'?'':file)),file);
 for(const url of urls){const file=new URL(url).pathname.slice(1)||'index.html';assert(publicPages.includes(file),file);assert(fs.existsSync(path.join(root,file)),file);}
 for(const file of ['student.html','parent.html','teacher-login.html']){const dom=new JSDOM(read(file));assert.match(dom.window.document.querySelector('meta[name="robots"]').content,/noindex/);assert(!urls.includes(origin+'/'+file));dom.window.close();}
});
test('homepage structured data describes only real organization and website identities',()=>{
 const dom=new JSDOM(read('index.html')),d=dom.window.document,nodes=[...d.querySelectorAll('script[type="application/ld+json"]')].flatMap(s=>JSON.parse(s.textContent)['@graph']||[]);
 const org=nodes.find(n=>n['@type']==='EducationalOrganization'),site=nodes.find(n=>n['@type']==='WebSite');assert(org);assert(site);assert.equal(org.url,origin+'/');assert.equal(site.url,org.url);assert.equal(org.name,'TECHNO MINDS');assert(fs.existsSync(path.join(root,new URL(org.logo).pathname)));assert(!org.aggregateRating);dom.window.close();
});
test('local HTML assets and page links resolve without removing existing routes',()=>{
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const dom=new JSDOM(read(file),{url:origin+'/'+file});
  for(const node of dom.window.document.querySelectorAll('[src],link[href],a[href]')){const raw=node.getAttribute('src')||node.getAttribute('href');if(!raw||/^(?:#|https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(raw))continue;const url=new URL(raw,origin+'/'+file);if(url.origin!==origin)continue;assert(fs.existsSync(path.join(root,decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html')),file+': '+raw);}
  dom.window.close();
 }
});
