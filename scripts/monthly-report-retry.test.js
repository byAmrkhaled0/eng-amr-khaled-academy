
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('functions/index.js','utf8'),start=source.indexOf('async function buildStudentMonthlyReport('),end=source.indexOf('async function buildStudentMonthlyReportOnce(',start);
function load(once){const c={buildStudentMonthlyReportOnce:once};vm.createContext(c);vm.runInContext(source.slice(start,end)+'this.build=buildStudentMonthlyReport;',c);return c.build;}
test('healthy report calculates once with unchanged input',async()=>{const student={},options={force:true},report={score:75};let calls=0;const build=load(async(s,m,o)=>{calls++;assert.equal(s,student);assert.equal(m,'2026-10');assert.equal(o,options);return report;});assert.equal(await build(student,'2026-10',options),report);assert.equal(calls,1);});
test('one revision conflict recalculates once and returns the fresh report',async()=>{let calls=0;const report={revision:2},build=load(async()=>{if(++calls===1)throw Object.assign(Error('changed'),{code:'aborted'});return report;});assert.equal(await build({},'2026-10'),report);assert.equal(calls,2);});
test('continuous conflicts stop after two attempts',async()=>{let calls=0;const error=Object.assign(Error('changed'),{code:'aborted'}),build=load(async()=>{calls++;throw error;});await assert.rejects(build({},'2026-10'),e=>e===error);assert.equal(calls,2);});
test('permission, validation and availability errors are not retried',async()=>{for(const code of ['permission-denied','invalid-argument','unavailable']){let calls=0;const error=Object.assign(Error(code),{code}),build=load(async()=>{calls++;throw error;});await assert.rejects(build({},'2026-10'),e=>e===error);assert.equal(calls,1);}});
