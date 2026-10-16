import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {JSDOM}=require(process.env.JSDOM_MODULE_PATH||'jsdom');
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://studio.example.com',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;window.confirm=()=>false;
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
const directory=join(process.cwd(),'.test-navigation');await mkdir(directory,{recursive:true});
const adapters={name:'ui-isolation',setup(b){
 b.onResolve({filter:/^\.\/(email-editor|template-picker|audience-upload|campaign-statistics|connection-check)$/},args=>({path:args.path,namespace:'ui-test'}));
 b.onLoad({filter:/.*/,namespace:'ui-test'},()=>({contents:'export const BlockEditor=()=>null,HtmlEditor=()=>null,TemplatePicker=()=>null,AudienceUpload=()=>null,CampaignStatistics=()=>null,ConnectionCheck=()=>null;',loader:'js'}));
 if(process.argv.includes('--baseline'))b.onLoad({filter:/components\/studio\.tsx$/},async args=>{
  let source=await (await import('node:fs/promises')).readFile(args.path,'utf8');
  source=source.replace("function changeView(next:string){setView(next);setMobileMenu(false);setError('');}","async function changeView(next:string){if(dirty&&!locked)await save();setView(next);setMobileMenu(false);}").replace('onClick={()=>changeView(item.id)}',"onClick={()=>run('navigation',()=>changeView(item.id))}");
  return {contents:source,loader:'tsx',resolveDir:join(process.cwd(),'components')};
 });
}};
const outfile=join(directory,'studio.cjs');await build({entryPoints:['components/studio.tsx'],outfile,bundle:true,platform:'node',format:'cjs',packages:'external',jsx:'automatic',plugins:[adapters],logLevel:'silent'});
const Studio=require(outfile).default;
const config={senderName:'Forbes',senderEmail:'news@example.com',address:'Kyiv',unsubscribe:'https://example.com/unsubscribe',testEmail:'user@example.com',accountTimezone:'Europe/Kyiv',timezoneConfirmed:true,enabled:false,subscriptionsKeys:[]};
let draftPosts=0,recoveryPosts=0,releaseSave,submitted,saved=false;
function record(){return {id:'123',name:submitted?.data.name||'Saved',data:submitted?.data,revision:1,status:'draft',message_id:'123',broadcast_id:null,updated_at:new Date().toISOString()};}
const store=()=>({user:{name:'Tester',email:'user@example.com'},campaigns:saved?[record()]:[],templates:[],operations:[],pendingCreates:!saved&&submitted?[{token:submitted.token,template:false,name:submitted.data.name,status:'unknown'}]:[],config,connections:{esputnik:true}});
globalThis.fetch=async(url,options={})=>{
 if(url==='/api/studio'&&options.method==='POST'){draftPosts++;submitted=JSON.parse(options.body);return new Promise(resolve=>{releaseSave=()=>resolve(Response.json({error:'Create acknowledgement timed out',creation:{token:submitted.token,template:false}},{status:502}));});}
 if(url==='/api/recover'&&options.method==='POST'){recoveryPosts++;assert.equal(JSON.parse(options.body).token,submitted.token);saved=true;return Response.json({id:'123',revision:1});}
 if(url==='/api/studio')return Response.json(store());
 if(url==='/api/studio?id=123')return Response.json(record());
 if(url==='/api/segments')return Response.json({segments:[]});
 throw new Error('Unexpected UI request: '+url);
};
const root=createRoot(document.getElementById('root'));
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text||node.textContent.trim().startsWith(text));
async function click(node){assert.ok(node,'Missing button');await act(async()=>{node.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
async function input(node,value){assert.ok(node,'Missing input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
const sidebar=text=>button(text,document.querySelector('aside'));
try{
 await act(async()=>{root.render(React.createElement(Studio));});
 const name=[...document.querySelectorAll('label')].find(node=>node.textContent.includes('Назва кампанії')).querySelector('input');
 await input(name,'Unconfirmed draft retained');assert.ok(document.body.textContent.includes('Є незбережені зміни'));
 await click(sidebar('Кампанії'));assert.equal(document.querySelector('h1').textContent,'Кампанії');assert.equal(draftPosts,0,'Navigation must never create a draft');
 await click(sidebar('Створити лист'));assert.equal(document.querySelector('input').value,'Unconfirmed draft retained');
 await click(button('Зберегти чернетку'));assert.equal(draftPosts,1);
 await click(sidebar('Кампанії'));assert.equal(document.querySelector('h1').textContent,'Кампанії','Navigation must work during a pending POST');assert.equal(draftPosts,1);
 await act(async()=>{releaseSave();});
 await click(sidebar('Створити лист'));assert.equal(document.querySelector('input').value,'Unconfirmed draft retained');assert.ok(document.body.textContent.includes('Збереження потребує перевірки'));
 await click(button('Перевірити збереження'));assert.equal(recoveryPosts,1);assert.equal(draftPosts,1);assert.ok(document.body.textContent.includes('Чернетку знайдено'));
 const subject=document.querySelector('input[placeholder="Тема, яку побачить читач"]');await input(subject,'Keep this unsaved edit');
 await click(sidebar('Кампанії'));assert.equal(document.querySelector('h1').textContent,'Кампанії');assert.equal(draftPosts,1);
 await click(button('Відкрити'));assert.equal(document.querySelector('h1').textContent,'Кампанії');
 await click(sidebar('Створити лист'));assert.equal(document.querySelector('input[placeholder="Тема, яку побачить читач"]').value,'Keep this unsaved edit');
 console.log('PASS: real React DOM events, dirty navigation without POST, navigation during pending save, timeout handling, editor retention, read-only recovery action, no duplicate create, cancellation preserves unsaved edits. Child editors are isolated; no browser rendering is claimed.');
}finally{await act(async()=>root.unmount());dom.window.close();await rm(directory,{recursive:true,force:true});}
