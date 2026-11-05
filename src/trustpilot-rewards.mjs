import {rewardFulfillment} from './reward-fulfillment.mjs';
import {ApiError} from './validation.mjs';
import {createCipheriv,createHash,createHmac,randomBytes} from 'node:crypto';
export function trustpilotRewards({db,json,readBody,env=process.env,clock=Date.now}) {
 const fulfillment=rewardFulfillment({db,env,clock});
 const developer=s=>String(env.PRIME_DEVELOPER_EMAILS||env.PRIME_DEVELOPER_EMAIL||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(String(s.email||'').toLowerCase());
 const templateId=String(env.PRIME_TRUSTPILOT_TEMPLATE_ID||'53ch7c1d9be8a02f64d31e79').trim();
 const buid=String(env.PRIME_TRUSTPILOT_BUID||'').trim();
 const secret=String(env.PRIME_TRUSTPILOT_SECRET||'');
 const collectorConfigured=!!buid&&secret.length>=16&&secret.length<=256&&!/[\u0000-\u001f]/.test(secret)&&/^[a-f0-9]{24}$/i.test(buid);
 function createPayload(customerData){
  const iv=randomBytes(12),jsonData=JSON.stringify(customerData),key=createHash('sha256').update(secret).digest(),cipher=createCipheriv('aes-256-gcm',key,iv);
  let encrypted=cipher.update(jsonData,'utf8','base64');encrypted+=cipher.final('base64');
  const tag=cipher.getAuthTag().toString('base64'),signatureData=secret+customerData.email+customerData.reference;
  return {data:encrypted,iv:iv.toString('base64'),tag,sig:createHmac('sha256',secret).update(signatureData).digest('hex')};
 }
 function profile(){try{const u=new URL(env.PRIME_TRUSTPILOT_REVIEW_URL||'https://it.trustpilot.com/review/www.primegestionale.it');if(u.protocol==='https:'&&['it.trustpilot.com','www.trustpilot.com','trustpilot.com'].includes(u.hostname)&&/^\/review\/[^/]+\/?$/.test(u.pathname)&&!u.username&&!u.password)return u.href;}catch{}return null;}
 function status(s){
  const sub=db.prepare('SELECT * FROM plan_subscriptions WHERE tenant_id=?').get(s.tenant_id);
  const row=db.prepare('SELECT * FROM trustpilot_rewards WHERE tenant_id=?').get(s.tenant_id);
  const start=Date.parse(sub?.period_start),eligibleAt=Number.isFinite(start)?start+7*86400000:null;
  const amount=sub?.cycle==='annual'?Math.round(sub.paid_plan_cents/12):Math.round((sub?.paid_plan_cents||0)*7/100);
  const eligible=!!sub&&sub.state==='active'&&Date.parse(sub.period_end)>clock()&&eligibleAt!==null&&clock()>=eligibleAt;
  return {profileUrl:profile(),isDeveloper:developer(s),eligibleAt:eligibleAt?new Date(eligibleAt).toISOString():null,eligible,collectorAvailable:collectorConfigured&&eligible,collector:{templateId,buid,locale:'it-IT',size:'M',background:'light',border:'shadow',animatedStars:true},cycle:sub?.cycle||null,amountCents:amount,reward:row||null};
 }
 function collectorPayload(s){
  const v=status(s);if(!v.collectorAvailable)throw new ApiError(409,'Il collector Trustpilot non è disponibile per questo account.');
  const owner=db.prepare("SELECT u.email,t.name FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id WHERE m.tenant_id=? AND m.role='owner' ORDER BY u.email LIMIT 1").get(s.tenant_id);
  if(!owner?.email)throw new ApiError(409,'Manca un indirizzo email cliente verificato.');
  const sub=db.prepare('SELECT payment_reference,revision FROM plan_subscriptions WHERE tenant_id=?').get(s.tenant_id);
  const reference=`prime:${s.tenant_id}:${sub?.payment_reference||sub?.revision||'customer'}`;
  return createPayload({name:String(owner.name||'PRIME').slice(0,200),email:String(owner.email).slice(0,254),reference});
 }
 return async(req,res,url,s)=>{
  if(!url.pathname.startsWith('/api/billing/trustpilot'))return false;
  if(url.pathname==='/api/billing/trustpilot'&&req.method==='GET'){json(res,200,status(s));return true;}
  if(url.pathname==='/api/billing/trustpilot/collector-payload'&&req.method==='GET'){json(res,200,collectorPayload(s));return true;}
  if(url.pathname==='/api/billing/trustpilot/requests'&&req.method==='GET'){
   if(!developer(s))throw new ApiError(403,'Riservato allo sviluppatore.');
   json(res,200,db.prepare('SELECT r.*,t.name agency FROM trustpilot_rewards r JOIN tenants t ON t.id=r.tenant_id ORDER BY submitted_at DESC LIMIT 200').all());return true;
  }
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito');
  const b=await readBody(req);
  if(url.pathname==='/api/billing/trustpilot'){
   if(s.role!=='owner')throw new ApiError(403,'Richiesta riservata al titolare.');
   const v=status(s);if(!v.eligible)throw new ApiError(409,'Serve un abbonamento attivo da almeno 7 giorni.');
   let u;try{u=new URL(b.reviewUrl);}catch{throw new ApiError(400,'Inserisci il link pubblico della recensione.');}
   if(u.protocol!=='https:'||!['trustpilot.com','www.trustpilot.com','it.trustpilot.com'].includes(u.hostname)||!/^\/reviews\/[a-f0-9]{24}\/?$/i.test(u.pathname)||u.username||u.password||u.search||u.hash)throw new ApiError(400,'Link alla recensione Trustpilot non valido.');
   u.hostname='www.trustpilot.com';u.pathname=u.pathname.replace(/\/$/,'');
   if(v.reward)throw new ApiError(409,'Hai già inviato una richiesta.');
   const sub=db.prepare('SELECT * FROM plan_subscriptions WHERE tenant_id=?').get(s.tenant_id);
   if(v.amountCents<=0)throw new ApiError(409,'Importo del canone non disponibile.');
   if(db.prepare('SELECT 1 FROM trustpilot_rewards WHERE review_url=?').get(u.href))throw new ApiError(409,'Recensione già associata a una richiesta.');
   db.prepare('INSERT INTO trustpilot_rewards(tenant_id,review_url,cycle,amount_cents,payment_reference,submitted_at) VALUES(?,?,?,?,?,?)').run(s.tenant_id,u.href,v.cycle,v.amountCents,sub.payment_reference,new Date(clock()).toISOString());
   json(res,200,{saved:true});return true;
  }
  if(url.pathname==='/api/billing/trustpilot/verify'){
   if(!developer(s))throw new ApiError(403,'Riservato allo sviluppatore.');
   if(!['approved','rejected','fulfilled'].includes(b.status))throw new ApiError(400,'Stato non valido.');
   const row=db.prepare('SELECT * FROM trustpilot_rewards WHERE tenant_id=?').get(b.tenantId);
   if(!row||row.status!== (b.status==='fulfilled'?'approved':'pending'))throw new ApiError(409,'Stato della richiesta cambiato.');
   const at=new Date(clock()).toISOString();
   if(b.status==='fulfilled'){
    throw new ApiError(409,'L’erogazione viene registrata automaticamente dopo la conferma del pagamento.');

    const ref=String(b.reference||'').trim();if(ref.length<5||ref.length>200)throw new ApiError(400,'Indica il riferimento reale di sconto o rimborso.');
    db.prepare("UPDATE trustpilot_rewards SET status='fulfilled',fulfillment_reference=?,fulfilled_at=? WHERE tenant_id=? AND status='approved'").run(ref,at,b.tenantId);
   }else db.prepare("UPDATE trustpilot_rewards SET status=?,verified_by=?,verified_at=?,automation_state=? WHERE tenant_id=? AND status='pending'").run(b.status,s.user_id,at,b.status==='approved'?'pending':'manual_review',b.tenantId);
   if(b.status==='approved')await fulfillment.process(b.tenantId);
   json(res,200,{saved:true});return true;
  }
  throw new ApiError(404,'Operazione non disponibile.');
 };
}
