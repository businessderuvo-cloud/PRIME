import { createVeronicaConversation } from './sisters-chat.js';

function syncTheme() {
  try { document.documentElement.dataset.theme = localStorage.getItem('prime-landing-theme') === 'light' ? 'light' : 'dark'; }
  catch { document.documentElement.dataset.theme = 'dark'; }
}
syncTheme();
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
