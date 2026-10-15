import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {MockAgent,getGlobalDispatcher,setGlobalDispatcher} from 'undici';

// Real installed @vercel/blob, real OIDC resolver, real HTTP serialization,
// and production control code. Only the remote HTTP endpoints are simulated.
const directory=join(process.cwd(),'.test-storage-sdk');await mkdir(directory,{recursive:true});
const minified=process.argv.includes('--minified');
const outfile=join(directory,minified?'control.cjs':'control.mjs');
await build({entryPoints:['lib/control.ts'],outfile,bundle:true,platform:'node',...(minified?{format:'cjs',minify:true}:{format:'esm',packages:'external'}),logLevel:'silent'});
const loaded=await import(pathToFileURL(outfile));
const {controlRead,controlChange,probeStorage}=minified?loaded.default:loaded;
process.env.ESPUTNIK_API_KEY='sdk-test-provider-key';
process.env.BLOB_STORE_ID='store_sdk';delete process.env.BLOB_READ_WRITE_TOKEN;delete process.env.VERCEL_OIDC_TOKEN;
process.env.VERCEL_BLOB_API_URL='https://blob-api.test.invalid';process.env.VERCEL_BLOB_RETRIES='1';
const token=['eyJhbGciOiJub25lIn0',Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'test'].join('.');
const contextKey=Symbol.for('@vercel/request-context');globalThis[contextKey]={get:()=>({headers:{'x-vercel-oidc-token':token}})};
const originalDispatcher=getGlobalDispatcher(),agent=new MockAgent();agent.disableNetConnect();setGlobalDispatcher(agent);
const files=new Map();let clock=0,apiPuts=0,denyWrites=false,loseAck=false,conflict=false,omitEtag=false;
function headersOf(value){if(Array.isArray(value)){const result=new Headers();for(let i=0;i<value.length;i+=2)result.set(value[i],value[i+1]);return result;}return new Headers(value);}
function response(statusCode,data,headers={}){return {statusCode,data:typeof data==='string'?data:JSON.stringify(data),responseOptions:{headers:{'content-type':'application/json',...headers}}};}
function error(code,statusCode=412){return response(statusCode,{error:{code}});}
agent.get('https://blob-api.test.invalid').intercept({path:/.*/,method:'PUT'}).reply(options=>{
 apiPuts++;const headers=headersOf(options.headers);assert.equal(headers.get('authorization'),'Bearer '+token);assert.equal(headers.get('x-vercel-blob-store-id'),'sdk');assert.equal(headers.get('x-vercel-blob-access'),'private');
 if(denyWrites)return error('forbidden',403);
 const pathname=new URL(options.path,'https://blob-api.test.invalid').searchParams.get('pathname');assert.ok(pathname);
 const previous=files.get(pathname),ifMatch=headers.get('x-if-match');
 if(conflict&&previous){conflict=false;previous.etag='"'+(++clock)+'"';return error('precondition_failed');}
 if(previous&&(headers.get('x-allow-overwrite')!=='1'||(ifMatch&&ifMatch!==previous.etag)))return error('precondition_failed');
 assert.equal(headers.get('x-add-random-suffix'),'0');
 const body=typeof options.body==='string'?options.body:Buffer.from(options.body).toString();const etag='"'+(++clock)+'"';files.set(pathname,{body,etag});
 if(loseAck){loseAck=false;return error('service_unavailable',503);}
 return response(200,{url:'https://sdk.private.blob.vercel-storage.com/'+pathname,downloadUrl:'https://sdk.private.blob.vercel-storage.com/'+pathname+'?download=1',pathname,contentType:'application/json',contentDisposition:'attachment',etag});
}).persist();
agent.get('https://sdk.private.blob.vercel-storage.com').intercept({path:/.*/,method:'GET'}).reply(options=>{
 const headers=headersOf(options.headers);assert.equal(headers.get('authorization'),'Bearer '+token);
 const url=new URL(options.path,'https://sdk.private.blob.vercel-storage.com');assert.equal(url.searchParams.get('cache'),'0');
 const file=files.get(decodeURIComponent(url.pathname.slice(1)));if(!file)return response(404,'');
 return response(200,file.body,omitEtag?{}:{etag:file.etag});
}).persist();
agent.get('https://blob-api.test.invalid').intercept({path:'/delete',method:'POST'}).reply(options=>{
 const body=JSON.parse(String(options.body));for(const path of body.urls)files.delete(path);return response(200,{});
}).persist();
try{
 await controlChange(state=>{state.operations.push({id:'first',kind:'test',status:'saved',data:{},created_at:new Date().toISOString()});});
 assert.equal((await controlRead()).state.operations.length,1);
 const beforeAck=apiPuts;loseAck=true;
 const value=await controlChange(state=>{state.operations.push({id:'lost-ack',kind:'test',status:'saved',data:{},created_at:new Date().toISOString()});return 42;});
 assert.equal(value,42);assert.ok(apiPuts>beforeAck);assert.equal((await controlRead()).state.operations.filter(o=>o.id==='lost-ack').length,1);
 conflict=true;await controlChange(state=>{state.operations.push({id:'conflict',kind:'test',status:'saved',data:{},created_at:new Date().toISOString()});});
 assert.equal((await controlRead()).state.operations.filter(o=>o.id==='conflict').length,1);
 const beforeDenied=apiPuts;denyWrites=true;
 await assert.rejects(controlChange(state=>{state.operations.push({id:'denied'});}),error=>error.code==='BLOB_ACCESS_DENIED');
 assert.equal(apiPuts-beforeDenied,1);denyWrites=false;
 omitEtag=true;await assert.rejects(controlRead(),error=>error.code==='BLOB_ETAG_MISSING');omitEtag=false;
 const beforeProbe=[...files.entries()];assert.equal((await probeStorage()).ok,true);assert.deepEqual([...files.entries()],beforeProbe);
 console.log((minified?'MINIFIED BUNDLE ':'')+'PASS: real Blob SDK HTTP, request-context OIDC, quoted ETags, committed-write acknowledgement loss, conditional-write conflict, fatal access errors, missing ETag, isolated diagnostic probe and cleanup.');
}finally{setGlobalDispatcher(originalDispatcher);await agent.close();delete globalThis[contextKey];await rm(directory,{recursive:true,force:true});}
