import {ApiError} from './validation.mjs';
export const portals=[{id:'immobiliare',name:'Immobiliare.it',url:'https://www.immobiliare.it/'},{id:'idealista',name:'idealista',url:'https://www.idealista.it/'},{id:'casa',name:'Casa.it',url:'https://www.casa.it/'}];
export function portalService({db,readBody,json}) {
 return async function route(req,res,url,s){
  if(!url.pathname.startsWith('/api/portals'))return false;
  if(!['owner','manager'].includes(s.role))throw new ApiError(403,'Portali riservati al titolare o responsabile.');
  if(url.pathname==='/api/portals'&&req.method==='GET'){
   json(res,200,{portals:portals.map(p=>({...p,status:'awaiting_activation',...db.prepare('SELECT account_reference,channel FROM portal_settings WHERE tenant_id=? AND portal=?').get(s.tenant_id,p.id)})),properties:db.prepare('SELECT id,title,marketing_status FROM properties WHERE tenant_id=? ORDER BY title').all(s.tenant_id),drafts:db.prepare('SELECT portal,property_id,operation,updated_at FROM portal_drafts WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100').all(s.tenant_id)});return true;
  }
  const match=/^\/api\/portals\/(immobiliare|idealista|casa)$/.exec(url.pathname);
  if(match&&req.method==='PUT'){
   const b=await readBody(req);if(typeof b.account_reference!=='string'||b.account_reference.length>200||!['api','feed'].includes(b.channel))throw new ApiError(400,'Indica riferimento account e canale API o feed.');
   db.prepare('INSERT INTO portal_settings VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,portal) DO UPDATE SET account_reference=excluded.account_reference,channel=excluded.channel,updated_at=excluded.updated_at').run(s.tenant_id,match[1],b.account_reference.trim(),b.channel,new Date().toISOString());json(res,200,{ok:true,status:'awaiting_activation'});return true;
  }
  if(url.pathname==='/api/portals/drafts'&&req.method==='POST'){
   const b=await readBody(req);if(!Array.isArray(b.portals)||!b.portals.length||b.portals.length>3||b.portals.some(id=>!portals.some(p=>p.id===id))||!['publish','update','withdraw'].includes(b.operation)||typeof b.property_id!=='string')throw new ApiError(400,'Scegli immobile, portali e operazione.');
   const property=db.prepare(`SELECT p.id,p.title,p.price,p.marketing_status,u.property_type,u.area,u.rooms,s.city,s.district FROM properties p LEFT JOIN units u ON u.tenant_id=p.tenant_id AND u.id=p.unit_id LEFT JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id LEFT JOIN streets s ON s.tenant_id=b.tenant_id AND s.id=b.street_id WHERE p.tenant_id=? AND p.id=?`).get(s.tenant_id,b.property_id);
   if(!property)throw new ApiError(404,'Immobile non trovato.');
   const updated=new Date().toISOString();db.exec('BEGIN IMMEDIATE');try{for(const id of new Set(b.portals))db.prepare('INSERT INTO portal_drafts VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,portal,property_id) DO UPDATE SET operation=excluded.operation,payload=excluded.payload,updated_at=excluded.updated_at').run(s.tenant_id,id,property.id,b.operation,JSON.stringify({schema_version:1,property,media:[],requires_portal_mapping:true}),updated);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
   json(res,200,{ok:true,status:'draft',message:'Bozze salvate. Nessun annuncio inviato ai portali.'});return true;
  }
  throw new ApiError(404,'Operazione portale non disponibile.');
 };
}
