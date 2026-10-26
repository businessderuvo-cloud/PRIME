import { createVeronicaConversation } from './sisters-chat.js';

function syncTheme() {
  try { document.documentElement.dataset.theme = localStorage.getItem('prime-landing-theme') === 'light' ? 'light' : 'dark'; }
  catch { document.documentElement.dataset.theme = 'dark'; }
  const button=document.querySelector('#sisters-theme');if(button){const light=document.documentElement.dataset.theme==='light';button.setAttribute('aria-label',light?'Attiva tema scuro':'Attiva tema chiaro');button.innerHTML='<span aria-hidden="true">'+(light?'☾':'☀')+'</span>';}
}
syncTheme();
document.querySelector('#sisters-theme').addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('prime-landing-theme',theme);}catch{}document.documentElement.dataset.theme=theme;const b=document.querySelector('#sisters-theme');b.setAttribute('aria-label',theme==='light'?'Attiva tema scuro':'Attiva tema chiaro');b.innerHTML='<span aria-hidden="true">'+(theme==='light'?'☾':'☀')+'</span>';});
window.addEventListener('storage', event => { if (event.key === 'prime-landing-theme') syncTheme(); });

const thread = document.querySelector('#sisters-thread');
const input = document.querySelector('#sisters-question');
const reply = createVeronicaConversation();
const form = document.querySelector('#sisters-chat-form');
const sendButton = form.querySelector('button');
const quickButtons = [...document.querySelectorAll('[data-question]')];
let pending = false;
function bubble(role, content) {
  const item = document.createElement('div'); item.className = `bubble ${role}`;
  const name = document.createElement('span'); name.textContent = role === 'user' ? 'Tu' : 'Veronica';
  const text = document.createElement('p'); text.textContent = content;
  item.append(name, text); thread.append(item);
  // Keep the session local and the DOM bounded, with no persistent chat history.
  while (thread.children.length > 41) thread.firstElementChild.remove();
}
async function send(value) {
  const question = String(value).trim().slice(0, 1000); if (!question || pending) return;
  pending = true; bubble('user', question); input.value = '';
  sendButton.disabled = true; quickButtons.forEach(button => { button.disabled = true; });
  const typing = document.createElement('div'); typing.className = 'bubble assistant sisters-typing';
  typing.setAttribute('role', 'status'); typing.setAttribute('aria-label', 'Veronica sta scrivendo');
  const name = document.createElement('span'); name.textContent = 'Veronica';
  const dots = document.createElement('div'); dots.className = 'typing-dots'; dots.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i++) dots.append(document.createElement('i'));
  typing.append(name, dots); thread.append(typing); thread.setAttribute('aria-busy', 'true');
  thread.scrollTop = thread.scrollHeight;
  const answer = reply(question);
  await new Promise(resolve => setTimeout(resolve, 1900 + Math.min(1100, answer.length * 2) + Math.random() * 350));
  const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
  typing.remove(); thread.removeAttribute('aria-busy'); bubble('assistant', answer);
  pending = false; sendButton.disabled = false; quickButtons.forEach(button => { button.disabled = false; });
  if (nearBottom) thread.scrollTop = thread.scrollHeight;
}
document.querySelector('#sisters-chat-form').addEventListener('submit', event => { event.preventDefault(); send(input.value); input.focus(); });
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => { send(button.dataset.question); input.focus(); }));
const videos = [...document.querySelectorAll('video')];
videos.forEach(video => video.addEventListener('play', () => videos.filter(other => other !== video).forEach(other => other.pause())));
document.querySelector('a[href="#veronica-chat"]').addEventListener('click', () => { input.focus({ preventScroll: true }); });

const callbackForm=document.querySelector('#vanessa-callback-form'),callbackStatus=document.querySelector('#call-status'),callbackButton=callbackForm.querySelector('button');let callbackChallenge=null;
fetch('/api/public/vanessa').then(r=>r.json()).then(data=>{if(data.available){callbackChallenge=data.challenge;callbackButton.disabled=false;callbackStatus.textContent='Vanessa ti chiamerà sul numero che indichi.';}else{callbackStatus.textContent='La richiamata è momentaneamente in preparazione. Per assistenza: phoenix@primegestionale.it.';}}).catch(()=>{callbackStatus.textContent='Demo non disponibile al momento. Riprova più tardi.';});
callbackForm.addEventListener('submit',async e=>{e.preventDefault();if(!callbackForm.reportValidity()||!callbackChallenge)return;const ready=await fetch('/api/public/vanessa').then(r=>r.json());if(!ready.available){callbackStatus.textContent='Demo non disponibile al momento.';return;}callbackChallenge=ready.challenge;const values=new FormData(callbackForm),phone=String(values.get('phone')).trim();if(!window.confirm('Vuoi ricevere una chiamata dimostrativa da Vanessa al numero '+phone+'?'))return;callbackButton.disabled=true;callbackStatus.textContent='Invio la richiesta di richiamata…';try{const r=await fetch('/api/public/vanessa/callback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,consent:values.get('consent')==='on',website:values.get('website'),challenge:callbackChallenge})});const data=await r.json();if(!r.ok)throw Error(data.error||'Richiesta non riuscita.');callbackChallenge=null;callbackStatus.textContent=data.message;callbackButton.textContent='Richiesta inviata';}catch(error){callbackStatus.textContent=error.message+' Ricarica la pagina per verificare la disponibilità.';}});
