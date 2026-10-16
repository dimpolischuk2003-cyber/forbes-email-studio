import {config,hash,apiKey,segment,AppError,type Config} from './server';
import {loadedCampaign} from './messages';
import {controlRead} from './control';
import {validateForSend,renderEmail,type Campaign} from './email';
export async function readySegment(id:number){const group=await segment(await apiKey(),id);const {state}=await controlRead();if(Object.values(state.imports).some(i=>(i.groupId===id||i.groupName===group.name)&&i.status!=='ready'))throw new AppError('Імпорт цієї бази ще не підтверджено. Перевірте стан імпорту.',409);if(group.count===null||group.count===0)throw new AppError(group.count===0?'Обраний сегмент порожній.':'eSputnik не повернув кількість контактів. Запуск заблоковано.',502);return {...group,count:group.count};}
export function checkSchedule(c:Campaign,f:Config){if(c.send_mode!=='schedule')return;if(!f.timezoneConfirmed||c.timezone!==f.accountTimezone)throw new AppError('Підтвердіть часовий пояс кабінету eSputnik у налаштуваннях.');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.scheduled_at)||!Number.isFinite(Date.parse(c.scheduled_at)))throw new AppError('Вкажіть дату й час відправки.');const local=new Intl.DateTimeFormat('sv-SE',{timeZone:f.accountTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.now()+5*60000)).replace(' ','T');if(c.scheduled_at<=local)throw new AppError('Оберіть час щонайменше через 5 хвилин.');}
export async function prepared(id:string,email:string){const loaded=await loadedCampaign(id);if(loaded.record.kind!=='campaign'||loaded.record.status!=='draft')throw new AppError('Цей лист уже запущено або його статус потребує перевірки. Створіть копію.',409);const {config:f,binding}=await config(email);const missing=validateForSend(loaded.data,f);if(missing.length)throw new AppError('Заповніть: '+missing.join(', '));const h=await hash({c:loaded.data,f,binding,fingerprint:loaded.remote.fingerprint,rendered:await hash(renderEmail(loaded.data,f)),testMethod:'prepared-message-v1'});return {...loaded,f,h,binding};}

/** A one-recipient test succeeds only after an explicit matching queue receipt. */
export function testReceipt(data:unknown,email:string){
 const raw=data&&typeof data==='object'?(data as {results?:unknown}).results:null;
 const rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
 if(rows.length!==1||!rows[0]||typeof rows[0]!=='object')throw new AppError('eSputnik не підтвердив прийняття тесту. Перевірте журнал дій і кабінет; повторне надсилання заблоковане.',502);
 const result=rows[0] as {status?:unknown;locator?:unknown;requestId?:unknown};
 if(result.status==='ERROR')throw new AppError('eSputnik відхилив тест. Перевірте адресу, статус контакту та відправника в кабінеті.',502);
 if(result.status!=='OK'||typeof result.locator!=='string'||result.locator.toLowerCase()!==email.toLowerCase())throw new AppError('eSputnik повернув непідтверджений результат тесту. Перевірте кабінет перед повторним надсиланням.',502);
 return typeof result.requestId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(result.requestId)?result.requestId:undefined;
}
