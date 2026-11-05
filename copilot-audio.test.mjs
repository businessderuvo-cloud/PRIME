import test from 'node:test';
import assert from 'node:assert/strict';
import {startEliteCopilotAudio,startEliteCopilotText} from './public/elite-audio.js';

test('voice copilot negotiates mu-law input/output, plays audio and clears it on interruption',async()=>{
  const originals=new Map(['window','navigator','AudioContext','WebSocket'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let socket,processor,playback=0,interrupted=0,videoStopped=0,bufferRate=0;
  const node=()=>({connect(){},disconnect(){},gain:{value:1}});
  class AudioContextMock{
    sampleRate=48000;currentTime=0;destination={};
    async resume(){} async close(){}
    createGain(){return node();} createMediaStreamSource(){return node();}
    createScriptProcessor(){processor=node();return processor;}
    createBuffer(_channels,length,rate){bufferRate=rate;return {getChannelData:()=>new Float32Array(length),duration:length/rate};}
    createBufferSource(){return {...node(),start(){playback++;},stop(){interrupted++;}};}
  }
  class SocketMock extends EventTarget{
    static OPEN=1;readyState=1;sent=[];
    constructor(){super();socket=this;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
    send(value){const message=JSON.parse(value);this.sent.push(message);if(message.type==='conversation_initiation_client_data')queueMicrotask(()=>this.receive({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{conversation_id:'conv_voice_test',user_input_audio_format:'ulaw_8000',agent_output_audio_format:'ulaw_8000'}}));}
    receive(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
    close(){this.readyState=3;}
  }
  try{
    for(const [key,value] of Object.entries({window:{isSecureContext:true},navigator:{mediaDevices:{}},AudioContext:AudioContextMock,WebSocket:SocketMock}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    const track={stop(){},addEventListener(){}},video={stop(){videoStopped++;},addEventListener(){}},stream={getAudioTracks:()=>[track],getVideoTracks:()=>[video],getTracks:()=>[track,video]};
    const session=await startEliteCopilotAudio({signedUrl:'wss://api.elevenlabs.io/test',tabStream:stream,captureCall:true,playAudio:true});
    assert.equal(session.isActive(),true);assert.equal(videoStopped,0,'shared capture remains alive during the session');
    assert.equal(socket.sent[0].conversation_config_override.conversation.text_only,false);
    processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(.1)},outputBuffer:{getChannelData:()=>new Float32Array(2048)}});
    assert.equal(Buffer.from(socket.sent.find(message=>message.user_audio_chunk).user_audio_chunk,'base64').length,341,'input resampled to negotiated 8kHz mu-law');
    socket.receive({type:'audio',audio_event:{audio_base_64:'//8='}});assert.equal(playback,1);assert.equal(bufferRate,8000);
    socket.receive({type:'interruption'});assert.equal(interrupted,1);
    await session.endSession();assert.equal(session.isActive(),false);assert.equal(videoStopped,1);
  }finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('voice copilot with text output streams audio, invokes change tools and stays silent',async()=>{
  const originals=new Map(['window','navigator','AudioContext','WebSocket'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let socket,processor,played=0,stopped=0,closed=0;
  const transcripts=[],suggestions=[],tools=[];
  const node=()=>({connect(){},disconnect(){},gain:{value:1}});
  class FakeContext{
    sampleRate=48000;
    destination={};
    async resume(){}
    createGain(){return node();}
    createMediaStreamSource(){return node();}
    createScriptProcessor(){processor=node();return processor;}
    createBufferSource(){played++;throw Error('Text copilot must never play audio');}
    async close(){closed++;}
  }
  class FakeSocket extends EventTarget{
    static OPEN=1;readyState=1;sent=[];
    constructor(){super();socket=this;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
    send(value){const message=JSON.parse(value);this.sent.push(message);if(message.type==='conversation_initiation_client_data')queueMicrotask(()=>this.receive({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{conversation_id:'conv_test_audio',user_input_audio_format:'pcm_16000',agent_output_audio_format:'pcm_16000'}}));}
    close(){this.readyState=3;}
    receive(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}
  }
  try{
    for(const [key,value] of Object.entries({window:{isSecureContext:true},navigator:{mediaDevices:{}},AudioContext:FakeContext,WebSocket:FakeSocket}))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    const track={stop(){stopped++;},addEventListener(){}};
    const stream={getAudioTracks:()=>[track],getTracks:()=>[track],getVideoTracks:()=>[]};
    const session=await startEliteCopilotAudio({signedUrl:'wss://api.elevenlabs.io/test',micStream:stream,tabStream:stream,captureCall:true,playAudio:false,dynamicVariables:{agency_name:'Test'},firstMessage:'Pronto',onTranscript:text=>transcripts.push(text),onAgentMessage:text=>suggestions.push(text),clientTools:{prime_workspace:async parameters=>{tools.push(parameters);return {proposal:{id:'pending'}};}}});
    processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(.1)},outputBuffer:{getChannelData:()=>new Float32Array(2048)}});
    assert.ok(socket.sent.some(message=>message.user_audio_chunk?.length>0));
    socket.receive({type:'user_transcript',user_transcription_event:{user_transcript:'Il cliente cerca un bilocale'}});
    socket.receive({type:'agent_response',agent_response_event:{agent_response:'Chiedi il budget massimo.'}});
    socket.receive({type:'audio',audio_event:{audio_base_64:'AAAA'}});
    socket.receive({type:'client_tool_call',client_tool_call:{tool_name:'prime_workspace',tool_call_id:'change-1',parameters:{operation:'propose',entity:'contacts'}}});
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(transcripts,['Il cliente cerca un bilocale']);assert.deepEqual(suggestions,['Chiedi il budget massimo.']);assert.equal(played,0);assert.equal(tools[0].operation,'propose');
    assert.ok(socket.sent.some(message=>message.type==='client_tool_result'&&!message.is_error&&message.result.includes('pending')));
    await session.endSession();assert.equal(stopped,1);assert.equal(closed,1);assert.equal(socket.readyState,3);
  }finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

async function withTextCopilot(run,{startupError}={}){
  const originals=new Map(['window','AudioContext'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const state={sources:[],messages:[],suggestions:[],transcripts:[],statuses:[],sent:[],contextClosed:0,sessionClosed:0,scribeClosed:0,ended:0};
  const node=()=>({connect(){},disconnect(){},gain:{value:1}});
  class Track extends EventTarget{stopped=0;stop(){this.stopped++;}}
  state.mic=new Track();state.call=new Track();state.video=new Track();
  state.micStream={getAudioTracks:()=>[state.mic],getTracks:()=>[state.mic]};
  state.tabStream={getAudioTracks:()=>[state.call],getTracks:()=>[state.call,state.video]};
  class Context{
    sampleRate=48000;destination={};
    async resume(){} async close(){state.contextClosed++;}
    createGain(){return node();}
    createMediaStreamSource(stream){state.sources.push(stream);return node();}
    createScriptProcessor(){state.processor=node();return state.processor;}
    createBufferSource(){throw Error('Text-only copilot must never reproduce speech');}
  }
  const events={SESSION_STARTED:'started',PARTIAL_TRANSCRIPT:'partial',COMMITTED_TRANSCRIPT:'committed',ERROR:'error',CLOSE:'close'};
  const listeners=new Map();
  state.scribe={on(event,listener){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(listener);},emit(event,data={}){for(const listener of listeners.get(event)||[])listener(data);},send(data){state.sent.push(data);},close(){state.scribeClosed++;this.emit('close');}};
  const sdk={
    Conversation:{async startSession(options){state.options=options;const session={getId:()=>'conv_text_scribe',sendUserMessage:text=>state.messages.push(text),async endSession(){state.sessionClosed++;options.onDisconnect();}};options.onConversationCreated(session);options.onConnect();return session;}},
    Scribe:{connect(options){state.scribeOptions=options;queueMicrotask(()=>state.scribe.emit(startupError?'error':'started',startupError?{error:startupError}:{}));return state.scribe;}},
    AudioFormat:{PCM_16000:'pcm_16000'},CommitStrategy:{VAD:'vad'},RealtimeEvents:events
  };
  try{
    Object.defineProperty(globalThis,'window',{value:{isSecureContext:true},configurable:true});
    Object.defineProperty(globalThis,'AudioContext',{value:Context,configurable:true});
    state.start=extra=>startEliteCopilotText({api:async path=>{assert.equal(path,'/api/elite/scribe-token');return {token:'single-use'};},loadClient:async()=>sdk,signedUrl:'wss://api.elevenlabs.io/test',micStream:state.micStream,tabStream:state.tabStream,onTranscript:text=>state.transcripts.push(text),onAgentMessage:text=>state.suggestions.push(text),onStatus:text=>state.statuses.push(text),onEnd:()=>state.ended++,...extra});
    await run(state);
  }finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}

test('real text copilot mixes selected mic and call, resamples Scribe audio, forwards committed text and releases capture',async()=>{
  await withTextCopilot(async state=>{
    const tools=[];
    const session=await state.start({language:'en',clientTools:{prime_workspace:async p=>{tools.push(p);return 'pending';}}});
    assert.equal(session.isActive(),true);assert.equal(session.getId(),'conv_text_scribe');
    assert.equal(state.options.textOnly,true);assert.equal(state.scribeOptions.languageCode,'eng');
    assert.deepEqual(state.sources,[state.micStream,state.tabStream]);
    state.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(2048).fill(.1)},outputBuffer:{getChannelData:()=>new Float32Array(2048)}});
    assert.equal(Buffer.from(state.sent[0].audioBase64,'base64').length,1364,'audio is resampled from actual 48kHz context to 16kHz PCM');
    state.scribe.emit('partial',{text:'cerca un bilocale'});assert.equal(state.messages.length,0);
    state.scribe.emit('committed',{text:'Il cliente cerca un bilocale'});
    assert.deepEqual(state.transcripts,['Il cliente cerca un bilocale']);assert.match(state.messages[0],/Trascrizione live.*Il cliente cerca un bilocale/);
    state.options.onMessage({source:'ai',message:'Chiedi il budget massimo.'});assert.deepEqual(state.suggestions,['Chiedi il budget massimo.']);
    assert.equal(await state.options.clientTools.prime_workspace({operation:'propose'}),'pending');assert.deepEqual(tools,[{operation:'propose'}]);
    await session.endSession();await session.endSession();assert.equal(session.isActive(),false);
    assert.deepEqual([state.mic.stopped,state.call.stopped,state.video.stopped],[1,1,1]);
    assert.deepEqual([state.sessionClosed,state.scribeClosed,state.contextClosed,state.ended],[1,1,1,1]);
    state.scribe.emit('committed',{text:'late segment'});assert.equal(state.messages.length,1);
  });
});

test('text copilot releases both captures and closes Vanessa when Scribe startup fails',async()=>{
  await withTextCopilot(async state=>{
    await assert.rejects(state.start(),/permission denied/);
    assert.deepEqual([state.mic.stopped,state.call.stopped,state.video.stopped],[1,1,1]);
    assert.deepEqual([state.sessionClosed,state.scribeClosed,state.ended],[1,1,1]);
    assert.equal(state.sources.length,0,'failed transcription never starts audio processing');
  },{startupError:'permission denied'});
});

test('text copilot stops capture and allows restart after provider, speech socket or sharing ends',async()=>{
  for(const cause of ['provider','scribe','sharing'])await withTextCopilot(async state=>{
    const session=await state.start();
    if(cause==='provider')state.options.onDisconnect();
    else if(cause==='scribe')state.scribe.emit('close');
    else state.video.dispatchEvent(new Event('ended'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(session.isActive(),false,cause);
    assert.deepEqual([state.mic.stopped,state.call.stopped,state.video.stopped],[1,1,1],cause);
    assert.deepEqual([state.sessionClosed,state.scribeClosed,state.contextClosed,state.ended],[1,1,1,1],cause);
    assert.match(state.statuses.at(-1),/Riavvia il copilot/);
  });
});
