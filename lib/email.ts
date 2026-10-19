import { z } from 'zod';
import {stableImageUrl} from './brand';
import {brandHeaderHtml,brandFooterCell,brandExistingStudioEmail} from './brand-email';
import {responsiveEmail,importedImageUrls} from './responsive-email';
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
export const emailFonts=['Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Times New Roman','Courier New'] as const;
export const colorSchema=z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const blockSchema=z.object({id:z.string().max(80),type:z.enum(['heading','text','image','button','divider']),text:z.string().max(15000),html:z.string().max(30000).default(''),url:z.string().max(2000),alt:z.string().max(300),fontSize:z.number().int().min(10).max(64),align:z.enum(['left','center','right']),fontFamily:z.enum(emailFonts).optional(),textColor:colorSchema.optional(),buttonTextAlign:z.enum(['left','center','right']).optional(),imageLink:z.string().max(2000).optional(),borderWidth:z.number().int().min(0).max(8).optional(),borderColor:colorSchema.optional(),borderRadius:z.number().int().min(0).max(32).optional(),padding:z.number().int().min(0).max(48).optional(),dividerWidth:z.number().int().min(10).max(100).optional(),dividerStyle:z.enum(['solid','dashed','dotted']).optional()});
export type EmailBlock=z.infer<typeof blockSchema>;
export function newBlock(type:EmailBlock['type']):EmailBlock{return {id:crypto.randomUUID(),type,text:type==='heading'?'Заголовок листа':type==='text'?'Додайте текст листа.':type==='button'?'Дізнатися більше':'',html:'',url:'',alt:'',fontSize:type==='heading'?36:16,align:'left'};}
export function campaignBlocks(c:Campaign):EmailBlock[]{if(c.blocks?.length)return c.blocks;return [{...newBlock('heading'),text:c.headline},{...newBlock('text'),text:c.body},...(c.image_url?[{...newBlock('image'),url:c.image_url}]:[]),...(c.button_text?[{...newBlock('button'),text:c.button_text,url:c.button_url}]:[])];}
export const campaignSchema = z.object({
  blocks:z.array(blockSchema).max(80).default([]), imported_html:z.string().max(350000).default(''), template_source:z.string().max(200).default(''),
  theme:z.enum(['light','dark']).optional(),
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
export type Footer = { senderName: string; senderEmail: string; address: string; unsubscribe: string; logoUrl?:string; footerLinks?:{label:string;url:string}[] };
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
  if(c.imported_html){if(importedImageUrls(c.imported_html).some(isDriveUrl))missing.push('Імпортуйте зображення з Google Drive кнопкою біля адреси');if(!c.imported_html.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,'').trim())missing.push('Контент шаблону');}
  else if(c.blocks?.length){
   if(!c.blocks.some(b=>(b.type==='text'||b.type==='heading')&& (b.text.trim()||b.html.replace(/<[^>]*>/g,'').trim())))missing.push('Текст листа');
   for(const b of c.blocks){if(b.type==='button'&&(!b.text.trim()||!validUrl(b.url)))missing.push('Текст та HTTPS-посилання кнопки');if(b.type==='image'&&!validUrl(b.url))missing.push('HTTPS-посилання зображення');if(b.type==='image'&&isDriveUrl(b.url))missing.push('Імпортуйте зображення з Google Drive кнопкою біля адреси');if(b.imageLink&&!validUrl(b.imageLink))missing.push('HTTPS-посилання банера');}
  }else{if(!c.headline.trim())missing.push('Заголовок');if(!c.body.trim())missing.push('Текст листа');if(c.button_text&&!validUrl(c.button_url))missing.push('HTTPS-посилання кнопки');}
  if(c.image_url&&!validUrl(c.image_url))missing.push('HTTPS-посилання зображення');
  if(c.utm_enabled&&(!c.utm_campaign.trim()||!c.utm_source.trim()||!c.utm_medium.trim()))missing.push('UTM-мітки');
  if(!f.senderEmail||!f.senderName.trim())missing.push('Відправник');
  return missing;
}
export function renderEmail(c:Campaign, f:Footer=defaultFooter, preview=false) {
 if(c.imported_html){
  const html=mapImportedEmailLinks(c.imported_html,url=>url===f.unsubscribe?url:trackLink(c,url));
  return withPreheader(responsiveEmail(brandExistingStudioEmail(html,f)),c.preheader);
 }
 const d=designs.find(d=>d.id===c.design)!;const e=escapeHtml;const dark=c.theme==='dark';
 const bg=dark?'#171717':'#ffffff',outer=dark?'#101010':'#f0f1f3',ink=dark?'#f0f0f0':'#242831',muted=dark?'#bfc3ca':'#737780';
 const blocks=c.blocks.length?c.blocks:campaignBlocks({...c,headline:c.headline||(preview?'Заголовок вашого листа':''),body:c.body||(preview?'Додайте текст вручну у редакторі блоків.':'')});
 const logo=brandHeaderHtml(f);
 return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(c.subject)}</title><style>body{margin:0;padding:0;-webkit-text-size-adjust:100%;text-size-adjust:100%}table{border-collapse:collapse}img{border:0;height:auto;max-width:100%}body>table[role="none"],body>table[role="none"] table{background-color:#101010!important}#unsubscribe{color:#b5b5b5!important;font:12px/1.6 Arial,sans-serif!important}.studio-copy{overflow-wrap:break-word;word-break:break-word}.studio-copy p{margin:0 0 16px}.studio-copy p:last-child{margin-bottom:0}@media(max-width:600px){.studio-wrap,table[width="600"]{width:100%!important;max-width:100%!important}td[width="560"]{width:auto!important}.studio-pad{padding:22px 18px!important}.studio-heading{font-size:30px!important}}@media(prefers-color-scheme:dark){.studio-surface{background-color:#171717!important}.studio-ink{color:#f0f0f0!important}.studio-muted{color:#bfc3ca!important}}</style></head><body style="margin:0;padding:0;background-color:${outer}">${preheaderHtml(c.preheader)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background-color:${outer}"><tr><td align="center" style="padding:16px 0"><table class="studio-wrap studio-surface" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="width:100%;max-width:600px;table-layout:fixed;background-color:${bg}"><tr><td data-studio-header="true" class="studio-pad" bgcolor="#ffffff" style="padding:26px 32px;background-color:#ffffff;border-bottom:3px solid ${d.color}">${logo}</td></tr><tr><td class="studio-pad studio-ink" style="padding:32px;color:${ink}">${renderBlocks({...c,blocks},d.color,ink)}</td></tr><tr>${brandFooterCell(f)}</tr></table></td></tr></table></body></html>`;
}

