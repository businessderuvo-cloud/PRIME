import { renderPartnerMail } from './partner-mail.js?v=20261102-infomaniak-inbox-layout';
import { renderZohoPec } from './zoho-pec.js?v=20261101-transparent-logos';
const providers = { gmail: 'Gmail', outlook: 'Outlook', zoho: 'Zoho Mail' };
const brandIcons = { gmail: 'gmail', outlook: 'outlook' };
const brandIcon = provider => provider === 'zoho' ? '<span class="integration-brand-icon" aria-hidden="true"><img src="/assets/zoho-mail-logo.svg" alt="" width="28" height="28"></span>' : `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${brandIcons[provider]}.svg" alt="" width="28" height="28"></span>`;
export async function renderMail({ state, main, api, pageHeader, esc }) {
  const data = await api('/api/connect');
  data.mailProviders = data.mailProviders.filter(provider => provider.provider !== 'yahoo');
  data.mail = data.mail.filter(message => message.provider !== 'yahoo');
  const canZapier = false;
  const zapierMail = data.zapier_mail || { configured: false, endpoint: '/api/connect/webhook/zapier/mail' };
  main.innerHTML = pageHeader('LA TUA POSTA, A COLPO D’OCCHIO', 'Email', 'Collega i tuoi account email e PEC in un unico spazio.') + '<p class="small-note">La posta è personale: ogni utente vede soltanto le proprie notifiche. PRIME mostra mittente e oggetto. Le richieste Trustpilot automatiche partono dalla casella Zoho Mail autorizzata, dopo 7 giorni dall’attivazione, con richiesta di ricevuta di lettura.</p>' + `<div class="mail-provider-grid">${data.mailProviders.filter(provider => provider.provider !== 'yahoo').map(provider => {
    const account = data.connections.find(item => item.provider === provider.provider && item.status !== 'disconnected');
    const status = !account ? provider.configured ? 'Da collegare' : 'Non configurato' : account.status === 'reauthorize' ? 'Da ricollegare' : account.status === 'error' ? 'Controllo non riuscito' : 'Collegato';
    const connect = !account || account.status === 'reauthorize' ? provider.configured ? `<button class="primary" data-mail-connect="${provider.provider}">${account ? 'Ricollega' : 'Collega'} ${providers[provider.provider]}</button>` : '' : '';
    const mailboxType = account?.account_label.startsWith('PEC · ') ? 'pec' : 'personal';
    const mailboxName = account?.account_label.replace(/^(?:Personale|PEC) · /, '') || '';
    const switchMarkup = '<div class="partner-switch mail-account-switch" role="group" aria-label="Tipo di casella per '+providers[provider.provider]+'"><button type="button" data-mailbox-mode="personal" class="'+(mailboxType==='personal'?'active':'')+'" aria-pressed="'+(mailboxType==='personal')+'">Personale</button><button type="button" data-mailbox-mode="pec" class="'+(mailboxType==='pec'?'active':'')+'" aria-pressed="'+(mailboxType==='pec')+'">PEC</button></div>';
    const mailboxDescription = mailboxType === 'pec' ? 'In PRIME questa casella è classificata come PEC.' : 'In PRIME questa casella è classificata come email personale.';
    const testButton = provider.provider === 'zoho' && account && ['owner','manager'].includes(state.me.role) ? '<button class="secondary" type="button" data-trustpilot-test>Invia test Trustpilot a deruvomichele@gmail.com</button>' : '';
    const connected = account ? `<p>${esc(mailboxName)}</p><p class="small-note">Ultimo controllo: ${account.last_sync_at ? esc(new Date(account.last_sync_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT'))) : 'in attesa del primo controllo'}</p>${account.last_error ? `<p class="error">${esc(account.last_error)}</p>` : ''}<div class="connect-actions"><button class="secondary" data-mail-check="${esc(account.id)}">Controlla ora</button>${testButton}<button class="text-button" data-mail-unlink="${esc(account.id)}">Scollega</button></div>` : `<p>${state.me.customer_demo ? "Il collegamento reale della posta non è attivo nella demo." : provider.configured ? "Accedi al tuo account e autorizza PRIME a mostrarti le notifiche." : "Collegamento in preparazione. Contatta l’assistenza PRIME."}</p>`;
    return `<section class="panel mail-provider" data-mail-account="${provider.provider}" data-mailbox-type="${mailboxType}"><h2 class="mail-provider-title">${brandIcon(provider.provider)}<span>${providers[provider.provider]}${''}</span></h2><div class="mail-provider-controls"><span class="pill">${esc(status)}</span>${switchMarkup}</div><p class="small-note" data-mailbox-description>${mailboxDescription}</p>${connected}${connect}<p class="connect-feedback" role="status"></p></section>`;
  }).join('')}</div><section class="panel mail-panel"><h2>Notifiche email</h2><label>Cerca mittente o oggetto<input id="mail-search" type="search" placeholder="Cerca nelle notifiche…"></label><p class="small-note">“Nascondi notifica” agisce soltanto in PRIME: non archivia e non modifica la casella email.</p><div id="mail-list" class="mail-notifications"></div><p id="mail-feedback" role="status"></p></section>`;
  if (canZapier) {
    const zapierPanel = document.createElement('section');
    zapierPanel.className = 'panel zapier-mail-panel';
    zapierPanel.innerHTML = "<p class='eyebrow'>AUTOMAZIONE DIRETTA</p><h2>Zapier → PRIME</h2><p>Collega il tuo Zapier a questa agenzia. Le nuove email di Outlook arriveranno nelle notifiche PRIME; vengono importati solo mittente, oggetto, data e link alla casella.</p><p><strong>1.</strong> In Zapier crea un trigger Microsoft Outlook “New Email”. <strong>2.</strong> Aggiungi “Webhooks by Zapier” con evento <strong>POST</strong>, payload <strong>JSON</strong> e Basic Auth <code>PRIME:la tua chiave</code>. <strong>3.</strong> Mappa i campi <code>id</code>, <code>from</code>, <code>subject</code>, <code>webLink</code> e <code>receivedDateTime</code>.</p><label>URL di destinazione<input readonly value='" + esc(location.origin + zapierMail.endpoint) + "'></label><p class='small-note'>" + (zapierMail.configured ? 'Zapier è abilitato per questa agenzia.' : 'Genera una chiave da inserire nel passaggio Webhooks del tuo Zap.') + "</p><button class='primary' type='button' data-zapier-key>" + (zapierMail.configured ? 'Rigenera chiave Zapier' : 'Genera chiave Zapier') + "</button>" + (zapierMail.configured ? " <button class='text-button' type='button' data-zapier-revoke>Scollega Zapier</button>" : '') + "<p class='small-note' data-zapier-key-feedback role='status'></p><div data-zapier-secret hidden><p>Username Basic Auth: <code>PRIME</code></p><p>Password Basic Auth (visibile una sola volta): <code data-zapier-password></code></p><p><button class='secondary' type='button' data-zapier-copy>Copia chiave</button></p></div>";
    main.querySelector('.mail-provider-grid')?.after(zapierPanel);
    zapierPanel.querySelector('[data-zapier-key]').onclick = async event => {
      const button = event.currentTarget, feedback = zapierPanel.querySelector('[data-zapier-key-feedback]');
      button.disabled = true; feedback.textContent = 'Genero una nuova chiave…';
      try { const result = await api('/api/connect/zapier/mail-token', { method: 'POST', body: '{}' }); zapierPanel.querySelector('[data-zapier-password]').textContent = result.password; zapierPanel.querySelector('[data-zapier-secret]').hidden = false; feedback.textContent = 'Chiave generata. Copiala ora e inseriscila nel tuo Zap.'; }
      catch (error) { feedback.textContent = error.message; }
      finally { button.disabled = false; }
    };
    zapierPanel.querySelector('[data-zapier-copy]').onclick = async () => {
      const password = zapierPanel.querySelector('[data-zapier-password]').textContent;
      try { await navigator.clipboard.writeText(password); zapierPanel.querySelector('[data-zapier-key-feedback]').textContent = 'Chiave copiata.'; }
      catch { zapierPanel.querySelector('[data-zapier-key-feedback]').textContent = 'Seleziona e copia la chiave visualizzata.'; }
    };
    zapierPanel.querySelector('[data-zapier-revoke]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try { await api('/api/connect/zapier/mail-token', { method: 'DELETE' }); await renderMail({ state, main, api, pageHeader, esc }); }
      catch (error) { zapierPanel.querySelector('[data-zapier-key-feedback]').textContent = error.message; button.disabled = false; }
    });
  }
  renderPartnerMail(main, { data, api, customerDemo: Boolean(state.me.customer_demo), refresh: () => renderMail({ state, main, api, pageHeader, esc }) });
  renderZohoPec({ main, state });
  const extensionPanel = document.createElement('section');
  extensionPanel.className = 'panel mail-request-panel';
  extensionPanel.innerHTML = '<p class="eyebrow">ESTENSIONI EMAIL</p><h2>Altri provider, su richiesta</h2><p>Puoi chiedere supporto per Virgilio Mail o per un provider PEC.</p><div class="mail-request-grid"><article><h3>Virgilio Mail</h3><p>Chiedi di valutare il supporto per la tua casella Virgilio Mail.</p><button type="button" class="secondary" data-mail-provider-request="Virgilio Mail">Richiedi Virgilio Mail</button></article><article><h3>Posta certificata (PEC)</h3><p>Richiedi la verifica tecnica per il tuo gestore PEC.</p><label class="mail-request-provider">Gestore PEC<select aria-label="Seleziona gestore PEC" data-pec-provider><option value="">Seleziona gestore</option><option>Aruba PEC</option><option>Legalmail</option><option>Register.it PEC</option><option>InfoCert PEC</option><option>Altro gestore PEC</option></select></label><button type="button" class="secondary" data-mail-provider-request="PEC" disabled>Richiedi supporto PEC</button></article></div>';
  main.querySelector('.zoho-pec-panel')?.after(extensionPanel);
  const pecSelect = extensionPanel.querySelector('[data-pec-provider]');
  const pecButton = extensionPanel.querySelector('[data-mail-provider-request="PEC"]');
  pecSelect.onchange = () => { pecButton.disabled = !pecSelect.value; };
  extensionPanel.querySelectorAll('[data-mail-provider-request]').forEach(button => button.onclick = async () => {
    const provider = button.dataset.mailProviderRequest === 'PEC' ? pecSelect.value : button.dataset.mailProviderRequest;
    if (!provider) return;
    button.disabled = true;
    try { await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Feedback sull’app: Richiesta di attivazione provider email ' + provider + '.' }] }) }); button.textContent = 'Richiesta registrata'; }
    catch (error) { button.disabled = false; main.querySelector('#mail-feedback').textContent = error.message; }
  });
  function draw() {
    const query = main.querySelector('#mail-search').value.trim().toLocaleLowerCase('it');
    const notifications = data.mail.filter(mail => `${mail.sender} ${mail.subject}`.toLocaleLowerCase('it').includes(query));
    main.querySelector('#mail-list').innerHTML = notifications.map(mail => `<article class="mail-notification"><span class="pill">${providers[mail.provider] || ({ infomaniak: 'Infomaniak', zoho: 'Zoho Mail', infocert: 'InfoCert PEC' }[mail.provider] || esc(mail.provider))}</span><div><strong>${esc(mail.sender)}</strong><p>${esc(mail.subject)}</p><small>${esc(mail.account_label)} · ${esc(new Date(mail.received_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT')))}</small></div><a href="${esc(mail.provider_url)}" target="_blank" rel="noopener noreferrer">Apri email ↗</a><button class="text-button" data-hide-mail="${esc(mail.message_id)}" data-connection="${esc(mail.connection_id)}">Nascondi notifica</button></article>`).join('') || (data.connections.some(item=>item.provider==='infomaniak'&&item.status==='connected')?'<p class="muted">Nessuna notifica recente. Premi Controlla ora nella scheda Infomaniak per aggiornare.</p>':'<p class="muted">Nessuna notifica da mostrare.</p>');
    main.querySelectorAll('[data-hide-mail]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await api(`/api/connect/mail/connections/${button.dataset.connection}/dismiss`, { method: 'POST', body: JSON.stringify({ message_id: button.dataset.hideMail }) }); data.mail = data.mail.filter(mail => !(mail.connection_id === button.dataset.connection && mail.message_id === button.dataset.hideMail)); draw(); }
      catch (error) { main.querySelector('#mail-feedback').textContent = error.message; button.disabled = false; }
    });
  }
  main.querySelector('#mail-search').oninput = draw;
  draw();
  main.querySelectorAll('[data-mail-account]').forEach(card => card.querySelectorAll('[data-mailbox-mode]').forEach(button => button.onclick = async () => {
    const oldType = card.dataset.mailboxType || 'personal', nextType = button.dataset.mailboxMode;
    if (nextType === oldType) return;
    const setMode = type => { card.dataset.mailboxType = type; card.querySelectorAll('[data-mailbox-mode]').forEach(item => { const active=item.dataset.mailboxMode===type; item.classList.toggle('active',active); item.setAttribute('aria-pressed',String(active)); }); card.querySelector('[data-mailbox-description]').textContent=type==='pec'?'In PRIME questa casella è classificata come PEC.':'In PRIME questa casella è classificata come email personale.'; };
    setMode(nextType);
    const account=data.connections.find(item=>item.provider===card.dataset.mailAccount&&item.status!=='disconnected'); if(!account)return;
    const feedback=card.querySelector('.connect-feedback'); feedback.textContent='Aggiorno il tipo di casella…';
    try { await api(`/api/connect/mail/connections/${account.id}/type`,{method:'PATCH',body:JSON.stringify({mailbox_type:nextType})}); await renderMail({state,main,api,pageHeader,esc}); }
    catch(error){setMode(oldType);feedback.textContent=error.message;}
  }));
  main.querySelectorAll('[data-mail-connect]').forEach(button => button.onclick = async () => {
    const card = button.closest('[data-mail-account]');
    if (state.me.customer_demo) { card.querySelector('.connect-feedback').textContent = 'Il collegamento reale della posta non è attivo nella demo.'; return; }
    button.disabled = true;
    try { const result = await api(`/api/connect/mail/authorize/${button.dataset.mailConnect}`, { method: 'POST', body: JSON.stringify({ mailbox_type: card.dataset.mailboxType||'personal' }) }); location.assign(result.url); }
    catch (error) { card.querySelector('.connect-feedback').textContent = error.message; button.disabled = false; }
  });
  main.querySelectorAll('[data-trustpilot-test]').forEach(button => button.onclick = async () => {
    const card=button.closest('[data-mail-account]'),feedback=card.querySelector('.connect-feedback');button.disabled=true;feedback.textContent='Invio del test in corso…';
    try { const result=await api('/api/trustpilot/test',{method:'POST',body:JSON.stringify({to:'deruvomichele@gmail.com'})});feedback.textContent=`Test inviato a ${result.to}. Ricevuta di lettura richiesta.`; }
    catch(error){feedback.textContent=error.message;button.disabled=false;}
  });
  const run = async (button, action) => {
    button.disabled = true;
    const feedback = button.closest('[data-mail-account]').querySelector('.connect-feedback');
    feedback.textContent = 'Attendi…';
    try { await action(); } catch (error) { feedback.textContent = error.message; button.disabled = false; }
  };
  main.querySelectorAll('[data-mail-check]').forEach(button => button.onclick = () => run(button, async () => { await api(`/api/connect/mail/connections/${button.dataset.mailCheck}/sync`, { method: 'POST', body: '{}' }); await renderMail({ state, main, api, pageHeader, esc }); }));
  main.querySelectorAll('[data-mail-unlink]').forEach(button => button.onclick = () => run(button, async () => { await api(`/api/connect/connections/${button.dataset.mailUnlink}`, { method: 'DELETE' }); await renderMail({ state, main, api, pageHeader, esc }); }));
  const panel = main.querySelector('.mail-panel');
  let refreshing = false;
  const timer = setInterval(async () => {
    if (!panel.isConnected) { clearInterval(timer); return; }
    if (refreshing || document.hidden) return;
    refreshing = true;
    try { const fresh = await api('/api/connect'); if (panel.isConnected) { data.mail = fresh.mail.filter(message => message.provider !== 'yahoo'); draw(); } }
    catch { /* Keep the current notification list while the connection is unavailable. */ }
    finally { refreshing = false; }
  }, 30000);
}
