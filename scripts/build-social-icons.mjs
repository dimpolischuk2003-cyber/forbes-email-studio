import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const names={'instagram':'instagram','facebook-f':'facebook','youtube':'youtube','linkedin-in':'linkedin','telegram':'telegram'};
for(const [source,name] of Object.entries(names)){
 const svg=await readFile(new URL('../public/brand/social/source/'+source+'.svg',import.meta.url),'utf8');
 const png=await sharp(Buffer.from(svg.replaceAll('fill="currentColor"','fill="#ffffff"'))).resize(64,64,{fit:'contain',background:{r:16,g:16,b:16,alpha:1}}).flatten({background:'#101010'}).png().toBuffer();
 await writeFile(new URL('../public/brand/social/'+name+'.png',import.meta.url),png);
}
