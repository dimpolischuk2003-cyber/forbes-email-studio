import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,rm,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const dir=join(process.cwd(),'.test-brand');await mkdir(dir,{recursive:true});
try{
 const out=join(dir,'brand.mjs');await build({stdin:{contents:"export * from './lib/email';export * from './lib/brand';export * from './lib/brand-email';export * from './lib/responsive-email';export * from './lib/sanitize';",resolveDir:process.cwd(),loader:'ts'},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
 const {renderEmail,emptyCampaign,brandLogoUrl,brandSocialLinks,stableBannerUrl,legacyBannerSource,brandExistingStudioEmail,responsiveEmail,canonicalCampaign}=await import(pathToFileURL(out));
 const f={senderName:'Forbes Україна',senderEmail:'events_contact@forbes.ua',address:'',unsubscribe:''};
 const c={...emptyCampaign,name:'Magazine',subject:'Magazine',headline:'Offer',body:'Text',button_text:'Register',button_url:'https://example.com/register',utm_enabled:false};
 const native=renderEmail(c,f);assert.ok(native.includes(`src="${brandLogoUrl}"`));assert.ok(native.includes('bgcolor="#101010"'));assert.ok(native.includes('mailto:support@forbes.ua'));assert.ok(native.includes('Ви отримали цю розсилку, тому що є читачем Forbes Ukraine'));
 for(const link of brandSocialLinks)assert.ok(native.includes(`href="${link.url}"`));
 assert.ok(!native.includes('href="#"'));assert.ok(!native.includes('tov-ujavi.esclick.me'));assert.ok(!native.includes('Керувати підписками або відписатися')); // No fake personal unsubscribe URL.
 const legacy=await readFile('tests/fixtures/legacy-studio-layout.html','utf8');
 assert.ok(legacy.includes(legacyBannerSource));const fixed=renderEmail({...c,blocks:[],imported_html:legacy,preheader:'Preview'},f);
 assert.ok(fixed.includes(brandLogoUrl));assert.ok(fixed.includes(stableBannerUrl));assert.ok(!fixed.includes(legacyBannerSource));assert.ok(fixed.includes('Оформити передплату – 1799 грн'));assert.ok(fixed.includes('Купити електронну передплату – 1350 грн'));
 assert.ok(fixed.includes('безкоштовна доставка'));assert.ok(fixed.includes('id="unsubscribe"'));assert.equal((fixed.match(/id="unsubscribe"/g)||[]).length,1);assert.ok(fixed.indexOf('id="unsubscribe"')>fixed.indexOf('Купити електронну передплату'));
 assert.ok(fixed.includes('table[width="600"]{width:100%!important'));assert.ok(fixed.includes('td[width="560"]{width:auto!important}'));assert.ok(!fixed.includes('<table class="wrap" role="presentation" width="600"'));assert.ok(!fixed.includes('role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin-bottom:22px"'));
 assert.ok(fixed.includes('display:block;padding:15px 24px;text-align:center'));assert.equal(brandExistingStudioEmail(brandExistingStudioEmail(legacy,f),f),brandExistingStudioEmail(legacy,f));assert.equal(responsiveEmail(fixed),fixed);
 const preserved='<html><head></head><body><table><tr><td>External template footer <a href="https://example.com/unsub">відписатися</a></td></tr></table></body></html>';assert.equal(brandExistingStudioEmail(preserved,f),preserved);
 const cleaned=canonicalCampaign({...c,imported_html:fixed}).imported_html;assert.ok(cleaned.includes('data-studio-header="true"'));assert.ok(cleaned.includes('data-studio-footer="true"'));assert.ok(cleaned.includes('id="unsubscribe"'));
 assert.equal(createHash('sha256').update(await readFile('public/brand/forbes-ukraine-black.png')).digest('hex'),'3b3faa1480e99e1bea4c0ff52403a4d40ec30394331441313abdf906908e900e');
 assert.ok((await readFile('public/brand/magazine-subscription-banner.jpg')).length>10000);
 console.log('PASS: official unchanged logo, five shared social links, support footer, sanitized received-email fixture, legacy layout migration, stable banner, full-area legacy CTAs, bottom unsubscribe preserved, idempotent transforms and external template source preservation.');
}finally{await rm(dir,{recursive:true,force:true});}
