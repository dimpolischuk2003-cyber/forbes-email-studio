import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {get as sdkBlobGet,BlobPreconditionFailedError,BlobAccessError,BlobNotFoundError} from '@vercel/blob';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';

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
let blob=null,etag=0,blobDown=false,loseAcknowledgement=false,failFinalize=false,missingEtag=false;
const probes=new Map();
globalThis.__studioBlob={
 async head(path){if(blobDown)throw new Error('offline');const item=path.includes('/diagnostics/')?probes.get(path):(blob===null?null:{body:blob,etag:String(etag)});if(!item)throw new BlobNotFoundError();return {etag:item.etag,size:Buffer.byteLength(item.body)};},
 async get(path,options){assert.equal(options.useCache,false);assert.equal(options.access,'private');if(blobDown)throw new Error('offline');if(path.includes('/diagnostics/')){const item=probes.get(path);return item?{statusCode:200,stream:new Response(item.body).body,blob:{etag:item.etag}}:null;}if(blob===null)return null;const captured=blob;const capturedTag=missingEtag?'':String(etag);await Promise.resolve();return {statusCode:200,stream:new Response(captured).body,blob:{etag:capturedTag}};},
 async put(path,body,options){assert.equal(options.access,'private');if(blobDown)throw new Error('offline');if(path.includes('/diagnostics/')){const previous=probes.get(path);if(previous&&(!options.allowOverwrite||options.ifMatch!==previous.etag))throw new BlobPreconditionFailedError();const tag=String((previous?.revision||0)+1);probes.set(path,{body,etag:tag,revision:Number(tag)});return {etag:tag};}if(blob!==null&&(!options.allowOverwrite||options.ifMatch!==String(etag)))throw new BlobPreconditionFailedError();if(failFinalize&&Object.keys(JSON.parse(body).records).length>Object.keys(JSON.parse(blob).records).length){failFinalize=false;throw new BlobAccessError();}blob=body;etag++;if(loseAcknowledgement){loseAcknowledgement=false;throw new Error('response lost after commit');}return {etag:String(etag)};},
 async del(path){probes.delete(path);},
};
const plugins=[{name:'test-adapters',setup(b){b.onResolve({filter:/^(next\/headers|@vercel\/blob)$/},args=>args.namespace==='studio-test'?{path:args.path,external:true}:{path:args.path,namespace:'studio-test'});b.onLoad({filter:/.*/,namespace:'studio-test'},args=>({contents:args.path==='next/headers'?'export async function cookies(){return globalThis.__studioCookies;}':"export {BlobNotFoundError,BlobError,BlobAccessError,BlobStoreNotFoundError,BlobStoreSuspendedError,BlobServiceRateLimited,BlobPreconditionFailedError,BlobContentTypeNotAllowedError,BlobRequestAbortedError,BlobServiceNotAvailable} from '@vercel/blob';export const head=(...a)=>globalThis.__studioBlob.head(...a);export const get=(...a)=>globalThis.__studioBlob.get(...a);export const put=(...a)=>globalThis.__studioBlob.put(...a);export const del=(...a)=>globalThis.__studioBlob.del(...a);",loader:'js'}));}}];
let bundleId=0;
// Project-local bundles resolve external packages through node_modules.
const {mkdir}=await import('node:fs/promises');
const localDir=join(process.cwd(),'.test-run');await mkdir(localDir,{recursive:true});
async function route(name){const outfile=join(localDir,'handler-'+bundleId+++'.mjs');await build({entryPoints:['app/api/'+name+'/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins,logLevel:'silent'});return import(pathToFileURL(outfile));}
const [login,studio,studio2,test,test2,review,launch,launch2,templates,remote,audiences,statistics,settings,segments,diagnostics,recover]=await Promise.all(['auth/login','studio','studio','test','test','review','launch','launch','templates','remote-templates','audiences','statistics','settings','segments','diagnostics','recover'].map(route));
const draftDiagnostics=await route('draft-diagnostics');
const domain='https://studio.example.com';
async function call(handler,body,path='/api/action',origin=domain){const method=body===undefined?'GET':'POST';const request=new Request(domain+path,{method,headers:{origin,'content-type':'application/json','x-forwarded-for':'127.0.0.1'},body:body===undefined?undefined:JSON.stringify(body)});const r=await handler(request);return {status:r.status,data:await r.json()};}
const messages=new Map(),broadcasts=new Map(),groupRows=[{id:7,name:'Readers',contactsCount:10}];
let nextId=100,broadcastCalls=0,testCalls=0,importCalls=0,ambiguous=false,testAmbiguous=false,denyGroups=false,listShape='array',createTimeout=false,providerWrites=0,normalizeHtmlReads=false,lastTestHtml='';
globalThis.fetch=async function(url,options){assert.match(String(url),/^https:\/\/esputnik.com\/api\/v1\//);assert.equal(options.headers.Authorization,'Basic '+Buffer.from('forbes:test-provider-key').toString('base64'));if(['POST','PUT'].includes(options.method))providerWrites++;const u=new URL(url),p=u.pathname.replace('/api/v1','');const body=options.body?JSON.parse(options.body):null;const response=(data,headers={})=>Response.json(data,{headers});
 if(p==='/messages/email'&&body){const id=String(nextId++);messages.set(id,{...body,id});if(createTimeout)throw new Error('timeout after draft creation');return response({id:Number(id)});}
 if(p==='/messages/email'){const search=u.searchParams.get('search');if(listShape==='null')return response(null);if(listShape==='empty')return new Response(null,{status:204});if(listShape==='unexpected')return response({unexpected:'Private provider diagnostic'});if(listShape==='forbidden')return new Response('Forbidden',{status:403});const rows=[...messages.values()].filter(x=>!search||x.tags?.includes(search)||x.name.includes(search)).map(x=>({id:Number(x.id),name:x.name,subject:x.subject,template:x.template}));return response(listShape==='single'?(rows.length?{id:rows[0].id}:null):listShape==='wrapped'?{messages:rows}:rows,{TotalCount:String(rows.length)});}
 if(p.startsWith('/messages/email/')){const id=p.split('/').at(-1);if(!messages.has(id))return new Response('missing',{status:404});if(options.method==='PUT'){messages.set(id,{...body,id});if(createTimeout)throw new Error('timeout after draft creation');return response({id:Number(id)});}const message=messages.get(id);return response(normalizeHtmlReads?{...message,htmlText:'\n'+message.htmlText}:message);}
 if(p==='/message/email'){lastTestHtml=body.htmlText;testCalls++;assert.equal(body.emails.length,1);assert.equal(body.emails[0],'marketer@example.com');assert.ok(!body.htmlText.includes('forbes-studio-v2:'));if(testAmbiguous)throw new Error('timeout after provider acceptance');return response({results:[{status:'OK'}]});}
 if(p==='/broadcast'&&body){broadcastCalls++;assert.ok(!messages.get(String(body.messageId)).htmlText.includes('forbes-studio-v2:'));const id=String(broadcastCalls);broadcasts.set(id,body);if(ambiguous)throw new Error('timeout after provider acceptance');return response({id});}
 if(p.startsWith('/broadcast/'))return response({status:'FINISHED',statistics:{sent:10,delivered:9,uniqueOpened:5,uniqueClicked:2,unsubscribed:1,errors:1}});
 if(p==='/groups')return denyGroups?new Response('Forbidden',{status:403}):response(groupRows);
 if(p.startsWith('/group/'))return response([],{TotalCount:String(groupRows.find(g=>g.id===Number(p.split('/')[2]))?.contactsCount||0)});
 if(p==='/contacts'){importCalls++;const count=body.contacts.length;assert.ok(count<=3000);const id=20+importCalls;groupRows.push({id,name:body.groupNames[0],contactsCount:count});return response({asyncSessionId:'session-'+importCalls,failedContacts:[]});}
 if(p.startsWith('/importstatus/'))return response({status:'COMPLETED'});
 throw new Error('Unhandled provider route '+p);
};
try{
 assert.equal((await call(studio.GET,undefined)).status,401);
 assert.equal((await call(draftDiagnostics.GET,undefined,'/api/draft-diagnostics?id=100')).status,401);
 assert.equal((await call(login.POST,{email:process.env.STUDIO_EMAIL,password:'wrong'})).status,401);
 assert.equal((await call(login.POST,{email:process.env.STUDIO_EMAIL,password:process.env.STUDIO_PASSWORD})).status,200);
 assert.ok(jar.has('forbes-studio-session'));
 assert.equal((await call(studio.POST,{},'/api/studio','https://evil.example')).status,403);
 const base={blocks:[{id:'heading',type:'heading',text:'Our news',html:'',url:'',alt:'',fontSize:36,align:'left'},{id:'body',type:'text',text:'Private draft body marker',html:'<p>Hello <strong>readers</strong><script>alert(1)</script></p>',url:'',alt:'',fontSize:16,align:'left'}],imported_html:'',template_source:'',name:'Campaign',design:'standard',scenario:'Анонс',brief:'',message:'',tone:'',subject:'News',subjects:[],preheader:'Read our news',headline:'',body:'',button_text:'',button_url:'',image_url:'',segment_id:7,utm_enabled:false,utm_source:'',utm_medium:'',utm_campaign:'',send_mode:'now',scheduled_at:'',timezone:'Europe/Kyiv'};
 const token=randomUUID();const created=await Promise.all([call(studio.POST,{data:base,token}),call(studio2.POST,{data:base,token})]);assert.equal(created.filter(r=>r.status===201).length,1);const id=created.find(r=>r.status===201).data.id;assert.equal(messages.size,1);assert.equal((await call(studio.POST,{data:base,token})).data.id,id);
 assert.equal((await call(studio.POST,{data:{...base,subject:'Different'},token})).status,409);
 const opened=await call(studio2.GET,undefined,'/api/studio?id='+id);assert.equal(opened.status,200);assert.equal(opened.data.data.blocks.length,2);assert.ok(!opened.data.data.blocks[1].html.includes('<script'));
 assert.ok(!blob.includes('Private draft body marker'));assert.ok(!blob.includes('<html'));assert.ok(!blob.includes(process.env.ESPUTNIK_API_KEY));assert.ok(!blob.includes(process.env.STUDIO_PASSWORD));
 // A successful draft save remains visible when the subsequent search has no
 // usable list. Direct reads still verify the actual stored letter.
 const beforeCatalogRefresh=messages.size;
 for(const shape of ['null','empty','unexpected']){
  listShape=shape;const refreshed=await call(studio.GET,undefined);assert.equal(refreshed.status,200);
  const saved=refreshed.data.campaigns.find(row=>row.id===id);assert.equal(saved.status,'draft');assert.equal(saved.name,base.name);
  assert.ok(!JSON.stringify(refreshed.data).includes('Private provider diagnostic'));
  assert.equal((await call(studio2.GET,undefined,'/api/studio?id='+id)).status,200);
  assert.equal((await call(studio.POST,{data:base,token})).data.id,id);
 }
 assert.equal(messages.size,beforeCatalogRefresh);
 for(const shape of ['null','empty']){listShape=shape;const empty=await call(remote.GET,undefined,'/api/remote-templates?search=absent');assert.equal(empty.status,200);assert.deepEqual(empty.data.templates,[]);assert.equal(empty.data.more,false);}
 listShape='unexpected';assert.equal((await call(remote.GET,undefined)).status,502);
 listShape='forbidden';assert.equal((await call(studio.GET,undefined)).status,502);
 listShape='wrapped';const wrapped=await call(studio.GET,undefined);assert.equal(wrapped.status,200);assert.ok(wrapped.data.campaigns.some(row=>row.id===id));listShape='array';
 // A Blob upload can commit and then lose its acknowledgement. It must not
 // reapply the logical claim, fail the save, or create another provider letter.
 loseAcknowledgement=true;const accepted=await call(studio.POST,{data:base,token:randomUUID()});assert.equal(accepted.status,201);
 // A timed-out provider CREATE is searchable and recoverable without another POST.
 const uncertainToken=randomUUID(),beforeUncertain=messages.size;createTimeout=true;
 const uncertain=await call(studio.POST,{data:base,token:uncertainToken});createTimeout=false;
 assert.equal(uncertain.status,502);assert.equal(uncertain.data.creation.token,uncertainToken);assert.equal(messages.size,beforeUncertain+1);
 assert.equal((await call(studio.POST,{data:base,token:uncertainToken})).status,409);assert.equal(messages.size,beforeUncertain+1);
 const uncertainState=await call(studio.GET,undefined);assert.ok(uncertainState.data.pendingCreates.some(item=>item.token===uncertainToken));assert.ok(uncertainState.data.operations.some(item=>item.kind==='draft_create'&&item.status==='unknown'));
 assert.equal((await call(recover.POST,{token:uncertainToken},'/api/recover','https://evil.example')).status,403);
 listShape='unexpected';assert.equal((await call(recover.POST,{token:uncertainToken})).status,502);listShape='wrapped';
 const uncertainId=String(nextId-1),untampered=structuredClone(messages.get(uncertainId));messages.get(uncertainId).htmlText=messages.get(uncertainId).htmlText.replace('Hello','Changed');
 const changedCandidate=await call(recover.POST,{token:uncertainToken});assert.equal(changedCandidate.status,200);assert.equal(changedCandidate.data.needsReview,true);assert.equal((await call(studio.GET,undefined,'/api/studio?id='+uncertainId)).data.status,'unknown');messages.set(uncertainId,untampered);
 const duplicateId=String(nextId++);messages.set(duplicateId,{...untampered,id:duplicateId});
 assert.equal((await call(recover.POST,{token:uncertainToken})).status,409);messages.delete(duplicateId);
 const found=await call(recover.POST,{token:uncertainToken});assert.equal(found.status,200);assert.equal(found.data.id,uncertainId);assert.equal(messages.size,beforeUncertain+1);
 assert.equal((await call(recover.POST,{token:uncertainToken})).status,200);assert.equal(messages.size,beforeUncertain+1);listShape='array';
 assert.ok(!(await call(studio.GET,undefined)).data.pendingCreates.some(item=>item.token===uncertainToken));
 createTimeout=true;const uncertainTemplateToken=randomUUID();const uncertainTemplate=await call(templates.POST,{data:base,name:'Timed out template',token:uncertainTemplateToken});createTimeout=false;
 assert.equal(uncertainTemplate.status,502);assert.equal(uncertainTemplate.data.creation.template,true);assert.equal((await call(recover.POST,{token:uncertainTemplateToken})).status,404);
 assert.equal((await call(recover.POST,{token:uncertainTemplateToken,template:true})).status,200);
 // The provider may create a letter before final status persistence fails.
 // It must remain readable and recover only its own unfinished CREATE.
 failFinalize=true;const recoveryToken=randomUUID();const beforePartial=messages.size;
 const partial=await call(studio.POST,{data:base,token:recoveryToken});assert.equal(partial.status,503);assert.match(partial.data.error,/BLOB_ACCESS_DENIED/);
 assert.equal(messages.size,beforePartial+1);const orphanId=String(nextId-1);assert.equal(partial.data.draft.id,orphanId);
 const orphan=await call(studio.GET,undefined,'/api/studio?id='+orphanId);assert.equal(orphan.status,200);assert.equal(orphan.data.status,'unknown');assert.equal(orphan.data.recoverable,true);
 assert.equal((await call(review.POST,{id:orphanId})).status,409);
 assert.equal((await call(studio.POST,{id:orphanId,revision:1,data:base})).status,409);
 assert.equal((await call(recover.POST,{id:orphanId},'/api/recover','https://evil.example')).status,403);
 const originalOrphan=structuredClone(messages.get(orphanId));messages.get(orphanId).htmlText=messages.get(orphanId).htmlText.replace('Hello','Tampered');
 assert.equal((await call(recover.POST,{id:orphanId})).status,409);messages.set(orphanId,originalOrphan);
 messages.set(orphanId,structuredClone(originalOrphan));
 // Recovery diagnostics explain each proof failure without changing any state.
 const diagnosticState=blob,diagnosticLetters=messages.size;
 const report=async()=>{const result=await call(draftDiagnostics.GET,undefined,'/api/draft-diagnostics?id='+orphanId);assert.equal(result.status,200);assert.equal(result.data.readOnly,true);assert.equal(blob,diagnosticState);assert.equal(messages.size,diagnosticLetters);const output=JSON.stringify(result.data);for(const secret of [process.env.ESPUTNIK_API_KEY,process.env.STUDIO_SESSION_SECRET,process.env.EMAIL_SENDER_EMAIL,'Private draft body marker','<html','forbes-studio-v2:','Private provider diagnostic'])assert.ok(!output.includes(secret));return result.data;};
 assert.equal((await report()).reason,'READY');
 messages.get(orphanId).css='body{color:red}';const cssReport=await report();assert.equal(cssReport.reason,'HTML_CHANGED');assert.equal(cssReport.checks.sourceHtmlMatches,true);assert.equal(cssReport.checks.combinedHtmlMatches,false);delete messages.get(orphanId).css;
 messages.get(orphanId).htmlText=originalOrphan.htmlText.replace('Hello','Changed');assert.equal((await report()).reason,'HTML_CHANGED');
 messages.get(orphanId).htmlText=originalOrphan.htmlText.replace(/<!--forbes-studio-v2:[\s\S]*?-->/g,'');assert.equal((await report()).reason,'EDITOR_MARKER_MISSING');
 messages.get(orphanId).htmlText=originalOrphan.htmlText.replace(/(<!--forbes-studio-v2:)[A-Za-z0-9_-]/,'$1!');assert.equal((await report()).reason,'EDITOR_MARKER_MISSING');
 messages.get(orphanId).htmlText=originalOrphan.htmlText.replace(/(<!--forbes-studio-v2:)[A-Za-z0-9_-]/,(_,prefix)=>prefix+(originalOrphan.htmlText.match(/<!--forbes-studio-v2:([A-Za-z0-9_-])/)[1]==='a'?'b':'a'));assert.equal((await report()).reason,'EDITOR_SIGNATURE_INVALID');
 messages.set(orphanId,structuredClone(originalOrphan));messages.get(orphanId).name='Changed name';assert.equal((await report()).reason,'NAME_CHANGED');messages.set(orphanId,structuredClone(originalOrphan));
 process.env.EMAIL_FOOTER_ADDRESS='Changed address';assert.equal((await report()).reason,'REQUEST_OR_SETTINGS_CHANGED');process.env.EMAIL_FOOTER_ADDRESS='Forbes, Kyiv';
 listShape='unexpected';const unsupportedReport=await report();assert.equal(unsupportedReport.search.supportedList,false);listShape='wrapped';assert.equal((await report()).search.includesDraftId,true);listShape='array';
 const beforeRecoveryBody=messages.get(orphanId).htmlText;
 assert.equal((await call(recover.POST,{id:orphanId})).status,200);assert.equal(messages.size,beforePartial+1);assert.equal(messages.get(orphanId).htmlText,beforeRecoveryBody);
 assert.equal((await call(studio.GET,undefined,'/api/studio?id='+orphanId)).data.status,'draft');
 assert.equal((await call(recover.POST,{id:orphanId})).status,409);
 assert.equal((await call(studio.POST,{data:base,token:recoveryToken})).data.id,orphanId);
 // Regression from live diagnostic: valid origin + changed HTML + {id} search.
 createTimeout=true;const changedToken=randomUUID();const changedCreate=await call(studio.POST,{data:base,token:changedToken});createTimeout=false;assert.equal(changedCreate.status,502);
 const changedId=String(nextId-1);messages.get(changedId).htmlText=messages.get(changedId).htmlText.replace('Hello','Provider version');
 const beforeAdoptWrites=providerWrites,beforeAdoptCount=messages.size;
 listShape='single';const exactReport=await call(draftDiagnostics.GET,undefined,'/api/draft-diagnostics?id='+changedId);assert.equal(exactReport.data.reason,'HTML_CHANGED');assert.equal(exactReport.data.checks.pendingRequestMatches,true);assert.equal(exactReport.data.checks.signatureValid,true);assert.equal(exactReport.data.search.supportedList,true);assert.equal(exactReport.data.search.includesDraftId,true);
 const candidate=await call(recover.POST,{token:changedToken});assert.equal(candidate.status,200);assert.equal(candidate.data.id,changedId);assert.equal(candidate.data.needsReview,true);
 const reviewed=await call(studio.GET,undefined,'/api/studio?id='+changedId);assert.equal(reviewed.data.status,'unknown');assert.equal(reviewed.data.recoverable,true);assert.equal(reviewed.data.recoveryReview.htmlChanged,true);assert.ok(reviewed.data.data.imported_html.includes('Provider version'));assert.equal(reviewed.data.data.blocks.length,0);
 const accept={id:changedId,acceptRemoteHtml:true,recoveryToken:reviewed.data.recoveryReview.token};
 assert.equal((await call(recover.POST,{id:changedId})).status,409);
 assert.equal((await call(recover.POST,{...accept,acceptRemoteHtml:false})).status,409);
 assert.equal((await call(recover.POST,{...accept,recoveryToken:accept.recoveryToken+'x'})).status,409);
 assert.equal((await call(recover.POST,accept,'/api/recover','https://evil.example')).status,403);
 const beforeExpiry=Date.now;Date.now=()=>beforeExpiry()+11*60*1000;try{assert.equal((await call(recover.POST,accept)).status,409);}finally{Date.now=beforeExpiry;}
 const reviewedBody=messages.get(changedId).htmlText;messages.get(changedId).htmlText=reviewedBody.replace('Provider version','Changed after preview');assert.equal((await call(recover.POST,accept)).status,409);messages.get(changedId).htmlText=reviewedBody;
 const reviewedTags=[...messages.get(changedId).tags];messages.get(changedId).tags=['forbes-email-studio-v2'];assert.equal((await call(recover.POST,accept)).status,409);messages.get(changedId).tags=reviewedTags;
 process.env.EMAIL_FOOTER_ADDRESS='Different settings';assert.equal((await call(recover.POST,accept)).status,409);process.env.EMAIL_FOOTER_ADDRESS='Forbes, Kyiv';
 assert.equal((await call(review.POST,{id:changedId})).status,409);
 assert.equal((await call(recover.POST,accept)).status,200);assert.equal(messages.get(changedId).htmlText,reviewedBody);assert.equal(providerWrites,beforeAdoptWrites);assert.equal(messages.size,beforeAdoptCount);
 const adopted=await call(studio.GET,undefined,'/api/studio?id='+changedId);assert.equal(adopted.data.status,'draft');assert.ok(adopted.data.data.imported_html.includes('Provider version'));assert.equal(adopted.data.data.segment_id,null);assert.equal(JSON.parse(blob).records[changedId].testedHash,null);assert.equal((await call(review.POST,{id:changedId})).status,400);assert.equal((await call(recover.POST,accept)).status,409);
 assert.equal((await call(recover.POST,{token:changedToken})).data.id,changedId);assert.equal(providerWrites,beforeAdoptWrites);listShape='array';
 // A singleton with a larger TotalCount is incomplete and cannot hide duplicates.
 createTimeout=true;const incompleteToken=randomUUID();await call(studio.POST,{data:base,token:incompleteToken});createTimeout=false;const incompleteId=String(nextId-1),extraId=String(nextId++);messages.set(extraId,{...structuredClone(messages.get(incompleteId)),id:extraId});listShape='single';const incomplete=await call(recover.POST,{token:incompleteToken});assert.equal(incomplete.status,409);assert.match(incomplete.data.error,/неповний/);listShape='array';messages.delete(extraId);
 missingEtag=true;const etagFailure=await call(studio.POST,{data:base,token:randomUUID()});assert.equal(etagFailure.status,503);assert.match(etagFailure.data.error,/BLOB_ETAG_MISSING/);missingEtag=false;
 const beforeDiagnostic=messages.size;const diagnostic=await call(diagnostics.POST,{});assert.equal(diagnostic.status,200);assert.equal(diagnostic.data.ok,true);assert.equal(diagnostic.data.build.version,'0.2.7');assert.equal(probes.size,0);assert.equal(messages.size,beforeDiagnostic);
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
 // Imported preheader must survive provider HTML normalization and real reopen.
 normalizeHtmlReads=true;
 const originalTemplate='<html><body><div class="esd-hidden-preheader" style="display:none">Old template preheader</div><a href="https://example.com/button">Button before</a><p>Imported body</p></body></html>';
 const importedDraft=await call(studio.POST,{data:{...base,blocks:[],imported_html:originalTemplate,preheader:'Перший прехедер & Forbes'},token:randomUUID()});assert.equal(importedDraft.status,201);const preheaderId=importedDraft.data.id;
 const reopenedFirst=await call(studio2.GET,undefined,'/api/studio?id='+preheaderId);assert.equal(reopenedFirst.data.data.preheader,'Перший прехедер & Forbes');assert.ok(reopenedFirst.data.data.imported_html.includes('Button before'));assert.ok(!reopenedFirst.data.data.imported_html.includes('Old template preheader'));
 const preheaderValue='Новий прехедер <журнал> & події';
 const updatedPreheader=await call(studio.POST,{id:preheaderId,revision:reopenedFirst.data.revision,data:{...reopenedFirst.data.data,subject:'Preheader regression',preheader:preheaderValue,imported_html:reopenedFirst.data.data.imported_html.replace('Button before','Button after')}});assert.equal(updatedPreheader.status,200);
 let actualPreheader=await call(studio2.GET,undefined,'/api/studio?id='+preheaderId);assert.equal(actualPreheader.data.data.preheader,preheaderValue);assert.equal(actualPreheader.data.data.subject,'Preheader regression');assert.ok(actualPreheader.data.data.imported_html.includes('Button after'));assert.equal((messages.get(preheaderId).htmlText.match(/id="forbes-studio-preheader"/g)||[]).length,1);assert.ok(messages.get(preheaderId).htmlText.includes('Новий прехедер &lt;журнал&gt; &amp; події'));
 assert.equal((await call(test.POST,{id:preheaderId})).status,200);assert.ok(lastTestHtml.includes('Новий прехедер &lt;журнал&gt; &amp; події'));assert.ok(lastTestHtml.includes('Button after'));assert.ok(!lastTestHtml.includes('Old template preheader'));assert.ok(!lastTestHtml.includes('forbes-studio-v2:'));
 // Actual provider preheader wins over old signed editor content after an edit.
 messages.get(preheaderId).htmlText=messages.get(preheaderId).htmlText.replace('Новий прехедер','Правка у eSputnik');actualPreheader=await call(studio2.GET,undefined,'/api/studio?id='+preheaderId);assert.equal(actualPreheader.data.data.preheader,'Правка у eSputnik <журнал> & події');assert.equal(JSON.parse(blob).records[preheaderId].testedHash,null);
 assert.equal((await call(studio.POST,{id:preheaderId,revision:actualPreheader.data.revision,data:{...actualPreheader.data.data,preheader:''}})).status,200);const emptyPreheader=await call(studio2.GET,undefined,'/api/studio?id='+preheaderId);assert.equal(emptyPreheader.data.data.preheader,'');assert.ok(!emptyPreheader.data.data.imported_html.includes('Правка у eSputnik'));assert.ok(emptyPreheader.data.data.imported_html.includes('Button after'));assert.ok(!blob.includes(preheaderValue));normalizeHtmlReads=false;
 // Connected OIDC stores work even when the token exists only in the request context.
 delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.VERCEL_OIDC_TOKEN;process.env.BLOB_STORE_ID='store_regression';
 const contextKey=Symbol.for('@vercel/request-context'),previousContext=globalThis[contextKey];
 const oidcToken=['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
 globalThis[contextKey]={get:()=>({headers:{'x-vercel-oidc-token':oidcToken}})};
 const dispatcher=getGlobalDispatcher(),mockAgent=new MockAgent();mockAgent.disableNetConnect();
 mockAgent.get('https://regression.private.blob.vercel-storage.com').intercept({path:'/regression.json?cache=0',method:'GET',headers:{authorization:'Bearer '+oidcToken}}).reply(404,'');
 setGlobalDispatcher(mockAgent);
 try{assert.equal(await sdkBlobGet('regression.json',{access:'private',useCache:false}),null);mockAgent.assertNoPendingInterceptors();}
 finally{setGlobalDispatcher(dispatcher);await mockAgent.close();if(previousContext===undefined)delete globalThis[contextKey];else globalThis[contextKey]=previousContext;}
 const oidcDraft=await call(studio.POST,{data:base,token:randomUUID()});assert.equal(oidcDraft.status,201);
 assert.equal((await call(studio.GET,undefined,'/api/studio?id='+oidcDraft.data.id)).status,200);
 delete process.env.BLOB_STORE_ID;const beforeMissingStore=messages.size;
 assert.equal((await call(studio.POST,{data:base,token:randomUUID()})).status,503);assert.equal(messages.size,beforeMissingStore);
 process.env.BLOB_READ_WRITE_TOKEN='test-blob-token';
 denyGroups=true;const denied=await call(segments.GET,undefined);assert.equal(denied.status,502);assert.match(denied.data.error,/баз отримувачів.*403/);assert.ok(!denied.data.error.includes(process.env.ESPUTNIK_API_KEY));denyGroups=false;
 process.env.ESPUTNIK_API_KEY='rotated-key';assert.equal((await call(studio.GET,undefined)).status,503);process.env.ESPUTNIK_API_KEY='test-provider-key';
 process.env.STUDIO_PASSWORD='rotated-password-long-enough';assert.equal((await call(studio.GET,undefined)).status,401);
 assert.equal((await call(draftDiagnostics.GET,undefined,'/api/draft-diagnostics?id=100')).status,401);
 console.log('PASS: auth, CSRF, eSputnik draft persistence, post-save list refresh, committed-write acknowledgements, orphan draft recovery, diagnostics, missing ETags, empty/unsupported search responses, templates, concurrent CAS claims, stale edits, test/review/launch, ambiguous outcomes, imports, schedules, stats, Blob request-context OIDC, group access errors, credential rotation, secret redaction.');
}finally{await rm(localDir,{recursive:true,force:true});}
