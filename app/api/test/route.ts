export const runtime='nodejs';
export const maxDuration=300;
import {actor,apiKey,esputnik,json,failure,payload,AppError} from '@/lib/server';
import {messageId} from '@/lib/messages';
import {prepared} from '@/lib/send';
import {renderEmail,emailText} from '@/lib/email';
import {controlChange,log} from '@/lib/control';
export async function POST(request:Request){try{const u=await actor(request);const b=await payload(request);const id=messageId.parse(b.id);const p=await prepared(id,u.email);if(!p.f.testEmail)throw new AppError('Вкажіть тестову пошту у налаштуваннях.');const op=crypto.randomUUID();const already=await controlChange(s=>{const r=s.records[id];if(r.status!=='draft'||r.revision!==p.record.revision||r.fingerprint!==p.remote.fingerprint)throw new AppError('Лист змінився.',409);if(r.test?.hash===p.h&&r.test.status==='completed')return true;if(r.test?.status==='started'||r.test?.status==='unknown')throw new AppError('Попередній тест потребує перевірки. Створіть копію для нового тесту.',409);r.test={hash:p.h,status:'started',operation:op};return false;});if(already)return json({email:p.f.testEmail,already:true});
 try{const {data}=await esputnik(await apiKey(),'/message/email',{from:'"'+p.f.senderName+'" <'+p.f.senderEmail+'>',subject:'[ТЕСТ] '+p.data.subject,htmlText:renderEmail(p.data,p.f),plainText:emailText(p.data),emails:[p.f.testEmail],subscriptionsKeys:p.f.subscriptionsKeys,externalRequestId:op});if((data as {results?:{status?:string}[]})?.results?.some(x=>x.status==='ERROR'))throw new AppError('eSputnik відхилив тест. Перевірте його в кабінеті.',502);await controlChange(s=>{const r=s.records[id];if(r.test?.operation!==op||r.fingerprint!==p.remote.fingerprint)throw new AppError('Статус тесту потребує перевірки.',409);r.test.status='completed';r.testedHash=p.h;log(s,'test','completed',{actor:u.email,messageId:id,email:p.f.testEmail},op);});return json({email:p.f.testEmail});}
 catch(e){await controlChange(s=>{const r=s.records[id];if(r.test?.operation===op&&r.test.status==='started'){r.test.status='unknown';r.testedHash=null;log(s,'test','unknown',{actor:u.email,messageId:id},op);}}).catch(()=>{});throw e;}
 }catch(e){return failure(e);}}
