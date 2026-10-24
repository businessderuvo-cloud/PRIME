import {randomUUID} from 'node:crypto';
import {ApiError} from '../validation.mjs';
import {googleEventId} from './providers.mjs';
import {nowISO} from './store.mjs';
const cancelled=a=>['annullato','saltato','riprogrammato'].includes(a.status);
export function calendarSync({db,api,credentials,saveAppointment}){
 const links=id=>db.prepare('SELECT * FROM calendar_event_links WHERE connection_id=?').all(id);
 function link(c,a,e){db.prepare(`INSERT INTO calendar_event_links(connection_id,appointment_id,external_id,etag,local_version) VALUES (?,?,?,?,?) ON CONFLICT(connection_id,appointment_id) DO UPDATE SET external_id=excluded.external_id,etag=excluded.etag,local_version=excluded.local_version`).run(c.id,a.id,e.id,e.etag||'',a.version);}
 function conflict(c,a,event,reason){db.prepare(`INSERT INTO calendar_conflicts(id,connection_id,appointment_id,reason,remote_payload,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(connection_id,appointment_id) DO UPDATE SET reason=excluded.reason,remote_payload=excluded.remote_payload,resolved_at=NULL`).run(randomUUID(),c.id,a.id,reason,JSON.stringify(event),nowISO());}
 async function sync(c){
  const creds=await credentials(c),session=db.prepare('SELECT user_id,tenant_id,role FROM memberships WHERE tenant_id=? AND user_id=?').get(c.tenant_id,c.user_id);if(!session||session.role==='external')throw new ApiError(403,'Account PRIME non più autorizzato.');
  let remote=[],fullSync=false;
  if(c.provider==='google'){
   let page,token=c.sync_token;fullSync=!token;for(let tries=0;tries<2;tries++){
    try{do{const query=new URLSearchParams({singleEvents:'true',maxResults:'2500',showDeleted:'true',...(token?{syncToken:token}:{timeMin:new Date(Date.now()-30*86400000).toISOString()}),...(page?{pageToken:page}:{})});const result=await api.google(creds.access_token,`calendars/${encodeURIComponent(c.calendar_id)}/events?${query}`);remote.push(...(result.items||[]).map(e=>({id:e.id,etag:e.etag||'',cancelled:e.status==='cancelled',transparent:e.transparency==='transparent',title:e.summary,starts_at:e.start?.dateTime||(e.start?.date?e.start.date+'T00:00:00Z':null),ends_at:e.end?.dateTime||(e.end?.date?e.end.date+'T00:00:00Z':null),meeting_url:e.hangoutLink||'',prime:e.extendedProperties?.private})));page=result.nextPageToken;if(!page&&result.nextSyncToken)token=result.nextSyncToken;}while(page);break;}catch(error){if(error.remoteStatus!==410||tries)throw error;token='';page=undefined;remote=[];fullSync=true;db.prepare('DELETE FROM external_busy_events WHERE connection_id=?').run(c.id);}
   }
   // The token advances only after incoming changes have been processed below.
   c.newToken=token;
  }else remote=await api.caldav.events(creds,c.calendar_id);
  if(c.provider==='apple')db.prepare('DELETE FROM external_busy_events WHERE connection_id=?').run(c.id);
  const mapping=links(c.id);
  for(const event of remote){
   let saved=mapping.find(l=>l.external_id===event.id);
   // Recover a successful Google insert after a lost response, without duplicating the event.
   if(!saved&&event.prime?.primeConnectionId===c.id){const a=db.prepare('SELECT * FROM appointments WHERE tenant_id=? AND id=? AND agent_id=?').get(c.tenant_id,event.prime.primeAppointmentId,c.user_id);if(a&&event.id===googleEventId(c.id,a.id)){link(c,{...a,version:Number(event.prime.primeLocalVersion||0)},event);saved=links(c.id).find(l=>l.appointment_id===a.id);}}
   if(!saved&&c.provider==='apple'&&event.uid?.startsWith('prime-'+c.id+'-')){const a=db.prepare('SELECT * FROM appointments WHERE tenant_id=? AND agent_id=?').all(c.tenant_id,c.user_id).find(a=>event.uid===`prime-${c.id}-${a.id}@prime.local`);if(a){link(c,{...a,version:event.local_version||0},event);saved=links(c.id).find(l=>l.appointment_id===a.id);}}
   if(saved){
    const a=db.prepare('SELECT * FROM appointments WHERE tenant_id=? AND id=?').get(c.tenant_id,saved.appointment_id);
    if(!a||a.agent_id!==c.user_id){try{if(c.provider==='google')await api.google(creds.access_token,`calendars/${encodeURIComponent(c.calendar_id)}/events/${encodeURIComponent(l.external_id)}`,'DELETE',null,l.etag?{'If-Match':l.etag}:{});else await api.caldav.call(creds,l.external_id,'DELETE',undefined,l.etag?{'If-Match':l.etag}:{});}catch(error){if(![404,410].includes(error.remoteStatus))throw error;}db.prepare('DELETE FROM calendar_event_links WHERE connection_id=? AND appointment_id=?').run(c.id,l.appointment_id);continue;}
    if(event.etag===saved.etag&&!event.cancelled)continue;
    if(a.version!==saved.local_version){conflict(c,a,event,'Modificato sia in PRIME sia nel calendario. Scegli quale versione conservare.');continue;}
    try{const updated=saveAppointment(session,a,{...(event.cancelled?{status:'annullato'}:{starts_at:event.starts_at,ends_at:event.ends_at,...(event.title?{title:event.title}:{}),...(event.meeting_url?{meeting_url:event.meeting_url}:{})})});link(c,updated,event);}catch{conflict(c,a,event,'La modifica esterna richiede una verifica: appuntamenti sovrapposti o dati non validi.');}
   }else if(!event.cancelled&&!event.transparent&&event.starts_at&&event.ends_at){db.prepare(`INSERT INTO external_busy_events VALUES (?,?,?,?) ON CONFLICT(connection_id,external_id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at`).run(c.id,event.id,new Date(event.starts_at).toISOString(),new Date(event.ends_at).toISOString());}
   else db.prepare('DELETE FROM external_busy_events WHERE connection_id=? AND external_id=?').run(c.id,event.id);
  }
  if(fullSync){const present=new Set(remote.map(event=>event.id));for(const saved of links(c.id)){if(present.has(saved.external_id))continue;db.prepare('DELETE FROM calendar_event_links WHERE connection_id=? AND appointment_id=?').run(c.id,saved.appointment_id);}}
  // Deleted and reassigned appointments are removed from this user's calendar only.
  for(const l of links(c.id)){
   const a=db.prepare('SELECT * FROM appointments WHERE tenant_id=? AND id=? AND agent_id=?').get(c.tenant_id,l.appointment_id,c.user_id);
   if(a&&!cancelled(a))continue;
   try{if(c.provider==='google')await api.google(creds.access_token,`calendars/${encodeURIComponent(c.calendar_id)}/events/${encodeURIComponent(l.external_id)}`,'DELETE',null,l.etag?{'If-Match':l.etag}:{});else await api.caldav.call(creds,l.external_id,'DELETE',undefined,l.etag?{'If-Match':l.etag}:{});}catch(error){if(![404,410].includes(error.remoteStatus))throw error;}
   db.prepare('DELETE FROM calendar_event_links WHERE connection_id=? AND appointment_id=?').run(c.id,l.appointment_id);
  }
  const appointments=db.prepare("SELECT * FROM appointments WHERE tenant_id=? AND agent_id=? AND status NOT IN ('annullato','saltato','riprogrammato') AND ends_at>?").all(c.tenant_id,c.user_id,new Date(Date.now()-30*86400000).toISOString());
  for(const a of appointments){
   if(db.prepare('SELECT 1 FROM calendar_conflicts WHERE connection_id=? AND appointment_id=? AND resolved_at IS NULL').get(c.id,a.id))continue;
   const l=links(c.id).find(l=>l.appointment_id===a.id);if(l?.local_version===a.version)continue;
   try{
    let event;
    if(c.provider==='google'){
     const body={summary:a.title||a.appointment_type,start:{dateTime:a.starts_at},end:{dateTime:a.ends_at},extendedProperties:{private:{primeConnectionId:c.id,primeAppointmentId:a.id,primeLocalVersion:String(a.version)}}};
     if(!l)body.id=googleEventId(c.id,a.id);
     if(a.meeting_mode==='videocall'&&a.video_provider==='Google Meet'&&!a.meeting_url)body.conferenceData={createRequest:{requestId:googleEventId(c.id,a.id)}};
     event=await api.google(creds.access_token,`calendars/${encodeURIComponent(c.calendar_id)}/events${l?'/'+encodeURIComponent(l.external_id):''}?conferenceDataVersion=1`,l?'PATCH':'POST',body,l?.etag?{'If-Match':l.etag}:{});
     if(event.hangoutLink&&a.meeting_url!==event.hangoutLink){const updated=saveAppointment(session,a,{meeting_url:event.hangoutLink});a.version=updated.version;}
    }else{
     const uid=`prime-${c.id}-${a.id}@prime.local`,id=l?.external_id||new URL(encodeURIComponent(uid)+'.ics',c.calendar_id).href;
     const result=await api.caldav.write(creds,id,a,l?.etag,uid);event={id,etag:result.etag};
     if(!event.etag){const all=await api.caldav.events(creds,c.calendar_id);event.etag=all.find(e=>e.id===id)?.etag||'';if(!event.etag)throw new ApiError(502,'iCloud non ha confermato la versione salvata.');}
    }
    link(c,a,event);
   }catch(error){if([409,412].includes(error.remoteStatus)){conflict(c,a,{},'Il calendario contiene una versione diversa. Sincronizza di nuovo e verifica il conflitto.');continue;}throw error;}
  }
  if(c.newToken)db.prepare('UPDATE integration_connections SET sync_token=? WHERE id=?').run(c.newToken,c.id);
 }
 return {sync};
}
