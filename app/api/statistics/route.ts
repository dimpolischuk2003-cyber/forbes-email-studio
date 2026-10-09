export const runtime='nodejs';
export const maxDuration=300;
import {actor,apiKey,esputnik,AppError,failure,json,payload} from '@/lib/server';
import {controlRead,controlChange} from '@/lib/control';
import {messageId} from '@/lib/messages';
import {normalizeStats,type Stats,metrics} from '@/lib/statistics';
import {z} from 'zod';
export async function GET(request:Request){try{await actor();const id=messageId.parse(new URL(request.url).searchParams.get('id'));const r=(await controlRead()).state.records[id];if(!r)throw new AppError('Кампанію не знайдено.',404);return json({stats:r.stats||null,broadcastId:r.broadcastId});}catch(e){return failure(e);}}
export async function POST(request:Request){try{await actor(request);const b=await payload(request);const id=messageId.parse(b.id);const r=(await controlRead()).state.records[id];if(!r?.broadcastId)throw new AppError('Статистика доступна після запуску.');let stats:Stats;
 if(b.source==='csv'){const m=z.object(Object.fromEntries(metrics.map(k=>[k,z.number().int().min(0).max(1000000000).nullable()]))).parse(b.metrics);if(Object.values(m).every(v=>v===null))throw new AppError('Оберіть хоча б один показник CSV.');stats={metrics:normalizeStats(m),status:null,source:'csv',updatedAt:new Date().toISOString()};}
 else{const {data}=await esputnik(await apiKey(),'/broadcast/'+encodeURIComponent(r.broadcastId));const m=normalizeStats(data);if(Object.values(m).every(v=>v===null)&&r.stats)return json({stats:r.stats,notice:'API не повернув показники. Збережено попередній звіт.'});const status=(data as {status?:unknown})?.status;stats={metrics:m,status:typeof status==='string'?status:null,source:'api',updatedAt:new Date().toISOString()};}
 await controlChange(s=>{s.records[id].stats=stats;});return json({stats,notice:Object.values(stats.metrics).every(v=>v===null)?'API не повернув числовий звіт. Імпортуйте CSV з розділу Звіти eSputnik.':undefined});
 }catch(e){return failure(e);}}
