const storageNames={drive:'Google Drive',onedrive:'OneDrive',dropbox:'Dropbox'};
const storageLogos={drive:'/brands/providers/googledrive.svg',onedrive:'/brands/providers/microsoftonedrive.svg',dropbox:'/brands/providers/dropbox.svg'};
const safeHref=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}};

export function renderSecretServices({main,data,state,api,esc,navigate}){
 const plan=state.me.customer_demo?state.me.demo_plan:state.me.edition;
 if(plan!=='secret')return;
 const host=document.createElement('section');host.className='secret-services';
 const cloud=(data.storageProviders||[]).map(item=>{
  const name=storageNames[item.provider]||item.provider,account=item.connection,status=account?.status==='connected'?'Collegato':item.configured?'Pronto da collegare':'Client OAuth da configurare';
  const description='Sfoglia, carica e gestisci file e cartelle direttamente da PRIME.';
  return `<article class="panel secret-service-card" data-storage-provider="${esc(item.provider)}"><header><div class="secret-service-brand"><img src="${storageLogos[item.provider]}" alt="${esc(name)}" width="34" height="34"><h3>${esc(name)}</h3></div><span class="pill">${esc(status)}</span></header><p>${description}</p>${account?`<p class="small-note">Account: ${esc(account.account_label)}</p>`:`<p class="small-note">Autorizzazione richiesta solo dopo il consenso dell’utente Dropbox.</p>`}${item.redirect_uri?`<details><summary>Impostazioni OAuth</summary><p>URI di reindirizzamento da registrare nella console ${esc(name==='Dropbox'?'Dropbox':'del provider')}:</p><code class="connect-url">${esc(item.redirect_uri)}</code>${item.provider==='dropbox'?'<p>Abilita gli scope <code>account_info.read</code> e <code>files.metadata.read</code> per l’app Dropbox.</p>':''}</details>`:''}<div class="connect-actions">${account?.status==='connected'?`<button type="button" class="primary" data-storage-action="open">Apri ${esc(name)}</button><button type="button" class="secondary" data-storage-action="disconnect">Scollega</button>`:item.configured?`<button type="button" class="primary" data-storage-action="authorize">Collega ${esc(name)}</button>`:`<button type="button" class="secondary" disabled>Client OAuth non configurato</button>`}</div><p class="connect-feedback" role="status"></p></article>`;
 }).join('');
 const calendly=(data.connections||[]).find(item=>item.provider==='calendly'&&item.status==='connected');
 host.innerHTML='<h2>Archiviazione cloud</h2><p>Collega ogni servizio OAuth per aprirlo nella sua sezione dedicata. I file restano nel rispettivo account.</p><div class="secret-storage-grid">'+cloud+'</div><h2>Videoconferenze con Calendly</h2><p>Zoom e Microsoft Teams si configurano nei tipi di evento Calendly. PRIME usa il tipo selezionato quando prepara il link di prenotazione.</p><div class="secret-video-grid">'+[
  ['zoom','Zoom','/brands/providers/zoom.svg','zoom_conference'],
  ['teams','Microsoft Teams','/brands/providers/microsoftteams.svg','microsoft_teams_conference']
 ].map(([id,name,logo])=>`<article class="panel secret-service-card"><header><div class="secret-service-brand"><img src="${logo}" alt="" width="34" height="34"><h3>${name}</h3></div><span class="pill">${calendly?'Gestito da Calendly':'Collega prima Calendly'}</span></header><p>${calendly?`Seleziona in Calendly un tipo di evento con ${name} e PRIME lo mostrerà nella scelta della modalità video.`:`Collega Calendly, poi configura ${name} nelle sue integrazioni e scegli un tipo di evento video.`}</p><a class="text-button" href="https://calendly.com/integrations" target="_blank" rel="noopener noreferrer">${calendly?'Apri integrazioni Calendly':'Apri Calendly'} ↗</a></article>`).join('')+'</div>';
 main.querySelector('.connect-cards')?.after(host);
 for(const card of host.querySelectorAll('[data-storage-provider]')){
  const provider=card.dataset.storageProvider,item=(data.storageProviders||[]).find(entry=>entry.provider===provider),connection=item?.connection;
  card.querySelectorAll('[data-storage-action]').forEach(button=>button.addEventListener('click',async()=>{
   button.disabled=true;const feedback=card.querySelector('[role="status"]');
   try{
    if(button.dataset.storageAction==='authorize'){
     const result=await api('/api/connect/authorize/'+provider,{method:'POST',body:'{}'}),url=new URL(result.url);
     if(url.protocol!=='https:'||!['www.dropbox.com','dropbox.com','accounts.google.com','login.microsoftonline.com'].includes(url.hostname))throw new Error('Indirizzo OAuth non valido.');
     location.assign(url.href);return;
    }
    if(button.dataset.storageAction==='open'){await navigate('storage_'+provider);return;}
    if(button.dataset.storageAction==='disconnect'&&connection?.id){await api('/api/connect/connections/'+encodeURIComponent(connection.id),{method:'DELETE',body:'{}'});location.reload();return;}
   }catch(error){feedback.textContent=error.message;button.disabled=false;}
  }));
 }
}

