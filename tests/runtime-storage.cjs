// Loaded only by the isolated production runtime test, never by the application.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {MockAgent,setGlobalDispatcher}=require('undici');
const token=process.env.VERCEL_OIDC_TOKEN;
const agent=new MockAgent();agent.disableNetConnect();agent.enableNetConnect(/^(localhost|127\.0\.0\.1):/);setGlobalDispatcher(agent);
const messages=new Map();let nextMessage=100;
agent.get('https://esputnik.com').intercept({path:/^\/api\/v1\/(messages\/email|groups)/,method:'GET'}).reply(options=>{
 const id=/\/messages\/email\/(\d+)/.exec(options.path)?.[1];return id?(messages.has(id)?response(200,messages.get(id)):response(404,{})):response(200,[]);
}).persist();
agent.get('https://esputnik.com').intercept({path:'/api/v1/messages/email',method:'POST'}).reply(options=>{const id=String(nextMessage++);messages.set(id,{...JSON.parse(String(options.body)),id});return response(200,{id:Number(id)});}).persist();
agent.get('https://esputnik.com').intercept({path:/^\/api\/v1\/messages\/email\/\d+$/,method:'PUT'}).reply(options=>{const id=options.path.split('/').at(-1);if(!messages.has(id))return response(404,{});messages.set(id,{...JSON.parse(String(options.body)),id});return response(200,{id:Number(id)});}).persist();
// Next configures its proxy dispatcher at startup. Restore the isolated mock
// at each local HTTP request, before the real route calls the SDK.
require('node:diagnostics_channel').channel('http.server.request.start').subscribe(()=>setGlobalDispatcher(agent));
const files=new Map();
// Existing legacy history has a delivery ETag distinct from the object ETag.
const controlPath='forbes-email-studio/v2/'+createHash('sha256').update(process.env.STUDIO_WORKSPACE_ID||'forbes-email-studio').digest('hex')+'/control.json';
const legacyBody=JSON.stringify({version:1,binding:createHash('sha256').update(process.env.ESPUTNIK_API_KEY).digest('hex'),records:{},imports:{},creates:{},operations:[{id:'legacy-preserved',kind:'bootstrap',status:'saved',data:{name:'x'.repeat(8192)},created_at:new Date().toISOString()}]});
files.set(controlPath,{body:legacyBody,etag:'"'+createHash('md5').update(legacyBody).digest('hex')+'"'});
let clock=0,apiPuts=0,denyWrites=false,loseAck=false,conflict=false,omitEtag=false;
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
 const body=typeof options.body==='string'?options.body:Buffer.from(options.body).toString();const etag='"'+createHash('md5').update(body).digest('hex')+'"';files.set(pathname,{body,etag});
 if(loseAck){loseAck=false;return error('service_unavailable',503);}
 return response(200,{url:'https://sdk.private.blob.vercel-storage.com/'+pathname,downloadUrl:'https://sdk.private.blob.vercel-storage.com/'+pathname+'?download=1',pathname,contentType:'application/json',contentDisposition:'attachment',etag});
}).persist();
agent.get('https://blob-api.test.invalid').intercept({path:/.*/,method:'GET'}).reply(options=>{
 const pathname=new URL(options.path,'https://blob-api.test.invalid').searchParams.get('url'),file=files.get(pathname);
 if(!file)return error('not_found',404);
 return response(200,{url:'https://sdk.private.blob.vercel-storage.com/'+pathname,pathname,size:Buffer.byteLength(file.body),etag:file.etag,uploadedAt:new Date().toISOString(),contentType:'application/json',contentDisposition:'attachment',cacheControl:'private'});
}).persist();
agent.get('https://sdk.private.blob.vercel-storage.com').intercept({path:/.*/,method:'GET'}).reply(options=>{
 const headers=headersOf(options.headers);assert.equal(headers.get('authorization'),'Bearer '+token);
 const url=new URL(options.path,'https://sdk.private.blob.vercel-storage.com');assert.equal(url.searchParams.get('cache'),'0');
 const file=files.get(decodeURIComponent(url.pathname.slice(1)));if(!file)return response(404,'');
 return response(200,file.body,omitEtag?{}:{etag:url.pathname.endsWith('/control.json')?'W/"'+file.etag.replaceAll('"','')+'-gzip"':file.etag});
}).persist();
agent.get('https://blob-api.test.invalid').intercept({path:'/delete',method:'POST'}).reply(options=>{
 const body=JSON.parse(String(options.body));for(const path of body.urls)files.delete(path);return response(200,{});
}).persist();
