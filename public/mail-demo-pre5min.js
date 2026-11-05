import { renderPartnerMail } from './partner-mail-demo-pre5min.js?v=20261103-public-demo-pre5min';
import { renderZohoPec } from './zoho-pec.js?v=20261101-transparent-logos';
const providers = { gmail: 'Gmail', outlook: 'Outlook', yahoo: 'Yahoo Mail' };
const brandIcons = { gmail: 'gmail', outlook: 'outlook', yahoo: 'yahoo' };
const brandIcon = provider => provider==='yahoo' ? `<img src="/assets/yahoo-mail-dark.svg" alt="Yahoo Mail" width="150" height="27" style="object-fit:contain">` : `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${brandIcons[provider]}.svg" alt="" width="28" height="28"></span>`;
export async function renderMail({ state, main, api, pageHeader, esc }) {
  const data = await api('/api/connect');
  main.innerHTML = pageHeader('LA TUA POSTA, A COLPO D’OCCHIO', 'Email', 'Collega e gestisci i tuoi account email e PEC.') + '<p class="small-note">Le notifiche email si trovano solo nell’Inbox in alto. Ogni utente vede le notifiche dei propri account; il controllo automatico avviene ogni 5 minuti.</p>' + `<div class="mail-provider-grid">${data.mailProviders.filter(provider => provider.provider !== 'yahoo').map(provider => {
    const account = data.connections.find(item => item.provider === provider.provider && item.status !== 'disconnected');
    const status = !account ? provider.access_pending ? 'In attesa di Yahoo' : provider.configured ? 'Da collegare' : 'Non configurato' : account.status === 'reauthorize' ? 'Da ricollegare' : account.status === 'error' ? 'Controllo non riuscito' : 'Collegato';
    const canConnect = provider.configured && (!state.me.customer_demo || ['outlook','yahoo'].includes(provider.provider));
    const connect = !account || account.status === 'reauthorize' ? canConnect ? `<button class="primary" data-mail-connect="${provider.provider}">${account ? 'Ricollega' : 'Collega'} ${providers[provider.provider]}</button>` : '' : '';
    const mailboxType = account?.account_label.startsWith('PEC · ') ? 'pec' : 'personal';
    const mailboxName = account?.account_label.replace(/^(?:Personale|PEC) · /, '') || '';
    const switchMarkup = '<div class="partner-switch mail-account-switch" role="group" aria-label="Tipo di casella per '+providers[provider.provider]+'"><button type="button" data-mailbox-mode="personal" class="'+(mailboxType==='personal'?'active':'')+'" aria-pressed="'+(mailboxType==='personal')+'">Personale</button><button type="button" data-mailbox-mode="pec" class="'+(mailboxType==='pec'?'active':'')+'" aria-pressed="'+(mailboxType==='pec')+'">PEC</button></div>';
    const mailboxDescription = mailboxType === 'pec' ? 'In PRIME questa casella è classificata come PEC.' : 'In PRIME questa casella è classificata come email personale.';
    const connected = account ? `<p>${esc(mailboxName)}</p><p class="small-note">Ultimo controllo: ${account.last_sync_at ? esc(new Date(account.last_sync_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT'))) : 'in attesa del primo controllo'}</p>${state.me.customer_demo ? '<p class="small-note">Collegamento temporaneo della demo · solo mittente e oggetto.</p>' : ''}${account.last_error ? `<p class="error">${esc(account.last_error)}</p>` : ''}<div class="connect-actions"><button class="secondary" data-mail-check="${esc(account.id)}">Controlla ora</button><button class="text-button" data-mail-unlink="${esc(account.id)}">Scollega</button></div>` : `<p>${state.me.customer_demo ? (provider.provider==='outlook' ? 'Collega il tuo Outlook per vedere qui le ultime 10 notifiche. Il collegamento è temporaneo, legge solo mittente e oggetto e non invia email.' : provider.provider==='yahoo'&&provider.access_pending ? 'Yahoo Mail sarà collegabile qui dopo l’approvazione dell’accesso posta e la configurazione delle credenziali PRIME.' : provider.provider==='yahoo' ? 'Collega Yahoo Mail con OAuth per vedere qui le ultime 10 notifiche.' : 'Nella demo pubblica puoi provare il collegamento Outlook.') : provider.access_pending ? 'Yahoo deve ancora approvare l’accesso OAuth alla posta per PRIME.' : provider.configured ? "Accedi al tuo account e autorizza PRIME a mostrarti le notifiche." : "Collegamento in preparazione. Contatta l’assistenza PRIME."}</p>`;
    return `<section class="panel mail-provider" data-mail-account="${provider.provider}" data-mailbox-type="${mailboxType}"><h2 class="mail-provider-title">${brandIcon(provider.provider)}${provider.provider==='yahoo'?'':`<span>${providers[provider.provider]}</span>`}</h2><div class="mail-provider-controls"><span class="pill">${esc(status)}</span>${switchMarkup}</div><p class="small-note" data-mailbox-description>${mailboxDescription}</p>${connected}${connect}<p class="connect-feedback" role="status"></p></section>`;
  }).join('')}</div><p id="mail-feedback" role="status"></p>`;
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
    try { const result = await api(`/api/connect/mail/authorize/${button.dataset.mailConnect}`, { method: 'POST', body: JSON.stringify({ mailbox_type: card.dataset.mailboxType||'personal' }) }); location.assign(result.url); }
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
}
