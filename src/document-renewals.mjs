const dateOnly=value=>{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?value:null;
};
export function documentRenewalService(db){
 return {
  // Called only with the authoritative server-to-server verification decision.
  capture(row,decision){
   if(!['approved','kyc_expired'].includes(row.status))return;
   const reports=[decision.id_verifications,decision.document_verifications,decision.id_verification?[decision.id_verification]:null].filter(Array.isArray);
   if(!reports.length)return;
   db.prepare('DELETE FROM agency_document_expiries WHERE session_id=?').run(row.id);
   for(const [index,document] of reports.flat().entries()){
    const expires=dateOnly(document?.expiration_date);
    if(expires)db.prepare('INSERT OR REPLACE INTO agency_document_expiries VALUES (?,?,?)').run(row.id,String(index),expires);
   }
  },
  notifications(tenantId,environment,now=new Date()){
   const row=db.prepare("SELECT rowid,* FROM didit_kyb_sessions WHERE tenant_id=? AND environment=? AND status IN ('approved','kyc_expired') ORDER BY created_at DESC,rowid DESC LIMIT 1").get(tenantId,environment);
   if(!row)return [];
   // A date-only document remains valid through the end of its expiry date in Italy.
   const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   const expired=db.prepare('SELECT expires_on FROM agency_document_expiries WHERE session_id=? AND expires_on<? ORDER BY expires_on').all(row.id,today);
   if(!expired.length&&row.status!=='kyc_expired')return [];
   return [{id:'agency-documents:'+row.id,title:'Documenti dell’agenzia da aggiornare',message:'I documenti dell’agenzia risultano scaduti. Provvedi a inviare i documenti aggiornati.',expiredOn:expired[0]?.expires_on||null}];
  }
 };
}
