export const STUDIO_VERSION='0.2.10';
export function buildInfo(){return {version:STUDIO_VERSION,commit:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)||'local',environment:process.env.VERCEL_ENV||'local'};}
