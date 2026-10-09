import {cookies} from 'next/headers';
import {createHash,timingSafeEqual} from 'node:crypto';
import {sign,verify} from './tokens';
import {AppError} from './errors';
export const SESSION_COOKIE='forbes-studio-session';
export type User={email:string;displayName:string;userId:string;sessionId:string};
type Account={email:string;password:string;name?:string};
type Session={email:string;credentialVersion:string;sessionId:string;expires:number};
function accounts():Account[]{let extra:Account[]=[];if(process.env.STUDIO_USERS_JSON){try{extra=JSON.parse(process.env.STUDIO_USERS_JSON);}catch{throw new AppError('Перевірте налаштування входу у Vercel.',503);}}if(!Array.isArray(extra))throw new AppError('Перевірте STUDIO_USERS_JSON у Vercel.',503);const primary=process.env.STUDIO_EMAIL&&process.env.STUDIO_PASSWORD?[{email:process.env.STUDIO_EMAIL,password:process.env.STUDIO_PASSWORD,name:process.env.STUDIO_NAME}]:[];const list=[...primary,...extra];if(!Array.isArray(extra)||list.some(a=>!a||typeof a.email!=='string'||typeof a.password!=='string'||a.password.length<14))throw new AppError('Для кожного акаунта потрібен пароль від 14 символів.',503);return list;}
function version(a:Account){return createHash('sha256').update(a.email.toLowerCase()+'\0'+a.password).digest('hex');}
export function checkCredentials(email:string,password:string){const a=accounts().find(a=>a.email.toLowerCase()===email.toLowerCase());const expected=createHash('sha256').update(a?.password??'invalid-credential-padding').digest();const actual=createHash('sha256').update(password).digest();return timingSafeEqual(actual,expected)&&a?a:null;}
export function sessionFor(a:Account){return sign('session',{email:a.email.toLowerCase(),credentialVersion:version(a),sessionId:crypto.randomUUID(),expires:Date.now()+8*60*60*1000});}
export async function currentUser():Promise<User|null>{const token=(await cookies()).get(SESSION_COOKIE)?.value;if(!token)return null;const s=verify<Session>('session',token);if(!s||typeof s.expires!=='number'||s.expires<Date.now()||typeof s.sessionId!=='string')return null;const a=accounts().find(a=>a.email.toLowerCase()===s.email);if(!a||version(a)!==s.credentialVersion)return null;return {email:s.email,displayName:a.name||s.email,userId:'team',sessionId:s.sessionId};}
export const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
