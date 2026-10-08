'use strict';
// Runs the existing production builder/validator with an isolated output only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'tm-exam-build-'));
for(const name of ['build.js','verify-dist.js']){
 const file=path.join(__dirname,name),source=fs.readFileSync(file,'utf8').replace("const dist = path.join(root, 'dist');",`const dist = ${JSON.stringify(out)};`);
 vm.runInNewContext(source,{require:createRequire(file),__dirname:path.dirname(file),console,process,Buffer,URLSearchParams},{filename:file});
}
console.log('Isolated verified output: '+out);
