import sanitize from 'sanitize-html';
import type {Campaign} from './email';
export function cleanHtml(html:string,full=false){return sanitize(html,{
 allowedTags:full?sanitize.defaults.allowedTags.concat(['html','head','body','meta','title','style','img','font','center']):['p','br','b','strong','em','i','u','s','span','div','h1','h2','h3','ul','ol','li','a'],
 allowedAttributes:full?{'*':['data-studio-preheader','data-studio-footer','style','class','id','align','valign','width','height','bgcolor','border','cellpadding','cellspacing','role','dir','lang','color','size','face'],a:['href','title','target','rel','style','class','id'],img:['src','alt','width','height','style','class'],meta:['charset','name','content']}: {'*':['style'],a:['href','title']},
 allowedSchemes:['https','mailto','tel'],allowedSchemesByTag:{img:['https']},allowProtocolRelative:false,allowVulnerableTags:true,
 exclusiveFilter:frame=>frame.tag==='meta'&&!['viewport','charset'].includes(frame.attribs.name||'charset'),
 transformTags:{'*':(tagName,attribs)=>{if(attribs.style)attribs.style=attribs.style.replace(/(?:expression|behavior|-moz-binding)\s*[:(][^;]*/gi,'').replace(/url\s*\([^)]*\)/gi,v=>/https:\/\//i.test(v)?v:'');return {tagName,attribs};}},
 textFilter:(text,tagName)=>tagName==='style'?text.replace(/@import[^;]*;/gi,'').replace(/(?:expression|behavior|-moz-binding)\s*[:(][^;}]*[;})]/gi,'').replace(/url\s*\([^)]*\)/gi,v=>/https:\/\//i.test(v)?v:''):text, nonTextTags:['script','textarea','option','noscript','iframe','object','embed'],
 });}
export function canonicalCampaign(c:Campaign):Campaign{return {...c,imported_html:cleanHtml(c.imported_html,true),blocks:c.blocks.map(b=>({...b,html:cleanHtml(b.html)}))};}
