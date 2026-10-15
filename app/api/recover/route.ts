export const runtime='nodejs';
export const maxDuration=300;
import {actor,config,payload,json,failure} from '@/lib/server';
import {messageId,recoverDraft} from '@/lib/messages';
export async function POST(request:Request){try{const user=await actor(request);const body=await payload(request);const {config:f}=await config(user.email);return json(await recoverDraft(messageId.parse(body.id),f,user.email));}catch(e){return failure(e);}}
