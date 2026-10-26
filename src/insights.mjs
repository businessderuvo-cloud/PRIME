import { ApiError } from './validation.mjs';

export function scoreMatch(profile, p) {
  if (profile.status !== 'attiva' || !['in vendita','in affitto'].includes(p.marketing_status)) return null;
  if (profile.operation_type !== 'indifferente' && p.marketing_status !== (profile.operation_type === 'locazione' ? 'in affitto' : 'in vendita')) return null;
  const components = [], missing = [];
  const add = (criterion, weight, known, compatible) => { components.push({criterion,weight,points:known && compatible ? weight : 0, result: !known ? 'dato mancante' : compatible ? 'compatibile' : 'non compatibile'}); if(!known)missing.push(criterion); };
  add('operazione',15,true,true);
  if(profile.budget_min || profile.budget_max) add('budget',30,p.price>0,(!profile.budget_min || p.price>=profile.budget_min)&&(!profile.budget_max || p.price<=profile.budget_max));
  const areas=profile.preferred_areas.toLocaleLowerCase('it').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
  const address=[p.city,p.district,p.street].filter(Boolean).join(' ').toLocaleLowerCase('it');
  if(areas.length)add('zona',25,!!address,areas.some(x=>address.includes(x)));
  if(profile.min_area)add('superficie',15,p.area>0,p.area>=profile.min_area);
  if(profile.min_rooms)add('locali',10,p.rooms>0,p.rooms>=profile.min_rooms);
  if(profile.needs_garage)add('garage',10,p.has_garage!==null && p.has_garage!==undefined,!!p.has_garage);
  if(profile.preferred_floor)add('piano',5,!!p.floor,String(p.floor).trim().toLowerCase()===profile.preferred_floor.trim().toLowerCase());
  // Explicit constraints remain hard filters, preserving the existing matching behavior.
  if(components.some(x=>x.result==='non compatibile'&&x.criterion!=='piano'))return null;
  const score=Math.round(100*components.reduce((s,x)=>s+x.points,0)/components.reduce((s,x)=>s+x.weight,0));
  return {...p,score,quality:missing.length?'da verificare':components.length<3?'limitata':score>=85?'alta':score>=60?'media':'bassa',components,missing,
    reasons:components.map(x=>`${x.criterion}: ${x.result} (${x.points}/${x.weight})`),
    warnings:[...(components.length<3?['Pochi criteri compilati: completa le preferenze per un confronto più affidabile']:[]),...(profile.requirements ? ['Altre caratteristiche testuali da verificare con il cliente'] : [])],
    address:[p.street,p.district,p.city].filter(Boolean).join(' · ')};
}

