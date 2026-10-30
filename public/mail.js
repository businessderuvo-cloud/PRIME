import { renderPartnerMail } from './partner-mail.js?v=20261029-no-proton';
import { renderZohoPec } from './zoho-pec.js?v=20261029-mail-controls';
const providers = { gmail: 'Gmail', outlook: 'Outlook' };
const brandIcons = { gmail: 'gmail', outlook: 'outlook' };
const brandIcon = provider => `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${brandIcons[provider]}.svg" alt="" width="28" height="28"></span>`;
const guides = {
  gmail: {
    url: 'https://console.cloud.google.com/apis/credentials',
    steps: ['Nel progetto Google Cloud abilita Gmail API e configura il consenso OAuth.', 'Crea una credenziale web OAuth e registra l’indirizzo di ritorno qui sotto. In modalità di prova aggiungi gli account di titolare e agenti.', 'In Ambiti autorizza https://www.googleapis.com/auth/gmail.metadata e openid email. PRIME richiede soltanto mittente, oggetto e data. Google può richiedere la verifica dell’app per la distribuzione agli utenti fuori dal gruppo di prova.', 'Incolla Client ID e Client secret. Se il progetto è in modalità test, rinnova l’autorizzazione quando Google la fa scadere.']
  },
  outlook: {
    url: 'https://entra.microsoft.com/',
    steps: ['In Microsoft Entra registra un’applicazione per account organizzativi e personali e aggiungi il ritorno qui sotto come URI di reindirizzamento della piattaforma Web.', 'Aggiungi il permesso delegato Microsoft Graph Mail.ReadBasic. PRIME richiede anche gli ambiti OpenID openid, profile ed email e offline_access per rinnovare la connessione.', 'Crea un client secret e inserisci Client ID e secret in PRIME. Ogni agente autorizza il proprio account.', 'PRIME mostra soltanto mittente, oggetto e data; il link apre Outlook sul web.']
  }
};

