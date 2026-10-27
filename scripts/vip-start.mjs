import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createApp } from '../server.mjs';

const directory=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data/vip');
mkdirSync(directory,{recursive:true});
const database=process.env.PRIME_VIP_DB||path.join(directory,'prime.sqlite');
const shared=path.resolve(directory,'../prime.sqlite');
if(path.resolve(database)===shared)throw Error('Usa un archivio distinto per PRIME VIP.');
const {server,db}=createApp({edition:'vip',database});
server.listen(Number(process.env.PORT||4342),process.env.HOST||'127.0.0.1',()=>console.log(`PRIME VIP disponibile su http://127.0.0.1:${server.address().port}/app`));
let stopping=false;
function stop(){if(stopping)return;stopping=true;server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
