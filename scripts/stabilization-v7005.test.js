'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('release, frontend, backend, lockfiles and worker agree without changing API schema',()=>{
  const version='70.0.5';
  for(const file of ['package.json','functions/package.json','package-lock.json','functions/package-lock.json']){
    const value=JSON.parse(read(file));assert.equal(value.version,version,file);
    if(value.packages)assert.equal(value.packages[''].version,version,file);
  }
  assert.match(read('assets/firebase-sync.js'),/FRONTEND_VERSION='70\.0\.5'/);
  assert.match(read('assets/firebase-sync.js'),/API_SCHEMA_VERSION='portal-v64\.0\.0'/);
  assert.match(read('assets/app.js'),/MF_ASSET_VERSION = '70\.0\.5'/);
  assert.match(read('service-worker.js'),/technominds-v70-0-5-complete-report/);
  assert.match(read('service-worker.js'),/ASSET_VERSION = "70\.0\.5"/);
});

test('deployment is selective and Vercel only; smoke check gets each published route',()=>{
  const production=read('deploy-production.ps1'),hosting=read('deploy-hosting-only.ps1');
  assert.match(production,/\[string\[\]\]\$Functions = @\(\)/);
  assert.match(production,/foreach \(\$FunctionName in \(\$Functions \| Sort-Object -Unique\)\)/);
  assert.match(production,/\$FunctionName -notin \$AvailableFunctions/);
  assert.doesNotMatch(production,/"deploy", "--only", "hosting"|--force/);
  assert.doesNotMatch(hosting,/deploy\s+--only\s+hosting/);
  assert.match(hosting,/exit 1/);
  const pkg=JSON.parse(read('package.json'));
  for(const key of ['firebase:functions','firebase:hosting','firebase:deploy:backend','firebase:deploy:all'])assert.doesNotMatch(pkg.scripts[key],/firebase deploy --only/);
  const check=read('check-deployment.ps1');
  assert.match(check,/\$BaseUrl = "https:\/\/eng-amr-khaled-academy\.vercel\.app"/);
  assert.match(check,/-Method Get/);
  for(const route of ['student.html','parent.html','teacher-login.html','service-worker.js','site-manifest.json','teacher-manifest.json','404.html'])assert.ok(check.includes(route));
  assert.match(check,/release number alone does not prove incompatibility/);
});

