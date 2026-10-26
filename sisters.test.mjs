import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './server.mjs';
import {veronicaReply,createVeronicaConversation} from './public/sisters-chat.js';

test('Veronica follows small talk, playful follow-ups and plan context without mixing sessions',()=>{
  const reply=createVeronicaConversation();
  assert.match(reply('Ciao!'),/Veronica/);
  assert.match(reply('Mi chiamo Luca'),/Piacere, Luca/);
  assert.match(reply('Come mi chiamo?'),/Luca/);
  assert.match(reply('Chi è più bella tra voi 2?'),/imparziale.*sorella/);
  assert.match(reply('Dai, sii sincera'),/mi sbilancio/);
  assert.match(reply('ok aiutami a scegliere... il piano'),/gestionale completo parti da Standard/);
  assert.match(reply('E lei?'),/Vanessa.*VIP ed Elite/);
  reply('Cosa include Pro?');
  const price=reply('Quanto costa?');assert.match(price,/Pro: 105/);assert.doesNotMatch(price,/522/);
  assert.match(reply('sì'),/10 agenti umani/);
  reply('E per Elite quanto costa?');
  assert.match(reply('Sì'),/3.738 minuti/);
  assert.match(createVeronicaConversation()('Come mi chiamo?'),/Non me l’hai ancora detto/);
  assert.match(reply('Sei una persona?'),/assistente virtuale/);
});

test('public sisters demo keeps plan entitlements and future calling accurate',()=>{
  assert.match(veronicaReply('Cosa include Pro?'), /10 agenti umani/);
  assert.match(veronicaReply('Standard'), /Non include AI Assistant, chiamate AI o Detective/);
  assert.match(veronicaReply('Quali sono le quote?'), /0,27696/);
  assert.match(veronicaReply('Chi è Vanessa?'), /VIP ed Elite/);
  assert.match(veronicaReply('Posso chiamare?'), /richiedere una chiamata dimostrativa/);
  assert.match(veronicaReply('Posso usare una voce personalizzata?'), /Con Elite/);
  assert.match(veronicaReply('Anche VIP ha la voce reale del titolare?'), /non per Standard, Pro o VIP/);
  assert.match(veronicaReply('Posso cambiare la personalità di Vanessa?'), /ha già una personalità distinta/);
  assert.match(veronicaReply('Può dare del Lei?'), /dare del Lei oppure del tu/);
  assert.match(veronicaReply('Posso importare dati da un altro gestionale con Pro?'), /Pro compreso/);
  assert.match(veronicaReply('Importazione dati con Standard?'), /Standard non la include/);
  assert.match(veronicaReply('Quanto tempo per attivare Elite?'), /massimo di 24 ore/);
  assert.match(veronicaReply('Tempi di attivazione VIP'), /sabati, domeniche e giorni festivi sono esclusi/);
  assert.match(veronicaReply('Secret per franchising'), /su preventivo/);
  assert.match(veronicaReply('Una domanda fuori argomento'), /demo informativa guidata/);
});

test('video players receive seekable byte ranges and reject invalid requests',async()=>{
  const {server,db}=createApp({database:':memory:',connectInterval:0});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(origin+'/sorelle-assistenti')).status,200);
    for(const who of ['veronica','vanessa']){
      const url=origin+`/assets/${who}-intro.mp4`;
      const partial=await fetch(url,{headers:{Range:'bytes=0-1023'}});
      assert.equal(partial.status,206);assert.equal(partial.headers.get('content-type'),'video/mp4');
      assert.match(partial.headers.get('content-range'),/^bytes 0-1023\//);
      assert.equal((await partial.arrayBuffer()).byteLength,1024);
      const tail=await fetch(url,{headers:{Range:'bytes=-32'}});
      assert.equal(tail.status,206);assert.equal((await tail.arrayBuffer()).byteLength,32);
      for(const range of ['bytes=999999999-','bytes=-0','bytes=5-3','bytes=0-1,3-4']){
        const invalid=await fetch(url,{headers:{Range:range}});assert.equal(invalid.status,416,range);
        await invalid.arrayBuffer();
      }
    }
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
