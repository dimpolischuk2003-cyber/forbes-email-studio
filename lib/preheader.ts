import {Parser} from 'htmlparser2';

const id='forbes-studio-preheader';
const padding='&#8199;&#847;&#8199;&#847;&#8199;&#847;';
type Part={start:number;end:number;text:string};
function isPreheader(tag:string,a:Record<string,string>){
 if(!['div','span','p'].includes(tag))return null;
 if(a.id===id||a['data-studio-preheader']==='true'||a.class?.split(/\s+/).includes('esd-hidden-preheader'))return 'marked';
 // The exact hidden block emitted by earlier Studio versions had no marker.
 const style=(a.style||'').toLowerCase().replace(/\s+/g,'');
 return /(?:^|;)display:none(?:!important)?(?:;|$)/.test(style)&&/(?:^|;)max-height:0(?:px)?(?:!important)?(?:;|$)/.test(style)&&/(?:^|;)overflow:hidden(?:!important)?(?:;|$)/.test(style)&&/(?:^|;)mso-hide:all(?:;|$)/.test(style)?'legacy':null;
}
function inspect(html:string){
 const parts:Part[]=[];let depth=0,bodyEnd:number|undefined,headEnd:number|undefined,htmlEnd:number|undefined;
 let active:{start:number;depth:number;text:string;legacy:boolean}|undefined;const ignored=new Set<number>();
 const parser=new Parser({
  onopentag(tag,a){
   depth++;
   if(tag==='body'&&bodyEnd===undefined)bodyEnd=parser.endIndex+1;
   if(tag==='html'&&htmlEnd===undefined)htmlEnd=parser.endIndex+1;
   if(tag==='script'||tag==='style')ignored.add(depth);
   const kind=isPreheader(tag,a);if(!active&&kind)active={start:parser.startIndex,depth,text:'',legacy:kind==='legacy'};
   if(active&&tag==='br')active.text+=' ';
  },
  ontext(text){if(active&&!ignored.size)active.text+=text;},
  onclosetag(tag,implied){
   if(active?.depth===depth){
    // Do not remove the rest of a malformed document after an unclosed div.
    if(!implied&&(!active.legacy||/\u034f\s*\u034f\s*\u034f\s*$/u.test(active.text)))parts.push({start:active.start,end:parser.endIndex+1,text:active.text});
    active=undefined;
   }
   if(tag==='head'&&!implied)headEnd=parser.endIndex+1;
   ignored.delete(depth);depth--;
  },
 },{decodeEntities:true});
 parser.end(html);
 return {parts,insert:bodyEnd??headEnd??htmlEnd??0};
}
export function readPreheader(html:string){
 const part=inspect(html).parts[0];
 return part?part.text.replace(/[\s\u034f\u2007\u200b\u00a0]+$/u,'').trim().slice(0,300):'';
}
export function preheaderHtml(text:string){
 const escaped=text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return `<div id="${id}" class="esd-hidden-preheader" data-studio-preheader="true" style="display:none!important;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all">${escaped}${padding}</div>`;
}
/** Edit only recognized preheader ranges; retain all other source bytes. */
export function withPreheader(html:string,text:string){
 const {parts,insert}=inspect(html);
 const offset=parts.filter(p=>p.end<=insert).reduce((sum,p)=>sum+p.end-p.start,0);
 for(const p of parts.slice().reverse())html=html.slice(0,p.start)+html.slice(p.end);
 const at=insert-offset;return html.slice(0,at)+preheaderHtml(text)+html.slice(at);
}
