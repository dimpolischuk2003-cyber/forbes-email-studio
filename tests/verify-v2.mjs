import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

// Exercise real handlers/auth/provider adapter/control CAS with an isolated fake provider.
// Separate handler bundles represent independent workers sharing the same Blob store.
process.env.STUDIO_EMAIL='marketer@example.com';
process.env.STUDIO_PASSWORD='test-password-long-enough';
process.env.STUDIO_SESSION_SECRET='test-session-secret-32-characters-minimum';
process.env.ESPUTNIK_API_KEY='test-provider-key';
process.env.BLOB_READ_WRITE_TOKEN='test-blob-token';
process.env.EMAIL_SENDER_EMAIL='news@example.com';
process.env.EMAIL_FOOTER_ADDRESS='Forbes, Kyiv';
process.env.EMAIL_UNSUBSCRIBE_URL='https://example.com/unsubscribe';
process.env.ESPUTNIK_SEND_ENABLED='true';
process.env.ESPUTNIK_TIMEZONE='Europe/Kyiv';
process.env.ESPUTNIK_TIMEZONE_CONFIRMED='true';
const jar=new Map();
globalThis.__studioCookies={get:name=>jar.has(name)?{value:jar.get(name)}:undefined,set:(name,value,options)=>{if(options?.maxAge===0)jar.delete(name);else jar.set(name,value);}};
let blob=null,etag=0,blobDown=false;
globalThis.__studioBlob={
 async get(_path,options){assert.equal(options.useCache,false);assert.equal(options.access,'private');if(blobDown)throw new Error('offline');if(blob===null)return null;const captured=blob;const capturedTag=String(etag);await Promise.resolve();return {statusCode:200,stream:new Response(captured).body,blob:{etag:capturedTag}};},
 async put(_path,body,options){assert.equal(options.access,'private');if(blobDown)throw new Error('offline');if(blob!==null&&(!options.allowOverwrite||options.ifMatch!==String(etag)))throw new Error('precondition failed');blob=body;etag++;return {};},
};
const plugins=[{name:'test-adapters',setup(b){b.onResolve({filter:/^(next\/headers|@vercel\/blob)$/},args=>({path:args.path,namespace:'studio-test'}));b.onLoad({filter:/.*/,namespace:'studio-test'},args=>({contents:args.path==='next/headers'?'export async function cookies(){return globalThis.__studioCookies;}':'export const get=(...a)=>globalThis.__studioBlob.get(...a);export const put=(...a)=>globalThis.__studioBlob.put(...a);',loader:'js'}));}}];
let bundleId=0;
// Project-local bundles resolve external packages through node_modules.
const {mkdir}=await import('node:fs/promises');
const localDir=join(process.cwd(),'.test-run');await mkdir(localDir,{recursive:true});
async function route(name){const outfile=join(localDir,'handler-'+bundleId+++'.mjs');await build({entryPoints:['app/api/'+name+'/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins,logLevel:'silent'});return import(pathToFileURL(outfile));}
const [login,studio,studio2,test,test2,review,launch,launch2,templates,remote,audiences,statistics,settings]=await Promise.all(['auth/login','studio','studio','test','test','review','launch','launch','templates','remote-templates','audiences','statistics','settings'].map(route));
const domain='https://studio.example.com';
async function call(handler,body,path='/api/action',origin=domain){const method=body===undefined?'GET':'POST';const request=new Request(domain+path,{method,headers:{origin,'content-type':'application/json','x-forwarded-for':'127.0.0.1'},body:body===undefined?undefined:JSON.stringify(body)});const r=await handler(request);return {status:r.status,data:await r.json()};}
const messages=new Map(),broadcasts=new Map(),groupRows=[{id:7,name:'Readers',contactsCount:10}];
let nextId=100,broadcastCalls=0,testCalls=0,importCalls=0,ambiguous=false,testAmbiguous=false;
globalThis.fetch=async function(url,options){assert.match(String(url),/^https:\/\/esputnik.com\/api\/v1\//);assert.equal(options.headers.Authorization,'Basic '+Buffer.from('forbes:test-provider-key').toString('base64'));const u=new URL(url),p=u.pathname.replace('/api/v1','');const body=options.body?JSON.parse(options.body):null;const response=(data,headers={})=>Response.json(data,{headers});
 if(p==='/messages/email'&&body){const id=String(nextId++);messages.set(id,{...body,id});return response({id:Number(id)});}
 if(p==='/messages/email'){const search=u.searchParams.get('search');return response([...messages.values()].filter(x=>!search||x.tags?.includes(search)||x.name.includes(search)).map(x=>({id:Number(x.id),name:x.name,subject:x.subject,template:x.template})),{TotalCount:String(messages.size)});}
 if(p.startsWith('/messages/email/')){const id=p.split('/').at(-1);if(!messages.has(id))return new Response('missing',{status:404});if(options.method==='PUT'){messages.set(id,{...body,id});return response({id:Number(id)});}return response(messages.get(id));}
 if(p==='/message/email'){testCalls++;assert.equal(body.emails.length,1);assert.equal(body.emails[0],'marketer@example.com');assert.ok(!body.htmlText.includes('forbes-studio-v2:'));if(testAmbiguous)throw new Error('timeout after provider acceptance');return response({results:[{status:'OK'}]});}
 if(p==='/broadcast'&&body){broadcastCalls++;assert.ok(!messages.get(String(body.messageId)).htmlText.includes('forbes-studio-v2:'));const id=String(broadcastCalls);broadcasts.set(id,body);if(ambiguous)throw new Error('timeout after provider acceptance');return response({id});}
 if(p.startsWith('/broadcast/'))return response({status:'FINISHED',statistics:{sent:10,delivered:9,uniqueOpened:5,uniqueClicked:2,unsubscribed:1,errors:1}});
 if(p==='/groups')return response(groupRows);
 if(p.startsWith('/group/'))return response([],{TotalCount:String(groupRows.find(g=>g.id===Number(p.split('/')[2]))?.contactsCount||0)});
 if(p==='/contacts'){importCalls++;const count=body.contacts.length;assert.ok(count<=3000);const id=20+importCalls;groupRows.push({id,name:body.groupNames[0],contactsCount:count});return response({asyncSessionId:'session-'+importCalls,failedContacts:[]});}
 if(p.startsWith('/importstatus/'))return response({status:'COMPLETED'});
 throw new Error('Unhandled provider route '+p);
};
try{
 assert.equal((await call(studio.GET,undefined)).status,401);
 assert.equal((await call(login.POST,{email:process.env.STUDIO_EMAIL,password:'wrong'})).status,401);
 assert.equal((await call(login.POST,{email:process.env.STUDIO_EMAIL,password:process.env.STUDIO_PASSWORD})).status,200);
 assert.ok(jar.has('forbes-studio-session'));
 assert.equal((await call(studio.POST,{},'/api/studio','https://evil.example')).status,403);
 const base={blocks:[{id:'heading',type:'heading',text:'Our news',html:'',url:'',alt:'',fontSize:36,align:'left'},{id:'body',type:'text',text:'Private draft body marker',html:'<p>Hello <strong>readers</strong><script>alert(1)</script></p>',url:'',alt:'',fontSize:16,align:'left'}],imported_html:'',template_source:'',name:'Campaign',design:'standard',scenario:'Анонс',brief:'',message:'',tone:'',subject:'News',subjects:[],preheader:'Read our news',headline:'',body:'',button_text:'',button_url:'',image_url:'',segment_id:7,utm_enabled:false,utm_source:'',utm_medium:'',utm_campaign:'',send_mode:'now',scheduled_at:'',timezone:'Europe/Kyiv'};
 const token=randomUUID();const created=await Promise.all([call(studio.POST,{data:base,token}),call(studio2.POST,{data:base,token})]);assert.equal(created.filter(r=>r.status===201).length,1);const id=created.find(r=>r.status===201).data.id;assert.equal(messages.size,1);assert.equal((await call(studio.POST,{data:base,token})).data.id,id);
 assert.equal((await call(studio.POST,{data:{...base,subject:'Different'},token})).status,409);
 const opened=await call(studio2.GET,undefined,'/api/studio?id='+id);assert.equal(opened.status,200);assert.equal(opened.data.data.blocks.length,2);assert.ok(!opened.data.data.blocks[1].html.includes('<script'));
 assert.ok(!blob.includes('Private draft body marker'));assert.ok(!blob.includes('<html'));assert.ok(!blob.includes(process.env.ESPUTNIK_API_KEY));assert.ok(!blob.includes(process.env.STUDIO_PASSWORD));
 const beforeTemplates=messages.size;const template=await call(templates.POST,{data:base,name:'Reusable',token:randomUUID()});assert.equal(template.status,201);assert.equal(messages.get(template.data.id).template,true);const original=structuredClone(messages.get(template.data.id));const chosen=await call(remote.POST,{id:template.data.id});assert.equal(chosen.status,200);assert.deepEqual(messages.get(template.data.id),original);assert.equal(messages.size,beforeTemplates+1);
 assert.equal((await call(review.POST,{id})).status,400);
 const tests=await Promise.all([call(test.POST,{id}),call(test2.POST,{id})]);assert.ok(tests.some(x=>x.status===200));assert.equal(testCalls,1);assert.equal((await call(test.POST,{id})).data.already,true);
 const approved=await call(review.POST,{id});assert.equal(approved.status,200);assert.equal(approved.data.segment.count,10);const launchResults=await Promise.all([call(launch.POST,{token:approved.data.token,confirmed:true}),call(launch2.POST,{token:approved.data.token,confirmed:true})]);assert.equal(launchResults.filter(x=>x.status===200).length,1);assert.equal(broadcastCalls,1);assert.equal((await call(launch.POST,{token:approved.data.token,confirmed:true})).status,409);assert.equal(broadcastCalls,1);assert.equal((await call(studio.POST,{id,revision:1,data:base})).status,409);
 assert.equal((await call(studio2.GET,undefined,'/api/studio?id='+id)).data.status,'queued');const stats=await call(statistics.POST,{id});assert.equal(stats.data.stats.metrics.uniqueClicked,2);
 const draft=await call(studio.POST,{data:base,token:randomUUID()});const id2=draft.data.id;await call(test.POST,{id:id2});const oldReview=await call(review.POST,{id:id2});const changed=await call(studio.POST,{id:id2,revision:1,data:{...base,subject:'Edited'}});assert.equal(changed.status,200);assert.equal(changed.data.revision,2);assert.equal((await call(launch.POST,{token:oldReview.data.token,confirmed:true})).status,409);assert.equal((await call(studio.POST,{id:id2,revision:1,data:base})).status,409);
 messages.get(id2).htmlText=messages.get(id2).htmlText.replace('Hello','External change');const external=await call(studio.GET,undefined,'/api/studio?id='+id2);assert.equal(external.data.revision,3);assert.ok(external.data.data.imported_html.includes('External change'));assert.equal((await call(review.POST,{id:id2})).status,400);
 const unknown=await call(studio.POST,{data:base,token:randomUUID()});await call(test.POST,{id:unknown.data.id});const unknownReview=await call(review.POST,{id:unknown.data.id});ambiguous=true;assert.equal((await call(launch.POST,{token:unknownReview.data.token,confirmed:true})).status,502);ambiguous=false;const afterTimeout=broadcastCalls;assert.equal((await call(launch2.POST,{token:unknownReview.data.token,confirmed:true})).status,409);assert.equal(broadcastCalls,afterTimeout);assert.equal((await call(studio.GET,undefined,'/api/studio?id='+unknown.data.id)).data.status,'unknown');
 const testUnknown=await call(studio.POST,{data:base,token:randomUUID()});testAmbiguous=true;assert.equal((await call(test.POST,{id:testUnknown.data.id})).status,502);testAmbiguous=false;const afterTestTimeout=testCalls;assert.equal((await call(test2.POST,{id:testUnknown.data.id})).status,409);assert.equal(testCalls,afterTestTimeout);
 const importToken=randomUUID();const imported=await call(audiences.POST,{name:'New list',emails:['one@example.com','ONE@example.com','two@example.com'],token:importToken});assert.equal(imported.status,200);assert.equal(imported.data.count,2);await call(audiences.POST,{name:'New list',emails:['one@example.com','two@example.com'],token:importToken});assert.equal(importCalls,1);assert.ok(!blob.includes('one@example.com'));const importGroup=groupRows.find(x=>x.name===imported.data.groupName);const blocked=await call(studio.POST,{data:{...base,segment_id:importGroup.id},token:randomUUID()});await call(test.POST,{id:blocked.data.id});assert.equal((await call(review.POST,{id:blocked.data.id})).status,409);const ready=await call(audiences.GET,undefined,'/api/audiences?id='+importToken);assert.equal(ready.data.status,'ready');assert.equal((await call(review.POST,{id:blocked.data.id})).status,200);
 const scheduled=await call(studio.POST,{data:{...base,send_mode:'schedule',scheduled_at:'2099-01-10T12:30'},token:randomUUID()});await call(test.POST,{id:scheduled.data.id});const scheduleReview=await call(review.POST,{id:scheduled.data.id});assert.equal(scheduleReview.status,200);const scheduleLaunch=await call(launch.POST,{token:scheduleReview.data.token,confirmed:true});assert.equal(scheduleLaunch.data.status,'scheduled');assert.equal(broadcasts.get(scheduleLaunch.data.broadcastId).startDate,'2099-01-10T12:30');
 process.env.ESPUTNIK_SEND_ENABLED='false';assert.equal((await call(review.POST,{id:blocked.data.id})).status,400);process.env.ESPUTNIK_SEND_ENABLED='true';
 blobDown=true;const countBefore=messages.size;assert.equal((await call(studio.POST,{data:base,token:randomUUID()})).status,503);assert.equal(messages.size,countBefore);blobDown=false;
 assert.equal((await call(settings.POST,{apiKey:'secret',config:{}})).status,400);assert.ok(!JSON.stringify((await call(studio.GET,undefined)).data).includes(process.env.ESPUTNIK_API_KEY));
 process.env.ESPUTNIK_API_KEY='rotated-key';assert.equal((await call(studio.GET,undefined)).status,503);process.env.ESPUTNIK_API_KEY='test-provider-key';
 process.env.STUDIO_PASSWORD='rotated-password-long-enough';assert.equal((await call(studio.GET,undefined)).status,401);
 console.log('PASS: auth, CSRF, eSputnik draft persistence, templates, concurrent CAS claims, stale edits, test/review/launch, ambiguous outcomes, imports, schedules, stats, credential rotation, secret redaction.');
}finally{await rm(localDir,{recursive:true,force:true});}
