import json,time,urllib.request,concurrent.futures
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Explicit safe probes of default public Judge0 only; never platform production.')
parser.add_argument('--mode',choices=['hello','network'],required=True)
mode=parser.parse_args().mode
provider='https://ce.judge0.com'
# Fixed harmless Hello programs only. No arbitrary student source and no abuse probes.
programs=[('python',71,'print("PHASE23_HELLO")'),('javascript',63,'console.log("PHASE23_HELLO");'),('typescript',74,'console.log("PHASE23_HELLO");'),('c',50,'#include <stdio.h>\nint main(){puts("PHASE23_HELLO");return 0;}'),('cpp',54,'#include <iostream>\nint main(){std::cout<<"PHASE23_HELLO";}'),('java',62,'class Main {public static void main(String[] args){System.out.println("PHASE23_HELLO");}}'),('csharp',51,'using System;class Program{static void Main(){Console.WriteLine("PHASE23_HELLO");}}'),('go',60,'package main\nimport "fmt"\nfunc main(){fmt.Println("PHASE23_HELLO")}'),('php',68,'<?php echo "PHASE23_HELLO";'),('ruby',72,'puts "PHASE23_HELLO"'),('rust',73,'fn main(){println!("PHASE23_HELLO");}'),('kotlin',78,'fun main(){println("PHASE23_HELLO")}')]
network_programs=[
 ('javascript',63,"const net=require('net');const s=net.connect({host:'1.1.1.1',port:80});s.setTimeout(2000);s.on('connect',()=>{console.log('NETWORK_CONNECTED');s.destroy();});s.on('error',e=>console.log('NETWORK_BLOCKED:'+e.code));s.on('timeout',()=>{console.log('NETWORK_TIMEOUT');s.destroy();});"),
 ('python',71,"import socket\ns=socket.socket();s.settimeout(2)\ntry:\n s.connect(('1.1.1.1',80));print('NETWORK_CONNECTED')\nexcept Exception as e:\n print('NETWORK_BLOCKED:'+str(type(e).__name__)+':'+str(getattr(e,'errno',None)))\nfinally:\n s.close()"),
 ('c',50,'#include <sys/socket.h>\n#include <sys/time.h>\n#include <arpa/inet.h>\n#include <stdio.h>\n#include <errno.h>\n#include <unistd.h>\nint main(){int s=socket(AF_INET,SOCK_STREAM,0);struct timeval t={2,0};setsockopt(s,SOL_SOCKET,SO_SNDTIMEO,&t,sizeof(t));struct sockaddr_in a={0};a.sin_family=AF_INET;a.sin_port=htons(80);inet_pton(AF_INET,"1.1.1.1",&a.sin_addr);if(connect(s,(struct sockaddr*)&a,sizeof(a))==0)puts("NETWORK_CONNECTED");else printf("NETWORK_BLOCKED:%d\\n",errno);close(s);}')]

if mode=='network':programs=network_programs

def call(url,body=None):
 import subprocess
 args=['curl','-sS','--max-time','15',provider+url,'-w','\n%{http_code}']
 if body is not None:args+=['-X','POST','-H','Content-Type: application/json','--data',json.dumps(body)]
 completed=subprocess.run(args,capture_output=True,text=True)
 if completed.returncode:raise RuntimeError('curl transfer failed')
 content,status=completed.stdout.rsplit('\n',1)
 if not status.startswith('2'):raise RuntimeError('HTTP '+status)
 return json.loads(content)
def run(item):
 key,lang,source=item
 try:
  body={'language_id':lang,'source_code':source,'stdin':'','cpu_time_limit':5,'wall_time_limit':10,'memory_limit':131072,'max_file_size':1024,'max_processes_and_or_threads':128,'enable_per_process_and_thread_time_limit':False,'enable_per_process_and_thread_memory_limit':False,'enable_network':False}
  data=call('/submissions?base64_encoded=false&wait=false',body);token=data['token']
  for _ in range(25):
   time.sleep(1);data=call('/submissions/'+token+'?base64_encoded=false')
   if data.get('status',{}).get('id',0)>2:break
  return {'language':key,'status':data.get('status'),'stdout':data.get('stdout'),'stderr':data.get('stderr'),'compile_output':data.get('compile_output'),'memory':data.get('memory'),'pass':data.get('status',{}).get('id')==3 and ('PHASE23_HELLO' if mode=='hello' else 'NETWORK_BLOCKED') in (data.get('stdout')or'')}
 except Exception as e:return{'language':key,'pass':False,'notVerified':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex:
 results=list(ex.map(run,programs))
root=Path(__file__).resolve().parent.parent
p=root/'reports'/('phase23-provider-compatibility.json' if mode=='hello' else 'phase23-provider-network-probes.json')
p.write_text(json.dumps({'provider':provider,'mode':mode,'limits':{'processes':128,'memoryKb':131072},'results':results},indent=2));print(json.dumps(results,indent=2))
