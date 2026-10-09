export const runtime='nodejs';
import {actor,apiKey,groups,json,failure} from '@/lib/server';
export async function GET(){try{await actor();return json({segments:await groups(await apiKey())});}catch(e){return failure(e);}}
