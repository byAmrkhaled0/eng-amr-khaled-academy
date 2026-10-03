'use strict';
// Same non-emulator scope as Phase 1.1; integration suites run separately.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=fs.readdirSync(__dirname).filter(name=>name.endsWith('.test.js')&&!name.includes('.integration.')&&!name.includes('.emulator.')).sort().map(name=>`scripts/${name}`);
console.log(`Non-emulator test files: ${files.length}`);
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',env:process.env});
if(result.error)throw result.error;
process.exitCode=result.status===null?1:result.status;
