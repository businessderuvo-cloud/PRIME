const decode64=(value)=>{const raw=atob(value),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;};
function pcmBuffer(context,encoded,rate){const bytes=decode64(encoded),samples=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2)),buffer=context.createBuffer(1,samples.length,rate),channel=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)channel[i]=samples[i]/32768;return buffer;}
function linearResample(input,from,to){if(from===to)return input;const length=Math.floor(input.length*to/from),result=new Float32Array(length),ratio=from/to;for(let i=0;i<length;i++){const pos=i*ratio,left=Math.floor(pos),mix=pos-left,right=Math.min(left+1,input.length-1);result[i]=input[left]*(1-mix)+input[right]*mix;}return result;}
function encodePcm(samples){const bytes=new Uint8Array(samples.length*2);const view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(i*2,value<0?value*32768:value*32767,true);}let raw='';for(let i=0;i<bytes.length;i+=0x8000)raw+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(raw);}

/** Capture only sources the operator selected, mix them locally, and stream PCM to the signed ElevenLabs session. */
export async function startEliteCopilotAudio({clientTools={},signedUrl,dynamicVariables,firstMessage,micStream,tabStream,playAudio=true,captureCall,onTranscript,onAgentMessage,onStatus,onConversationCreated}){
  if(!micStream?.getAudioTracks().length&&!tabStream?.getAudioTracks().length)throw Error('Scegli almeno il microfono o l’audio della chiamata.');
  if(!window.isSecureContext||!navigator.mediaDevices)throw Error('La condivisione audio richiede HTTPS oppure localhost e un browser compatibile.');
  let context=null,socket=null,processor=null,mix=null,silent=null,closed=false,ready=false,conversationId='',playAt=0,inputFormat='pcm_16000',outputFormat='pcm_16000';
  const inputs=[],playing=new Set();
  function stopPlayback(){for(const source of playing)try{source.stop();}catch{}playing.clear();playAt=0;}
  async function cleanup(){
    if(closed)return;closed=true;ready=false;stopPlayback();
    processor?.disconnect();mix?.disconnect();silent?.disconnect();inputs.forEach(source=>source.disconnect());
    micStream?.getTracks().forEach(track=>track.stop());tabStream?.getTracks().forEach(track=>track.stop());
    if(socket?.readyState===WebSocket.OPEN)socket.close();
    await context?.close().catch(()=>{});
  }
  function formatRate(format){const match=/^(pcm|ulaw)_(\d+)$/.exec(format);if(!match||Number(match[2])<8000||Number(match[2])>96000||(match[1]==='ulaw'&&match[2]!=='8000'))throw Error('Formato audio ElevenLabs non supportato: '+format);return Number(match[2]);}
  function outputBuffer(encoded){
    if(outputFormat.startsWith('pcm_'))return pcmBuffer(context,encoded,formatRate(outputFormat));
    const bytes=decode64(encoded),buffer=context.createBuffer(1,bytes.length,8000),channel=buffer.getChannelData(0);
    for(let index=0;index<bytes.length;index++){const value=(~bytes[index])&255,magnitude=(((value&15)<<3)+132)<<((value>>4)&7);channel[index]=((value&128)?132-magnitude:magnitude-132)/32768;}
    return buffer;
  }
  function encodeInput(samples){
    if(inputFormat.startsWith('pcm_'))return encodePcm(samples);
    let encoded='';for(const sample of samples){const signed=Math.round(Math.max(-1,Math.min(1,sample))*32767),sign=signed<0?128:0,magnitude=Math.min(32635,Math.abs(signed))+132;let exponent=7;for(let mask=16384;(magnitude&mask)===0&&exponent>0;mask>>=1)exponent--;const mantissa=(magnitude>>(exponent+3))&15;encoded+=String.fromCharCode((~(sign|(exponent<<4)|mantissa))&255);}return btoa(encoded);
  }
  try{
    if(captureCall&&!tabStream?.getAudioTracks().length)throw Error('La scheda condivisa non fornisce audio. Seleziona “Condividi audio scheda”.');
    context=new AudioContext();await context.resume();mix=context.createGain();mix.gain.value=1;
    for(const stream of [micStream,tabStream])if(stream?.getAudioTracks().length){const source=context.createMediaStreamSource(stream);source.connect(mix);inputs.push(source);}
    processor=context.createScriptProcessor(2048,1,1);silent=context.createGain();silent.gain.value=0;mix.connect(processor);processor.connect(silent);silent.connect(context.destination);
    socket=new WebSocket(signedUrl);socket.binaryType='arraybuffer';
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Vanessa non ha confermato la sessione audio. Riprova.')),15000);
      const fail=message=>{clearTimeout(timer);reject(Error(message));};
      socket.addEventListener('error',()=>fail('Collegamento audio con ElevenLabs non riuscito.'),{once:true});
      socket.addEventListener('close',event=>{if(!ready)fail('ElevenLabs ha chiuso la sessione audio: '+(event.reason||'verifica configurazione e credito.'));else{onStatus?.('Il collegamento audio con Vanessa è terminato.');void cleanup();}},{once:true});
      socket.addEventListener('message',event=>{
        try{
          const data=JSON.parse(event.data);
          if(data.type==='conversation_initiation_metadata'){
            const metadata=data.conversation_initiation_metadata_event||{};conversationId=metadata.conversation_id||'';
            inputFormat=metadata.user_input_audio_format||'pcm_16000';outputFormat=metadata.agent_output_audio_format||'pcm_16000';
            formatRate(inputFormat);formatRate(outputFormat);ready=true;clearTimeout(timer);
            if(conversationId)onConversationCreated?.(conversationId);
            onStatus?.('Copilot vocale collegato. Vanessa ascolta le sorgenti selezionate.');resolve();
          }else if(data.type==='user_transcript'){const text=data.user_transcription_event?.user_transcript;if(text)onTranscript?.(text);}
          else if(data.type==='agent_response'){const text=data.agent_response_event?.agent_response;if(text)onAgentMessage?.(text);}
          else if(data.type==='agent_response_correction'){const text=data.agent_response_correction_event?.corrected_agent_response;if(text)onAgentMessage?.(text);}
          else if(data.type==='audio'&&playAudio&&ready){const encoded=data.audio_event?.audio_base_64;if(!encoded)return;const source=context.createBufferSource();source.buffer=outputBuffer(encoded);source.connect(context.destination);source.onended=()=>playing.delete(source);playing.add(source);playAt=Math.max(playAt,context.currentTime);source.start(playAt);playAt+=source.buffer.duration;}
          else if(data.type==='interruption')stopPlayback();
          else if(data.type==='client_tool_call'){const call=data.client_tool_call;void(async()=>{let result,is_error=false;try{if(!Object.hasOwn(clientTools,call.tool_name))throw Error('Strumento non disponibile.');result=await clientTools[call.tool_name](call.parameters);}catch(error){result=error.message;is_error=true;}if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'client_tool_result',tool_call_id:call.tool_call_id,result:typeof result==='string'?result:JSON.stringify(result),is_error}));})();}
          else if(data.type==='ping')socket.send(JSON.stringify({type:'pong',event_id:data.ping_event?.event_id}));
          else if(['error','client_error'].includes(data.type)){const message='ElevenLabs non ha accettato il copilot vocale.';onStatus?.(message);if(!ready)fail(message);else void cleanup();}
        }catch(error){if(!ready)fail(error.message);else onStatus?.('Errore nel flusso audio: '+error.message);}
      });
      socket.addEventListener('open',()=>socket.send(JSON.stringify({type:'conversation_initiation_client_data',dynamic_variables:dynamicVariables,conversation_config_override:{agent:{first_message:firstMessage},conversation:{text_only:false}}})),{once:true});
    });
    processor.onaudioprocess=event=>{
      event.outputBuffer.getChannelData(0).fill(0);if(closed||!ready||socket?.readyState!==WebSocket.OPEN)return;
      const samples=linearResample(event.inputBuffer.getChannelData(0),context.sampleRate,formatRate(inputFormat));if(samples.length)socket.send(JSON.stringify({user_audio_chunk:encodeInput(samples)}));
    };
    tabStream?.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(!closed){onStatus?.('La condivisione audio è terminata. Riavvia il copilot per ricollegarla.');void cleanup();}}));
    return {getId:()=>conversationId,isActive:()=>ready&&!closed,sendUserMessage(text){if(!closed&&ready&&socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'user_message',text}));},async endSession(){await cleanup();}};
  }catch(error){await cleanup();throw error;}
}

