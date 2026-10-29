import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,timingSafeEqual} from 'node:crypto';
import {ApiError} from './validation.mjs';

export function privateDemoAccess({db,directory,root,enabled,json,readBody,createSession,clock=Date.now}){
  const limits=new Map(),year=365*86400;
  function config(){
    if(!enabled||!directory)return null;
    try{const data=JSON.parse(readFileSync(path.join(directory,'private-demo-access.json'),'utf8'));return data.expiresAt>clock()&&/^[a-f0-9]{64}$/.test(data.tokenHash)?data:null;}catch{return null;}
  }
  function lifetime(userId){const entry=config();return entry?.userId===userId?year:86400;}
  async function route(req,res,url){
    if(!['/private-demo-access','/api/private-demo-access','/private-demo-access.js'].includes(url.pathname))return false;
    const entry=config();if(!entry)throw new ApiError(404,'Accesso demo privata non disponibile.');
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(req.method==='GET'&&url.pathname!=='/api/private-demo-access'){
      const script=url.pathname.endsWith('.js');res.writeHead(200,{'Content-Type':script?'text/javascript; charset=utf-8':'text/html; charset=utf-8'});res.end(readFileSync(path.join(root,'public',script?'private-demo-access.js':'private-demo-access.html')));return true;
    }
    if(req.method!=='POST'||url.pathname!=='/api/private-demo-access')throw new ApiError(405,'Metodo non disponibile.');
    const address=req.socket.remoteAddress||'unknown',previous=limits.get(address);
    if(previous&&previous.after>clock()&&previous.count>=8)throw new ApiError(429,'Troppe richieste. Riprova tra un minuto.');
    if(limits.size>1000)for(const [key,item] of limits)if(item.after<clock())limits.delete(key);
    limits.set(address,previous&&previous.after>clock()?{...previous,count:previous.count+1}:{after:clock()+60000,count:1});
    const body=await readBody(req),token=String(body.token||'');
    if(!/^[a-f0-9]{64}$/.test(token)||!timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(entry.tokenHash,'hex')))throw new ApiError(401,'Link personale non valido o scaduto.');
    const owner=db.prepare("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.tenant_id=? AND m.role='owner' AND u.totp_enabled=0").get(entry.userId,entry.tenantId);
    if(!owner)throw new ApiError(401,'Account demo non disponibile.');
    createSession(res,entry.userId,entry.tenantId);json(res,200,{ok:true,redirect:'/app'});return true;
  }
  return {route,lifetime};
}
