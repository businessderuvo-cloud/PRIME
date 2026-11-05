import {eliteMarkup,mountEliteModePicker} from './elite-view.js?v=20261029-zadarma-auto';
import {plans} from './pricing.js';

export async function renderCustomerDemoVanessa({main,api,esc,state,compact=false}){
  const plan=state.me.demo_plan==='vip'?'vip':'elite';
  const settings={auto_queue:false,outbound_greeting:'Buongiorno, sono Vanessa dell’agenzia demo.',inbound_greeting:'Benvenuto nell’agenzia demo PRIME.',instructions:'Lavora soltanto con i dati dimostrativi della sessione.',address_style:'lei'};
  main.innerHTML=eliteMarkup({status:{configured:true,plan,settings},state,esc,compact});
  if(plan==='vip')main.querySelector('.elite-extra').innerHTML='<div><p class="eyebrow">IL TUO TEAM AI VIP</p><h2>Vanessa inclusa</h2><p>Il piano include un agente AI. Gli agenti aggiuntivi richiedono attivazione a 100 €/mese ciascuno. Le quote sono condivise e non aumentano aggiungendo agenti. La voce personalizzata è disponibile con Elite.</p></div>';
  if(compact)main.querySelectorAll('.elite-queue,.elite-usage,.elite-settings,.elite-extra').forEach(section=>section.remove());
  main.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
  const form=main.querySelector('#elite-chat-form'),input=main.querySelector('#elite-chat-input'),log=main.querySelector('#elite-chat-log'),status=main.querySelector('#elite-voice-state');
  input.disabled=false;form.querySelector('button').disabled=false;
  main.querySelectorAll('[data-elite-prompt]').forEach(button=>{button.disabled=false;});
  main.querySelector('.elite-note').textContent='Chat con Vanessa attiva sui dati dimostrativi. Copilot, voce e chiamate sono visibili ma disattivati nella demo pubblica; le operazioni sui dati restano disponibili nelle altre schermate del gestionale.';
  main.querySelector('#elite-mode').value='workspace';
  mountEliteModePicker({mode:main.querySelector('#elite-mode'),compact,esc,disabledModes:['copilot','copilot_voice']});
  const queue=main.querySelector('#elite-queue-list');if(queue)queue.textContent='Nessuna chiamata avviabile nella demo pubblica.';
  const usage=main.querySelector('#elite-usage-content');if(usage)usage.innerHTML='<p>Quote mensili del piano demo: '+plans[plan].quotas.map((value,index)=>esc(new Intl.NumberFormat((document.documentElement.lang==='en'?'en-GB':'it-IT')).format(value))+' '+['minuti','operazioni semplici','ricerche medie','ricerche complesse'][index]).join(' · ')+'.</p>';
  const phone=main.querySelector('#elite-phone-number');if(phone)phone.innerHTML='<option>Collegamento numero disattivato nella demo pubblica</option>';
  const chatIntro=log.querySelector('.elite-message p');if(chatIntro)chatIntro.textContent=document.documentElement.lang==='en'?"Hi! I'm Vanessa 😊 Let's explore this sample agency together. Where shall we start?":'Ciao! Sono Vanessa 😊 Possiamo esplorare insieme questa agenzia dimostrativa. Da dove cominciamo?';
  let session=null,starting=null,disposed=false;
  const safeMessageUrl=value=>{try{const u=new URL(value,location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}};
  const richMarkup=value=>{let html=String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');html=html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi,(m,alt,url)=>{const safe=safeMessageUrl(url);return safe?'<img class="elite-message-image" src="'+safe+'" alt="'+alt+'" loading="lazy">':m;});html=html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi,(m,label,url)=>{const safe=safeMessageUrl(url);return safe?'<a href="'+safe+'" target="_blank" rel="noopener noreferrer">'+label+'</a>':label;});html=html.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,'<strong>$1$2</strong>').replace(/\*([^*\n]+)\*|_([^_\n]+)_/g,'<em>$1$2</em>');return html.split(/\r?\n/).map(line=>/^\s*[-*•]\s+(.+)$/.test(line)?'<li>'+richMarkup(RegExp.$1)+'</li>':line?'<p>'+line+'</p>':'<br>').join('').replace(/(<li>.*<\/li>)+/g,m=>'<ul>'+m+'</ul>');};
  const add=(role,text)=>{const message=document.createElement('article');message.className='elite-message '+(role==='user'?'is-user':'is-agent');const who=document.createElement('strong');who.textContent=role==='user'?'Tu':'Vanessa';if(role!=='user'){const avatar=document.createElement('img');avatar.className='elite-message-avatar';avatar.src='/assets/vanessa-poster.png';avatar.alt='';message.append(avatar);}message.append(who);const body=document.createElement('div');body.className='elite-message-body';body.innerHTML=richMarkup(text);message.append(body);log.append(message);log.scrollTop=log.scrollHeight;};
  void api('/api/elite/greeting',{method:'POST',body:JSON.stringify({language:document.documentElement.lang==='en'?'en':'it'})})
    .then(({message})=>{if(message&&log.isConnected)add('agent',message);}).catch(()=>{});
  async function connect(){
    if(session)return session;if(starting)return starting;
    starting=(async()=>{
      status.textContent='Collegamento a Vanessa…';
      const data=await api('/api/elite/session',{method:'POST',body:JSON.stringify({mode:'workspace',agentId:'vanessa',language:document.documentElement.lang==='en'?'en':'it'})});
      const {Conversation}=await import('/vendor/elevenlabs/client.js');
      const connected=await Conversation.startSession({signedUrl:data.signedUrl,connectionType:'websocket',textOnly:true,dynamicVariables:data.dynamicVariables,overrides:{agent:{firstMessage:data.firstMessage}},onMessage:event=>{if(!disposed&&event.source==='ai'&&event.message){add('agent',event.message);status.textContent='Chat attiva.';}},onDisconnect:()=>{session=null;if(!disposed)status.textContent='Conversazione terminata. Puoi riconnetterti inviando un messaggio.';},onError:()=>{session=null;if(!disposed)status.textContent='Collegamento con Vanessa interrotto. Premi Invia per riprovare.';}});
      if(disposed){await connected.endSession();throw Error('Schermata chiusa.');}
      session=connected;const id=session.getId?.();if(id)void api('/api/elite/conversations',{method:'POST',body:JSON.stringify({conversationId:id,mode:'workspace',agentId:'vanessa'})}).catch(()=>{});
      status.textContent='Chat attiva. Voce e copilot disattivati nella demo pubblica.';return session;
    })().catch(error=>{if(!disposed)status.textContent=error.message;throw error;}).finally(()=>{starting=null;});
    return starting;
  }
  form.onsubmit=async event=>{event.preventDefault();const text=input.value.trim();if(!text||disposed)return;const button=form.querySelector('button');button.disabled=true;try{const active=await connect();add('user',text);input.value='';active.sendUserMessage(text);status.textContent='Vanessa sta scrivendo…';}catch{}finally{button.disabled=false;if(input.isConnected)input.focus();}};
  main.querySelectorAll('[data-elite-prompt]').forEach(button=>button.onclick=()=>{input.value=button.dataset.elitePrompt;input.focus();});
  function close(){if(disposed)return;disposed=true;observer.disconnect();if(session)void session.endSession().catch(()=>{});session=null;}
  const observer=new MutationObserver(()=>{if(!form.isConnected)close();});observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',close,{once:true});
}
