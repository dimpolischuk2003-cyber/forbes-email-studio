import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const storageMode=process.argv.includes('--storage');
const port=33000+Math.floor(Math.random()*10000),origin=`http://localhost:${port}`;
const env={...process.env,NODE_ENV:'production',STUDIO_EMAIL:'runtime@example.com',STUDIO_PASSWORD:'runtime-test-password-long-enough',STUDIO_SESSION_SECRET:'runtime-test-session-secret-32-characters',STUDIO_USERS_JSON:'',ESPUTNIK_API_KEY:'',BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:'',VERCEL_OIDC_TOKEN:'',EMAIL_SENDER_EMAIL:'news@example.com'};
if(storageMode){Object.assign(env,{ESPUTNIK_API_KEY:'runtime-fake-provider-key',BLOB_STORE_ID:'store_sdk',VERCEL_BLOB_API_URL:'https://blob-api.test.invalid',VERCEL_BLOB_RETRIES:'1',VERCEL_OIDC_TOKEN:['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'runtime'].join('.')});}
const child=spawn(process.execPath,[...(storageMode?['--require','./tests/runtime-storage.cjs']:[]),'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env,stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{output=(output+data.toString()).slice(-5000);});
try{
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(origin+'/login')).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Production server did not become ready: '+output);
 assert.equal((await fetch(origin+'/api/studio')).status,401);
 assert.equal((await fetch(origin+'/api/diagnostics',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(origin+'/api/recover',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"id":"123"}'})).status,401);
 const login=await fetch(origin+'/api/auth/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email:env.STUDIO_EMAIL,password:env.STUDIO_PASSWORD})});assert.equal(login.status,200,await login.text());
 const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');assert.ok(cookie);
 const html=await fetch(origin+'/',{headers:{cookie}});assert.equal(html.status,200);assert.ok((await html.text()).includes('Email Studio'));
 const studio=await fetch(origin+'/api/studio',{headers:{cookie}});assert.equal(studio.status,200,studio.status!==200?(await studio.clone().text())+' '+output:'');assert.equal(studio.headers.get('x-studio-version'),'0.2.3');const state=await studio.json();assert.equal(state.connections.esputnik,storageMode);assert.deepEqual(state.campaigns,[]);assert.ok(!JSON.stringify(state).includes(env.STUDIO_PASSWORD));
 const csrf=await fetch(origin+'/api/diagnostics',{method:'POST',headers:{cookie,origin:'https://other.invalid','content-type':'application/json'},body:'{}'});assert.equal(csrf.status,403);
 const response=await fetch(origin+'/api/diagnostics',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{}'});assert.equal(response.status,200);const report=await response.json();assert.equal(report.build.version,'0.2.3');assert.equal(report.ok,storageMode,JSON.stringify(report));assert.equal(report.checks.length,5);if(!storageMode)assert.ok(report.checks.some(check=>check.detail.includes('BLOB_NOT_CONFIGURED')));else{assert.ok(report.checks.every(check=>check.ok),JSON.stringify(report));assert.ok(report.checks.find(check=>check.name==='Історія кампаній').detail.includes('відрізняються'));const again=await fetch(origin+'/api/diagnostics',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{}'});assert.equal((await again.json()).ok,true);}assert.ok(!JSON.stringify(report).includes(env.STUDIO_SESSION_SECRET));
 if(storageMode){
  const campaign={blocks:[{id:'body',type:'text',text:'Runtime draft body',html:'',url:'',alt:'',fontSize:16,align:'left'}],imported_html:'',template_source:'',name:'Runtime saved draft',design:'standard',scenario:'Анонс',brief:'',message:'',tone:'',subject:'Runtime save',subjects:[],preheader:'',headline:'',body:'',button_text:'',button_url:'',image_url:'',segment_id:null,utm_enabled:false,utm_source:'',utm_medium:'',utm_campaign:'',send_mode:'now',scheduled_at:'',timezone:'Europe/Kyiv'};
  const headers={cookie,origin,'content-type':'application/json'},token=randomUUID();
  async function post(body){return fetch(origin+'/api/studio',{method:'POST',headers,body:JSON.stringify(body)});}
  const created=await post({data:campaign,token});assert.equal(created.status,201,created.status!==201?(await created.clone().text())+' '+output:'');const saved=await created.json();
  const duplicate=await post({data:campaign,token});assert.equal(duplicate.status,201);assert.equal((await duplicate.json()).id,saved.id);
  const opened=await fetch(origin+'/api/studio?id='+saved.id,{headers:{cookie}});assert.equal(opened.status,200);assert.equal((await opened.json()).data.subject,'Runtime save');
  const changed=await post({id:saved.id,revision:1,data:{...campaign,subject:'Runtime edited'}});assert.equal(changed.status,200,changed.status!==200?await changed.clone().text():'');assert.equal((await changed.json()).revision,2);
  const latest=await fetch(origin+'/api/studio?id='+saved.id,{headers:{cookie}});assert.equal((await latest.json()).data.subject,'Runtime edited');
  const after=await (await fetch(origin+'/api/studio',{headers:{cookie}})).json();assert.equal(after.campaigns.length,1);assert.ok(after.operations.some(op=>op.id==='legacy-preserved'));
 }
 console.log((storageMode?'REAL NEXT BUILD + SIMULATED STORAGE ':'')+'PASS: production HTTP login, protected studio/diagnostics/recovery, CSRF, version headers, authenticated rendering, diagnostics, legacy delivery/object ETag variants, draft create/reopen/update with original history preserved, idempotency and secret redaction.');
}finally{child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},3000)).then(()=>{})]);}
