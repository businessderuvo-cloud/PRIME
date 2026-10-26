import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './src/database.mjs';
import { livePhone, eliteModel } from './src/elite.mjs';

test('Elite fixes Vanessa LIVE to the ElevenLabs GPT 6.1 Sol model',()=>{
  assert.equal(eliteModel,'gpt-6.1-sol');
});

test('Elite phone numbers normalize and reject local or malformed values',()=>{
  assert.equal(livePhone('+39 (333) 123-4567'),'+393331234567');
  assert.equal(livePhone('0039 333 1234567'),'+393331234567');
  assert.throws(()=>livePhone('3331234567'),/numero internazionale/);
  assert.throws(()=>livePhone('+00000000'),/numero internazionale/);
});

test('Elite database migrations create settings, consented call queue and conversation ledger',()=>{
  const db=openDatabase(':memory:');
  try{
    for(const table of ['elite_settings','elite_agents','elite_access_tokens','elite_call_queue','elite_conversations'])
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
  }finally{db.close();}
});
