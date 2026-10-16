export const runtime='nodejs';
export const maxDuration=300;
import {actor,config,payload,json,failure} from '@/lib/server';
import {messageId,recoverDraft,findCreatedDraft} from '@/lib/messages';
import {z} from 'zod';
export async function POST(request:Request){try{const user=await actor(request);const body=await payload(request);const {config:f}=await config(user.email);return json(body.token?await findCreatedDraft(z.string().uuid().parse(body.token),z.boolean().default(false).parse(body.template),f,user.email):await recoverDraft(messageId.parse(body.id),f,user.email,body.acceptRemoteHtml===true?{confirmed:true,token:z.string().max(3000).parse(body.recoveryToken)}:undefined));}catch(e){return failure(e);}}
