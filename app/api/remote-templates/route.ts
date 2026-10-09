export const runtime='nodejs';
export const maxDuration=300;
import {actor,json,failure,payload} from '@/lib/server';
import {listedMessages,readMessage,decodeMessage,messageId} from '@/lib/messages';
import {z} from 'zod';
export async function GET(request:Request){try{await actor();const p=new URL(request.url).searchParams;const start=z.coerce.number().int().min(1).max(10000).parse(p.get('start')||1);const r=await listedMessages((p.get('search')||'').slice(0,200),start);return json({templates:r.rows.map(x=>({...x,id:Number(x.id)})),more:r.more,total:r.total});}catch(e){return failure(e);}}
export async function POST(request:Request){try{await actor(request);const b=await payload(request);const id=messageId.parse(b.id);const data=await decodeMessage(await readMessage(id));return json({id,data:{...data,template_source:'eSputnik #'+id}});}catch(e){return failure(e);}}
