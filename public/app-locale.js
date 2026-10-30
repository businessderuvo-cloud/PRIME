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
  window.primeI18n.mount(slot,document.documentElement.lang==='en'?'Language':'Lingua');
  window.primeI18n.translate(document);
}