test('deployment resume requires resources and skips completed functions without unsafe flags',()=>{
  const production=read('deploy-production.ps1'),launcher=read('DEPLOY-WINDOWS.cmd');
  assert.match(production,/if \(\$Functions\.Count -eq 0 -and -not \$DeployRules -and -not \$DeployIndexes\) \{\s*throw/);
  assert.match(production,/function Test-StepComplete\([\s\S]*?if \(-not \$Resume -or -not \(Test-Path -LiteralPath \$StateFile\)\) \{ return \$false \}[\s\S]*?Where-Object \{ \$_ -eq \$Name \}/);
  const loop=production.slice(production.indexOf('foreach ($FunctionName in ($Functions | Sort-Object -Unique))'),production.indexOf('Complete-Step "functions"'));
  assert.ok(loop.includes('if (Test-StepComplete $FunctionStep)'));
  assert.ok(loop.indexOf('continue')<loop.indexOf('Invoke-Checked -Executable $FirebaseExecutable'));
  assert.ok(loop.indexOf('Invoke-Checked -Executable $FirebaseExecutable')<loop.indexOf('Complete-Step $FunctionStep'));
  assert.match(production,/\$ResumeCommand \+= @\('-Functions', \(\$Functions -join ','\)\)/);
  assert.match(production,/if \(\$DeployRules\) \{ \$ResumeCommand \+= '-DeployRules' \}/);
  assert.match(production,/if \(\$DeployIndexes\) \{ \$ResumeCommand \+= '-DeployIndexes' \}/);
  assert.match(production,/\$ResumeCommand -join ' '/);
  assert.doesNotMatch(production,/Write-Host "\.\\deploy-production\.ps1 -Resume"/);
  assert.doesNotMatch(launcher,/DEPLOY-WINDOWS\.cmd -Resume(?:"|\s*$)/m);
  assert.match(launcher,/DEPLOY-WINDOWS\.cmd -Resume -Functions getPlatformHealthHttp,getPortalStudent/);
  assert.doesNotMatch(production+launcher,/firebase deploy --only hosting|"deploy", "--only", "hosting"|--force/i);
});

test('deployment normalizes PowerShell and CMD function lists and README uses current release commands',()=>{
  const production=read('deploy-production.ps1'),readme=read('README.md'),launcher=read('DEPLOY-WINDOWS.cmd');
  const normalization=production.match(/\$Functions = @\(\s*\$Functions \|\s*ForEach-Object \{ \$_ -split ',' \} \|\s*ForEach-Object \{ \$_\.Trim\(\) \} \|\s*Where-Object \{ \$_ \} \|\s*Sort-Object -Unique\s*\)/);
  assert.ok(normalization,'split every parameter element, trim, discard blanks, deduplicate');
  assert.ok(production.indexOf(normalization[0])<production.indexOf('if ($Functions.Count -eq 0'),'normalize before preflight');
  for(const input of [['getPortalStudent,getStudentResources'],['getPortalStudent'],['getPortalStudent, getStudentResources','getPortalStudent',',']]){
    const actual=[...new Set(input.flatMap(value=>value.split(',')).map(value=>value.trim()).filter(Boolean))].sort();
    assert.deepEqual(actual,input.length===1&&input[0]==='getPortalStudent'?['getPortalStudent']:['getPortalStudent','getStudentResources']);
  }
  assert.match(production,/\$ResumeCommand \+= @\('-Functions', \(\$Functions -join ','\)\)/);
  assert.match(launcher,/powershell\.exe[^\n]*-File "%~dp0deploy-production\.ps1" %\*/);
  assert.match(readme,/GitHub → Vercel/);
  assert.match(readme,/لا تستخدم Firebase Hosting أو `DEPLOY-HOSTING-ONLY\.cmd`/);
  assert.match(readme,/\.\\deploy-production\.ps1 -Functions getPlatformHealthHttp,getPortalStudent -SkipSiteCheck/);
  assert.match(readme,/\.\\deploy-production\.ps1 -Resume -Functions getPlatformHealthHttp,getPortalStudent -SkipSiteCheck/);
  assert.match(readme,/DEPLOY-WINDOWS\.cmd -Resume -Functions getPlatformHealthHttp,getPortalStudent -SkipSiteCheck/);
  assert.doesNotMatch(readme,/^\s*\.?\\?DEPLOY-WINDOWS\.cmd -Resume\s*$/m);
  assert.doesNotMatch(readme,/^\s*\.\\DEPLOY-HOSTING-ONLY\.cmd\s*$/m);
  assert.doesNotMatch(production+launcher+readme,/firebase deploy --only hosting|"deploy", "--only", "hosting"|--force/i);
  assert.equal(JSON.parse(read('package.json')).version,'70.0.5');
});

test('teacher page keeps admin bundles inert and preserves final renderer order',()=>{
  const html=read('teacher-login.html');
  const login=html.split('<template id="adminBundles">')[0];
  assert.match(login,/assets\/admin-entry\.js\?v=70\.0\.5/);
  for(const name of ['admin.js','app.js','v60-admin-workflow.js','v64-admin-operations.js'])assert.doesNotMatch(login,new RegExp('src="assets/'+name.replace('.','\\.')+'\\?'));
  assert.ok(html.indexOf('assets/admin.js?')<html.indexOf('assets/v60-admin-workflow.js?'));
  assert.ok(html.indexOf('assets/v60-admin-workflow.js?')<html.indexOf('assets/v64-admin-operations.js?'));
  assert.match(read('assets/admin-entry.js'), /await \(window\.__tmAdminRenderReady\|\|Promise\.resolve\(\)\)/);
});

let JSDOM;try{({JSDOM}=require('jsdom'));}catch{}
test('login loads each admin bundle once only after admin claim, and deep link survives', {skip:!JSDOM},async()=>{
  const dom=new JSDOM(read('teacher-login.html'),{url:'https://example.test/teacher-login.html?section=bookings',runScripts:'outside-only'});
  const {window}=dom,{document}=window,form=document.getElementById('loginForm');
  Object.defineProperties(form,{email:{value:document.getElementById('adminEmail')},password:{value:document.getElementById('adminPassword')}});
  form.email.value='teacher@example.test';form.password.value='secret';
  const loaded=[],root=document.getElementById('adminRoot');let allowed=false,observer,starts=0,reset=0,signouts=0,readyResolve;
  window.MFCloud={ready:true,auth:{currentUser:{uid:'admin'},onIdTokenChanged(fn){observer=fn;}},async signIn(){setTimeout(()=>observer({uid:'admin'}),0);},async signOut(){signouts++;},async getCurrentStaffProfile(){return {uid:'admin',allowed};},async sendPasswordReset(){reset++;}};
  const originalAppend=document.body.appendChild.bind(document.body);
  document.body.appendChild=node=>{if(node.tagName==='SCRIPT'){loaded.push(node.src.split('/').pop().split('?')[0]);if(node.src.includes('v638-admin-recovery.js?'))window.__tmAdminRenderReady=new Promise(resolve=>{readyResolve=resolve;});if(node.src.includes('admin.js?'))window.__tmAdminBootstrapStart=async profile=>{starts++;assert.ok(profile.allowed);root.className='admin-page';assert.equal(new window.URLSearchParams(window.location.search).get('section'),'bookings');};queueMicrotask(()=>node.onload?.());return node;}return originalAppend(node);};
  window.eval(read('assets/admin-entry.js'));
  assert.equal(loaded.length,0);
  const submit=()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  submit();await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(loaded.length,0,'unauthorized users must not download admin bundles');assert.equal(signouts,1);
  allowed=true;submit();submit();await new Promise(resolve=>setTimeout(resolve,12));
  assert.equal(starts,0,'workspace cannot render before the final renderer is installed');
  readyResolve();await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(starts,1);assert.equal(loaded.length,document.getElementById('adminBundles').content.querySelectorAll('script[src]').length);
  assert.equal(loaded.filter(name=>name==='admin.js').length,1);
  await observer({uid:'admin'});assert.equal(starts,1);
  form.email.value='teacher@example.test';document.getElementById('adminPasswordReset').click();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(reset,1);
  dom.window.close();
});

test('logout reports server sign-out failures instead of claiming success',async()=>{
  const vm=require('node:vm'),admin=read('assets/admin.js');
  const start=admin.indexOf('window.adminLogout=async function()'),end=admin.indexOf('\n};',start)+3;
  assert.ok(start>0&&end>start);
  let reloaded=false,feedback='';
  const window={OfflineAttendance:{counts:async()=>({total:0})},MFCloud:{signOut:async()=>{throw Error('offline');}}};
  const context={window,console,confirm:()=>true,OFFLINE_STAFF_PROFILE_KEY:'profile',localStorage:{removeItem(){}},location:{reload(){reloaded=true;}},aToast:value=>{feedback=value;},adminActionErrorMessage:(error)=>error.message};
  vm.runInNewContext(admin.slice(start,end),context);
  await context.window.adminLogout();
  assert.equal(reloaded,false);
  assert.equal(feedback,'offline');
});

test('localhost shares Vercel backend routing without Firebase Hosting fallbacks',()=>{
  const sync=read('assets/firebase-sync.js'),practical=read('assets/practical.js');
  assert.doesNotMatch(sync+practical,/eng-amr-khaled-academy\.web\.app/);
  assert.match(sync,/publicApiOrigin=localHosts\.has\([^)]*\)\?'https:\/\/eng-amr-khaled-academy\.vercel\.app'/);
  assert.match(sync,/preferDirectCallable=[^;]+\|\|localHosts\.has/);
  assert.match(practical,/PREFER_DIRECT=[^;]+\|\|LOCAL_HOSTS\.includes/);
  assert.match(practical,/eng-amr-khaled-academy\.vercel\.app\/api\/code/);
});

test('offline attendance keeps the cached verified staff path after auth refresh fails', {skip:!JSDOM},async()=>{
  const dom=new JSDOM(read('teacher-login.html'),{url:'https://example.test/teacher-login.html',runScripts:'outside-only'});
  const {window}=dom,{document}=window;
  Object.defineProperty(window.navigator,'onLine',{value:false,configurable:true});
  window.localStorage.setItem('tm-offline-staff-profile-v1',JSON.stringify({allowed:true,uid:'admin',expiresAt:Date.now()+60000}));
  let observer,loads=0;
  window.MFCloud={ready:true,auth:{onIdTokenChanged(fn){observer=fn;}},getCurrentStaffProfile:async()=>{throw Error('offline');}};
  document.body.appendChild=node=>{if(node.tagName==='SCRIPT'){loads++;if(node.src.includes('v638-admin-recovery'))window.__tmAdminRenderReady=Promise.resolve();queueMicrotask(()=>node.onload?.());return node;}throw Error('unexpected append');};
  window.eval(read('assets/admin-entry.js'));
  await observer({uid:'admin'});
  assert.equal(loads,document.getElementById('adminBundles').content.querySelectorAll('script[src]').length);
  assert.match(read('assets/admin.js'),/tryOfflineStaffWorkspace\(\)/);
  dom.window.close();
});
