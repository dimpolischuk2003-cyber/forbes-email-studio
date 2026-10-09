export const runtime='nodejs';
export const maxDuration=300;
import {actor,json,failure,payload,AppError} from '@/lib/server';
import {messageId} from '@/lib/messages';
import {prepared,readySegment,checkSchedule} from '@/lib/send';
import {campaignLinks} from '@/lib/email';
import {sign} from '@/lib/tokens';
export async function POST(request:Request){try{const u=await actor(request);const b=await payload(request);const id=messageId.parse(b.id);const p=await prepared(id,u.email);if(!p.f.enabled)throw new AppError('Запуск вимкнено. Перевірте налаштування та ESPUTNIK_SEND_ENABLED у Vercel.');if(p.record.testedHash!==p.h)throw new AppError('Надішліть тест актуальної версії перед запуском.');if(!p.data.segment_id)throw new AppError('Оберіть базу отримувачів.');checkSchedule(p.data,p.f);const group=await readySegment(p.data.segment_id);const expires=Date.now()+10*60000;const token=sign('review',{id,revision:p.record.revision,fingerprint:p.remote.fingerprint,hash:p.h,group,actor:u.email,session:u.sessionId,expires,nonce:crypto.randomUUID()});return json({token,expiresAt:new Date(expires).toISOString(),c:p.data,f:p.f,segment:group,actor:u.email,links:campaignLinks(p.data)});}catch(e){return failure(e);}}
