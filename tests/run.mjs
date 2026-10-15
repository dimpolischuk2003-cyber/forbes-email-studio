import {spawnSync} from 'node:child_process';
for(const args of [['tests/verify-v2.mjs'],['tests/verify-storage-sdk.mjs'],['tests/verify-storage-sdk.mjs','--minified']]){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
