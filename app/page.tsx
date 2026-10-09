import Studio from '@/components/studio';
import {currentUser} from '@/lib/auth';
import {redirect} from 'next/navigation';
export default async function Page(){if(!await currentUser())redirect('/login');return <Studio/>;}
