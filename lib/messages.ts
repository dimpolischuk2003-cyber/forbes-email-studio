import {z} from 'zod';
import {esputnik,apiKey,hash,AppError,type Config} from './server';
import {campaignSchema,emptyCampaign,renderEmail,type Campaign} from './email';
import {canonicalCampaign} from './sanitize';
import {sign,verify} from './tokens';
import {controlRead,controlChange,log,type RecordState} from './control';
import {DraftSaveError} from './errors';
export const TAG='forbes-email-studio-v2';
const marker=/<!--forbes-studio-v2:([A-Za-z0-9_.-]+)-->/g;
export const messageId=z.coerce.string().regex(/^\d{1,16}$/);
type Remote={id:string;name:string;subject:string;from:string;html:string;template:boolean;tags:string[];fingerprint:string};
export async function readMessage(id:string):Promise<Remote>{messageId.parse(id);const {data}=await esputnik(await apiKey(),`/messages/email/${id}`);const v=data as Record<string,unknown>;const content=v?.content as Record<string,unknown>|undefined;const html=v?.htmlText||v?.html||v?.rawHtml||content?.html||content?.htmlText||(typeof v?.content==='string'?v.content:'');if(typeof html!=='string'||!html.trim())throw new AppError('У листі немає HTML для редагування.',502);const css=v.css||content?.css;const combined=typeof css==='string'&&css.trim()?`<style>${css}</style>${html}`:html;const r={id,name:String(v.name||`eSputnik ${id}`),subject:String(v.subject||''),from:String(v.from||''),html:combined,template:v.template===true};return {...r,tags:Array.isArray(v.tags)?v.tags.filter((x):x is string=>typeof x==='string'):[],fingerprint:await hash(r)};}
export async function encodeMessage(c:Campaign,f:Config,template=false){const html=renderEmail(c,f);const meta=sign('editor',{data:c,htmlHash:await hash(html)});return {name:c.name||'Без назви',from:`"${f.senderName}" <${f.senderEmail}>`,subject:c.subject||'Без теми',htmlText:html+`<!--forbes-studio-v2:${meta}-->`,languageCode:'uk',tags:[TAG],subscriptionsKeys:f.subscriptionsKeys,template};}
export async function decodeMessage(r:Remote){const tokens=Array.from(r.html.matchAll(marker));const html=r.html.replace(marker,'');if(tokens.length===1){const meta=verify<{data:Campaign;htmlHash:string}>('editor',tokens[0][1]);if(meta&&meta.htmlHash===await hash(html)){const parsed=campaignSchema.safeParse(meta.data);if(parsed.success&&r.name===(parsed.data.name||'Без назви')&&r.subject===(parsed.data.subject||'Без теми'))return canonicalCampaign(parsed.data);}}
 if(html.length>350000)throw new AppError('Лист завеликий для редактора MVP.');return canonicalCampaign(campaignSchema.parse({...emptyCampaign,name:r.name.slice(0,200),subject:r.subject.slice(0,200),imported_html:html,template_source:`eSputnik #${r.id}`,utm_enabled:false}));}
