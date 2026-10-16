import {get,put,del,head,BlobNotFoundError,BlobError,BlobAccessError,BlobStoreNotFoundError,BlobStoreSuspendedError,BlobServiceRateLimited,BlobPreconditionFailedError,BlobContentTypeNotAllowedError,BlobRequestAbortedError,BlobServiceNotAvailable} from '@vercel/blob';
import {createHash} from 'node:crypto';
import {AppError} from './errors';
import type {Stats} from './statistics';
export type Receipt={id:string;kind:string;status:string;data:Record<string,unknown>;created_at:string};
export type RecordState={id:string;kind:'campaign'|'template';revision:number;fingerprint:string;status:string;testedHash:string|null;test?:{hash:string;status:string;operation:string};broadcastId:string|null;sendMessageId?:string;operation?:string;updatedAt:string;stats?:Stats};
export type ImportState={id:string;name:string;status:string;sessions:string[];count:number;failed:number;groupName:string;groupId:number|null;updatedAt:string};
export type ControlState={version:1;binding?:string;writes?:string[];records:Record<string,RecordState>;imports:Record<string,ImportState>;operations:Receipt[];creates:Record<string,{status:string;id?:string;operation:string;hash?:string;name?:string;actor?:string;createdAt?:string}>};
const empty=():ControlState=>({version:1,records:{},imports:{},operations:[],creates:{}});
// Blob SDK resolves Vercel OIDC from request context as well as environment variables.
// A connected store ID is sufficient here; authenticated reads/writes still fail closed.
export function controlAvailable(){return !!(process.env.BLOB_READ_WRITE_TOKEN?.trim()||process.env.BLOB_STORE_ID?.trim());}
function path(){const key=process.env.ESPUTNIK_API_KEY;if(!key)throw new AppError('Додайте ключ eSputnik у налаштування Vercel.',503);const account=createHash('sha256').update(process.env.STUDIO_WORKSPACE_ID||'forbes-email-studio').digest('hex');return `forbes-email-studio/v2/${account}/control.json`;}
export class StorageError extends AppError {constructor(public code:string,message:string){super(`${message} [${code}]`,503);}}
export function storageError(error:unknown,operation='write'):StorageError{
 // Constructor names are minified in Next.js production bundles. Compare the
 // actual exported SDK classes, which remain valid after bundling/minification.
 const classes=[BlobAccessError,BlobStoreNotFoundError,BlobStoreSuspendedError,BlobServiceRateLimited,BlobPreconditionFailedError,BlobContentTypeNotAllowedError,BlobRequestAbortedError,BlobServiceNotAvailable];
 const names=['BlobAccessError','BlobStoreNotFoundError','BlobStoreSuspendedError','BlobServiceRateLimited','BlobPreconditionFailedError','BlobContentTypeNotAllowedError','BlobRequestAbortedError','BlobServiceNotAvailable'];
 let kind=names[classes.findIndex(type=>error instanceof type)]||'';
 if(error instanceof BlobError){
  const status=/Failed to fetch blob: (\d{3})/.exec(error.message)?.[1];
  if(status==='401'||status==='403')kind='BlobAccessError';if(status==='429')kind='BlobServiceRateLimited';
  // This SDK subclass is not exported. Match only its fixed, public prefix;
  // never include the provider's raw message in responses or logs.
  if(error.message.includes('OIDC is enabled for this project, but not for the')&&error.message.includes('environment.'))kind='BlobOidcEnvironmentNotAllowedError';
  if(!kind)kind='BlobError';
 }
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
  BlobError:['BLOB_SDK_ERROR','SDK сховища відхилив запит. Потрібна перевірка параметрів підключення.'],
 };
 const [code,message]=known[kind]||[operation==='read'?'BLOB_READ_FAILED':'BLOB_WRITE_UNCONFIRMED','Сховище не підтвердило дію. Відкрийте «Налаштування» → «Перевірити підключення».'];
 // Never log raw SDK messages, request headers, tokens, or file contents.
 console.error('studio.storage',JSON.stringify({code,operation,kind:known[kind]?kind:'unknown'}));
 return new StorageError(code,message);
}
async function readBlob(pathname:string){
 const result=await get(pathname,{access:'private',useCache:false,headers:{'accept-encoding':'identity'},abortSignal:AbortSignal.timeout(15000)});
 if(!result)return null;
 if(result.statusCode!==200||!result.stream)throw new StorageError('BLOB_INVALID_RESPONSE','Сховище повернуло неповну відповідь.');
 if(!result.blob.etag)throw new StorageError('BLOB_ETAG_MISSING','Сховище не повернуло версію службового файлу. Збереження заблоковано.');
 return {text:await new Response(result.stream).text(),etag:result.blob.etag};
}
/** Pair fresh bytes with the storage API's ETag. Metadata must be stable across
 * the entire download; a newer HEAD must never be paired with an older body. */
