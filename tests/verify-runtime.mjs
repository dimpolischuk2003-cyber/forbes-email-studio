import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const port=33000+Math.floor(Math.random()*10000),origin=`http://localhost:${port}`;
const env={...process.env,NODE_ENV:'production',STUDIO_EMAIL:'runtime@example.com',STUDIO_PASSWORD:'runtime-test-password-long-enough',STUDIO_SESSION_SECRET:'runtime-test-session-secret-32-characters',STUDIO_USERS_JSON:'',ESPUTNIK_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:'',VERCEL_OIDC_TOKEN:'',EMAIL_SENDER_EMAIL:'news@example.com'};
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-5000);});
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Production server did not become ready: '+output);
 assert.equal((await fetch(origin+'/api/studio')).status,401);
 assert.equal((await fetch(origin+'/api/diagnostics',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(origin+'/api/recover',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"id":"123"}'})).status,401);
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:env.STUDIO_EMAIL,password:env.STUDIO_PASSWORD})});assert.equal(login.status,200,await login.text());
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(cookie);
 const html=await fetch(origin+'/',{headers:{cookie}});assert.equal(html.status,200);assert.ok((await html.text()).includes('Email Studio'));
 const studio=await fetch(origin+'/api/studio',{headers:{cookie}});assert.equal(studio.status,200);assert.equal(studio.headers.get('x-studio-version'),'0.2.1');const state=await studio.json();assert.equal(state.connections.esputnik,false);assert.deepEqual(state.campaigns,[]);assert.ok(!JSON.stringify(state).includes(env.STUDIO_PASSWORD));
 const csrf=await fetch(origin+'/api/diagnostics',{method:'POST',headers:{cookie,origin:'https://other.invalid','content-type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
 const response=await fetch(origin+'/api/diagnostics',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{}'});assert.equal(response.status,200);const report=await response.json();assert.equal(report.build.version,'0.2.1');assert.equal(report.ok,false);assert.equal(report.checks.length,5);assert.ok(report.checks.some(check=>check.detail.includes('BLOB_NOT_CONFIGURED')));assert.ok(!JSON.stringify(report).includes(env.STUDIO_SESSION_SECRET));
 console.log('PASS: production HTTP login, protected studio/diagnostics/recovery, CSRF, version headers, authenticated rendering, actionable missing-configuration diagnostics, secret redaction.');
}finally{child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},3000)).then(()=>{})]);}