export async function renderMail({ state, main, api, pageHeader, esc }) {
  const data = await api('/api/connect');
  const owner = state.me.role === 'owner';
  const setupMarkup = provider => {
    if (!owner) return '<p class="small-note">Chiedi al titolare di preparare il collegamento di questo provider.</p>';
    const guide = guides[provider.provider];
    return `<details class="mail-provider-setup"><summary>Configurazione dell’agenzia</summary><ol>${guide.steps.map(step => `<li>${esc(step)}</li>`).join('')}<li>Indirizzo di ritorno: <code>${esc(provider.base_url || location.origin)}/api/connect/callback/${provider.provider}</code></li></ol><a href="${guide.url}" target="_blank" rel="noopener noreferrer">Apri la console di ${providers[provider.provider]} ↗</a><form data-mail-form="${provider.provider}" class="connect-form"><label>Indirizzo di PRIME<input name="base_url" type="url" required value="${esc(provider.base_url || location.origin)}"></label><label>Client ID<input name="client_id" required value="${esc(provider.settings?.client_id || '')}"></label><label>Client secret${provider.client_secret_set ? ' · salvato, lascia vuoto per conservarlo' : ''}<input name="client_secret" type="password" autocomplete="new-password" data-no-voice="true"></label><button class="primary">Salva configurazione</button><p class="connect-feedback" role="status"></p></form></details>`;
  };
  data.mailProviders = data.mailProviders.filter(provider => provider.provider !== 'yahoo');
  data.mail = data.mail.filter(message => message.provider !== 'yahoo');
  main.innerHTML = pageHeader('LA TUA POSTA, A COLPO D’OCCHIO', 'Email', 'Collega i tuoi account email e PEC in un unico spazio.') + '<p class="small-note">La posta è personale: ogni utente vede soltanto le proprie notifiche. PRIME mostra mittente e oggetto, non importa corpo o allegati e non invia email. Il controllo automatico avviene ogni 5 minuti.</p>' + `<div class="mail-provider-grid">${data.mailProviders.map(provider => {
    const account = data.connections.find(item => item.provider === provider.provider && item.status !== 'disconnected');
    const status = !account ? provider.configured ? 'Da collegare' : 'Non configurato' : account.status === 'reauthorize' ? 'Da ricollegare' : account.status === 'error' ? 'Controllo non riuscito' : 'Collegato';
    const connect = !account || account.status === 'reauthorize' ? provider.configured ? `<button class="primary" data-mail-connect="${provider.provider}">${account ? 'Ricollega' : 'Collega'} ${providers[provider.provider]}</button>` : '' : '';
    const setup = provider.configured ? (owner ? setupMarkup(provider) : '') : setupMarkup(provider);
    const mailboxType = provider.provider==='outlook' ? 'personal' : account?.account_label.startsWith('PEC · ') ? 'pec' : 'personal';
    const mailboxName = account?.account_label.replace(/^(?:Personale|PEC) · /, '') || '';
    const switchMarkup = provider.provider==='outlook' ? '' : '<div class="partner-switch mail-account-switch" role="group" aria-label="Tipo di casella per '+providers[provider.provider]+'"><button type="button" data-mailbox-mode="personal" class="'+(mailboxType==='personal'?'active':'')+'" aria-pressed="'+(mailboxType==='personal')+'">Personale</button><button type="button" data-mailbox-mode="pec" class="'+(mailboxType==='pec'?'active':'')+'" aria-pressed="'+(mailboxType==='pec')+'">PEC</button></div>';
    const mailboxDescription = provider.provider==='outlook' ? 'Account Outlook personale: PRIME non offre collegamenti PEC tramite Outlook.' : mailboxType === 'pec' ? 'In PRIME questa casella è classificata come PEC.' : 'In PRIME questa casella è classificata come email personale.';
    const connected = account ? `<p>${esc(mailboxName)}</p><p class="small-note">Ultimo controllo: ${account.last_sync_at ? esc(new Date(account.last_sync_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT'))) : 'in attesa del primo controllo'}</p>${account.last_error ? `<p class="error">${esc(account.last_error)}</p>` : ''}<div class="connect-actions"><button class="secondary" data-mail-check="${esc(account.id)}">Controlla ora</button><button class="text-button" data-mail-unlink="${esc(account.id)}">Scollega</button></div>` : `<p>Accedi al tuo account Outlook personale e autorizza PRIME a mostrarti le notifiche.</p>`;
    return `<section class="panel mail-provider" data-mail-account="${provider.provider}" data-mailbox-type="${mailboxType}"><h2 class="mail-provider-title">${brandIcon(provider.provider)}<span>${providers[provider.provider]}${provider.provider==='outlook'?' personale':''}</span></h2><div class="mail-provider-controls"><span class="pill">${esc(status)}</span>${switchMarkup}</div><p class="small-note" data-mailbox-description>${mailboxDescription}</p>${connected}${connect}${setup}<p class="connect-feedback" role="status"></p></section>`;
  }).join('')}</div><section class="panel mail-panel"><h2>Notifiche email</h2><label>Cerca mittente o oggetto<input id="mail-search" type="search" placeholder="Cerca nelle notifiche…"></label><p class="small-note">“Nascondi notifica” agisce soltanto in PRIME: non archivia e non modifica la casella email.</p><div id="mail-list" class="mail-notifications"></div><p id="mail-feedback" role="status"></p></section>`;
  renderPartnerMail(main, { data, api, refresh: () => renderMail({ state, main, api, pageHeader, esc }) });
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
    main.querySelector('#mail-list').innerHTML = notifications.map(mail => `<article class="mail-notification"><span class="pill">${providers[mail.provider] || ({ infomaniak: 'Infomaniak', zoho: 'Zoho Mail', infocert: 'InfoCert PEC' }[mail.provider] || esc(mail.provider))}</span><div><strong>${esc(mail.sender)}</strong><p>${esc(mail.subject)}</p><small>${esc(mail.account_label)} · ${esc(new Date(mail.received_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT')))}</small></div><a href="${esc(mail.provider_url)}" target="_blank" rel="noopener noreferrer">Apri email ↗</a><button class="text-button" data-hide-mail="${esc(mail.message_id)}" data-connection="${esc(mail.connection_id)}">Nascondi notifica</button></article>`).join('') || '<p class="muted">Nessuna notifica da mostrare.</p>';
    main.querySelectorAll('[data-hide-mail]').forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await api(`/api/connect/mail/connections/${button.dataset.connection}/dismiss`, { method: 'POST', body: JSON.stringify({ message_id: button.dataset.hideMail }) }); data.mail = data.mail.filter(mail => !(mail.connection_id === button.dataset.connection && mail.message_id === button.dataset.hideMail)); draw(); }
      catch (error) { main.querySelector('#mail-feedback').textContent = error.message; button.disabled = false; }
    });
  }
  main.querySelector('#mail-search').oninput = draw;
  draw();
  for (const form of main.querySelectorAll('[data-mail-form]')) form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    const status = form.querySelector('[role=status]');
    button.disabled = true;
    try { await api(`/api/connect/settings/${form.dataset.mailForm}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); await renderMail({ state, main, api, pageHeader, esc }); }
    catch (error) { status.textContent = error.message; button.disabled = false; }
  };
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
    button.disabled = true;
    try { const result = await api(`/api/connect/mail/authorize/${button.dataset.mailConnect}`, { method: 'POST', body: JSON.stringify({ mailbox_type: button.dataset.mailConnect==='outlook'?'personal':card.dataset.mailboxType||'personal' }) }); location.assign(result.url); }
    catch (error) { card.querySelector('.connect-feedback').textContent = error.message; button.disabled = false; }
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
