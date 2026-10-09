import {cookies} from 'next/headers';
import {z} from 'zod';
import {checkCredentials,sessionFor,SESSION_COOKIE,cookieOptions} from '@/lib/auth';
import {failure,json} from '@/lib/server';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';
const attempts=new Map<string,{count:number;reset:number}>();
export async function POST(request:Request){try{if(request.headers.get('origin')!==new URL(request.url).origin)throw new AppError('Оновіть сторінку.',403);const raw=await request.text();if(Buffer.byteLength(raw)>4096)throw new AppError('Запит завеликий.',413);const b=z.object({email:z.string().email().max(254),password:z.string().min(1).max(1000)}).parse(JSON.parse(raw));const ip=request.headers.get('x-forwarded-for')?.split(',')[0]||'local';const now=Date.now();const a=attempts.get(ip);if(a&&a.reset>now&&a.count>=10)throw new AppError('Забагато спроб входу. Спробуйте через 10 хвилин.',429);if(attempts.size>10000)for(const [k,v] of attempts)if(v.reset<now)attempts.delete(k);const account=checkCredentials(b.email,b.password);if(!account){attempts.set(ip,{count:a&&a.reset>now?a.count+1:1,reset:a&&a.reset>now?a.reset:now+600000});throw new AppError('Перевірте пошту та пароль.',401);}attempts.delete(ip);(await cookies()).set(SESSION_COOKIE,sessionFor(account),{...cookieOptions,maxAge:8*60*60});return json({ok:true});}catch(e){return failure(e);}}
