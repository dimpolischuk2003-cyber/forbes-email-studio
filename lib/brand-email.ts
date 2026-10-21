import {Parser} from 'htmlparser2';
import {brandLogoUrl,brandSocialLinks,socialIconUrl} from './brand';
type BrandSettings={logoUrl?:string;footerLinks?:{label:string;url:string}[];address:string};
const e=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const https=(v:string)=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export function brandHeaderHtml(f:BrandSettings){const logo=f.logoUrl&&https(f.logoUrl)?f.logoUrl:brandLogoUrl;return `<img src="${e(logo)}" alt="Forbes Україна" width="180" height="45" style="display:block;width:180px;max-width:100%;height:auto;border:0;background-color:#ffffff">`;}
export function brandFooterHtml(f:BrandSettings){
 const links=(f.footerLinks??brandSocialLinks).filter(link=>https(link.url)).map(link=>{
  const icon=socialIconUrl(link.url);
  return `<a href="${e(link.url)}" target="_blank" title="${e(link.label)}" style="display:inline-block;padding:10px 12px 10px 0;vertical-align:middle;color:#ffffff;font:12px/1.5 Arial,sans-serif;text-decoration:none">${icon?`<img src="${e(icon)}" alt="${e(link.label)}" width="24" height="24" style="display:block;width:24px;height:24px;max-width:24px;border:0;background-color:#101010">`:e(link.label)}</a>`;
 }).join('');
 return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed"><tr><td style="padding:0 0 16px;color:#ffffff;font:12px/1.5 Arial,sans-serif">${links}</td></tr><tr><td align="right" style="text-align:right;color:#ffffff;font:14px/1.6 Arial,sans-serif">З питань підписки на Forbes Digital<br><a href="mailto:support@forbes.ua" style="color:#ffffff;text-decoration:underline">support@forbes.ua</a></td></tr><tr><td align="center" style="padding-top:24px;text-align:center;color:#b5b5b5;font:12px/1.6 Georgia,serif">Ви отримали цю розсилку, тому що є читачем Forbes Ukraine${f.address?`<br>${e(f.address).replace(/\n/g,'<br>')}`:''}</td></tr></table>`;
}
export function brandFooterCell(f:BrandSettings){return `<td data-studio-footer="true" class="studio-pad" bgcolor="#101010" style="padding:24px 32px;background-color:#101010;border-top:1px solid #333333;color:#ffffff;overflow-wrap:break-word">${brandFooterHtml(f)}</td>`;}
type NodeRange={tag:string;a:Record<string,string>;start:number;openEnd:number;closeStart:number;end:number;text:string};
/** Upgrade only slots owned by Studio; external template footers stay untouched. */
export function brandExistingStudioEmail(html:string,f:BrandSettings){
 const nodes:NodeRange[]=[],stack:NodeRange[]=[];
 const p=new Parser({onopentag(tag,a){const node={tag,a,start:p.startIndex,openEnd:p.endIndex+1,closeStart:0,end:0,text:''};if(['td','table'].includes(tag))stack.push(node);},ontext(text){for(const node of stack)node.text+=text;},onclosetag(tag,implied){if(!['td','table'].includes(tag))return;const i=stack.map(n=>n.tag).lastIndexOf(tag);if(i<0)return;const [node]=stack.splice(i,1);if(!implied){node.closeStart=p.startIndex;node.end=p.endIndex+1;nodes.push(node);}}},{decodeEntities:true});p.end(html);
 const legacy=html.includes('forbes-studio-preheader')&&nodes.some(n=>n.tag==='td'&&/border-bottom/.test(n.a.style||'')&&/^Forbes\s*УКРАЇНА$/.test(n.text.trim()));
 const edits:{start:number;end:number;value:string}[]=[];
 const header=nodes.find(n=>n.tag==='td'&&(n.a['data-studio-header']==='true'||(legacy&&/border-bottom/.test(n.a.style||'')&&/^Forbes\s*УКРАЇНА$/.test(n.text.trim()))));
 if(header){const opening=html.slice(header.start,header.openEnd);let patched=opening.replace(/\sbgcolor\s*=\s*(?:"[^"]*"|'[^']*')/i,'');const kept=(header.a.style||'').replace(/(?:^|;)\s*background(?:-color)?\s*:[^;]*/gi,'').replace(/;+/g,';').replace(/^;|;$/g,'');const style=kept+';background-color:#ffffff';const escaped=e(style);if(/\sstyle\s*=/i.test(patched))patched=patched.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i,()=>` style="${escaped}"`);else patched=patched.replace(/>$/,` style="${escaped}">`);if(!header.a['data-studio-header'])patched=patched.replace(/>$/,' data-studio-header="true">');edits.push({start:header.start,end:header.closeStart,value:patched+brandHeaderHtml(f)});}
 const footer=nodes.find(n=>n.tag==='td'&&(n.a['data-studio-footer']==='true'||(legacy&&/border-top/.test(n.a.style||'')&&/font:12px/.test(n.a.style||'')&&/^Forbes Україна\s*$/.test(n.text.trim()))));
 if(footer){const source=html.slice(footer.openEnd,footer.closeStart);if(!/id\s*=\s*["']unsubscribe|керувати\s+підпис|відписатися/i.test(source))edits.push({start:footer.start,end:footer.end,value:brandFooterCell(f)});}
 if(legacy){for(const node of nodes.filter(n=>n.tag==='table'&&['left','center','right'].includes(n.a.align)&&/margin-bottom:22px/.test(n.a.style||''))){let content=html.slice(node.start,node.end);const padding=/<td\b[^>]*style="[^"]*padding:([^;"]+)/i.exec(content)?.[1]||'15px 24px';content=content.replace(/(<table\b[^>]*?)\s+align="(?:left|center|right)"/i,'$1').replace(/(<td\b[^>]*style=")([^"]*)/i,(_all,open,style)=>open+style.replace(/padding:[^;]+;?/i,''));content=content.replace(/(<a\b[^>]*style=")([^"]*)/i,(_all,open,style)=>`${open}${style};display:block;padding:${e(padding)};text-align:center`);edits.push({start:node.start,end:node.end,value:`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed"><tr><td align="${node.a.align}">${content}</td></tr></table>`});}}
 for(const edit of edits.sort((a,b)=>b.start-a.start))html=html.slice(0,edit.start)+edit.value+html.slice(edit.end);
 return html;
}