export function isDriveUrl(value:string){try{const u=new URL(value);return u.hostname==='drive.google.com';}catch{return false;}}
export function trackLink(c:Campaign,value:string){if(!validUrl(value))return '';const url=new URL(value);if(c.utm_enabled){url.searchParams.set('utm_source',c.utm_source);url.searchParams.set('utm_medium',c.utm_medium);url.searchParams.set('utm_campaign',c.utm_campaign);}return url.toString();}
function renderBlocks(c:Campaign,color:string,ink:string){return c.blocks.map(b=>{
 const e=escapeHtml,font=b.fontFamily||(b.type==='heading'?'Georgia':'Arial'),textColor=b.textColor||ink;
 const border=b.borderWidth?`border:${b.borderWidth}px solid ${b.borderColor||'#cccccc'};border-radius:${b.borderRadius||0}px;padding:${b.padding??16}px;`:b.padding?`padding:${b.padding}px;`:'';
 const style=`text-align:${b.align};font-size:${b.fontSize}px;line-height:1.6;color:${textColor};font-family:'${font}',${['Georgia','Times New Roman'].includes(font)?'serif':'sans-serif'};${border}`;
 let content='';
 if(b.type==='divider')content=`<table role="presentation" align="${b.align}" width="${b.dividerWidth||100}%" cellpadding="0" cellspacing="0" style="width:${b.dividerWidth||100}%;margin:0"><tr><td style="border-top:${b.borderWidth??1}px ${b.dividerStyle||'solid'} ${b.borderColor||'#dedee4'};font-size:0;line-height:0">&nbsp;</td></tr></table>`;
 else if(b.type==='image'){
  if(!validUrl(b.url))return '';
  const img=`<img src="${e(stableImageUrl(b.url))}" alt="${e(b.alt)}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0">`;
  content=`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="${b.align}" style="${border}">${b.imageLink&&validUrl(b.imageLink)?`<a href="${e(trackLink(c,b.imageLink))}" target="_blank" style="display:block;text-decoration:none">${img}</a>`:img}</td></tr></table>`;
 }else if(b.type==='button'){
  content=`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="${b.align}" style="${border}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:100%"><tr><td bgcolor="${color}" align="${b.buttonTextAlign||'center'}" style="background-color:${color};border-radius:${b.borderRadius||0}px"><a href="${e(trackLink(c,b.url)||'#')}" target="_blank" style="display:block;padding:15px 24px;mso-padding-alt:0;mso-text-raise:1px;border:1px solid ${color};font:bold ${b.fontSize}px/1.4 '${font}',Arial,sans-serif;color:${b.textColor||'#ffffff'};text-decoration:none;text-align:${b.buttonTextAlign||'center'};overflow-wrap:break-word">${e(b.text)}</a></td></tr></table></td></tr></table>`;
 }else{
  const text=(b.html?b.html.replace(/<a\b([^>]*?)href="([^"]*)"([^>]*)>/gi,(all,a,url,tail)=>`<a${a}href="${e(trackLink(c,url.replace(/&amp;/g,'&'))||url)}"${tail}>`):'')||e(b.text).replace(/\n/g,'<br>');
  content=`<div class="studio-copy ${!b.textColor?'studio-ink':''} ${b.type==='heading'?'studio-heading':''}" style="${style}${b.type==='heading'?'font-weight:bold;line-height:1.2;':''}">${text}</div>`;
 }
 return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed"><tr><td style="padding:0 0 22px">${content}</td></tr></table>`;
 }).join('');}
export function campaignLinks(c:Campaign){if(c.imported_html)return importedEmailLinks(c.imported_html).filter(link=>validUrl(link.url)).map(link=>link.system?link.url:trackLink(c,link.url));return c.blocks?.length?c.blocks.flatMap(b=>b.type==='button'?[trackLink(c,b.url)]:b.type==='image'&&b.imageLink?[trackLink(c,b.imageLink)]:[]).filter(Boolean):[trackedUrl(c)].filter(Boolean);}

export function emailText(c:Campaign){if(c.imported_html)return c.imported_html.replace(/<(style|head)[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(c.blocks.length)return c.blocks.filter(b=>b.type!=='divider').map(b=>b.text||b.alt).filter(Boolean).join('\n\n');return [c.headline,c.body,c.button_text,c.button_url].filter(Boolean).join('\n\n');}
