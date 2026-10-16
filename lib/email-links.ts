import {Parser} from 'htmlparser2';
type Link={start:number;openEnd:number;end:number;url:string;text:string;system:boolean};
function links(html:string){
 const result:Link[]=[];let current:Link|undefined;
 const parser=new Parser({
  onopentag(tag,a){if(tag==='a'&&a.href!==undefined)current={start:parser.startIndex,openEnd:parser.endIndex+1,end:0,url:a.href,text:'',system:/unsubscribe|відпис|manage.?subscription/i.test(Object.values(a).join(' '))};},
  ontext(text){if(current)current.text+=text;},
  onclosetag(tag,implied){if(tag==='a'&&current){if(!implied){current.end=parser.endIndex+1;current.system=current.system||/unsubscribe|відпис|керувати\s+підпис|manage\s+subscription/i.test(current.text);result.push(current);}current=undefined;}},
 },{decodeEntities:true});parser.end(html);return result;
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function importedEmailLinks(html:string){return links(html).map(({url,system})=>({url,system}));}
export function mapImportedEmailLinks(html:string,track:(url:string)=>string){
 for(const link of links(html).reverse()){
  // Remove only the nonfunctional placeholder emitted by older Studio versions.
  if(link.url==='#'&&link.text.trim()==='Відписатися від розсилки'){html=html.slice(0,link.start)+html.slice(link.end);continue;}
  if(link.system||/[${}]/.test(link.url))continue;
  const url=track(link.url);if(!url||url===link.url)continue;
  const open=html.slice(link.start,link.openEnd).replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,()=>`href="${escape(url)}"`);
  html=html.slice(0,link.start)+open+html.slice(link.openEnd);
 }
 return html;
}
