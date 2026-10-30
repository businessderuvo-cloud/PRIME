import {Conversation} from '/vendor/elevenlabs/client.js';
const start=document.querySelector('#browser-call-start'),stop=document.querySelector('#browser-call-stop'),mute=document.querySelector('#browser-call-mute'),consent=document.querySelector('#browser-call-consent'),status=document.querySelector('#browser-call-status'),transcript=document.querySelector('#browser-call-transcript'),card=document.querySelector('#vanessa-call');
let session=null,sequence=0,timer=null,isMuted=false;
function reset(message){clearTimeout(timer);timer=null;session=null;isMuted=false;start.disabled=false;start.textContent='Parla con Vanessa';stop.hidden=true;mute.hidden=true;mute.textContent='Disattiva microfono';mute.setAttribute('aria-pressed','false');card.removeAttribute('data-voice-mode');status.textContent=message;}
async function finish(message='Chiamata terminata. Puoi scegliere se riprovare o farti richiamare.'){const current=session;sequence++;reset(message);if(current)try{await current.endSession();}catch{}}
function line(message){if(message.source!=='user'||!message.message)return;const item=document.createElement('p');item.className='voice-line';item.textContent=(document.documentElement.lang==='en'?'You: ':'Tu: ')+message.message;transcript.append(item);while(transcript.children.length>16)transcript.firstElementChild.remove();transcript.scrollTop=transcript.scrollHeight;}
start.addEventListener('click',async()=>{
 if(!consent.checked){status.textContent='Conferma la richiesta della conversazione AI e il consenso prima di iniziare.';consent.focus();return;}
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status.textContent='Per parlare usa un browser aggiornato e apri il sito in HTTPS.';return;}
 const attempt=++sequence;start.disabled=true;stop.hidden=false;status.textContent='Consenti il microfono per parlare con Vanessa.';transcript.replaceChildren();
 try{
  // Permission is requested only after the user's explicit click and consent.
  const check=await navigator.mediaDevices.getUserMedia({audio:true});check.getTracks().forEach(track=>track.stop());if(attempt!==sequence)return;
  status.textContent='Collegamento con Vanessa…';
  const readyResponse=await fetch('/api/public/vanessa'),ready=await readyResponse.json();if(!ready.available)throw Error('La demo vocale non è disponibile al momento.');
  const response=await fetch('/api/public/vanessa/browser',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,challenge:ready.challenge,language:document.documentElement.lang==='en'?'en':'it'})});const data=await response.json();if(!response.ok)throw Error(data.error||'Non riesco a collegare Vanessa.');if(attempt!==sequence)return;
  if(attempt!==sequence)return;
  document.querySelectorAll('video').forEach(video=>video.pause());
  const connected=await Conversation.startSession({signedUrl:data.signedUrl,overrides:data.overrides,connectionType:'websocket',workletPaths:{rawAudioProcessor:'/vendor/elevenlabs/rawAudioProcessor.js',audioConcatProcessor:'/vendor/elevenlabs/audioConcatProcessor.js'},libsampleratePath:'/vendor/elevenlabs/libsamplerate.worklet.js',
   onConnect:()=>{if(attempt===sequence)status.textContent='Sei collegato con Vanessa. Parla pure.';},
   onDisconnect:()=>{if(attempt===sequence)reset('La chiamata è terminata.');},
   onError:()=>{if(attempt===sequence)status.textContent='La connessione audio ha un problema. Se non senti Vanessa, termina e riprova.';},
   onModeChange:({mode})=>{if(attempt!==sequence)return;card.dataset.voiceMode=mode;status.textContent=mode==='speaking'?'Vanessa sta parlando…':isMuted?'Microfono disattivato. Puoi ancora ascoltare Vanessa.':'Vanessa ti ascolta…';},
   onMessage:message=>{if(attempt===sequence)line(message);}
  });
  if(attempt!==sequence){await connected.endSession();return;}
  session=connected;await session.setVolume({volume:1});mute.hidden=false;timer=setTimeout(()=>finish('La demo di 3 minuti è terminata. Grazie per aver parlato con Vanessa!'),180000);
 }catch(error){if(attempt!==sequence)return;const message=['NotAllowedError','PermissionDeniedError'].includes(error.name)?'Il microfono non è autorizzato. Abilitalo dalle impostazioni del browser, poi riprova.':error.name==='NotFoundError'?'Non trovo un microfono collegato. Controlla il dispositivo e riprova.':error.message||'Connessione non riuscita. Riprova più tardi.';await finish(message);}
});
stop.addEventListener('click',()=>finish());mute.addEventListener('click',()=>{if(!session)return;isMuted=!isMuted;session.setMicMuted(isMuted);mute.textContent=isMuted?'Riattiva microfono':'Disattiva microfono';mute.setAttribute('aria-pressed',String(isMuted));status.textContent=isMuted?'Microfono disattivato. Puoi ancora ascoltare Vanessa.':'Microfono attivo. Vanessa ti ascolta.';});
window.addEventListener('pagehide',()=>{if(session)void finish('Chiamata terminata.');});
