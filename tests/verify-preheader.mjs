import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const directory=join(process.cwd(),'.test-preheader');await mkdir(directory,{recursive:true});
try{
 const outfile=join(directory,'helpers.mjs');
 await build({stdin:{contents:"export * from './lib/preheader';export * from './lib/email';export * from './lib/sanitize';",resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
 const {withPreheader,preheaderHtml,readPreheader,renderEmail,canonicalCampaign,emptyCampaign}=await import(pathToFileURL(outfile));
 const content='<table><tr><td><a href="https://example.com/button?x=1&amp;y=2">Button text</a><img src="https://example.com/image.png"></td></tr></table>';
 const letter='<!doctype html><html><head><style>.x{color:red}</style></head><body>'+content+'</body></html>';
 const value='Тест — журнал & події <сьогодні> "Forbes" 🗞️';
 const first=withPreheader(letter,value);assert.equal(readPreheader(first),value);assert.ok(first.includes(content));assert.ok(first.indexOf('forbes-studio-preheader')>first.indexOf('<body>'));assert.ok(first.includes('&amp; події &lt;сьогодні&gt;'));
 const next=withPreheader(first,'Другий прехедер');assert.equal(readPreheader(next),'Другий прехедер');assert.equal((next.match(/id="forbes-studio-preheader"/g)||[]).length,1);assert.ok(!next.includes('Тест — журнал'));assert.ok(next.includes(content));
 assert.equal(withPreheader(next,'Другий прехедер'),next);
 const cleared=withPreheader(next,'');assert.equal(readPreheader(cleared),'');assert.ok(!cleared.includes('Другий прехедер'));assert.ok(cleared.includes(content));
 const legacy='<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Legacy&#847; &#847; &#847;</div>';
 assert.equal(readPreheader(legacy),'Legacy');assert.ok(!withPreheader('<body>'+legacy+content+'</body>','Updated').includes('Legacy'));
 const provider="<DIV CLASS='other esd-hidden-preheader' style='display:none'><span>Старий &amp; текст</span>&#8199;&#847;</DIV>";
 assert.equal(readPreheader(provider),'Старий & текст');const adapted=withPreheader('<body>'+provider+content+'</body>','Актуальний');assert.equal(readPreheader(adapted),'Актуальний');assert.ok(!adapted.includes('Старий'));assert.ok(adapted.includes(content));
 const duplicated=withPreheader('<body>'+preheaderHtml('one')+preheaderHtml('two')+content+'</body>','Only one');assert.equal((duplicated.match(/id="forbes-studio-preheader"/g)||[]).length,1);assert.ok(duplicated.includes(content));
 const malformed='<body><div class="esd-hidden-preheader">Unclosed'+content+'</body>';assert.ok(withPreheader(malformed,'Safe').includes(content));
 const hidden='<div style="display:none">Unrelated hidden content</div>';assert.ok(withPreheader('<body>'+hidden+content+'</body>','New').includes(hidden));
 const pixel='<div style="display:none;max-height:0;overflow:hidden;mso-hide:all"><img src="https://example.com/pixel.png"></div>';assert.ok(withPreheader('<body>'+pixel+content+'</body>','New').includes(pixel));
 for(const imported_html of ['',letter]){
  const c=canonicalCampaign({...emptyCampaign,name:'Test',subject:'Subject',headline:'Headline',body:'Body',button_text:'',preheader:value,imported_html});
  for(const preview of [false,true]){const html=renderEmail(c,undefined,preview);assert.equal(readPreheader(html),value);assert.equal(readPreheader(canonicalCampaign({...c,imported_html:html}).imported_html),value);assert.equal((html.match(/id="forbes-studio-preheader"/g)||[]).length,1);}
 }
 assert.equal(readPreheader('<div class="esd-hidden-preheader">Actual<script>ignored()</script> text</div>'),'Actual text');
 console.log('PASS: preheader HTML on native/imported templates, provider class and legacy block, entity decoding, nested markup, replacement/clearing without duplicates, source preservation, malformed input, sanitization and preview/send consistency.');
}finally{await rm(directory,{recursive:true,force:true});}
