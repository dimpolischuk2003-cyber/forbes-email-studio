import { z } from 'zod';
import {preheaderHtml,withPreheader} from './preheader';
import {mapImportedEmailLinks,importedEmailLinks} from './email-links';

export const designs = [
  { id: 'standard', name: 'Forbes Standard', label: 'Редакційний', description: 'Виразний заголовок, текст і одна основна дія', color: '#111827' },
  { id: 'event', name: 'Event', label: 'Події', description: 'Запрошення, програма та реєстрація', color: '#235a8a' },
  { id: 'magazine', name: 'Magazine', label: 'Журнал', description: 'Обкладинка, головна тема та замовлення', color: '#a5272d' },
  { id: 'subscription', name: 'Subscription', label: 'Підписка', description: 'Цінність доступу та пропозиція читачеві', color: '#184d42' },
  { id: 'minimal', name: 'Minimal', label: 'Короткий лист', description: 'Пряме звернення без зайвих блоків', color: '#282828' },
  { id: 'digest', name: 'Digest', label: 'Добірка', description: 'Текстові блоки з редакційною ієрархією', color: '#584273' },
] as const;
export const scenarios = ['Анонс', 'Продаж', 'Last call', 'Нагадування', 'Реактивація', 'Новий номер журналу', 'Продаж підписки', 'Контентна добірка', 'Промо / спецпропозиція', 'Після події'];
export const blockSchema=z.object({id:z.string().max(80),type:z.enum(['heading','text','image','button','divider']),text:z.string().max(15000),html:z.string().max(30000).default(''),url:z.string().max(2000),alt:z.string().max(300),fontSize:z.number().int().min(10).max(64),align:z.enum(['left','center','right'])});
export type EmailBlock=z.infer<typeof blockSchema>;
export function newBlock(type:EmailBlock['type']):EmailBlock{return {id:crypto.randomUUID(),type,text:type==='heading'?'Заголовок листа':type==='text'?'Додайте текст листа.':type==='button'?'Дізнатися більше':'',html:'',url:'',alt:'',fontSize:type==='heading'?36:16,align:'left'};}
export function campaignBlocks(c:Campaign):EmailBlock[]{if(c.blocks?.length)return c.blocks;return [{...newBlock('heading'),text:c.headline},{...newBlock('text'),text:c.body},...(c.image_url?[{...newBlock('image'),url:c.image_url}]:[]),...(c.button_text?[{...newBlock('button'),text:c.button_text,url:c.button_url}]:[])];}
export const campaignSchema = z.object({
  blocks:z.array(blockSchema).max(80).default([]), imported_html:z.string().max(350000).default(''), template_source:z.string().max(200).default(''),
  name: z.string().max(200), design: z.enum(['standard','event','magazine','subscription','minimal','digest']),
  scenario: z.string().max(100), brief: z.string().max(8000), message: z.string().max(4000),
  tone: z.string().max(1000), subject: z.string().max(200), subjects: z.array(z.string().max(200)).max(3),
  preheader: z.string().max(300), headline: z.string().max(300), body: z.string().max(15000),
  button_text: z.string().max(100), button_url: z.string().max(2000), image_url: z.string().max(2000),
  segment_id: z.number().int().positive().nullable(), utm_enabled: z.boolean(),
  utm_source: z.string().max(100), utm_medium: z.string().max(100), utm_campaign: z.string().max(200),
  send_mode: z.enum(['now','schedule']), scheduled_at: z.string().max(30), timezone: z.string().max(100),
});
export type Campaign = z.infer<typeof campaignSchema>;
export const emptyCampaign: Campaign = {blocks:[],imported_html:'',template_source:'',name:'',design:'standard',scenario:'Анонс',brief:'',message:'',tone:'Діловий, зрозумілий. Без перебільшень. До 180 слів.',subject:'',subjects:[],preheader:'',headline:'',body:'',button_text:'Дізнатися більше',button_url:'',image_url:'',segment_id:null,utm_enabled:true,utm_source:'esputnik',utm_medium:'email',utm_campaign:'',send_mode:'now',scheduled_at:'',timezone:'Europe/Kyiv'};
export type Footer = { senderName: string; senderEmail: string; address: string; unsubscribe: string };
export const defaultFooter: Footer = {senderName:'Forbes Україна',senderEmail:'',address:'',unsubscribe:''};
export function escapeHtml(v: string) { return v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
export function validUrl(v:string) {try {const u=new URL(v);return u.protocol==='https:' && !u.username && !u.password;} catch {return false;} }
export function trackedUrl(c:Campaign) {
  if (!validUrl(c.button_url)) return '';
  const url=new URL(c.button_url);
  if(c.utm_enabled){url.searchParams.set('utm_source',c.utm_source);url.searchParams.set('utm_medium',c.utm_medium);url.searchParams.set('utm_campaign',c.utm_campaign);}
  return url.toString();
}
export function validateForSend(c:Campaign, f:Footer) {
  const missing: string[]=[];
  if(!c.name.trim())missing.push('Назва кампанії');
  if(!c.subject.trim())missing.push('Тема листа');
  if(c.imported_html){if(!c.imported_html.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,'').trim())missing.push('Контент шаблону');}
  else if(c.blocks?.length){
   if(!c.blocks.some(b=>(b.type==='text'||b.type==='heading')&& (b.text.trim()||b.html.replace(/<[^>]*>/g,'').trim())))missing.push('Текст листа');
   for(const b of c.blocks){if(b.type==='button'&&(!b.text.trim()||!validUrl(b.url)))missing.push('Текст та HTTPS-посилання кнопки');if(b.type==='image'&&!validUrl(b.url))missing.push('HTTPS-посилання зображення');}
  }else{if(!c.headline.trim())missing.push('Заголовок');if(!c.body.trim())missing.push('Текст листа');if(c.button_text&&!validUrl(c.button_url))missing.push('HTTPS-посилання кнопки');}
  if(c.image_url&&!validUrl(c.image_url))missing.push('HTTPS-посилання зображення');
  if(c.utm_enabled&&(!c.utm_campaign.trim()||!c.utm_source.trim()||!c.utm_medium.trim()))missing.push('UTM-мітки');
  if(!f.senderEmail||!f.senderName.trim())missing.push('Відправник');
  return missing;
}
export function renderEmail(c:Campaign, f:Footer=defaultFooter, preview=false) {
 if(c.imported_html){
  const html=mapImportedEmailLinks(c.imported_html,url=>url===f.unsubscribe?url:trackLink(c,url));
  return withPreheader(html,c.preheader);
 }
 const d=designs.find(d=>d.id===c.design)!; const e=escapeHtml;
 const minimal=c.design==='minimal', magazine=c.design==='magazine', digest=c.design==='digest';
 const headline=c.headline||(preview?'Заголовок вашого листа':'');
 const body=c.body||(preview?'Додайте текст вручну у редакторі блоків.\n\nОбраний дизайн зберігає структуру листа та стиль Forbes.':'');
 const paragraphs=body.split(/\n\s*\n/).filter(Boolean).map((p,i)=>digest?`<table role="presentation" width="100%" style="border-top:1px solid #dedee4;margin:20px 0"><tr><td width="36" valign="top" style="padding-top:18px;font:22px Georgia;color:${d.color}">${String(i+1).padStart(2,'0')}</td><td style="padding-top:18px;font:16px/1.65 Arial;color:#242831">${e(p).replace(/\n/g,'<br>')}</td></tr></table>`:`<p style="margin:0 0 20px;font:16px/1.7 Arial;color:#30343b">${e(p).replace(/\n/g,'<br>')}</p>`).join('');
 const image=c.image_url&&validUrl(c.image_url)?`<tr><td style="padding:${magazine?'24px 72px':'0'}"><img alt="${e(headline)}" src="${e(c.image_url)}" width="${magazine?'440':'600'}" style="display:block;width:100%;height:auto;border:0"></td></tr>`:'';
 const url=trackedUrl(c);
 return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.subject)}</title><style>@media(max-width:600px){.wrap{width:100%!important}.pad{padding:24px!important}.heading{font-size:32px!important}}</style></head><body style="margin:0;background:${minimal?'#ffffff':'#f0f1f3'}">${preheaderHtml(c.preheader)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 0"><table class="wrap" role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:white"><tr><td style="padding:26px 32px;border-bottom:${minimal?'1':'3'}px solid ${d.color}"><span style="font:bold 42px Georgia,serif;letter-spacing:-2px;color:#101010">Forbes</span><span style="font:10px Arial;letter-spacing:2px;padding-left:12px;color:#555">УКРАЇНА</span></td></tr>${c.blocks?.length?'':image}<tr><td class="pad" style="padding:32px;${c.design==='subscription'?'background:#f5f9f7;':''}">${c.blocks?.length?renderBlocks(c,d.color):`${!minimal?`<p style="font:bold 11px Arial;letter-spacing:2px;text-transform:uppercase;color:${d.color};margin:0 0 14px">${e(d.label)}</p>`:''}<h1 class="heading" style="font:${minimal?'normal 30':'bold 38'}px/1.15 Georgia,serif;letter-spacing:-.7px;margin:0 0 24px;color:#16191f">${e(headline)}</h1>${paragraphs}${c.button_text?`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${d.color}" style="padding:15px 24px"><a href="${e(preview?'#':(url||'#'))}" style="font:bold 15px Arial;color:white;text-decoration:none">${e(c.button_text)}</a></td></tr></table>`:''}`}</td></tr><tr><td style="padding:24px 32px;border-top:1px solid #e6e6e6;font:12px/1.7 Arial;color:#737780">${e(f.senderName)}<br>${e(f.address)}</td></tr></table></td></tr></table></body></html>`;
}

export function trackLink(c:Campaign,value:string){if(!validUrl(value))return '';const url=new URL(value);if(c.utm_enabled){url.searchParams.set('utm_source',c.utm_source);url.searchParams.set('utm_medium',c.utm_medium);url.searchParams.set('utm_campaign',c.utm_campaign);}return url.toString();}
function renderBlocks(c:Campaign,color:string){return c.blocks.map(b=>{
 const e=escapeHtml;const style=`text-align:${b.align};font-size:${b.fontSize}px;line-height:1.6;color:#242831;margin:0 0 22px`;
 if(b.type==='divider')return '<hr style="border:0;border-top:1px solid #dedee4;margin:24px 0">';
 if(b.type==='image')return validUrl(b.url)?`<div style="text-align:${b.align};margin:0 0 22px"><img src="${e(b.url)}" alt="${e(b.alt)}" width="536" style="max-width:100%;height:auto;display:inline-block;border:0"></div>`:'';
 if(b.type==='button')return `<table role="presentation" align="${b.align}" cellpadding="0" cellspacing="0" style="margin-bottom:22px"><tr><td bgcolor="${color}" style="padding:15px 24px"><a href="${e(trackLink(c,b.url)||'#')}" style="font:bold ${b.fontSize}px Arial;color:#fff;text-decoration:none">${e(b.text)}</a></td></tr></table><div style="clear:both"></div>`;
 const content=(b.html?b.html.replace(/<a\b([^>]*?)href="([^"]*)"([^>]*)>/gi,(all,a,url,tail)=>`<a${a}href="${e(trackLink(c,url.replace(/&amp;/g,'&'))||url)}"${tail}>`):'')||e(b.text).replace(/\n/g,'<br>');return b.type==='heading'?`<div style="${style};font-family:Georgia,serif;font-weight:bold;line-height:1.2">${content}</div>`:`<div style="${style};font-family:Arial">${content}</div>`;
 }).join('');}
export function campaignLinks(c:Campaign){if(c.imported_html)return importedEmailLinks(c.imported_html).filter(link=>validUrl(link.url)).map(link=>link.system?link.url:trackLink(c,link.url));return c.blocks?.length?c.blocks.filter(b=>b.type==='button').map(b=>trackLink(c,b.url)):[trackedUrl(c)].filter(Boolean);}

export function emailText(c:Campaign){if(c.imported_html)return c.imported_html.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(c.blocks.length)return c.blocks.filter(b=>b.type!=='divider').map(b=>b.text||b.alt).filter(Boolean).join('\n\n');return [c.headline,c.body,c.button_text,c.button_url].filter(Boolean).join('\n\n');}
