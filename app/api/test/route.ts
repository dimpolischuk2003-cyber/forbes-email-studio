export const runtime='nodejs';
export const maxDuration=300;
import {actor,apiKey,esputnik,providerId,json,failure,payload,AppError} from '@/lib/server';
import {messageId,readMessage} from '@/lib/messages';
import {prepared,testReceipt} from '@/lib/send';
import {renderEmail} from '@/lib/email';
import {controlChange,log} from '@/lib/control';
export async function POST(request:Request){try{const u=await actor(request);const b=await payload(request);const id=messageId.parse(b.id);const p=await prepared(id,u.email);if(!p.f.testEmail)throw new AppError('Вкажіть тестову пошту у налаштуваннях.');const op=crypto.randomUUID();const already=await controlChange(s=>{const r=s.records[id];if(r.status!=='draft'||r.revision!==p.record.revision||r.fingerprint!==p.remote.fingerprint)throw new AppError('Лист змінився.',409);if(r.test?.hash===p.h&&r.test.status==='completed')return true;if(r.test?.status==='started'||r.test?.status==='unknown')throw new AppError('Попередній тест потребує перевірки. Створіть копію для нового тесту.',409);r.test={hash:p.h,status:'started',operation:op};log(s,'test','started',{actor:u.email,messageId:id,email:p.f.testEmail},op);return false;});if(already)return json({email:p.f.testEmail,already:true});
 let stage='підготовка тестової копії';
 try{
  if((await readMessage(id)).fingerprint!==p.remote.fingerprint)throw new AppError('Лист змінили в eSputnik. Відкрийте актуальну версію перед тестом.',409);
  const key=await apiKey();
  // A separate stored message keeps the draft unchanged and excludes editor metadata.
  const copy=await esputnik(key,'/messages/email',{name:'[ТЕСТ] '+p.data.name,from:'"'+p.f.senderName+'" <'+p.f.senderEmail+'>',subject:'[ТЕСТ] '+p.data.subject,htmlText:renderEmail(p.data,p.f),languageCode:'uk',subscriptionsKeys:p.f.subscriptionsKeys,tags:['forbes-email-studio-test-v2',op],template:false});
  const testMessageId=messageId.parse(providerId(copy.data));
  await controlChange(s=>{const r=s.records[id];if(r.test?.operation!==op||r.test.status!=='started'||r.status!=='draft'||r.fingerprint!==p.remote.fingerprint)throw new AppError('Статус тесту змінився. Надсилання не запускалося.',409);r.test.messageId=testMessageId;const receipt=s.operations.find(row=>row.id===op);if(receipt)receipt.data.testMessageId=testMessageId;});
  stage='надсилання збереженого тестового листа';
  const {data}=await esputnik(key,`/message/${testMessageId}/smartsend`,{recipients:[{locator:p.f.testEmail,externalRequestId:op}],email:true});
  const requestId=testReceipt(data,p.f.testEmail);
  await controlChange(s=>{const r=s.records[id];if(r.test?.operation!==op||r.test.status!=='started'||r.status!=='draft'||r.fingerprint!==p.remote.fingerprint)throw new AppError('Статус тесту потребує перевірки.',409);r.test.status='completed';if(requestId)r.test.requestId=requestId;r.testedHash=p.h;const receipt=s.operations.find(row=>row.id===op);if(receipt){receipt.status='completed';receipt.data={...receipt.data,...(requestId?{requestId}:{})};}});
  return json({email:p.f.testEmail});
 }catch(e){await controlChange(s=>{const r=s.records[id];if(r.test?.operation===op&&r.test.status==='started'){r.test.status='unknown';r.testedHash=null;const receipt=s.operations.find(row=>row.id===op);if(receipt){receipt.status='unknown';receipt.data={...receipt.data,stage};}}}).catch(()=>{});throw e;}
 }catch(e){return failure(e);}}
