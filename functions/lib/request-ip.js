'use strict';
const {isIP}=require('node:net');

// Default: never infer a trusted proxy from a client-supplied header. Configure
// TM_TRUSTED_PROXY_HOPS only after checking the deployed ingress topology.
function requestIp(request,env=process.env){
  const raw=request.rawRequest||request,peer=String(raw.socket?.remoteAddress||'');
  const hops=Number(env.TM_TRUSTED_PROXY_HOPS||0);
  if(Number.isInteger(hops)&&hops>=1&&hops<=5){
    const header=raw.headers?.['x-forwarded-for'];
    const chain=typeof header==='string'?header.split(',').map(s=>s.trim()):[];
    const address=chain[chain.length-hops];
    if(isIP(address||''))return address;
  }
  return isIP(peer)?peer:'unknown';
}
module.exports={requestIp};
