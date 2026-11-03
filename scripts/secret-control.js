'use strict';
const fs=require('node:fs'),path=require('node:path');
// Scan only deployable/public files. Firebase web API keys are identifiers,
// not service-account credentials; do not confuse them with server secrets.
function scanPublicSecrets(root,entries=null){
 const findings=[];
 function visit(relative){
  const absolute=path.resolve(root,relative),name=path.basename(relative);
  if(!fs.existsSync(absolute))return;
  const stat=fs.lstatSync(absolute);
  const flag=kind=>findings.push({path:relative.replaceAll('\\','/'),kind});
  if(stat.isSymbolicLink()){flag('symlink-not-allowed');return;}
  if(/^(?:\.env(?:\..*)?|\.git|\.npmrc|\.pypirc|credentials(?:\..*)?|service[-_]?account.*\.json|.*\.(?:pem|p12|pfx|key))$/i.test(name)){flag('credential-file');return;}
  if(stat.isDirectory()){for(const child of fs.readdirSync(absolute))visit(path.join(relative,child));return;}
  if(!/\.(?:js|json|html|css|txt|md|yml|yaml|xml|map)$/i.test(name))return;
  const source=fs.readFileSync(absolute,'utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(source))flag('private-key');
  if(/"type"\s*:\s*"service_account"/.test(source)&&/"private_key"\s*:/.test(source))flag('service-account');
  if(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/.test(source))flag('provider-credential');
  if(/(?:JUDGE0_API_KEY|OPENAI_API_KEY|STRIPE_SECRET_KEY|CLIENT_SECRET|PRIVATE_KEY)\s*["']?\s*[:=]\s*["'][^"'\r\n]{12,}["']/i.test(source))flag('embedded-server-secret');
 }
 for(const entry of entries||fs.existsSync(root)&&fs.readdirSync(root)||[])visit(entry);
 return findings;
}
function assertPublicSecrets(root,entries){
 const findings=scanPublicSecrets(root,entries);
 if(findings.length)throw Error('Public asset secret control failed: '+findings.map(row=>`${row.path} (${row.kind})`).join('; '));
}
module.exports={scanPublicSecrets,assertPublicSecrets};
