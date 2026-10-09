import {createHmac,timingSafeEqual} from 'node:crypto';
import {AppError} from './errors';
function secret(){const s=process.env.STUDIO_SESSION_SECRET;if(!s||s.length<32)throw new AppError('Адміністратор має налаштувати ключ доступу студії у Vercel.',503);return s;}
export function sign(kind:string,value:unknown){const body=Buffer.from(JSON.stringify(value)).toString('base64url');const sig=createHmac('sha256',secret()).update(kind+'.'+body).digest('base64url');return body+'.'+sig;}
export function verify<T>(kind:string,token:string):T|null{try{if(token.length>750000)return null;const [body,sig,...rest]=token.split('.');if(!body||!sig||rest.length)return null;const actual=Buffer.from(sig,'base64url');const expected=createHmac('sha256',secret()).update(kind+'.'+body).digest();if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;return JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as T;}catch{return null;}}