async function writeSnapshot(pathname:string){
 for(let attempt=0;attempt<3;attempt++){
  let before;
  try{before=await head(pathname,{abortSignal:AbortSignal.timeout(15000)});}
  catch(e){if(e instanceof BlobNotFoundError)return null;throw e;}
  if(!before.etag||before.etag.startsWith('W/'))throw new StorageError('BLOB_METADATA_ETAG','Сховище не повернуло версію об’єкта для безпечного запису.');
  const blob=await readBlob(pathname);if(!blob)continue;
  let after;
  try{after=await head(pathname,{abortSignal:AbortSignal.timeout(15000)});}
  catch(e){if(e instanceof BlobNotFoundError)continue;throw e;}
  if(before.etag!==after.etag||before.size!==after.size)continue;
  if(Buffer.byteLength(blob.text)!==after.size)throw new StorageError('BLOB_SNAPSHOT_SIZE','Розмір прочитаної історії не збігається з версією об’єкта. Запис заблоковано.');
  const opaque=(tag:string)=>tag.replace(/^W\//,'').replace(/^"(.*)"$/,'$1');
  const version=opaque(after.etag),downloadVersion=opaque(blob.etag);
  // A weak delivery tag can describe the same object; never send that weak tag
  // as ifMatch. If the opaque tags differ, require an exact content digest.
  // Stable HEADs alone are insufficient: a stale download of equal length
  // must never be paired with a newer object's ETag.
  const digestMatches=/^[a-f0-9]{32}$/i.test(version)?createHash('md5').update(blob.text).digest('hex')===version.toLowerCase():/^[a-f0-9]{64}$/i.test(version)?createHash('sha256').update(blob.text).digest('hex')===version.toLowerCase():false;
  if(version!==downloadVersion&&!digestMatches)throw new StorageError('BLOB_VERSION_MISMATCH','Прочитані дані й версія об’єкта не узгоджені. Історію не перезаписано.');
  return {...blob,etag:after.etag,downloadEtagDiffers:blob.etag!==after.etag};
 }
 throw new StorageError('BLOB_SNAPSHOT_CHANGED','Історія змінюється під час читання. Запис заблоковано; спробуйте після завершення інших дій.');
}
export async function controlRead(options:{forWrite?:boolean}={}){
 if(!controlAvailable())throw new StorageError('BLOB_NOT_CONFIGURED','Завершіть підключення приватного сховища у Vercel.');
 try{
  const blob=options.forWrite?await writeSnapshot(path()):await readBlob(path());
  if(!blob)return {state:empty(),etag:null,downloadEtagDiffers:false};
  const state=JSON.parse(blob.text) as ControlState;
  if(state.version!==1||!state.records||!state.creates||!state.imports||!Array.isArray(state.operations)||(state.writes!==undefined&&(!Array.isArray(state.writes)||state.writes.some(x=>typeof x!=='string'))))throw new StorageError('BLOB_STATE_INVALID','Службовий файл має невірний формат.');
  if(state.binding!==createHash('sha256').update(process.env.ESPUTNIK_API_KEY!).digest('hex'))throw new StorageError('BLOB_ACCOUNT_BINDING','API-ключ змінився. Потрібна перевірка прив’язки історії до кабінету eSputnik.');
  return {state,etag:blob.etag,downloadEtagDiffers:'downloadEtagDiffers' in blob&&blob.downloadEtagDiffers===true};
 }catch(e){if(e instanceof AppError)throw e;throw storageError(e,'read');}
}
/** Only pure local changes belong in this callback: provider calls must run AFTER a successful CAS. */
export async function controlChange<T>(change:(state:ControlState)=>T):Promise<T>{
 const writeId=crypto.randomUUID();
 for(let attempt=0;attempt<6;attempt++){
  const {state,etag}=await controlRead({forWrite:true});
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
   const conflict=e instanceof BlobPreconditionFailedError;
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
 let created=false;let stage='створення перевірочного запису';
 try{
  const padding='x'.repeat(32768);
  created=true;await put(probe,JSON.stringify({revision:1,padding}),{...options,allowOverwrite:false,abortSignal:AbortSignal.timeout(15000)});created=true;
  stage='читання створеного запису';
  const first=await writeSnapshot(probe);
  if(!first)throw new StorageError('BLOB_PROBE_READ','Не вдалося прочитати перевірочний запис із його версією.');
  if(JSON.parse(first.text).revision!==1)throw new StorageError('BLOB_STALE_READ','Сховище повернуло застарілі дані.');
  stage='оновлення з поточною версією';
  const next=await put(probe,JSON.stringify({revision:2,padding}),{...options,allowOverwrite:true,ifMatch:first.etag,abortSignal:AbortSignal.timeout(15000)});
  stage='відхилення застарілої версії';
  let rejected=false;
  try{await put(probe,JSON.stringify({revision:3,padding}),{...options,allowOverwrite:true,ifMatch:first.etag,abortSignal:AbortSignal.timeout(15000)});}
  catch(e){if(e instanceof BlobPreconditionFailedError)rejected=true;else throw e;}
  if(!rejected)throw new StorageError('BLOB_CAS_UNSUPPORTED','Сховище не відхилило запис із застарілою версією.');
  stage='перевірка оновлених даних';
  const latest=await writeSnapshot(probe);
  if(!latest||JSON.parse(latest.text).revision!==2||latest.etag!==next.etag)throw new StorageError('BLOB_STALE_READ','Повторне читання не підтвердило останню версію запису.');
  return {ok:true,detail:'Читання, створення, оновлення та захист від конфліктів працюють.'};
 }catch(e){const failure=e instanceof AppError?e:storageError(e,'probe');throw new AppError(`Етап: ${stage}. ${failure.message}`,failure.status);}
 finally{if(created)await del(probe,{abortSignal:AbortSignal.timeout(10000)}).catch(()=>console.error('studio.storage',JSON.stringify({code:'BLOB_PROBE_CLEANUP',operation:'probe'})));}
}
export function log(state:ControlState,kind:string,status:string,data:Record<string,unknown>,id=crypto.randomUUID()){state.operations.push({id,kind,status,data,created_at:new Date().toISOString()});}
