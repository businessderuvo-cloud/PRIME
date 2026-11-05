const enc=new TextEncoder();
export const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function newDevice(){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 return {private_key:await crypto.subtle.exportKey('jwk',keys.privateKey),public_key:await crypto.subtle.exportKey('jwk',keys.publicKey)};
}
export async function signApproval(entry,message){
 const key=await crypto.subtle.importKey('jwk',entry.private_key,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 return base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(message)));
}
export function parsePrimeQr(value,origin){
 let u;try{u=new URL(value);}catch{return null;}
 if(u.origin!==origin||u.pathname!=='/authenticator/')return null;
 const h=new URLSearchParams(u.hash.slice(1));
 for(const action of ['pair','login']){const v=h.get('prime-'+action);if(v){const parts=v.split('.');if(parts.length!==2||!parts.every(x=>/^[A-Za-z0-9_-]{43}$/.test(x)))throw Error('QR PRIME non valido.');return {action,id:parts[0],secret:parts[1]};}}
 return null;
}
export function primeQr({getEntries,isUnlocked,save,notice,render}){
 const dialog=document.querySelector('#prime-request'),body=dialog.querySelector('.request-body');let generation=0;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=async(path,body)=>{const r=await fetch('/api/auth/qr/'+path,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Error(v.error||'Operazione non disponibile.');return v;};
 const active=g=>{if(g!==generation||!isUnlocked())throw Error('Sblocca di nuovo l’archivio.');};
 const show=html=>{body.innerHTML=html;if(!dialog.open)dialog.showModal();};
 function cancel(){generation++;if(dialog.open)dialog.close();body.replaceChildren();}
 dialog.querySelector('#prime-request-close').onclick=cancel;
 async function handle(value){
  const q=parsePrimeQr(value,location.origin);if(!q)return false;
  if(!isUnlocked())throw Error('Sblocca l’archivio prima di scansionare un QR PRIME.');
  const g=++generation;
  if(q.action==='pair'){
   if(getEntries().length>=100)throw Error('Massimo 100 account per archivio.');
   show('<h2>Abbina questo dispositivo</h2><p>Il dispositivo potrà approvare accessi a PRIME senza password. Avvia l’abbinamento solo dal tuo account, in Sicurezza account.</p><label>Nome del dispositivo<input id="device-label" maxlength="80" value="'+escape(/iPhone|iPad/.test(navigator.userAgent)?'Il mio iPhone':/Android/.test(navigator.userAgent)?'Il mio Android':'Il mio browser')+'"></label><button class="primary" id="pair-accept">Abbina a PRIME</button><p class="request-status" role="status"></p>');
   body.querySelector('#pair-accept').onclick=async e=>{
    e.currentTarget.disabled=true;const status=body.querySelector('.request-status');
    try{
     const keys=await newDevice();active(g);
     const r=await api('pair/submit',{id:q.id,token:q.secret,public_key:keys.public_key,label:body.querySelector('#device-label').value});active(g);
     const entry={type:'prime-device',paired:false,pair_id:q.id,pair_token:q.secret,id:r.device_id,issuer:'PRIME',account:r.account,origin:location.origin,private_key:keys.private_key,public_key:keys.public_key,fingerprint:r.fingerprint};
     getEntries().push(entry);try{await save();}catch(error){getEntries().pop();throw error;}active(g);
     show('<h2>Conferma in PRIME</h2><p>Confronta questa impronta con quella sul gestionale e premi <strong>Conferma dispositivo</strong> solo se coincidono.</p><p class="device-fingerprint">'+escape(r.fingerprint)+'</p><p>'+escape(r.account)+'</p><p class="request-status" role="status">In attesa della tua conferma sul gestionale…</p>');
     const until=Date.now()+300000;
     while(g===generation&&isUnlocked()&&Date.now()<until){const p=await api('pair/status',{id:q.id,token:q.secret});active(g);if(p.status==='confirmed'){entry.paired=true;delete entry.pair_id;delete entry.pair_token;await save();active(g);cancel();notice('Dispositivo abbinato. Ora puoi scansionare i QR nella schermata di accesso PRIME.');await render();return;}await new Promise(r=>setTimeout(r,2000));}
    }catch(error){if(g===generation&&isUnlocked()){const output=body.querySelector('.request-status');if(output)output.textContent=error.message;}}
   };
  }else{
   const devices=getEntries().filter(e=>e.type==='prime-device'&&e.origin===location.origin);
   if(!devices.length)throw Error('Abbina prima il dispositivo da PRIME → Sicurezza account → Accesso con QR.');
   const r=await api('details',{id:q.id,nonce:q.secret});active(g);
   show('<h2>Autorizzi questo accesso?</h2><p><strong>'+escape(r.origin)+'</strong><br>'+escape(r.browser)+'</p><p>Il numero sul gestionale deve essere uguale a questo:</p><p class="device-fingerprint">'+escape(r.match_code)+'</p><p>Approva solo un accesso che hai avviato tu. Scade tra pochi minuti.</p><label>Account<select id="login-device">'+devices.map((d,i)=>'<option value="'+i+'">'+escape(d.account)+'</option>').join('')+'</select></label><button id="approve-login" class="primary">Approva accesso a PRIME</button><p class="request-status" role="status"></p>');
   body.querySelector('#approve-login').onclick=async e=>{
    e.currentTarget.disabled=true;
    try{active(g);const d=devices[Number(body.querySelector('#login-device').value)];const signature=await signApproval(d,r.message);active(g);await api('approve',{id:q.id,nonce:q.secret,device_id:d.id,signature});active(g);cancel();notice('Accesso approvato. Il gestionale si aprirà sul dispositivo che ha mostrato il QR.');}
    catch(error){if(g===generation&&isUnlocked()){body.querySelector('.request-status').textContent=error.message;body.querySelector('#approve-login').disabled=false;}}
   };
  }
  return true;
 }
 async function resumePending(){
  for(const entry of getEntries().filter(e=>e.type==='prime-device'&&e.paired===false&&e.pair_id&&e.pair_token)){
   const g=++generation;show('<h2>Completa l’abbinamento a PRIME</h2><p>Hai già scansionato il QR. Torna al gestionale e conferma il dispositivo dopo aver confrontato l’impronta.</p><p class="device-fingerprint">'+escape(entry.fingerprint)+'</p><p class="request-status" role="status">In attesa della conferma…</p>');
   const until=Date.now()+300000;
   while(g===generation&&isUnlocked()&&Date.now()<until){
    try{const p=await api('pair/status',{id:entry.pair_id,token:entry.pair_token});active(g);if(p.status==='confirmed'){entry.paired=true;delete entry.pair_id;delete entry.pair_token;await save();active(g);cancel();notice('Dispositivo abbinato. Ora puoi accedere a PRIME con i QR.');await render();break;}}
    catch(error){if(!isUnlocked()||g!==generation)return;getEntries().splice(getEntries().indexOf(entry),1);await save();cancel();notice(error.message);await render();break;}
    await new Promise(r=>setTimeout(r,2000));
   }
   if(g===generation&&!isUnlocked())return;
   if(g===generation&&Date.now()>=until){getEntries().splice(getEntries().indexOf(entry),1);await save();cancel();notice('Abbinamento scaduto. Avviane uno nuovo da Sicurezza account.');await render();}
  }
 }
 return {handle,cancel,resumePending};
}
