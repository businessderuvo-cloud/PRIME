import {ApiError} from './validation.mjs';

const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const roadName=value=>normalized(String(value||'').replace(/^(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada)\s+/i,''));
export function exactAddressCandidate(results,{street,number,city}){
 const exact=results.filter(point=>{
  const a=point.address||{},cities=[a.city,a.town,a.village,a.municipality,a.hamlet];
  return normalized(a.house_number)===normalized(number)&&roadName(a.road||a.pedestrian||a.residential)===roadName(street)&&cities.some(value=>normalized(value)===normalized(city));
 });
 const unique=[...new Map(exact.map(p=>[p.latitude.toFixed(5)+','+p.longitude.toFixed(5),p])).values()];
 if(!unique.length)return null;
 // OSM can return an entrance and the building centre for the very same civic address.
 // Accept nearby duplicates, while keeping genuinely separate places ambiguous.
 const first=unique[0],metres=point=>Math.hypot((point.latitude-first.latitude)*111320,(point.longitude-first.longitude)*111320*Math.cos(first.latitude*Math.PI/180));
 return unique.every(point=>metres(point)<=50)?first:null;
}

// Shared by real workspaces and isolated demos: one application-wide queue/cache.
export function createGeocoder({fetcher=fetch,endpoint=()=>process.env.PRIME_GEOCODER_URL||'https://nominatim.openstreetmap.org/search',interval=1100}={}){
 const cache=new Map();let queue=Promise.resolve(),lastAt=0;
 return function geocode(query){
  if(query.length<5||query.length>240)throw new ApiError(400,'Inserisci via, civico e città da cercare');
  const task=queue.then(async()=>{
   const url=new URL(endpoint()),key=url.origin+url.pathname+'|'+query.toLocaleLowerCase('it');
   const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.results;
   const wait=interval-(Date.now()-lastAt);if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));lastAt=Date.now();
   for(const[k,v]of Object.entries({format:'jsonv2',addressdetails:'1',limit:'5',countrycodes:'it',q:query}))url.searchParams.set(k,v);
   let response;
   try{response=await fetcher(url,{headers:{'User-Agent':'PRIME Real Estate CRM/1.0 (+https://primegestionale.it)','Accept-Language':'it'},signal:AbortSignal.timeout(8000)});}catch{throw new ApiError(502,'Ricerca indirizzo temporaneamente non disponibile');}
   if(!response.ok)throw new ApiError(502,'Servizio mappa non disponibile. Riprova tra poco.');
   const data=await response.json();if(!Array.isArray(data))throw new ApiError(502,'Risposta del servizio mappa non valida');
   const results=data.map(item=>({latitude:Number(item.lat),longitude:Number(item.lon),label:String(item.display_name||'').slice(0,300),address:item.address||{}})).filter(p=>Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180);
   if(cache.size>=1000)cache.delete(cache.keys().next().value);
   cache.set(key,{results,until:Date.now()+86400000});return results;
  });
  queue=task.catch(()=>[]);return task;
 };
}
export const sharedGeocode=createGeocoder();

export function createMapLocator({db,authorize,audit,geocode=sharedGeocode}){
 const read=(s,id)=>db.prepare('SELECT * FROM buildings WHERE tenant_id=? AND id=?').get(s.tenant_id,id);
 const address=(s,building)=>{
  const street=db.prepare('SELECT * FROM streets WHERE tenant_id=? AND id=?').get(s.tenant_id,building.street_id);
  return street?{street:street.title,number:building.title,city:street.city,streetVersion:street.version}:null;
 };
 const addressKey=a=>a&&JSON.stringify([a.street,a.number,a.city,a.streetVersion]);
 async function locate(s,id){
  const building=read(s,id);if(!building)throw new ApiError(404,'Civico non trovato');authorize(s,'buildings',building);
  if(Number.isFinite(building.latitude)&&Number.isFinite(building.longitude))return{status:'existing',building};
  const a=address(s,building);
  if(!a?.street?.trim()||!a.number?.trim()||!a.city?.trim())return{status:'incomplete',building};
  const query=[a.street,a.number,a.city].join(', ');
  let results;try{results=await geocode(query);}catch{return{status:'unavailable',building};}
  const point=exactAddressCandidate(results,a);
  if(!point)return{status:results.length?'verify':'not_found',building};
  // Re-check both versions after the network call; never overwrite a manual move or an edited address.
  const current=read(s,id);
  if(!current||current.version!==building.version||addressKey(address(s,current))!==addressKey(a))return{status:'changed',building:current};
  const now=new Date().toISOString();db.exec('BEGIN IMMEDIATE');
  try{
   const changed=db.prepare('UPDATE buildings SET latitude=?,longitude=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=? AND version=?').run(point.latitude,point.longitude,s.user_id,now,s.tenant_id,id,building.version);
   if(!changed.changes){db.exec('ROLLBACK');return{status:'changed',building:read(s,id)};}
   const saved=read(s,id);
   db.prepare('INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)').run(s.tenant_id,'buildings',id,saved.version,JSON.stringify(saved),s.user_id,now);
   audit(s,'buildings.auto_map_position',id);db.exec('COMMIT');return{status:'located',building:saved};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 async function afterSave(s,entity,row){
  let buildingId=entity==='buildings'?row.id:entity==='units'?row.building_id:null;
  if(entity==='properties'&&row.unit_id)buildingId=db.prepare('SELECT building_id FROM units WHERE tenant_id=? AND id=?').get(s.tenant_id,row.unit_id)?.building_id;
  return buildingId?locate(s,buildingId):null;
 }
 return{locate,afterSave};
}
