export const runtime='nodejs';
export const maxDuration=300;
import {actor,config,json,failure,payload,AppError} from '@/lib/server';
import {createMessage} from '@/lib/messages';
import {campaignSchema} from '@/lib/email';
import {canonicalCampaign} from '@/lib/sanitize';
import {z} from 'zod';
export async function POST(request:Request){try{const u=await actor(request);const b=await payload(request);const name=z.string().trim().min(1).max(100).parse(b.name);const c=canonicalCampaign(campaignSchema.parse(b.data));const {config:f}=await config(u.email);if(!f.senderEmail)throw new AppError('Вкажіть адресу відправника у налаштуваннях.');return json(await createMessage({...c,name,segment_id:null,send_mode:'now',scheduled_at:''},f,z.string().uuid().parse(b.token),u.email,true),201);}catch(e){return failure(e);}}