export async function listedMessages(search=TAG,start=1){
 const {data,headers}=await esputnik(await apiKey(),`/messages/email?startindex=${start}&maxrows=50&search=${encodeURIComponent(search)}`);
 const rows=Array.isArray(data)?data:(data as {messages?:unknown[]}|null)?.messages;
 if(!Array.isArray(rows)){
  // A draft has already been read back and recorded before the editor refreshes
  // this search. A missing search result must not turn that confirmed save into
  // an error. Use only the workspace's recorded IDs and statuses; opening a
  // draft still fetches and verifies its current content directly in eSputnik.
  if(search===TAG&&start===1){
   const {state}=await controlRead();const operations=state.operations.slice().reverse();
   const saved=Object.values(state.records).map(record=>{
    const receipt=operations.find(o=>o.status==='saved'&&o.data.messageId===record.id&&typeof o.data.name==='string');
    return {id:record.id,name:typeof receipt?.data.name==='string'?receipt.data.name:`Лист eSputnik #${record.id}`,subject:'',template:record.kind==='template',updatedAt:record.updatedAt};
   });
   return {rows:saved,more:false,total:String(saved.length)};
  }
  if(data===null||data==='')return {rows:[],more:false,total:headers.get('TotalCount')};
  throw new AppError('eSputnik не повернув список листів. Збережені чернетки можна відкрити у розділі «Кампанії».',502);
 }
 return {rows:rows.map((v:Record<string,unknown>)=>({id:messageId.parse(v.id),name:String(v.name||v.subject||`Лист ${v.id}`),subject:String(v.subject||''),template:v.template===true,updatedAt:typeof v.updatedDate==='string'?v.updatedDate:''})),more:rows.length===50,total:headers.get('TotalCount')};
}
function creationKey(r:Remote){if(!r.tags.includes(TAG)||r.tags.includes('forbes-email-studio-sent-v2'))return null;const tags=r.tags.filter(t=>t.startsWith('studio-')&&z.string().uuid().safeParse(t.slice(7)).success);return tags.length===1?(r.template?'template:':'draft:')+tags[0].slice(7):null;}
async function recoveryContext(r:Remote,f:Config){
 const key=creationKey(r);if(!key)return null;
 const tokens=Array.from(r.html.matchAll(marker));if(tokens.length!==1)return null;
 const meta=verify<{data:Campaign;htmlHash:string}>('editor',tokens[0][1]);
 if(!meta||meta.htmlHash!==await hash(r.html.replace(marker,'')))return null;
 const parsed=campaignSchema.safeParse(meta.data);if(!parsed.success||r.name!==(parsed.data.name||'Без назви')||r.subject!==(parsed.data.subject||'Без теми'))return null;
 const data=canonicalCampaign(parsed.data);return {key,data,hash:await hash({c:data,f,template:r.template})};
}
export async function recoverDraft(id:string,f:Config,actor:string){
 const remote=await readMessage(messageId.parse(id));const recovery=await recoveryContext(remote,f);
 if(!recovery)throw new AppError('Походження цієї чернетки не підтверджено. Її можна переглянути, але відновлення статусу заблоковано.',409);
 await controlChange(s=>{
  if(s.records[id])throw new AppError('Службовий запис уже існує. Відкрийте останню версію кампанії.',409);
  const pending=s.creates[recovery.key];
  if(!pending||!['creating','unknown'].includes(pending.status)||pending.hash!==recovery.hash||(pending.id&&pending.id!==id))throw new AppError('Немає відповідної незавершеної операції створення. Відновлення статусу заблоковано.',409);
  // Only an unfinished CREATE may recover to draft. Tests and launches are
  // separate operations and can never be reset by this action.
  s.creates[recovery.key]={...pending,id,status:'saved'};
  s.records[id]={id,kind:remote.template?'template':'campaign',revision:1,fingerprint:remote.fingerprint,status:'draft',testedHash:null,broadcastId:null,updatedAt:new Date().toISOString()};
  log(s,'draft_recovered','saved',{actor,name:remote.name,messageId:id});
 });
 return {id,revision:1};
}
export async function loadedCampaign(id:string){const r=await readMessage(messageId.parse(id));const c=await decodeMessage(r);const {state}=await controlRead();let record=state.records[id];if(!record){const key=creationKey(r);const pending=key?state.creates[key]:undefined;return {remote:r,data:c,record:{id,kind:r.template?'template':'campaign',revision:1,fingerprint:r.fingerprint,status:'unknown',testedHash:null,broadcastId:null,updatedAt:''} as RecordState,recoverable:!!pending&&['creating','unknown'].includes(pending.status)&&(!pending.id||pending.id===id)};}
 if(record.fingerprint!==r.fingerprint&&record.status==='draft'){record=await controlChange(s=>{const value=s.records[id];if(value.status!=='draft')throw new AppError('Статус листа змінився. Оновіть сторінку.',409);if(value.fingerprint!==r.fingerprint){value.revision++;value.fingerprint=r.fingerprint;value.testedHash=null;delete value.test;value.updatedAt=new Date().toISOString();}return value;});}
 return {remote:r,data:c,record,recoverable:false};}
export function recordRow(record:RecordState,data:Campaign){return {id:record.id,name:data.name,data,revision:record.revision,status:record.status,message_id:record.id,broadcast_id:record.broadcastId,updated_at:record.updatedAt};}
export async function createMessage(c:Campaign,f:Config,token:string,actor:string,template=false){z.string().uuid().parse(token);const key=(template?'template:':'draft:')+token;const op=crypto.randomUUID();let createdId:string|undefined;const requestHash=await hash({c,f,template});const existing=(await controlRead()).state.creates[key];if(existing){if(existing.status==='saved'&&existing.id&&existing.hash===requestHash)return {id:existing.id,revision:1};throw new AppError('Створення цього листа вже розпочалося. Перевірте історію та eSputnik.',409);}
 try{await controlChange(s=>{if(s.creates[key])throw new AppError('Створення вже виконується.',409);s.creates[key]={status:'creating',operation:op,hash:requestHash};});
 const body=await encodeMessage(c,f,template);const {data}=await esputnik(await apiKey(),'/messages/email',{...body,tags:[TAG,`studio-${token}`]});const {providerId}=await import('./server');const id=messageId.parse(providerId(data));createdId=id;const r=await readMessage(id);await controlChange(s=>{s.creates[key]={status:'saved',id,operation:op,hash:requestHash};s.records[id]={id,kind:template?'template':'campaign',revision:1,fingerprint:r.fingerprint,status:'draft',testedHash:null,broadcastId:null,updatedAt:new Date().toISOString()};log(s,template?'template_saved':'created','saved',{actor,name:c.name,messageId:id},op);});return {id,revision:1};}
 catch(e){await controlChange(s=>{if(s.creates[key]?.operation===op&&s.creates[key].status!=='saved'){s.creates[key].status='unknown';if(createdId)s.creates[key].id=createdId;}}).catch(()=>{});if(createdId)throw new DraftSaveError(`Лист eSputnik #${createdId} створено, але службовий статус не підтверджено. Відкрийте його у «Кампаніях». ${e instanceof AppError?e.message:''}`,createdId,e instanceof AppError?e.status:503);throw e;}}
