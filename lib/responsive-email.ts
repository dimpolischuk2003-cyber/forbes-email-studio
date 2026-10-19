import {Parser} from 'htmlparser2';
import {stableImageUrl} from './brand';
/** Constrain fixed-width email containers without replacing content or links. */
export function responsiveEmail(html:string){
 const edits:{start:number;end:number;value:string}[]=[];
 const parser=new Parser({onopentag(tag,a){
  const width=Number((a.width||'').replace(/px$/,''));
  const constrain=tag==='table'&&width>=600;
  const image=tag==='img'&&width>=320;
  const stable=tag==='img'?stableImageUrl(a.src||''):'';const replaceSource=tag==='img'&&stable!==(a.src||'');
  if(!constrain&&!image&&!replaceSource)return;
  const open=html.slice(parser.startIndex,parser.endIndex+1);
  // Inline responsive sizing also helps clients that strip media queries.
  let updated=open.replace(/\swidth\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,constrain?' width="100%"':` width="${width}"`);
  if(replaceSource)updated=updated.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,()=>` src="${stable}"`);
  if(!constrain&&!image){edits.push({start:parser.startIndex,end:parser.endIndex+1,value:updated});return;}
  const css=constrain?`width:100%;max-width:${Math.min(width,600)}px;`:`width:100%;max-width:${width}px;height:auto;`;
  const kept=(a.style||'').replace(/(?:^|;)\s*(?:width|min-width|max-width|height)\s*:[^;]*/gi,'').replace(/;+/g,';').replace(/^;|;$/g,'');
  const value=(kept?kept+';':'')+css;
  const escaped=value.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
  if(/\sstyle\s*=/i.test(updated))updated=updated.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,()=>` style="${escaped}"`);else updated=updated.replace(/\s*\/?>$/,m=>` style="${escaped}"${m}`);
  edits.push({start:parser.startIndex,end:parser.endIndex+1,value:updated});
 }},{decodeEntities:true});parser.end(html);
 for(const edit of edits.reverse())html=html.slice(0,edit.start)+edit.value+html.slice(edit.end);
 const id='studio-mobile-layout';
 if(!html.includes(`id="${id}"`)){
  const footer=html.includes('data-studio-footer')?'body>table[role="none"],body>table[role="none"] table{background-color:#101010!important}#unsubscribe{color:#b5b5b5!important;font:12px/1.6 Arial,sans-serif!important}':'';
  const style=`<style id="${id}">@media(max-width:600px){table[width="600"]{width:100%!important;max-width:100%!important}td[width="560"]{width:auto!important}body{min-width:0!important}}${footer}</style>`;
  html=/<\/head\s*>/i.test(html)?html.replace(/<\/head\s*>/i,()=>style+'</head>'):style+html;
 }
 return html;
}

export function importedImageUrls(html:string){const urls:string[]=[];const p=new Parser({onopentag(tag,a){if(tag==='img'&&a.src)urls.push(a.src);}},{decodeEntities:true});p.end(html);return urls;}
