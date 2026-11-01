import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createApp} from './server.mjs';
import {createGeocoder,exactAddressCandidate} from './src/map-geocoding.mjs';
import {buildMapLocations,propertyStatus,statuses} from './public/map-locations.js';

const candidate=(number='12',lat=45.46)=>({latitude:lat,longitude:9.19,label:'Via Roma '+number+', Milano',address:{road:'Via Roma',house_number:number,city:'Milano'}});
test('automatic matching requires street, city and exact civic number, and rejects ambiguous houses',()=>{
 const address={street:'VIA ROMA',number:'12/A',city:'Milano'};
 assert.equal(exactAddressCandidate([candidate('12 A')],address)?.latitude,45.46);
 assert.equal(exactAddressCandidate([candidate('12')],address),null);
 assert.equal(exactAddressCandidate([{...candidate('12/A'),address:{...candidate('12/A').address,city:'Roma'}}],address),null);
 assert.equal(exactAddressCandidate([candidate('12/A'),candidate('12/A',44.1)],address),null);
 assert.equal(exactAddressCandidate([candidate('12/A'),{...candidate('12/A',45.4601),longitude:9.1901}],address)?.latitude,45.46,'Entrance and building centre for the same civic number are one match');
 assert.equal(exactAddressCandidate([{...candidate('12/A'),address:{road:'Via Roma',city:'Milano'}}],address),null);
});
test('geocoder serializes concurrent requests, caches results and resumes after a provider failure',async()=>{
 let active=0,maxActive=0,calls=0;const times=[];
 const geocode=createGeocoder({interval:25,endpoint:()=> 'https://example.invalid/search',fetcher:async url=>{
  calls++;times.push(Date.now());maxActive=Math.max(maxActive,++active);await new Promise(r=>setTimeout(r,4));active--;
  if(url.searchParams.get('q').includes('errore'))throw Error('offline');
  return{ok:true,json:async()=>[{lat:'45.46',lon:'9.19',display_name:'Via Roma 12, Milano',address:candidate().address}]};
 }});
 const results=await Promise.all([geocode('Via Roma 12, Milano'),geocode('Via Roma 12, Milano'),geocode('Via Roma 13, Milano')]);
 assert.equal(calls,2);assert.equal(maxActive,1);assert(times[1]-times[0]>=20);assert.equal(results[0][0].address.house_number,'12');
 await assert.rejects(geocode('Via errore 1, Milano'));
 assert.equal((await geocode('Via Roma 14, Milano')).length,1);
});
test('saving a civic address locates it, versions the change, isolates tenants and never loses a save on lookup failure',async()=>{
 const calls=[];let behavior='exact',resolveLookup;
 const app=createApp({database:':memory:',demo:true,connectInterval:0,geocode:async query=>{calls.push(query);if(behavior==='fail')throw Error('offline');if(behavior==='wait')await new Promise(r=>resolveLookup=r);return behavior==='ambiguous'?[candidate('99'),candidate('99',44.1)]:[candidate(/, 99,/.test(query)?'99':'12')];}});
 const db=app.db,token='a'.repeat(64),csrf='test-map-csrf';
 db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('tenant-a','Agency A');db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('tenant-b','Agency B');
 db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run('user-a','map@example.invalid','unused');
 db.prepare("INSERT INTO memberships VALUES (?,?,'owner')").run('user-a','tenant-a');
 db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),'user-a','tenant-a',Date.now()+3600000,csrf);
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 async function req(url,method='GET',body,hasCSRF=true){const res=await fetch(base+url,{method,headers:{Cookie:'prime_session='+token,...(hasCSRF?{'X-CSRF-Token':csrf}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,body:await res.json()};}
 try{
  const moduleResponse=await fetch(base+'/map-locations.js?v=test');assert.equal(moduleResponse.status,200);assert.match(moduleResponse.headers.get('content-type'),/javascript/);
  let response=await req('/api/entities/streets','POST',{data:{title:'Via Roma',city:'Milano'}});assert.equal(response.status,201);let street=response.body;
  response=await req('/api/entities/buildings','POST',{data:{title:'12',street_id:street.id}});assert.equal(response.status,201);let building=response.body;
  assert.equal(building.map_location,'located');assert.equal(building.latitude,45.46);assert.equal(building.version,2);assert.deepEqual(calls,['Via Roma, 12, Milano']);
  response=await req('/api/map/autolocate','POST',{building_id:building.id});assert.equal(response.body.status,'existing');assert.equal(calls.length,1);
  assert.equal((await req('/api/map/autolocate','POST',{building_id:building.id},false)).status,403);
  assert.equal((await req('/api/map/autolocate','POST',{building_id:'foreign-building'})).status,404);
  db.prepare("INSERT INTO memberships VALUES (?,?,'owner')").run('user-a','tenant-b');db.prepare('UPDATE sessions SET tenant_id=?').run('tenant-b');assert.equal((await req('/api/map/autolocate','POST',{building_id:building.id})).status,404);db.prepare('UPDATE sessions SET tenant_id=?').run('tenant-a');
  behavior='fail';response=await req('/api/entities/buildings/'+building.id,'PUT',{version:building.version,data:{title:'99',street_id:street.id}});assert.equal(response.status,200);building=response.body;assert.equal(building.map_location,'unavailable');assert.equal(building.latitude,null);assert.equal(building.title,'99');
  behavior='ambiguous';response=await req('/api/map/autolocate','POST',{building_id:building.id});assert.equal(response.body.status,'verify');assert.equal(response.body.building.latitude,null);
  behavior='wait';const pending=req('/api/map/autolocate','POST',{building_id:building.id});while(!resolveLookup)await new Promise(r=>setTimeout(r,1));
  response=await req('/api/map/position','PUT',{entity:'buildings',id:building.id,version:building.version,latitude:46,longitude:10});assert.equal(response.status,200);building=response.body;resolveLookup();const raced=await pending;assert.equal(raced.body.status,'changed');assert.equal(raced.body.building.latitude,46);
  behavior='exact';db.prepare('UPDATE buildings SET latitude=NULL,longitude=NULL WHERE id=?').run(building.id);
  response=await req('/api/entities/units','POST',{data:{title:'3',building_id:building.id,commercial_status:'in affitto'}});assert.equal(response.status,201);assert.equal(response.body.map_location,'located');const unit=response.body;
  response=await req('/api/entities/properties','POST',{data:{title:'Casa in affitto',unit_id:unit.id,marketing_status:'in affitto'}});assert.equal(response.status,201);assert.equal(response.body.map_location,'existing');const property=response.body;
  response=await req('/api/map/position','PUT',{entity:'properties',id:property.id,version:property.version,latitude:45.5,longitude:9.2});assert.equal(response.status,200);
  response=await req('/api/entities/streets/'+street.id,'PUT',{version:street.version,data:{title:'Via Nuova',city:'Milano'}});assert.equal(response.status,200);assert.equal(db.prepare('SELECT latitude FROM buildings WHERE id=?').get(building.id).latitude,null);assert.equal(db.prepare('SELECT latitude FROM properties WHERE id=?').get(property.id).latitude,null);
  const history=db.prepare("SELECT count(*) n FROM record_history WHERE entity='buildings' AND record_id=?").get(building.id);assert(history.n>=5);
 }finally{await new Promise(r=>app.server.close(r));db.close();}
});
test('real-address geocoding also works in the isolated public demo, without touching the live database',async()=>{
 const app=createApp({database:':memory:',production:false,connectInterval:0,geocode:async()=>[candidate()]});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const page=await fetch(base+'/demo/'),cookie=page.headers.get('set-cookie').split(';')[0];assert.equal(page.status,200);
  const me=await(await fetch(base+'/demo/api/me',{headers:{Cookie:cookie}})).json();
  async function post(route,body){const response=await fetch(base+'/demo/api/'+route,{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':me.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});assert(response.ok);return response.json();}
  const street=await post('entities/streets',{data:{title:'Via Roma',city:'Milano'}}),building=await post('entities/buildings',{data:{title:'12',street_id:street.id}});
  assert.equal(building.map_location,'located');assert.equal(building.latitude,45.46);assert.equal((await post('map/autolocate',{building_id:building.id})).status,'existing');
  assert.equal(app.db.prepare('SELECT count(*) n FROM buildings').get().n,0);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
test('houses use current status, inherited civic coordinates and include units without a listing',()=>{
 const d={streets:[{id:'s',title:'Via Roma',city:'Milano'}],buildings:[{id:'b',title:'12',street_id:'s',latitude:45,longitude:9}],units:[{id:'u1',title:'1',building_id:'b',commercial_status:'in affitto'},{id:'u2',title:'2',building_id:'b',commercial_status:'in vendita'}],properties:[{id:'p',unit_id:'u2',title:'Casa',marketing_status:'venduto'}],contacts:[]};
 let locations=buildMapLocations(d);assert.equal(locations.length,3);assert.equal(locations.find(r=>r.id==='u1').status,'in affitto');assert.equal(locations.find(r=>r.id==='p').status,'venduto');assert.equal(locations.find(r=>r.id==='p').latitude,45);assert.equal(locations.find(r=>r.id==='p').geocodeAddress,'Via Roma, 12, Milano');
 d.properties[0].marketing_status='locato';locations=buildMapLocations(d);assert.equal(locations.find(r=>r.id==='p').status,'locato');
 assert.equal(propertyStatus({marketing_status:'in trattativa'},{}),'in trattativa');assert.equal(statuses.length,new Set(statuses).size);
 const css=readFileSync('public/map.css','utf8');for(const status of statuses)assert(css.includes('prime-map-marker.'+status.replaceAll(' ','-')));
});
