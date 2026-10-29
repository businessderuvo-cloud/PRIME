const partners=[
  {id:'infomaniak',name:'Infomaniak',key:'infomaniak',logo:'/brands/providers/infomaniak-wordmark.svg',site:'https://www.infomaniak.com/it/ksuite',defaultType:'personal'},
  {id:'zoho',name:'Zoho Mail',key:'zohoMail',logo:'/assets/zoho-mail-logo.svg',site:'https://www.zoho.com/mail/',defaultType:'personal'},
  {id:'infocert',name:'InfoCert PEC',key:'infoCertPec',logo:'/brands/providers/legalmail.svg',site:'https://www.infocert.it/prodotti/legalmail-pec',defaultType:'pec'},
];
export const partnerUrls=Object.freeze({infomaniak:'https://www.infomaniak.com/goto/it/hosting.mail?utm_term=6ae2e98984b6c',zohoMail:'',infoCertPec:''});

export function renderPartnerMail(main,{data,api,refresh}){
  const grid=main.querySelector('.mail-provider-grid');
  if(!grid)return;
  grid.querySelectorAll('[data-partner]').forEach(card=>card.remove());
  const fragment=document.createDocumentFragment();
  for(const provider of partners){
    const account=data.connections.find(connection=>connection.provider===provider.id&&connection.status!=='disconnected');
    const type=account?.account_label?.startsWith('PEC · ')?'pec':account?'personal':provider.defaultType;
    const email=account?.account_label?.replace(/^(?:Personale|PEC) · /,'')||'';
    const card=document.createElement('section');
    card.className='panel mail-provider partner-mail-card';
    card.dataset.partner=provider.id;
    const logoClass=provider.id==='zoho'?' partner-zoho-logo':'';
    const logoSize=provider.id==='zoho'?112:28;
    const genericMailIcon='<span class="integration-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
    const logo=['infomaniak','zoho'].includes(provider.id)?genericMailIcon:`<span class="integration-brand-icon${logoClass}"><img src="${provider.logo}" alt="Logo ${provider.name}" width="${logoSize}" height="${logoSize}"></span>`;
    const switchMarkup=`<div class="partner-switch" role="group" aria-label="Tipo di casella per ${provider.name}"><button type="button" data-mode="personal" class="${type==='personal'?'active':''}" aria-pressed="${type==='personal'}">Personale</button><button type="button" data-mode="pec" class="${type==='pec'?'active':''}" aria-pressed="${type==='pec'}">PEC</button></div><p class="small-note" data-description>${type==='pec'?'In PRIME questa casella è classificata come PEC.':'In PRIME questa casella è classificata come email personale.'}</p>`;
    let accountMarkup;
    if(account){
      accountMarkup=`<span class="pill">${account.status==='error'||account.status==='reauthorize'?'Controllo da verificare':'Account collegato'}</span><p>${escapeHtml(email||account.account_label)}</p><p class="small-note">${account.last_sync_at?'Ultimo controllo: '+escapeHtml(new Date(account.last_sync_at).toLocaleString('it-IT')):account.last_error?escapeHtml(account.last_error):'In attesa del primo controllo.'}</p><button class="primary" type="button" data-open-form>Aggiorna accesso account</button>${formMarkup(provider,email,type,true)}<div class="partner-actions"><button class="secondary" type="button" data-check="${escapeHtml(account.id)}">Controlla ora</button><button class="text-button" type="button" data-unlink="${escapeHtml(account.id)}">Scollega</button></div>`;
    }else{
      accountMarkup=`<span class="pill">Da collegare</span><button class="primary" type="button" data-open-form>Collega account ${provider.name}</button>${formMarkup(provider,'',type,false)}`;
    }
    const affiliateUrl=partnerUrls[provider.key];
    const serviceLink=`<a class="text-button partner-service-link" href="${affiliateUrl||provider.site}" target="_blank" rel="noopener noreferrer">${affiliateUrl?'Apri offerta partner ↗':`Visita ${provider.name} ↗`}</a>`;
    card.innerHTML=`<h2 class="mail-provider-title">${logo}<span>${provider.name}</span></h2>${switchMarkup}${accountMarkup}${serviceLink}`;
    fragment.append(card);
  }
  grid.append(fragment);
  grid.querySelectorAll('[data-partner]').forEach(card=>{
    const provider=partners.find(item=>item.id===card.dataset.partner);
    const account=data.connections.find(connection=>connection.provider===provider.id&&connection.status!=='disconnected');
    const form=card.querySelector('.partner-imap-form');
    card.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',async()=>{
      const nextType=button.dataset.mode,oldType=card.querySelector('[data-mode].active')?.dataset.mode;
      if(nextType===oldType)return;
      setMailboxMode(card,nextType);
      const hiddenType=form?.querySelector('[name="mailbox_type"]');
      if(hiddenType)hiddenType.value=nextType;
      if(account){
        const feedback=form?.querySelector('[role="status"]');
        if(feedback)feedback.textContent='Aggiorno il tipo di casella…';
        try{await api(`/api/connect/mail/connections/${account.id}/type`,{method:'PATCH',body:JSON.stringify({mailbox_type:nextType})});await refresh();}
        catch(error){setMailboxMode(card,oldType);if(hiddenType)hiddenType.value=oldType;if(feedback)feedback.textContent=error.message;}
      }
    }));
    card.querySelector('[data-open-form]')?.addEventListener('click',()=>{form.hidden=false;card.querySelector('[data-open-form]').hidden=true;form.querySelector('input[name="email"]')?.focus();});
    card.querySelector('[data-cancel]')?.addEventListener('click',()=>{form.hidden=true;card.querySelector('[data-open-form]').hidden=false;});
    form?.addEventListener('submit',async event=>{
      event.preventDefault();
      const button=form.querySelector('[type=submit]'),feedback=form.querySelector('[role=status]'),body=Object.fromEntries(new FormData(form));
      button.disabled=true;feedback.textContent='Verifico e collego l’account…';
      try{await api(`/api/connect/mail/imap/connect/${provider.id}`,{method:'POST',body:JSON.stringify(body)});await refresh();}
      catch(error){feedback.textContent=error.message;button.disabled=false;}
    });
    card.querySelector('[data-check]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{await api(`/api/connect/mail/connections/${button.dataset.check}/sync`,{method:'POST',body:'{}'});await refresh();}
      catch(error){button.disabled=false;const note=card.querySelector('.small-note');if(note)note.textContent=error.message;}
    });
    card.querySelector('[data-unlink]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{await api(`/api/connect/connections/${button.dataset.unlink}`,{method:'DELETE'});await refresh();}
      catch(error){button.disabled=false;const note=card.querySelector('.small-note');if(note)note.textContent=error.message;}
    });
  });
}
function formMarkup(provider,email,type,hidden){
  return `<form class="partner-imap-form" hidden><input type="hidden" name="mailbox_type" value="${type}"><label>${provider.id==='infocert'?'Email o User ID':'Indirizzo email'}<input name="email" type="${provider.id==='infocert'?'text':'email'}" autocomplete="username" value="${escapeHtml(email)}" maxlength="254" required></label>${provider.id==='zoho'?'<label>Area account<select name="region"><option value="eu">Europa · casella personale</option><option value="eu-org">Europa · account aziendale</option><option value="global">Globale · casella personale</option><option value="global-org">Globale · account aziendale</option></select></label>':''}<label>Password IMAP<input name="password" type="password" autocomplete="current-password" required></label><p class="small-note">Inserisci la password della casella o la password specifica per app richiesta dal provider. Le credenziali vengono conservate cifrate; PRIME legge solo mittente e oggetto.</p><button class="primary" type="submit">${hidden?'Verifica e aggiorna collegamento':'Verifica e collega account'}</button><button class="text-button" type="button" data-cancel>Annulla</button><p class="connect-feedback" role="status"></p></form>`;
}
function setMailboxMode(card,type){
  card.querySelectorAll('[data-mode]').forEach(button=>{const active=button.dataset.mode===type;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  card.querySelector('[data-description]').textContent=type==='pec'?'In PRIME questa casella è classificata come PEC.':'In PRIME questa casella è classificata come email personale.';
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
