import {cookies} from 'next/headers';
import {SESSION_COOKIE,cookieOptions} from '@/lib/auth';
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Недійсний запит.'},{status:403});const jar=await cookies();jar.set(SESSION_COOKIE,'',{...cookieOptions,maxAge:0});jar.set('forbes-studio-settings','',{...cookieOptions,maxAge:0});return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
