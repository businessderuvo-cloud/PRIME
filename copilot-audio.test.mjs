import test from 'node:test';
import assert from 'node:assert/strict';
import {startEliteCopilotAudio} from './public/elite-audio.js';

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
    send(value){this.sent.push(JSON.parse(value));}
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
