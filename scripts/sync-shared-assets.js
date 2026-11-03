'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
fs.copyFileSync(path.join(root,'functions/lib/portal-results.js'),path.join(root,'assets/portal-results.js'));

fs.copyFileSync(path.join(root,'functions/lib/account-domain.js'),path.join(root,'assets/account-domain.js'));
