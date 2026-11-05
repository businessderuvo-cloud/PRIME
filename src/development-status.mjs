import {ApiError} from './validation.mjs';
import {developmentSections,developmentStatusKey} from '../public/development-status.js';

export function developmentStatusService({db,json,readBody,audit,editionFor}){
  const list=tenant=>db.prepare('SELECT feature_key,status,note,updated_at FROM development_status_overrides WHERE tenant_id=? ORDER BY feature_key').all(tenant);
  return async function route(req,res,url,session){
    if(url.pathname!=='/api/development-status')return false;
    if(session.role==='external')throw new ApiError(403,'Stato sviluppo riservato al team dell’agenzia.');
    const canEdit=['owner','manager'].includes(session.role);
    if(req.method==='GET'){json(res,200,{can_edit:canEdit,overrides:list(session.tenant_id)});return true;}
    if(req.method!=='PUT')throw new ApiError(405,'Metodo non disponibile.');
    if(!canEdit)throw new ApiError(403,'Solo il titolare o responsabile può modificare lo stato sviluppo.');
    const body=await readBody(req);
    if(!body||typeof body!=='object'||Array.isArray(body))throw new ApiError(400,'Aggiornamento non valido.');
    const keys=new Set(developmentSections({edition:editionFor(session)}).flatMap(section=>section.items.map(item=>developmentStatusKey(item.title))));
    if(typeof body.feature_key!=='string'||!keys.has(body.feature_key))throw new ApiError(400,'Funzionalità non valida o non inclusa nel piano.');
    if(!['auto','done','missing'].includes(body.status))throw new ApiError(400,'Scegli Automatico, Completato o Da completare.');
    if(body.note!==undefined&&(typeof body.note!=='string'||body.note.length>2000))throw new ApiError(400,'La nota deve contenere al massimo 2000 caratteri.');
    if(body.status==='auto')db.prepare('DELETE FROM development_status_overrides WHERE tenant_id=? AND feature_key=?').run(session.tenant_id,body.feature_key);
    else db.prepare('INSERT INTO development_status_overrides(tenant_id,feature_key,status,note,updated_at,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET status=excluded.status,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(session.tenant_id,body.feature_key,body.status,(body.note||'').trim(),new Date().toISOString(),session.user_id);
    audit(session,body.status==='auto'?'development_status.automatic':'development_status.manual',body.feature_key);
    json(res,200,{ok:true,override:list(session.tenant_id).find(row=>row.feature_key===body.feature_key)||null});
    return true;
  };
}
