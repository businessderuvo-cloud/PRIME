import {randomUUID} from 'node:crypto';
import {ApiError} from './validation.mjs';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sevenDays=7*86400000;

function cleanEmail(value){
  const result=String(value||'').trim().toLowerCase();
  return emailPattern.test(result)&&result.length<=254?result:'';
}

export function trustpilotMailer({db,connect,json,readBody,audit,env=process.env,clock=Date.now}){
  const bccAddress=String(env.PRIME_TRUSTPILOT_BCC||'www.primegestionale.it+538db2a3f9@invite.trustpilot.com').trim();
  const enabled=String(env.PRIME_TRUSTPILOT_EMAILS_ENABLED||'').toLowerCase()==='true';
  const configuredFrom=cleanEmail(env.PRIME_TRUSTPILOT_FROM);
  let polling=false;

  const now=()=>new Date(clock()).toISOString();
  const activeOwner=(tenantId)=>db.prepare("SELECT u.id user_id,u.email,u.email AS recipient_email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role='owner' ORDER BY u.email LIMIT 1").get(tenantId);
  // Zoho's send scope is sufficient for Trustpilot invites. A connection can be
  // marked reauthorize when PRIME's optional inbox sync lacks messages.READ;
  // that must not prevent an outbound invite from being sent.
  const zohoConnection=(tenantId,userId)=>db.prepare("SELECT c.* FROM integration_connections c JOIN memberships m ON m.tenant_id=c.tenant_id AND m.user_id=c.user_id WHERE c.tenant_id=? AND c.provider='zoho' AND c.status IN ('connected','reauthorize') AND m.role IN ('owner','manager') AND (c.user_id=? OR m.role='owner') ORDER BY CASE WHEN c.user_id=? THEN 0 ELSE 1 END,c.updated_at DESC LIMIT 1").get(tenantId,userId,userId);
  const senderAddress=connection=>configuredFrom||cleanEmail(String(connection?.account_label||'').replace(/^(?:Personale|PEC)\s*·\s*/i,''));
  const messageId=result=>String(result?.data?.messageId||result?.data?.message_id||result?.messageId||result?.message_id||'').slice(0,500);
  const html=(name)=>`<div style="margin:0;background:#f4f7f8;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;color:#24313a"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#10252b;padding:24px 28px;text-align:center"><img src="https://primegestionale.it/assets/prime-email-logo.png" alt="PRIME" width="210" style="display:block;width:210px;height:auto;margin:0 auto;border:0"></td></tr><tr><td style="padding:32px 30px 34px"><p style="margin:0 0 18px;font-size:18px">Ciao ${String(name||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))},</p><p style="margin:0 0 18px;line-height:1.6">hai già avuto modo di provare PRIME. Se ti va, condividi la tua esperienza: bastano pochi secondi.</p><p style="margin:26px 0 10px;text-align:center"><img src="https://primegestionale.it/assets/trustpilot-star-original.png" alt="Trustpilot" width="36" height="34" style="display:block;margin:0 auto;border:0"></p><p style="margin:0;text-align:center"><a href="https://it.trustpilot.com/evaluate/www.primegestionale.it" style="display:inline-block;background:#10252b;color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 24px;border-radius:8px">Lascia la tua valutazione</a></p><p style="margin:0 0 10px;text-align:center;color:#00b67a;font-size:13px;font-weight:700">Trustpilot · recensioni verificate</p><p style="margin:0;line-height:1.6;color:#5a6870">Grazie per il tuo tempo,<br><strong>Il team PRIME</strong></p></td></tr></table></div>`;
  const subject='PRIME · come sta andando la tua esperienza?';

  function schedule(){
    const cutoff=new Date(clock()).toISOString();
    const rows=db.prepare("SELECT t.id tenant_id,t.name,ps.period_start FROM plan_subscriptions ps JOIN tenants t ON t.id=ps.tenant_id WHERE ps.state='active' AND ps.period_end>? AND t.account_status='active'").all(cutoff);
    const insert=db.prepare('INSERT OR IGNORE INTO trustpilot_email_invites(id,tenant_id,recipient_email,recipient_name,due_at,status,receipt_requested,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for(const row of rows){
      const owner=activeOwner(row.tenant_id),recipient=cleanEmail(owner?.email),start=Date.parse(row.period_start||'');
      if(!recipient||!Number.isFinite(start))continue;
      const created=now();insert.run(randomUUID(),row.tenant_id,recipient,owner.email,start+sevenDays>clock()?new Date(start+sevenDays).toISOString():created,'scheduled',1,created,created);
    }
  }

  async function deliver(row,connection){
    const fromAddress=senderAddress(connection);
    if(!fromAddress)throw new ApiError(409,'Indica l’indirizzo mittente Zoho per l’automazione Trustpilot.');
    const result=await connect.sendMail(connection,{fromAddress,toAddress:row.recipient_email,bccAddress,subject,content:html(row.recipient_name),mailFormat:'html',askReceipt:'yes'});
    return messageId(result);
  }

  async function poll(){
    if(polling)return;
    polling=true;
    try{
      schedule();
      if(!enabled)return;
      const timestamp=clock(),iso=new Date(timestamp).toISOString();
      db.prepare("UPDATE trustpilot_email_invites SET status='scheduled',updated_at=? WHERE status='sending' AND updated_at<?").run(iso,new Date(timestamp-10*60000).toISOString());
      const rows=db.prepare("SELECT * FROM trustpilot_email_invites WHERE status='scheduled' AND due_at<=? ORDER BY due_at LIMIT 20").all(iso);
      for(const row of rows){
        const owner=activeOwner(row.tenant_id),connection=zohoConnection(row.tenant_id,owner?.user_id);
        if(!connection)continue;
        const claim=db.prepare("UPDATE trustpilot_email_invites SET status='sending',connection_id=?,last_error='',updated_at=? WHERE id=? AND status='scheduled'").run(connection.id,iso,row.id);
        if(!claim.changes)continue;
        try{
          const sentId=await deliver(row,connection),sentAt=now();
          db.prepare("UPDATE trustpilot_email_invites SET status='sent',message_id=?,sent_at=?,updated_at=?,last_error='' WHERE id=?").run(sentId,sentAt,sentAt,row.id);
          audit({tenant_id:row.tenant_id,user_id:owner?.user_id||connection.user_id},'trustpilot.email_sent',row.id);
        }catch(error){
          const retry=new Date(clock()+15*60000).toISOString(),message=String(error?.message||'Invio Trustpilot non riuscito.').slice(0,500);
          db.prepare("UPDATE trustpilot_email_invites SET status='scheduled',due_at=?,last_error=?,updated_at=? WHERE id=?").run(retry,message,now(),row.id);
        }
      }
    }finally{polling=false;}
  }

  async function testSend(session,to){
    if(!['owner','manager'].includes(session.role))throw new ApiError(403,'Solo il titolare o responsabile può inviare il test.');
    const recipient=cleanEmail(to);
    if(recipient!=='deruvomichele@gmail.com')throw new ApiError(400,'Il test è limitato a deruvomichele@gmail.com.');
    const connection=zohoConnection(session.tenant_id,session.user_id);
    if(!connection)throw new ApiError(409,'Collega prima Zoho Mail con OAuth diretto.');
    const fromAddress=senderAddress(connection);
    if(!fromAddress)throw new ApiError(409,'Non trovo l’indirizzo mittente della casella Zoho collegata.');
    const result=await connect.sendMail(connection,{fromAddress,toAddress:recipient,bccAddress,subject:'PRIME · test collegamento Trustpilot',content:'<p>Questo è un messaggio di test del collegamento diretto Zoho Mail per Trustpilot.</p><p>La richiesta di ricevuta di lettura è stata attivata.</p>',mailFormat:'html',askReceipt:'yes'});
    const id=messageId(result);audit(session,'trustpilot.email_test',recipient);return {ok:true,to:recipient,from:fromAddress,bcc:bccAddress,askReceipt:true,messageId:id};
  }

  async function route(req,res,url,session){
    if(!url.pathname.startsWith('/api/trustpilot'))return false;
    if(!['owner','manager'].includes(session.role))throw new ApiError(403,'Accesso riservato a titolare e responsabile.');
    if(url.pathname==='/api/trustpilot/mail-status'&&req.method==='GET'){
      const connection=zohoConnection(session.tenant_id,session.user_id),rows=db.prepare('SELECT id,recipient_email,due_at,status,receipt_requested,last_error,sent_at,created_at FROM trustpilot_email_invites WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20').all(session.tenant_id);
      json(res,200,{enabled,configured:!!connection,sender:senderAddress(connection),bcc:bccAddress,invites:rows});return true;
    }
    if(url.pathname==='/api/trustpilot/test'&&req.method==='POST'){
      const body=await readBody(req),result=await testSend(session,body.to);json(res,200,result);return true;
    }
    throw new ApiError(404,'Operazione Trustpilot non disponibile.');
  }

  return {poll,route,testSend};
}
