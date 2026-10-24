import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {ApiError} from '../validation.mjs';
export const providers=['google','apple','calendly','whatsapp'];
export const nowISO=()=>new Date().toISOString();
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function createVault({directory,key}={}) {
  let secret=key;
  function getKey(){
    if(secret)return secret;
    if(process.env.PRIME_CONNECT_KEY){secret=Buffer.from(process.env.PRIME_CONNECT_KEY,'base64');if(secret.length!==32)throw new ApiError(503,'PRIME_CONNECT_KEY deve contenere una chiave base64 da 32 byte.');return secret;}
    if(!directory){secret=randomBytes(32);return secret;}
    mkdirSync(directory,{recursive:true});const filename=path.join(directory,'connect.key');
    if(!existsSync(filename)){try{writeFileSync(filename,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}}
    secret=readFileSync(filename);if(secret.length!==32)throw new ApiError(503,'Chiave collegamenti non valida.');return secret;
  }
  return {
    seal(value,context){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',getKey(),nonce);cipher.setAAD(Buffer.from(context));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return [nonce,cipher.getAuthTag(),bytes].map(b=>b.toString('base64url')).join('.');},
    open(value,context){try{const [iv,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url'));const cipher=createDecipheriv('aes-256-gcm',getKey(),iv);cipher.setAAD(Buffer.from(context));cipher.setAuthTag(tag);return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString());}catch{throw new ApiError(503,'Impossibile aprire le credenziali: verifica la chiave dei collegamenti.');}}
  };
}
export function scopedConnection(db,session,id){const row=db.prepare('SELECT * FROM integration_connections WHERE tenant_id=? AND user_id=? AND id=?').get(session.tenant_id,session.user_id,id);if(!row)throw new ApiError(404,'Collegamento non trovato.');return row;}
export function publicConnection(row){return {id:row.id,provider:row.provider,status:row.status,account_label:row.account_label,calendar_id:row.calendar_id,sync_enabled:!!row.sync_enabled,last_sync_at:row.last_sync_at,last_error:row.last_error,user_id:row.user_id};}
export async function rawBody(req,max=1024*1024){let length=0;const chunks=[];for await(const chunk of req){length+=chunk.length;if(length>max)throw new ApiError(413,'Contenuto troppo grande.');chunks.push(chunk);}return Buffer.concat(chunks);}
export function validBaseUrl(value){let url;try{url=new URL(value);}catch{throw new ApiError(400,'Indica un indirizzo di PRIME valido.');}if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new ApiError(400,'Usa HTTPS oppure localhost e nessun percorso aggiuntivo.');return url.origin;}
