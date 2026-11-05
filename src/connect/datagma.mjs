import {ApiError} from '../validation.mjs';
export const datagmaOperations={"getcredit":{"path":"/api/ingress/v1/mine","title":"Crediti disponibili","fields":[]},"findemailv8":{"path":"/api/ingress/v8/findEmail","title":"Trova email professionale","fields":[{"type":"string","required":false,"name":"firstName"},{"type":"string","required":false,"name":"lastName"},{"type":"string","required":false,"name":"fullName"},{"type":"string","required":false,"name":"company"},{"type":"string","required":false,"name":"linkedInSlug"}]},"fullapiv2":{"path":"/api/ingress/v2/full","title":"Arricchisci persona o azienda","fields":[{"type":"string","required":false,"name":"data"},{"type":"string","required":false,"name":"companyKeyword"},{"type":"string","required":false,"name":"countryCode"},{"type":"string","required":false,"name":"firstName"},{"type":"string","required":false,"name":"lastName"},{"type":"string","required":false,"name":"fullName"},{"type":"boolean","required":false,"name":"companyPremium"},{"type":"boolean","required":false,"name":"companyFull"},{"type":"boolean","required":false,"name":"companyFrench"},{"type":"boolean","required":false,"name":"personFull"},{"type":"boolean","required":false,"name":"phoneFull"},{"type":"boolean","required":false,"name":"deepTraffic"},{"type":"boolean","required":false,"name":"debug"}]},"stellaupdatev2":{"path":"/api/ingress/v4/update","title":"Verifica cambio di lavoro","fields":[{"type":"string","required":false,"name":"firstName"},{"type":"string","required":false,"name":"lastName"},{"type":"string","required":false,"name":"fullName"},{"type":"string","required":false,"name":"companyName"},{"type":"string","required":false,"name":"jobTitle"}]},"findpeople":{"path":"/api/ingress/v1/find_people","title":"Trova persone in azienda","fields":[{"type":"string","required":false,"name":"currentJobTitle"},{"type":"string","required":false,"name":"linkedinId"},{"type":"string","required":false,"name":"domain"},{"type":"string","required":false,"name":"currentCompanies"},{"type":"string","required":false,"name":"countries"},{"type":"boolean","required":false,"name":"fuzzy"},{"type":"boolean","required":false,"name":"debug"}]},"search":{"path":"/api/ingress/v1/search","title":"Trova telefoni e verifica WhatsApp","fields":[{"type":"string","required":false,"name":"email"},{"type":"string","required":false,"name":"username"},{"type":"number","required":false,"name":"minimumMatch"},{"type":"boolean","required":false,"name":"whatsapp_check"}]},"searchbyphone":{"path":"/api/ingress/v1/reverse_phone_lookup","title":"Ricerca inversa da telefono","fields":[{"type":"string","required":false,"name":"code"},{"type":"string","required":true,"name":"number"}]},"searchbyemail":{"path":"/api/ingress/v1/reverse_email","title":"Ricerca inversa da email (fuori UE)","fields":[{"type":"string","required":false,"name":"email"}]},"gettwitterbyusername":{"path":"/api/ingress/v1/twitter/by_username","title":"Profilo X / Twitter da username","fields":[{"type":"string","required":false,"name":"username"},{"type":"string","required":false,"name":"linkedin"}]},"gettwitterbyemail":{"path":"/api/ingress/v1/twitter/by_email","title":"Profilo X / Twitter da email","fields":[{"type":"string","required":false,"name":"email"}]}};

datagmaOperations.fullapiv2.fields.push({name:'company',type:'string',required:false});
export const datagmaKey=cfg=>cfg.api_key||cfg.api_id||cfg.api_password||'';
export async function datagmaQuery({cfg,operation,params={},fetcher=fetch}){
 const op=datagmaOperations[operation];
 if(!Object.hasOwn(datagmaOperations,operation)||!op)throw new ApiError(400,'Operazione Datagma non valida.');
 const key=datagmaKey(cfg);if(!key)throw new ApiError(409,'Configura prima la chiave Datagma in PRIME Connect.');
 if(!params||typeof params!=='object'||Array.isArray(params))throw new ApiError(400,'Parametri Datagma non validi.');
 const url=new URL(op.path,'https://gateway.datagma.net');url.searchParams.set('apiId',key);
 for(const [name,value] of Object.entries(params)){
  const field=op.fields.find(f=>f.name===name);if(!field)throw new ApiError(400,'Campo Datagma non consentito.');
  if(value===''||value===null||value===undefined)continue;
  if(field.type==='boolean'&&typeof value!=='boolean')throw new ApiError(400,'Opzione Datagma non valida.');
  if(field.type==='number'&&(!Number.isFinite(value)||value<0||value>1))throw new ApiError(400,'Il punteggio minimo deve essere tra 0 e 1.');
  if(field.type==='string'&&(typeof value!=='string'||value.length>2000))throw new ApiError(400,'Dato Datagma non valido.');
  url.searchParams.set(name,String(value).trim());
 }
 const has=name=>!!url.searchParams.get(name),name=()=>has('fullName')||(has('firstName')&&has('lastName'));
 const valid={getcredit:true,fullapiv2:has('data')||(name()&&has('company')),findemailv8:name()&&(has('company')||has('linkedInSlug')),stellaupdatev2:name()&&has('companyName'),findpeople:has('currentJobTitle')&&(has('linkedinId')||has('domain')||has('currentCompanies')),search:has('email')||has('username'),searchbyphone:has('number'),searchbyemail:has('email'),gettwitterbyusername:has('username')||has('linkedin'),gettwitterbyemail:has('email')};
 if(!valid[operation])throw new ApiError(400,'Completa i dati richiesti per questa ricerca.');
 let response,raw;try{response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw new ApiError(502,'Datagma non è raggiungibile al momento.');}
 if(response.status===429)throw new ApiError(429,'Limite richieste Datagma raggiunto.');
 if(response.status===401||response.status===403)throw new ApiError(409,'Chiave Datagma rifiutata oppure funzione non inclusa nel piano.');
 try{raw=await response.json();}catch{throw new ApiError(502,'Risposta Datagma non valida (HTTP '+response.status+').');}
 const code=Number(raw?.code??raw?.error?.code??0);
 if(!response.ok&&code!==5&&![3,7,16].includes(code))throw new ApiError(502,'Richiesta Datagma non riuscita (HTTP '+response.status+').');
 if([3,7,16].includes(code))throw new ApiError(code===3?400:409,({3:'Datagma richiede altri dati per questa ricerca.',7:'Funzione non abilitata nel piano Datagma di questo account.',16:'Chiave Datagma non valida.'})[code]);
 if(code&&code!==5)throw new ApiError(502,'Datagma ha restituito un errore. Riprova più tardi.');
 const clean=value=>{
  if(typeof value==='string')return value.split(key).join('[riservato]');
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/(api.?id|api.?key|password|token|secret)/i.test(k)).map(([k,v])=>[k,clean(v)]));
  return value;
 };
 return {operation,found:code!==5,result:clean(raw)};
}
