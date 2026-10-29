import test from 'node:test';
import assert from 'node:assert/strict';
import {startEliteCopilotAudio} from './public/elite-audio.js';

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
    const track={stop(){},addEventListener(){}},video={stop(){videoStopped++;}},stream={getAudioTracks:()=>[track],getVideoTracks:()=>[video],getTracks:()=>[track,video]};
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

test('Text copilot streams selected call audio, displays live suggestions, invokes change tools and stays silent',async()=>{
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
    await session.endSession();assert.equal(stopped,2);assert.equal(closed,1);assert.equal(socket.readyState,3);
  }finally{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
