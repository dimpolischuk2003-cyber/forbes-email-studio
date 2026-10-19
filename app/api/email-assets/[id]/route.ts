export const runtime='nodejs';
import {get} from '@vercel/blob';
import {assetId,assetPath} from '@/lib/images';
// Intentionally public marketing images: opaque, immutable IDs; no directory listing.
// The private control state is never addressable through this route.
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!assetId.test(id))return new Response(null,{status:404});
 try{const blob=await get(assetPath(id),{access:'private',useCache:true});if(!blob||blob.statusCode!==200)return new Response(null,{status:404});
 const mime:Record<string,string>={png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
 return new Response(blob.stream,{headers:{'Content-Type':mime[id.split('.').at(-1)!],'Content-Disposition':'inline','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}
}
