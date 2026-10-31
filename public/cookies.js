const CONSENT_KEY = 'prime_cookie_consent_v1';
const defaults = { necessary: true, analytics: false, sessionReplay: false };
const language = document.documentElement.lang?.toLowerCase().startsWith('en') ? 'en' : 'it';
const copy = language === 'en' ? {
  title: 'Your privacy, your choice',
  text: 'PRIME uses necessary storage to keep the site working. Optional analytics and session recordings stay off unless you choose them.',
  accept: 'Accept all', reject: 'Reject optional', customize: 'Customize', save: 'Save choices',
  necessary: 'Necessary', necessaryText: 'Security, sign-in and your saved privacy choice. Always active.',
  analytics: 'Analytics', analyticsText: 'Helps us understand visits and improve the site.',
  replay: 'Session replay', replayText: 'If enabled, this allows masked recordings of site interactions. It does not access your camera or microphone.',
  close: 'Close', manage: 'Cookie settings', privacy: 'Privacy notice', saved: 'Preferences saved.'
} : {
  title: 'La tua privacy, la tua scelta',
  text: 'PRIME usa le memorie tecniche necessarie al funzionamento del sito. Analytics e registrazioni delle sessioni restano disattivati finché non li scegli.',
  accept: 'Accetta tutti', reject: 'Rifiuta opzionali', customize: 'Personalizza', save: 'Salva preferenze',
  necessary: 'Necessari', necessaryText: 'Sicurezza, accesso e memorizzazione della scelta privacy. Sempre attivi.',
  analytics: 'Analytics', analyticsText: 'Aiutano a capire le visite e migliorare il sito.',
  replay: 'Registrazione sessione', replayText: 'Se il servizio verrà attivato, consente replay mascherati delle interazioni sul sito. Non accede a fotocamera o microfono.',
  close: 'Chiudi', manage: 'Preferenze cookie', privacy: 'Informativa privacy', saved: 'Preferenze salvate.'
};

function readConsent() {
  try {
    const value = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    if (!value || value.version !== 1 || !value.categories) return null;
    return { version: 1, savedAt: value.savedAt, categories: { ...defaults, ...value.categories, necessary: true } };
  } catch { return null; }
}

function saveConsent(categories) {
  const value = { version: 1, savedAt: new Date().toISOString(), categories: { ...defaults, ...categories, necessary: true } };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('prime:consent', { detail: value }));
  return value;
}

function install() {
  if (document.getElementById('prime-cookie-root')) return;
  const root = document.createElement('div');
  root.id = 'prime-cookie-root';
  root.innerHTML = `
    <section class="pc-banner" role="dialog" aria-modal="false" aria-labelledby="pc-title" aria-describedby="pc-copy" hidden>
      <button class="pc-close" type="button" aria-label="${copy.close}">×</button>
      <div class="pc-copy"><p class="pc-eyebrow">PRIME · PRIVACY</p><h2 id="pc-title">${copy.title}</h2><p id="pc-copy">${copy.text}</p><a href="/cookies">${copy.privacy}</a></div>
      <div class="pc-actions"><button class="pc-button pc-accept" type="button">${copy.accept}</button><button class="pc-button pc-reject" type="button">${copy.reject}</button><button class="pc-link" type="button" data-open-settings>${copy.customize}</button></div>
    </section>
    <button class="pc-manage" type="button" aria-label="${copy.manage}">${copy.manage}</button>
    <dialog class="pc-dialog" aria-labelledby="pc-settings-title"><form method="dialog"><button class="pc-close" value="close" aria-label="${copy.close}">×</button><p class="pc-eyebrow">PRIME · PRIVACY</p><h2 id="pc-settings-title">${copy.customize}</h2>
      <label class="pc-option"><span><b>${copy.necessary}</b><small>${copy.necessaryText}</small></span><input type="checkbox" checked disabled></label>
      <label class="pc-option"><span><b>${copy.analytics}</b><small>${copy.analyticsText}</small></span><input id="pc-analytics" type="checkbox"></label>
      <label class="pc-option"><span><b>${copy.replay}</b><small>${copy.replayText}</small></span><input id="pc-replay" type="checkbox"></label>
      <div class="pc-actions"><button class="pc-button pc-accept" type="button">${copy.accept}</button><button class="pc-button pc-reject" type="button">${copy.reject}</button><button class="pc-button pc-save" type="button">${copy.save}</button></div>
    </form></dialog>`;
  document.body.append(root);
  const banner = root.querySelector('.pc-banner'), dialog = root.querySelector('.pc-dialog');
  const analytics = root.querySelector('#pc-analytics'), replay = root.querySelector('#pc-replay');
  const existing = readConsent();
  if (!existing) banner.hidden = false;
  else window.dispatchEvent(new CustomEvent('prime:consent', { detail: existing }));
  function persist(categories) { const value = saveConsent(categories); banner.hidden = true; dialog.close(); root.querySelector('.pc-manage').classList.add('is-visible'); window.dispatchEvent(new CustomEvent('prime:consent-saved', { detail: value })); }
  root.querySelectorAll('.pc-accept').forEach(button => button.addEventListener('click', () => persist({ analytics: true, sessionReplay: true })));
  root.querySelectorAll('.pc-reject').forEach(button => button.addEventListener('click', () => persist(defaults)));
  root.querySelector('.pc-close').addEventListener('click', () => persist(defaults));
  root.querySelector('[data-open-settings]').addEventListener('click', () => { const current = readConsent(); analytics.checked = !!current?.categories.analytics; replay.checked = !!current?.categories.sessionReplay; dialog.showModal(); });
  root.querySelector('.pc-save').addEventListener('click', () => persist({ analytics: analytics.checked, sessionReplay: replay.checked }));
  root.querySelector('.pc-manage').addEventListener('click', () => { const current = readConsent(); analytics.checked = !!current?.categories.analytics; replay.checked = !!current?.categories.sessionReplay; dialog.showModal(); });
  dialog.addEventListener('close', () => { if (!readConsent()) banner.hidden = false; });
  root.querySelector('.pc-manage').classList.toggle('is-visible', !!existing);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
else install();
window.PRIMEConsent = { get: readConsent, update: saveConsent };
