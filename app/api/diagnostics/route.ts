export const runtime='nodejs';
export const maxDuration=300;
import {actor,apiKey,config,esputnik,json,failure,AppError} from '@/lib/server';
import {controlRead,probeStorage} from '@/lib/control';
import {buildInfo} from '@/lib/build';
type Check={name:string;ok:boolean;detail:string};
export async function POST(request:Request){try{
 const user=await actor(request);const checks:Check[]=[];
 async function check(name:string,run:()=>Promise<string>){try{checks.push({name,ok:true,detail:await run()});}catch(e){checks.push({name,ok:false,detail:e instanceof AppError?e.message:'Перевірку не завершено. Перевірте доступ до сервісу.'});}}
 await check('eSputnik: читання листів',async()=>{const {data}=await esputnik(await apiKey(),'/messages/email?startindex=1&maxrows=1');const shape=Array.isArray(data)?'список':data===null?'порожня відповідь':typeof data==='object'?'об’єкт':'інший формат';return `API відповідає. Формат: ${shape}.`;});
 await check('eSputnik: бази отримувачів',async()=>{await esputnik(await apiKey(),'/groups?startindex=1&maxrows=1');return 'Читання груп дозволене.';});
 await check('Відправник',async()=>{const {config:f}=await config(user.email);if(!f.senderEmail)throw new AppError('Вкажіть email відправника у налаштуваннях.');return 'Адреса задана. Її підтвердження в eSputnik перевіряється при тестовій відправці.';});
 await check('Blob: запис і версії',async()=>(await probeStorage()).detail);
 await check('Історія кампаній',async()=>{const {state,etag,downloadEtagDiffers}=await controlRead({forWrite:true});return etag?`Історію прочитано зі стабільною версією об’єкта. Службових записів: ${Object.keys(state.records).length}. Версії завантаження й об’єкта ${downloadEtagDiffers?'відрізняються — для запису використовується версія об’єкта':'збігаються'}.`:'Сховище доступне. Історія ще не створена.';});
 return json({build:buildInfo(),host:new URL(request.url).host,ok:checks.every(c=>c.ok),checks});
 }catch(e){return failure(e);}}
