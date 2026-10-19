import {AppError} from './errors';
export const MAX_IMAGE_BYTES=3*1024*1024;
export function imageType(bytes:Uint8Array){
 const b=Buffer.from(bytes);
 if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',mime:'image/png'};
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return {ext:'jpg',mime:'image/jpeg'};
 if(b.length>=6&&['GIF87a','GIF89a'].includes(b.subarray(0,6).toString()))return {ext:'gif',mime:'image/gif'};
 if(b.length>=12&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return {ext:'webp',mime:'image/webp'};
 throw new AppError('Оберіть файл PNG, JPG, GIF або WebP. Сторінка перегляду не є зображенням.');
}
export function driveImageUrl(value:string){
 let u:URL;try{u=new URL(value);}catch{throw new AppError('Вкажіть посилання на файл Google Drive.');}
 if(u.protocol!=='https:'||u.hostname!=='drive.google.com'||u.username||u.password||u.port)throw new AppError('Вкажіть HTTPS-посилання на файл drive.google.com.');
 const id=/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/.exec(u.pathname)?.[1]||u.searchParams.get('id');
 if(!id||! /^[A-Za-z0-9_-]{10,200}$/.test(id))throw new AppError('Не вдалося знайти ID файлу Google Drive.');
 const out=new URL('https://drive.google.com/uc');out.searchParams.set('export','download');out.searchParams.set('id',id);const key=u.searchParams.get('resourcekey');if(key&&/^[A-Za-z0-9_-]{1,200}$/.test(key))out.searchParams.set('resourcekey',key);return out;
}
function allowedGoogleUrl(u:URL){return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='drive.google.com'||u.hostname==='drive.usercontent.google.com'||u.hostname==='googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'));}
export async function readImageBytes(response:Response){
 if(!response.ok)throw new AppError('Файл недоступний. Відкрийте доступ за посиланням або завантажте картинку з комп’ютера.');
 if(Number(response.headers.get('content-length'))>MAX_IMAGE_BYTES)throw new AppError('Зображення завелике. Максимум — 3 МБ.');
 if(!response.body)throw new AppError('Файл порожній.');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;
 try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new AppError('Зображення завелике. Максимум — 3 МБ.');}parts.push(item.value);}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(parts);if(!bytes.length)throw new AppError('Файл порожній.');imageType(bytes);return bytes;
}
export async function importDriveImage(value:string){
 let url=driveImageUrl(value);
 for(let i=0;i<5;i++){
  if(!allowedGoogleUrl(url))throw new AppError('Google Drive перенаправив запит за непідтримуваною адресою. Завантажте файл з комп’ютера.');
  const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:'image/*'}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)break;url=new URL(location,url);continue;}
  if(response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();throw new AppError('Google Drive повернув сторінку доступу замість картинки. Дозвольте перегляд усім за посиланням або завантажте файл з комп’ютера.');}
  return readImageBytes(response);
 }
 throw new AppError('Не вдалося отримати картинку з Google Drive. Завантажте файл з комп’ютера.');
}
export const assetPath=(id:string)=>`forbes-email-studio/assets/${id}`;
export const assetId=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;
