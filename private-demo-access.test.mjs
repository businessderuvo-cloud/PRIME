import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createApp} from './server.mjs';

test('private Elite demo access is scoped, persistent and backed by separate credentials',async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'prime-private-access-')),database=path.join(directory,'demo.sqlite');
  let app;
  try{
    const output=execFileSync(process.execPath,['scripts/setup-private-demo.mjs'],{encoding:'utf8',env:{...process.env,PRIME_EDITION:'elite',PRIME_DB:database,PRIME_PUBLIC_URL:'http://localhost:4317',NODE_ENV:'development'}});
    const credentials=JSON.parse(output.split('\n').find(line=>line.startsWith('PRIME_DEMO_CREDENTIALS:')).slice('PRIME_DEMO_CREDENTIALS:'.length)),token=new URL(credentials.accessUrl).hash.slice(1);
    const stored=readFileSync(path.join(directory,'private-demo-access.json'),'utf8');assert.ok(!stored.includes(token));assert.ok(!stored.includes(credentials.password));
    app=createApp({database,edition:'elite',production:false,connectInterval:0});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
    let response=await fetch(base+'/api/private-demo-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'bad'})});assert.equal(response.status,401);
    response=await fetch(base+'/api/private-demo-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(response.status,200);
    const cookie=response.headers.get('set-cookie');assert.match(cookie,/Max-Age=31536000/);assert.match(cookie,/HttpOnly/);
    const me=await fetch(base+'/api/me',{headers:{Cookie:cookie.split(';')[0]}}).then(result=>result.json());assert.equal(me.email,credentials.email);assert.equal(me.edition,'elite');assert.equal(me.role,'owner');
    assert.equal(app.db.prepare('SELECT count(*) n FROM properties WHERE tenant_id=?').get(me.tenant_id).n,3);
    response=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'login',email:credentials.email,password:credentials.password})});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=31536000/);
    assert.throws(()=>execFileSync(process.execPath,['scripts/setup-private-demo.mjs'],{stdio:'pipe',env:{...process.env,PRIME_EDITION:'elite',PRIME_DB:database}}),'setup cannot silently reset an existing account');
  }finally{
    if(app){await new Promise(resolve=>app.server.close(resolve));app.db.close();}
    assert.ok(directory.startsWith(path.join(tmpdir(),'prime-private-access-')));rmSync(directory,{recursive:true,force:true});
  }
});
