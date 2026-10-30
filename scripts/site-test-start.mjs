import {createApp} from '../server.mjs';
import {scryptSync,randomBytes} from 'node:crypto';
const salt=randomBytes(16).toString('hex'),passwordHash=password=>salt+':'+scryptSync(password,salt,64).toString('hex');
const app=createApp({database:':memory:',production:false,demo:false,connectInterval:0});
app.db.prepare('INSERT INTO tenants VALUES(?,?)').run('website-test','PRIME · fictional test agency');
app.db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES(?,?,?,1)').run('website-test-owner','test-owner@prime.local',await passwordHash('PrimeTestOnly2026!'));
app.db.prepare('INSERT INTO memberships VALUES(?,?,?)').run('website-test-owner','website-test','owner');
app.db.prepare("INSERT INTO agency_billing(tenant_id,kyb_status) VALUES(?,'approved')").run('website-test');
app.server.listen(4356,'127.0.0.1',()=>console.log('PRIME site test: http://127.0.0.1:4356/?lang=en · local fictional account: test-owner@prime.local / PrimeTestOnly2026!'));