/** Transcribe a selected live call with Scribe, then send only committed text to Vanessa's text-only agent session. */
export async function startEliteCopilotText({api,clientTools={},signedUrl,dynamicVariables,firstMessage,tabStream,onTranscript,onAgentMessage,onStatus,onConversationCreated}){
  if(!tabStream?.getAudioTracks().length)throw Error('Collega l’audio della chiamata prima di avviare il copilot testuale.');
  if(!window.isSecureContext)throw Error('Il copilot richiede una connessione HTTPS.');
  let context=null,processor=null,source=null,silent=null,scribe=null,session=null,closed=false;
  try{
    const {Conversation,Scribe,AudioFormat,CommitStrategy,RealtimeEvents}=await import('/vendor/elevenlabs/client.js?v=20261027-2');
    session=await Conversation.startSession({clientTools,signedUrl,connectionType:'websocket',textOnly:true,dynamicVariables,overrides:{agent:{firstMessage}},onConversationCreated:c=>onConversationCreated?.(c.getId()),onConnect:()=>onStatus?.('Vanessa è collegata in modalità testo; attendo la trascrizione live.'),onDisconnect:()=>{if(!closed)onStatus?.('La sessione testuale di Vanessa si è interrotta.');},onError:()=>onStatus?.('Collegamento testuale con Vanessa interrotto.'),onMessage:m=>{if(m.message&&m.source!=='user')onAgentMessage?.(m.message);}});
    const tokenData=await api('/api/elite/scribe-token',{method:'POST',body:'{}'});
    scribe=Scribe.connect({token:tokenData.token,modelId:'scribe_v2_realtime',audioFormat:AudioFormat.PCM_16000,sampleRate:16000,languageCode:'ita',commitStrategy:CommitStrategy.VAD,vadSilenceThresholdSecs:0.65,minSpeechDurationMs:120,minSilenceDurationMs:180});
    scribe.on(RealtimeEvents.SESSION_STARTED,()=>onStatus?.('Trascrizione live attiva. Vanessa riceve il testo della chiamata.'));
    scribe.on(RealtimeEvents.PARTIAL_TRANSCRIPT,data=>{if(data.text)onStatus?.('Trascrivo: '+data.text);});
    scribe.on(RealtimeEvents.COMMITTED_TRANSCRIPT,data=>{const transcript=String(data.text||'').trim();if(!transcript)return;onTranscript?.(transcript);session?.sendUserMessage('Trascrizione live della chiamata (testo riconosciuto): '+transcript);});
    scribe.on(RealtimeEvents.ERROR,data=>onStatus?.('Errore trascrizione live: '+String(data.error||'controlla saldo, permessi Scribe e connessione.')));
    scribe.on(RealtimeEvents.QUOTA_EXCEEDED,()=>onStatus?.('Credito di trascrizione ElevenLabs esaurito.'));
    scribe.on(RealtimeEvents.AUTH_ERROR,()=>onStatus?.('ElevenLabs non autorizza Scribe Realtime: verifica i permessi della chiave API.'));
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Scribe Realtime non si è collegato.')),12000);scribe.on(RealtimeEvents.SESSION_STARTED,()=>{clearTimeout(timer);resolve();});scribe.on(RealtimeEvents.ERROR,data=>{clearTimeout(timer);reject(Error(data.error||'Errore di connessione Scribe Realtime.'));});scribe.on(RealtimeEvents.AUTH_ERROR,()=>{clearTimeout(timer);reject(Error('Chiave ElevenLabs senza accesso a Scribe Realtime.'));});});
    context=new AudioContext({sampleRate:16000});await context.resume();source=context.createMediaStreamSource(new MediaStream(tabStream.getAudioTracks()));processor=context.createScriptProcessor(2048,1,1);silent=context.createGain();silent.gain.value=0;source.connect(processor);processor.connect(silent);silent.connect(context.destination);
    processor.onaudioprocess=event=>{if(closed)return;const samples=event.inputBuffer.getChannelData(0);scribe?.send({audioBase64:encodePcm(samples),sampleRate:16000});event.outputBuffer.getChannelData(0).fill(0);};
    tabStream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(!closed)onStatus?.('Audio della chiamata terminato.');}));
    return {getId:()=>session?.getId?.()||'',sendUserMessage:text=>session?.sendUserMessage(text),async endSession(){if(closed)return;closed=true;processor?.disconnect();source?.disconnect();silent?.disconnect();scribe?.close();try{await session?.endSession();}catch{}await context?.close().catch(()=>{});}};
  }catch(error){closed=true;processor?.disconnect();source?.disconnect();silent?.disconnect();scribe?.close();try{await session?.endSession();}catch{}await context?.close().catch(()=>{});throw error;}
}
