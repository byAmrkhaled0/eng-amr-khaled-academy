'use strict';
const http=require('node:http');
const capabilities={enable_network:false,allow_enable_network:false,max_cpu_time_limit:20,max_wall_time_limit:30,max_memory_limit:2048000,max_max_file_size:20480,max_max_processes_and_or_threads:256};
const accepted={status:{id:3,description:'Accepted'},stdout:'hello',stderr:'',compile_output:'',message:'',time:'0.01',memory:1234,exit_code:0};
async function fakeJudge0(scenario={}){
 const requests=[];const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const row={method:req.method,url:req.url,headers:req.headers,body:body?JSON.parse(body):null};requests.push(row);res.setHeader('Content-Type','application/json');const u=new URL(req.url,'http://localhost');if(scenario.handle&&u.pathname==='/config_info'&&scenario.redirectConfig&&await scenario.handle({req,res,row,u,requests}))return;if(u.pathname==='/config_info'){res.end(JSON.stringify({...capabilities,...scenario.capabilities}));return;}
 if(scenario.handle&&await scenario.handle({req,res,row,u,requests}))return;
 if(req.method==='POST'){if(scenario.submitStatus){res.statusCode=scenario.submitStatus;res.end('{}');}else res.end(JSON.stringify(scenario.submit||{token:'test-token'}));return;}
 res.end(JSON.stringify(scenario.result||accepted));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;return{origin,requests,env:{JUDGE0_BASE_URL:origin,JUDGE0_ALLOWED_ORIGINS:origin,JUDGE0_ALLOW_PRIVATE_ENDPOINT:'true'},close:()=>new Promise(r=>{server.close(r);server.closeAllConnections();})};
}
module.exports={fakeJudge0,capabilities,accepted};