export function insightsService(db) {
  const all=(entity,s)=>db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=?`).all(s.tenant_id);
  const own=(row,s,key='assigned_agent_id')=>s.role!=='agent'||row[key]===s.user_id;
  function matching(s, profileId) {
    if(s.role==='external')throw new ApiError(403,'Accesso riservato al team');
    const profiles=all('buyer_profiles',s).filter(p=>p.status==='attiva' && (!profileId || p.id===profileId) && (own(p,s)||!p.assigned_agent_id));
    if(profileId){const p=all('buyer_profiles',s).find(x=>x.id===profileId);if(!p)throw new ApiError(404,'Esigenza acquirente non trovata');if(s.role==='agent'&&p.assigned_agent_id&&p.assigned_agent_id!==s.user_id)throw new ApiError(403,'Esigenza assegnata a un altro agente');}
    const properties=db.prepare(`SELECT p.*,u.area,u.rooms,u.floor,u.has_garage,st.city,st.district,st.title street FROM properties p
      LEFT JOIN units u ON u.tenant_id=p.tenant_id AND u.id=p.unit_id LEFT JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id
      LEFT JOIN streets st ON st.tenant_id=b.tenant_id AND st.id=b.street_id WHERE p.tenant_id=? AND p.marketing_status IN ('in vendita','in affitto')`).all(s.tenant_id);
    const rejected=all('viewing_feedback',s).filter(x=>x.outcome==='negativo');
    return profiles.flatMap(profile=>properties.filter(p=>!rejected.some(x=>x.contact_id===profile.contact_id&&x.property_id===p.id)).map(p=>{
      const result=scoreMatch(profile,p);return result?{...result,profile_id:profile.id,profile_title:profile.title}:null;
    }).filter(Boolean)).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  }
  function dashboard(s, now=new Date()) {
    if(s.role==='external')throw new ApiError(403,'Accesso riservato al team');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const day=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
    const horizon=new Date(now.getTime()+30*86400000).toISOString().slice(0,10), cutoff=new Date(now.getTime()-90*86400000).toISOString();
    const properties=all('properties',s).filter(x=>own(x,s)), ids=new Set(properties.map(x=>x.id));
    const contacts=all('contacts',s).filter(x=>own(x,s)), profiles=all('buyer_profiles',s).filter(x=>own(x,s));
    const appointments=all('appointments',s).filter(x=>own(x,s,'agent_id'));
    const deals=all('deals',s).filter(x=>own(x,s));
    const expiry=(entity,list,field)=>list.filter(x=>x[field]&&x[field]<=horizon).map(x=>({entity,id:x.id,title:x.title,date:x[field],overdue:x[field]<today}));
    const deadlines=[...expiry('properties',properties.filter(x=>!['venduto','locato'].includes(x.marketing_status)),'mandate_expires_on'),...expiry('documents',all('documents',s).filter(x=>x.document_type==='incarico'&&x.status!=='archiviato'&&(s.role!=='agent'||ids.has(x.property_id))),'expires_on'),...expiry('leases',all('leases',s).filter(x=>x.status!=='conclusa'&&(s.role!=='agent'||ids.has(x.property_id))),'ends_on')].sort((a,b)=>a.date.localeCompare(b.date));
    const inactive=[['properties',properties.filter(x=>!['venduto','locato'].includes(x.marketing_status))],['contacts',contacts],['buyer_profiles',profiles.filter(x=>x.status==='attiva')]].flatMap(([entity,list])=>list.filter(x=>{
      const interactions=appointments.filter(a=>a.status!=='annullato'&&(entity==='properties'?a.property_id===x.id:a.contact_id===(entity==='contacts'?x.id:x.contact_id)));
      return [x.updated_at,...interactions.filter(a=>a.starts_at<=now.toISOString()).map(a=>a.starts_at)].every(d=>d<cutoff);
    }).map(x=>({entity,id:x.id,title:x.title,updated_at:x.updated_at})));
    const joined=db.prepare(`SELECT p.id,u.area,u.rooms,st.city FROM properties p LEFT JOIN units u ON u.tenant_id=p.tenant_id AND u.id=p.unit_id LEFT JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id LEFT JOIN streets st ON st.tenant_id=b.tenant_id AND st.id=b.street_id WHERE p.tenant_id=?`).all(s.tenant_id);
    const documents=all('documents',s), drafts=all('portal_drafts',s);
    const quality=properties.flatMap(p=>{const u=joined.find(x=>x.id===p.id)||{};const issues=[];if(!p.owner_id)issues.push('proprietario mancante');if(!p.assigned_agent_id)issues.push('agente mancante');if(!p.price)issues.push('prezzo mancante');if(!u.area)issues.push('superficie mancante');if(!u.city)issues.push('indirizzo incompleto');if(!p.mandate_expires_on)issues.push('scadenza incarico mancante');if(['in vendita','in affitto'].includes(p.marketing_status)){if(!documents.some(d=>d.property_id===p.id&&d.document_type==='APE'&&d.status==='disponibile'&&(!d.expires_on||d.expires_on>=today)))issues.push('APE da verificare');for(const draft of drafts.filter(d=>d.property_id===p.id&&d.operation!=='withdraw')){let payload;try{payload=JSON.parse(draft.payload);}catch{}if(!payload?.media?.length)issues.push(draft.portal+': foto annuncio mancanti');if(payload?.property?.price!==p.price||payload?.property?.marketing_status!==p.marketing_status)issues.push(draft.portal+': bozza da aggiornare');}}return issues.length?[{entity:'properties',id:p.id,title:p.title,issues}]:[];});
    const members=db.prepare("SELECT u.id,u.email title FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role IN ('owner','agent')").all(s.tenant_id).filter(x=>s.role!=='agent'||x.id===s.user_id);
    const agents=members.map(m=>({...m,properties:properties.filter(x=>x.assigned_agent_id===m.id).length,appointments:appointments.filter(x=>x.agent_id===m.id&&x.status==='effettuato').length,won:deals.filter(x=>x.assigned_agent_id===m.id&&x.status==='vinta').length}));
    const trend=Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5+i,1));const month=d.toISOString().slice(0,7);return {month,new_properties:properties.filter(x=>x.created_at.startsWith(month)).length,won:deals.filter(x=>x.status==='vinta'&&x.updated_at.startsWith(month)).length};});
    return {today,scope:s.role==='agent'?'personale':'agenzia',appointments:appointments.filter(x=>day(x.starts_at)===today&&!['annullato','riprogrammato','saltato'].includes(x.status)).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)),deadlines,recent:properties.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,8),inactive,matching:matching(s).slice(0,12),agents,trend,quality,quality_note:'Controlli sui dati delle schede; foto, APE e requisiti specifici dei portali richiedono verifica prima della pubblicazione.'};
  }
  return {matching,dashboard};
}