export async function renderStorageSection({main,state,api,esc,pageHeader,provider}){
 const plan=state.me.customer_demo?state.me.demo_plan:state.me.edition;
 if(plan!=='secret'||!storageNames[provider])throw new Error('Sezione di archiviazione disponibile solo nel Secret Plan.');
 const name=storageNames[provider],logo=storageLogos[provider];
 main.innerHTML=pageHeader('CONNESSIONI',name,'File e cartelle del tuo account: sfoglia, carica, scarica e gestisci cartelle.')+`<section class="panel storage-browser"><header class="storage-browser-heading"><div class="secret-service-brand"><img src="${logo}" alt="" width="34" height="34"><h2>${esc(name)}</h2></div><span class="pill">Account collegato</span></header><div class="storage-toolbar"><button class="secondary" type="button" data-storage-back disabled>← Indietro</button><span data-storage-path>/</span><button class="secondary" type="button" data-storage-refresh>Aggiorna</button><button class="secondary" type="button" data-storage-new-folder>Nuova cartella</button><label class="secondary storage-upload-label">Carica file<input type="file" data-storage-upload hidden></label></div><p class="small-note" data-storage-message role="status">Caricamento…</p><div class="storage-file-list" data-storage-files></div></section>`;
 const host=main.querySelector('[data-storage-files]'),message=main.querySelector('[data-storage-message]'),pathLabel=main.querySelector('[data-storage-path]'),back=main.querySelector('[data-storage-back]');
 const stack=['root'];
 async function load(){
  const parent=stack.at(-1);back.disabled=stack.length===1;pathLabel.textContent=parent==='root'?'/':parent;
  message.textContent='Caricamento…';host.innerHTML='';
  try{
   const items=await api('/api/connect/storage/'+provider+'/files?parent='+encodeURIComponent(parent));
   if(!items.length){message.textContent='Questa cartella è vuota.';return;}
   message.textContent=items.length+' elementi';
   host.innerHTML=items.map(item=>{const href=safeHref(item.url);return `<article class="storage-file-row ${item.folder?'is-folder':''}"><button type="button" class="storage-file-name" ${item.folder?'data-storage-folder="'+esc(item.id)+'"':''} ${!item.folder||!item.id?'disabled':''}><span aria-hidden="true">${item.folder?'📁':'📄'}</span><strong>${esc(item.name||'Elemento senza nome')}</strong></button><span class="storage-file-date">${esc(item.modified_at?new Date(item.modified_at).toLocaleDateString('it-IT'):'')}</span>${!item.folder&&href?`<a class="text-button" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Apri ↗</a>`:''}${!item.folder?`<a class="text-button" href="/api/connect/storage/${provider}/download?id=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name||'file')}">Scarica</a>`:''}${item.folder?`<button type="button" class="text-button" data-storage-delete-folder="${esc(item.id)}">Elimina</button>`:''}</article>`;}).join('');
   host.querySelectorAll('[data-storage-folder]').forEach(button=>button.addEventListener('click',()=>{stack.push(button.dataset.storageFolder);void load();}));
  }catch(error){message.textContent=error.message;}
 }
 back.onclick=()=>{if(stack.length>1){stack.pop();void load();}};
 main.querySelector('[data-storage-refresh]').onclick=()=>void load();
 main.querySelector('[data-storage-new-folder]').onclick=async()=>{const name=prompt('Nome cartella');if(!name)return;try{await api('/api/connect/storage/'+provider+'/folders',{method:'POST',body:JSON.stringify({name,parent:stack.at(-1)})});await load();}catch(error){message.textContent=error.message;}};
 main.querySelector('[data-storage-upload]').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{const id=crypto.randomUUID();const response=await fetch('/api/connect/storage/'+provider+'/upload?name='+encodeURIComponent(file.name)+'&parent='+encodeURIComponent(stack.at(-1))+'&upload_id='+id,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-CSRF-Token':state.me.csrf},body:file});const value=await response.json();if(!response.ok)throw Error(value.error||'Caricamento non riuscito.');await load();}catch(error){message.textContent=error.message;}event.target.value='';};
 main.querySelectorAll('[data-storage-delete-folder]').forEach(button=>button.onclick=async()=>{if(!confirm('Eliminare questa cartella?'))return;try{await api('/api/connect/storage/'+provider+'/folders',{method:'DELETE',body:JSON.stringify({id:button.dataset.storageDeleteFolder})});await load();}catch(error){message.textContent=error.message;}});
 await load();
}
