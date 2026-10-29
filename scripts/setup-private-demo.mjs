import {randomBytes,scryptSync,createHash} from 'node:crypto';
import {writeFileSync,existsSync,chownSync} from 'node:fs';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {seedDemoWorkspace} from '../src/customer-demo.mjs';
if(process.env.PRIME_EDITION!=='elite'||!process.env.PRIME_DB)throw Error('Configurazione disponibile solo per la demo privata Elite.');
const filename=path.join(path.dirname(process.env.PRIME_DB),'private-demo-access.json');
if(existsSync(filename))throw Error('Accesso privato già configurato: nessuna credenziale modificata.');
const config={plan:'elite'},app=createApp({database:process.env.PRIME_DB,edition:'elite',publicDemo:config,connectInterval:0});
try{
  const email='demo.elite@prime.example';
  if(app.db.prepare('SELECT 1 FROM users WHERE email=?').get(email))throw Error('Account demo già presente: nessuna password modificata.');
  const password='Elite-'+randomBytes(20).toString('base64url'),salt=randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex');
  app.db.exec('BEGIN IMMEDIATE');
  try{
    seedDemoWorkspace(app,config,{email,colleagueEmail:'agente.elite@prime.example',name:'PRIME Elite · Demo privata'});
    app.db.prepare('UPDATE users SET password=? WHERE id=?').run(salt+':'+scryptSync(password,salt,64).toString('hex'),config.session.user_id);
    app.db.prepare('DELETE FROM sessions WHERE user_id=?').run(config.session.user_id);
    app.db.exec('COMMIT');
  }catch(error){app.db.exec('ROLLBACK');throw error;}
  const access={userId:config.session.user_id,tenantId:config.session.tenant_id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:Date.now()+365*86400000};
  writeFileSync(filename,JSON.stringify(access),{flag:'wx',mode:0o600});
  if(process.getuid?.()===0)chownSync(filename,1000,1000);
  const origin=process.env.PRIME_PUBLIC_URL;
  console.log('PRIME_DEMO_CREDENTIALS:'+JSON.stringify({email,password,accessUrl:origin+'/private-demo-access#'+token,expiresAt:access.expiresAt}));
}finally{app.server.emit('close');app.db.close();}
