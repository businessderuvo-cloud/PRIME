// Agency verification is completed during onboarding. Inside the workspace, show
// only a renewal notice when authoritative document expiry data requires it.
export function startDocumentRenewalNotifications({state,api}){
 if(!['owner','manager'].includes(state.me?.role))return ()=>{};
 let stopped=false,busy=false,renewing=false,renewalUrl='';
 const remove=()=>document.querySelector('#agency-document-notice')?.remove();
 async function check(){
  if(stopped||busy||renewing)return;
  busy=true;
  try{
   const data=await api('/api/kyb/document-notifications');
   if(stopped)return;
   if(!data.items.length){remove();return;}
   let notice=document.querySelector('#agency-document-notice');
   if(!notice){notice=document.createElement('aside');notice.id='agency-document-notice';notice.className='agency-document-notice';notice.setAttribute('role','status');document.querySelector('#main')?.before(notice);}
   notice.replaceChildren();
   const copy=document.createElement('div'),title=document.createElement('strong'),message=document.createElement('p');
   title.textContent='Documenti dell’agenzia da aggiornare';message.textContent='I documenti dell’agenzia risultano scaduti. Provvedi a inviare i documenti aggiornati.';copy.append(title,message);notice.append(copy);
   if(!data.canRenew){const hint=document.createElement('small');hint.textContent='Il titolare può provvedere all’invio dei documenti aggiornati.';copy.append(hint);return;}
   if(renewalUrl){const link=document.createElement('a');link.className='primary';link.href=renewalUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Continua all’invio dei documenti ↗';notice.append(link);return;}
   const button=document.createElement('button');button.className='primary';button.type='button';button.textContent='Invia documenti aggiornati';notice.append(button);
   button.onclick=async()=>{
    if(renewing)return;renewing=true;button.disabled=true;
    try{const result=await api('/api/kyb/renew-documents',{method:'POST',body:'{}'});renewalUrl=result.session?.url||'';if(!renewalUrl)throw Error('Invio documenti non disponibile. Riprova tra poco.');}
    catch(error){message.textContent=error.message;}
    finally{renewing=false;button.disabled=false;if(renewalUrl)check();}
   };
  }catch(error){if(error.status===401){stopped=true;clearInterval(timer);remove();}}
  finally{busy=false;}
 }
 const visible=()=>{if(!document.hidden)check();};
 const timer=setInterval(visible,60000);document.addEventListener('visibilitychange',visible);check();
 return ()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);remove();};
}
