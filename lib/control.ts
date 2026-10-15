import {get,put,del} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {AppError} from './errors';
import type {Stats} from './statistics';
export type Receipt={id:string;kind:string;status:string;data:Record<string,unknown>;created_at:string};
export type RecordState={id:string;kind:'campaign'|'template';revision:number;fingerprint:string;status:string;testedHash:string|null;test?:{hash:string;status:string;operation:string};broadcastId:string|null;sendMessageId?:string;operation?:string;updatedAt:string;stats?:Stats};
export type ImportState={id:string;name:string;status:string;sessions:string[];count:number;failed:number;groupName:string;groupId:number|null;updatedAt:string};
export type ControlState={version:1;binding?:string;writes?:string[];records:Record<string,RecordState>;imports:Record<string,ImportState>;operations:Receipt[];creates:Record<string,{status:string;id?:string;operation:string;hash?:string}>};
const empty=():ControlState=>({version:1,records:{},imports:{},operations:[],creates:{}});
// Blob SDK resolves Vercel OIDC from request context as well as environment variables.
// A connected store ID is sufficient here; authenticated reads/writes still fail closed.
export function controlAvailable(){return !!(process.env.BLOB_READ_WRITE_TOKEN?.trim()||process.env.BLOB_STORE_ID?.trim());}
function path(){const key=process.env.ESPUTNIK_API_KEY;if(!key)throw new AppError('Додайте ключ eSputnik у налаштування Vercel.',503);const account=createHash('sha256').update(process.env.STUDIO_WORKSPACE_ID||'forbes-email-studio').digest('hex');return `forbes-email-studio/v2/${account}/control.json`;}
export class StorageError extends AppError {constructor(public code:string,message:string){super(`${message} [${code}]`,503);}}
export function storageError(error:unknown,operation='write'):StorageError{
 let kind=error instanceof Error?error.constructor.name:'';
 if(kind==='BlobError'&&error instanceof Error){const status=/Failed to fetch blob: (\d{3})/.exec(error.message)?.[1];if(status==='401'||status==='403')kind='BlobAccessError';if(status==='429')kind='BlobServiceRateLimited';}
 const known:Record<string,[string,string]>={
  BlobAccessError:['BLOB_ACCESS_DENIED','Сховище відхилило доступ. Перевірте підключення Blob до цього проєкту.'],
  BlobOidcEnvironmentNotAllowedError:['BLOB_ENVIRONMENT_DENIED','Сховище не дозволяє доступ із цього середовища. Перевірте Production / Preview у підключенні Blob.'],
  BlobStoreNotFoundError:['BLOB_STORE_NOT_FOUND','Підключене сховище не знайдено.'],
  BlobStoreSuspendedError:['BLOB_STORE_SUSPENDED','Сховище призупинене. Перевірте його стан і ліміти у Vercel.'],
  BlobServiceRateLimited:['BLOB_RATE_LIMIT','Перевищено частоту звернень до сховища. Спробуйте пізніше.'],
  BlobPreconditionFailedError:['BLOB_WRITE_CONFLICT','Службовий запис змінився під час збереження. Оновіть список кампаній.'],
  BlobContentTypeNotAllowedError:['BLOB_CONTENT_TYPE','Сховище відхилило тип службового файлу.'],
  BlobRequestAbortedError:['BLOB_TIMEOUT','Сховище не підтвердило дію за відведений час. Перевірте список кампаній.'],
  BlobServiceNotAvailable:['BLOB_UNAVAILABLE','Сховище тимчасово недоступне.'],
 };
 const [code,message]=known[kind]||[operation==='read'?'BLOB_READ_FAILED':'BLOB_WRITE_UNCONFIRMED','Сховище не підтвердило дію. Відкрийте «Налаштування» → «Перевірити підключення».'];
 // Never log raw SDK messages, request headers, tokens, or file contents.
 console.error('studio.storage',JSON.stringify({code,operation,kind:known[kind]?kind:'unknown'}));
 return new StorageError(code,message);
}
export async function controlRead(){
 if(!controlAvailable())throw new StorageError('BLOB_NOT_CONFIGURED','Завершіть підключення приватного сховища у Vercel.');
 try{
  const r=await get(path(),{access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000)});
  if(!r)return {state:empty(),etag:null};
  if(r.statusCode!==200||!r.stream)throw new StorageError('BLOB_INVALID_RESPONSE','Сховище повернуло неповну відповідь.');
  if(!r.blob.etag)throw new StorageError('BLOB_ETAG_MISSING','Сховище не повернуло версію службового файлу. Збереження заблоковано.');
  const state=await new Response(r.stream).json() as ControlState;
  if(state.version!==1||!state.records||!state.creates||!state.imports||!Array.isArray(state.operations)||(state.writes!==undefined&&(!Array.isArray(state.writes)||state.writes.some(x=>typeof x!=='string'))))throw new StorageError('BLOB_STATE_INVALID','Службовий файл має невірний формат.');
  if(state.binding!==createHash('sha256').update(process.env.ESPUTNIK_API_KEY!).digest('hex'))throw new StorageError('BLOB_ACCOUNT_BINDING','API-ключ змінився. Потрібна перевірка прив’язки історії до кабінету eSputnik.');
  return {state,etag:r.blob.etag};
 }catch(e){if(e instanceof AppError)throw e;throw storageError(e,'read');}
}
/** Only pure local changes belong in this callback: provider calls must run AFTER a successful CAS. */
export async function controlChange<T>(change:(state:ControlState)=>T):Promise<T>{
 const writeId=crypto.randomUUID();
 for(let attempt=0;attempt<6;attempt++){
  const {state,etag}=await controlRead();
  if(!state.binding)state.binding=createHash('sha256').update(process.env.ESPUTNIK_API_KEY!).digest('hex');
  const result=change(state);state.operations=state.operations.slice(-200);
  state.writes=[...(state.writes||[]),writeId].slice(-64);
  const body=JSON.stringify(state);
  if(Buffer.byteLength(body)>2*1024*1024)throw new AppError('Службова історія досягла ліміту. Зверніться до адміністратора.',503);
  try{
   await put(path(),body,{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',abortSignal:AbortSignal.timeout(20000)});
   return result;
  }catch(e){
   // The upload may have committed even if its response was lost. Confirm its
   // unique marker before rerunning a callback or reporting a failed save.
   const confirmed=await controlRead().catch(()=>null);
   if(confirmed?.state.writes?.includes(writeId))return result;
   const conflict=e instanceof Error&&e.constructor.name==='BlobPreconditionFailedError';
   if(!conflict||attempt===5)throw storageError(e);
   await new Promise(resolve=>setTimeout(resolve,25*2**attempt+Math.floor(Math.random()*25)));
  }
 }
 throw new StorageError('BLOB_WRITE_CONFLICT','Не вдалося узгодити версію службового запису.');
}
/** Isolated storage probe: no campaign, message, audience, or control-file writes. */
export async function probeStorage(){
 if(!controlAvailable())throw new StorageError('BLOB_NOT_CONFIGURED','Приватне сховище не підключене.');
 const probe=`forbes-email-studio/diagnostics/${crypto.randomUUID()}.json`;
 const options={access:'private' as const,addRandomSuffix:false,contentType:'application/json'};
 let created=false;
 try{
  created=true;await put(probe,JSON.stringify({revision:1}),{...options,allowOverwrite:false,abortSignal:AbortSignal.timeout(15000)});created=true;
  const first=await get(probe,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000)});
  if(first?.statusCode!==200||!first.stream||!first.blob.etag)throw new StorageError('BLOB_PROBE_READ','Не вдалося прочитати перевірочний запис із його версією.');
  if((await new Response(first.stream).json()).revision!==1)throw new StorageError('BLOB_STALE_READ','Сховище повернуло застарілі дані.');
  const next=await put(probe,JSON.stringify({revision:2}),{...options,allowOverwrite:true,ifMatch:first.blob.etag,abortSignal:AbortSignal.timeout(15000)});
  let rejected=false;
  try{await put(probe,JSON.stringify({revision:3}),{...options,allowOverwrite:true,ifMatch:first.blob.etag,abortSignal:AbortSignal.timeout(15000)});}
  catch(e){if(e instanceof Error&&e.constructor.name==='BlobPreconditionFailedError')rejected=true;else throw e;}
  if(!rejected)throw new StorageError('BLOB_CAS_UNSUPPORTED','Сховище не відхилило запис із застарілою версією.');
  const latest=await get(probe,{access:'private',useCache:false,abortSignal:AbortSignal.timeout(15000)});
  if(latest?.statusCode!==200||!latest.stream||(await new Response(latest.stream).json()).revision!==2||latest.blob.etag!==next.etag)throw new StorageError('BLOB_STALE_READ','Повторне читання не підтвердило останню версію запису.');
  return {ok:true,detail:'Читання, створення, оновлення та захист від конфліктів працюють.'};
 }catch(e){if(e instanceof AppError)throw e;throw storageError(e,'probe');}
 finally{if(created)await del(probe,{abortSignal:AbortSignal.timeout(10000)}).catch(()=>console.error('studio.storage',JSON.stringify({code:'BLOB_PROBE_CLEANUP',operation:'probe'})));}
}
export function log(state:ControlState,kind:string,status:string,data:Record<string,unknown>,id=crypto.randomUUID()){state.operations.push({id,kind,status,data,created_at:new Date().toISOString()});}
