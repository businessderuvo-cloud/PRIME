import test from 'node:test';
import assert from 'node:assert/strict';
import {mountZadarmaPhone} from './public/zadarma-phone.js';

test('Zadarma rejects public demo and unverified connections before requesting WebRTC',async()=>{
 for(const connection of [{demo:true,providers:[{provider:'zadarma',configured:true,demo:1}]},{demo:false,providers:[]}]){
  const calls=[];const phone=mountZadarmaPhone({api:async url=>{calls.push(url);return connection;},container:{},status:{}});
  await assert.rejects(phone.ensureMonitorStream(),/Collega e verifica/);
  assert.deepEqual(calls,['/api/connect/telephony']);phone.dispose();
 }
});

test('verified Zadarma connection starts monitoring once, sends the sequence automatically and cleans up',async()=>{
 const keys=['window','document','MediaStream'],originals=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]);
 let mounted=null,unregistered=0,clones=0;const calls=[],digits=[],requests=[];
 const track={kind:'audio',readyState:'live',clone(){clones++;return this;}};
 const sdk={webPhoneUA:{isRegistered:()=>true},callState:'',webCallSession:null,unreg(){unregistered++;},apiWidget:{call(number){calls.push(number);sdk.callState='talking';sdk.webCallSession={connection:{getReceivers:()=>[{track}]}};},sendDTMF(digit){digits.push(digit);}}};
 try{
  Object.defineProperty(globalThis,'window',{configurable:true,value:{io:{},DetectRTC:{},JsSIP:{},md5(){},zdrmWebPhone:sdk,zadarmaWidgetFn(){mounted={hidden:false,remove(){mounted=null;}};}}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:()=>mounted,createElement:()=>({}),head:{append(script){queueMicrotask(()=>script.onload());}}}});
  Object.defineProperty(globalThis,'MediaStream',{configurable:true,value:class{constructor(tracks){this.tracks=tracks;}getAudioTracks(){return this.tracks;}}});
  const connection={demo:false,providers:[{provider:'zadarma',configured:true,demo:0,verified_at:'2026-10-29',sip:'123456-101'}]};
  const phone=mountZadarmaPhone({api:async url=>{requests.push(url);return url.endsWith('/session')?{key:'test-key',sip:'123456-101'}:connection;},container:{append(){}},status:{}});
  assert.deepEqual(calls,[],'mounting alone must never start monitoring');
  const audio=await phone.ensureMonitorStream();assert.equal(audio.getAudioTracks().length,1);
  assert.deepEqual(calls,['007']);assert.deepEqual(digits,['1','0','0','4']);assert.equal(mounted.hidden,true);
  await phone.ensureMonitorStream();assert.deepEqual(calls,['007'],'reuse active monitor');assert.equal(clones,2);
  assert.equal(requests.filter(url=>url.endsWith('/session')).length,1);
  phone.dispose();phone.dispose();assert.equal(unregistered,2);assert.equal(mounted,null);
  await assert.rejects(phone.ensureMonitorStream(),/chiuso/);
 }finally{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
