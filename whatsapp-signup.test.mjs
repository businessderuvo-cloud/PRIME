import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderConnect } from './public/connect.js';
test('Base version shows WhatsApp coming soon without loading Meta SDK',async()=>{
 const saved={window:globalThis.window,location:globalThis.location,document:globalThis.document};
 const main={innerHTML:'',querySelector(){return {before(){},after(){},querySelector(){return null;}};},querySelectorAll(){return [];}};
 globalThis.document={createElement(){return {className:'',innerHTML:'',before(){},after(){},querySelector(){return {disabled:true,addEventListener(){}};},querySelectorAll(){return [];}};}};
 let sdkCalls=0;
 globalThis.window={addEventListener(){},removeEventListener(){},FB:{init(){sdkCalls++;}}};
 globalThis.location={search:'',origin:'https://prime.example'};
 try{
  await renderConnect({main,state:{me:{role:'agent'},data:{}},api:async()=>({providers:[{provider:'whatsapp',configured:true}],connections:[],mailProviders:[],mail:[],conflicts:[],requests:[]}),esc:String,pageHeader:()=>'',toast(){}});
  assert.match(main.innerHTML,/In arrivo/);assert.doesNotMatch(main.innerHTML,/data-action="whatsapp-signup"/);assert.equal(sdkCalls,0);
 }finally{for(const [key,value]of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
});
