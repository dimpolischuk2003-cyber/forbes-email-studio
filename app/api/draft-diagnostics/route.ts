export const runtime='nodejs';
export const maxDuration=300;
import {actor,config,json,failure} from '@/lib/server';
import {diagnoseDraft,messageId} from '@/lib/messages';
import {buildInfo} from '@/lib/build';
export async function GET(request:Request){try{
 const user=await actor();const id=messageId.parse(new URL(request.url).searchParams.get('id'));
 const {config:f}=await config(user.email);
 const report=await diagnoseDraft(id,f);
 const response=json({build:buildInfo(),readOnly:true,...report});
 response.headers.set('Content-Disposition',`attachment; filename="draft-diagnostics-${id}.json"`);
 response.headers.set('X-Content-Type-Options','nosniff');
 return response;
 }catch(e){return failure(e);}}
