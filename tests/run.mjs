import {spawnSync} from 'node:child_process';
for(const file of ['tests/verify-v2.mjs','tests/verify-storage-sdk.mjs']){const result=spawnSync(process.execPath,[file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
