'use strict';
// Test-only: never infer production or silently connect to another running demo.
function emulatorPort(name){
 if(process.env.GCLOUD_PROJECT!=='demo-technominds')throw Error('Disposable demo project required.');
 const match=String(process.env[name]||'').match(/^127\.0\.0\.1:(\d+)$/),port=Number(match?.[1]);
 if(!match||!Number.isInteger(port)||port<1024||port>65535)throw Error('Explicit loopback emulator required: '+name);
 return port;
}
module.exports={emulatorPort};
