export const runtime='nodejs';
export const maxDuration=60;
import {put} from '@vercel/blob';
import {actor,payload,json,failure,AppError} from '@/lib/server';
import {storageError,controlAvailable} from '@/lib/control';
import {MAX_IMAGE_BYTES,imageType,importDriveImage,assetPath} from '@/lib/images';
import {z} from 'zod';
export async function POST(request:Request){try{
 await actor(request);if(!controlAvailable())throw new AppError('Підключіть сховище Blob у Vercel для завантаження зображень.',503);
 let bytes:Uint8Array;
 if(request.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(request.headers.get('content-length'))>MAX_IMAGE_BYTES+16384)throw new AppError('Зображення завелике. Максимум — 3 МБ.',413);
  const data=await request.formData(),file=data.get('file');if(!(file instanceof File)||file.size===0)throw new AppError('Оберіть зображення.');if(file.size>MAX_IMAGE_BYTES)throw new AppError('Зображення завелике. Максимум — 3 МБ.',413);bytes=new Uint8Array(await file.arrayBuffer());
 }else{const b=await payload(request);bytes=await importDriveImage(z.string().max(2000).parse(b.driveUrl));}
 const type=imageType(bytes),id=crypto.randomUUID()+'.'+type.ext;
 try{await put(assetPath(id),Buffer.from(bytes),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:type.mime,cacheControlMaxAge:31536000});}catch(e){throw storageError(e);}
 return json({url:new URL('/api/email-assets/'+id,request.url).toString()},201);
 }catch(e){return failure(e);}}
