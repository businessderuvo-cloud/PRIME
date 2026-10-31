import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {acquireLock,mergeFile,safeFile} from './deploy-safe.mjs';

test('independent changes in the same file survive a three-way merge',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prime-merge-'));
 try{assert.equal((await mergeFile(Buffer.from('first\nsecond\nthird\nfourth\n'),Buffer.from('FIRST\nsecond\nthird\nfourth\n'),Buffer.from('first\nsecond\nthird\nFOURTH\n'),dir)).toString(),'FIRST\nsecond\nthird\nFOURTH\n');}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('overlapping edits block publication and keep a conflict artifact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prime-conflict-'));
 try{await assert.rejects(mergeFile(Buffer.from('original\n'),Buffer.from('mine\n'),Buffer.from('theirs\n'),dir,'public/test.js'),/Conflitto/);assert.match(await fs.readFile(path.join(dir,'public_test.js.conflict'),'utf8'),/<<<<<<<[\s\S]*mine[\s\S]*theirs/);}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('new files and binary collisions are handled without overwriting others',async()=>{
 const b=Buffer.from([0,1]),other=Buffer.from([0,2]);
 assert.deepEqual(await mergeFile(null,b,null,'.'),b);
 await assert.rejects(mergeFile(null,b,other,'.'),/Conflitto/);
 await assert.rejects(mergeFile(Buffer.from([0,3]),b,other,'.'),/binario/);
});
test('two publishers are serialized across processes',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'prime-lock-'));
 let lock;
 try{
  lock=await acquireLock('test-app',dir);
  const moduleUrl=new URL('./deploy-safe.mjs',import.meta.url).href;
  const code=`import {acquireLock} from ${JSON.stringify(moduleUrl)};const lock=await acquireLock('test-app',${JSON.stringify(dir)},5000);console.log('ACQUIRED');await lock.release();`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{windowsHide:true});
  let output='';child.stdout.on('data',b=>output+=b);
  const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve():reject(Error('Child failed')));});
  await new Promise(r=>setTimeout(r,350));assert.ok(!output.includes('ACQUIRED'));
  await lock.release();lock=null;await done;assert.match(output,/ACQUIRED/);
 }finally{if(lock)await lock.release();await fs.rm(dir,{recursive:true,force:true});}
});
test('secrets and path escapes cannot enter a patch',()=>{
 for(const value of ['../server.mjs','public/../../.env','.env','public/.env','/server.mjs','data/prime.sqlite'])assert.throws(()=>safeFile(value));
 assert.equal(safeFile('public\\landing.js'),'public/landing.js');
});
