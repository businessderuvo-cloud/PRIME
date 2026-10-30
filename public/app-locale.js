let active=false;
export const appLocale=()=>document.documentElement.lang==='en'?'en-GB':'it-IT';
export async function initializeAppLanguage(me){
  if(me.edition==='base'){document.documentElement.lang='it';return;}
  if(active)return;
  window.primeLocaleConfig={workspace:true};
  document.documentElement.classList.add('workspace-localized');
  const style=document.createElement('link');style.rel='stylesheet';style.href='/i18n.css';document.head.append(style);
  await import('./i18n.js?v=20261030-workspace');
  await window.primeI18n.ready;
  active=true;
  for(const name of ['alert','confirm']){const original=window[name].bind(window);window[name]=message=>original(window.primeI18n.t(String(message)));}
}
export function mountAppLanguage(){
  if(!active)return;
  const bar=document.querySelector('.topbar');if(!bar||bar.querySelector('.app-language-slot'))return;
  const slot=document.createElement('div');slot.className='app-language-slot';bar.querySelector('#theme').after(slot);
  slot.innerHTML='<div class="app-language-switch" role="group" aria-label="Language"><button type="button" lang="it" aria-pressed="'+(document.documentElement.lang==='it')+'">IT</button><button type="button" lang="en" aria-pressed="'+(document.documentElement.lang==='en')+'">EN</button></div>';
  slot.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>window.primeI18n.change(button.lang)));
  window.primeI18n.translate(document);
}
