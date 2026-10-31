import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const stateRoot=process.env.PRIME_DEPLOY_STATE_DIR||path.join(os.homedir(),'Documents','Codex','.prime-deploy');
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
let activeLock;

export function safeFile(file){
 const normalized=file.replaceAll('\\','/');
 if(normalized.split('/').some(s=>s==='..'||s==='.'||!s)||!(/^(public|src|scripts|migrations)\//.test(normalized)||['server.mjs','package.json','package-lock.json'].includes(normalized)))throw Error('File di pubblicazione non consentito: '+file);
 if(normalized.split('/').some(s=>s.startsWith('.')||s.endsWith('.env')))throw Error('Non pubblicare credenziali o file nascosti: '+file);
 return normalized;
}

export async function acquireLock(app,root=stateRoot,timeoutMs=600000){
 if(!/^[a-z0-9-]+$/.test(app))throw Error('Nome app non valido');
 await fs.mkdir(root,{recursive:true});
 const lockPath=path.join(root,app+'.lock'),token=crypto.randomUUID(),started=Date.now();
 let announced=false;
 for(;;){
  try{
   const fd=await fs.open(lockPath,'wx');
   const owner={token,pid:process.pid,host:os.hostname(),started:new Date().toISOString(),childPid:null};
   await fd.writeFile(JSON.stringify(owner));await fd.close();
   return {
    async child(pid){owner.childPid=pid;await fs.writeFile(lockPath,JSON.stringify(owner));},
    async release(){try{const current=JSON.parse(await fs.readFile(lockPath,'utf8'));if(current.token===token)await fs.unlink(lockPath);}catch(e){if(e.code!=='ENOENT')throw e;}}
   };
  }catch(e){if(e.code!=='EEXIST')throw e;}
  try{
   const owner=JSON.parse(await fs.readFile(lockPath,'utf8'));
   if(owner.host===os.hostname()&&!alive(owner.pid)&&(!owner.childPid||!alive(owner.childPid))){await fs.unlink(lockPath);continue;}
  }catch(e){if(e.code==='ENOENT')continue;}
  if(Date.now()-started>timeoutMs)throw Error('Un’altra pubblicazione è ancora attiva. Nessun file è stato sovrascritto.');
  if(!announced){console.log('Un’altra pubblicazione è in corso: attendo il mio turno.');announced=true;}
  await wait(1000);
 }
}

async function run(exe,args,{cwd,stream=false,allowFailure=false}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(exe,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout+=b;if(stream)process.stdout.write(b);});
  child.stderr.on('data',b=>{stderr+=b;if(stream)process.stderr.write(b);});
  const registered=activeLock?activeLock.child(child.pid):Promise.resolve();
  child.on('error',reject);
  child.on('close',async code=>{
   await registered;if(activeLock)await activeLock.child(null);
   if(code&&!allowFailure)reject(Error(`${exe} ${args[0]}: ${stderr||stdout}`));
   else resolve({code,stdout,stderr});
  });
 });
}

export async function mergeFile(base,desired,current,dir,name='file'){
 if(current!==null&&desired.equals(current))return desired;
 if(base===null){if(current===null)return desired;throw Error('Conflitto: un altro deploy ha già creato '+name);}
 if(current===null)throw Error('Conflitto: un altro deploy ha eliminato '+name);
 if(base.equals(current))return desired;
 if(base.equals(desired))return current;
 if([base,desired,current].some(b=>b.includes(0)))throw Error('Conflitto sul file binario '+name);
 await fs.mkdir(dir,{recursive:true});
 const id=crypto.randomUUID(),local=path.join(dir,id+'-local'),ancestor=path.join(dir,id+'-base'),remote=path.join(dir,id+'-live');
 await Promise.all([fs.writeFile(local,desired),fs.writeFile(ancestor,base),fs.writeFile(remote,current)]);
 const result=await run('git',['merge-file','--diff3','-p',local,ancestor,remote],{allowFailure:true});
 if(result.code){await fs.writeFile(path.join(dir,name.replaceAll('/','_')+'.conflict'),result.stdout);throw Error('Conflitto in '+name+'. Risolvi il file .conflict prima di pubblicare.');}
 return Buffer.from(result.stdout);
}

async function liveImage(app){
 const {stdout}=await run('fly',['image','show','--app',app,'--json']);
 const rows=JSON.parse(stdout);
 const images=new Set(rows.map(x=>`${x.Registry}/${x.Repository}@${x.Digest}`));
 if(images.size!==1)throw Error('Le macchine non hanno la stessa versione. Completa il deploy precedente prima di procedere.');
 return {image:[...images][0],machine:rows[0].MachineID,tag:rows[0].Tag};
}

async function readLiveFiles(app,files){
 for(let attempt=0;attempt<3;attempt++){
  const before=await liveImage(app);
  const encoded=Buffer.from(JSON.stringify(files)).toString('base64');
  const code=`const f=require("fs"),p=JSON.parse(Buffer.from("${encoded}","base64").toString());console.log("PRIME_FILES="+JSON.stringify(Object.fromEntries(p.map(n=>{try{return [n,f.readFileSync("/app/"+n).toString("base64")]}catch(e){if(e.code==="ENOENT")return [n,null];throw e}}))))`;
  const result=await run('fly',['ssh','console','--app',app,'--machine',before.machine,'--quiet','-C',`node -e '${code}'`]);
  const line=result.stdout.split(/\r?\n/).find(l=>l.startsWith('PRIME_FILES='));
  if(!line)throw Error('Impossibile leggere i file della versione live.');
  const after=await liveImage(app);
  if(before.image===after.image)return {...after,files:JSON.parse(line.slice('PRIME_FILES='.length))};
 }
 throw Error('La versione live cambia continuamente. Riprova quando gli altri deploy sono conclusi.');
}

async function snapshot(app,dir,files){
 try{await fs.access(path.join(dir,'snapshot.json'));throw Error('La cartella contiene già uno snapshot: scegli una cartella nuova per conservare le modifiche.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const live=await readLiveFiles(app,files);
 await fs.mkdir(path.join(dir,'files'),{recursive:true});
 for(const file of files){
  const dest=path.join(dir,'files',file);await fs.mkdir(path.dirname(dest),{recursive:true});
  if(live.files[file]!==null)await fs.writeFile(dest,Buffer.from(live.files[file],'base64'));
 }
 await fs.writeFile(path.join(dir,'snapshot.json'),JSON.stringify({version:1,app,created:new Date().toISOString(),...live},null,2));
 console.log('Snapshot pronto. Modifica solo i file nella cartella '+path.join(dir,'files'));
}

async function publish(dir){
 const manifest=JSON.parse(await fs.readFile(path.join(dir,'snapshot.json'),'utf8'));
 if(manifest.version!==1)throw Error('Formato snapshot non supportato');
 const files=Object.keys(manifest.files).map(safeFile),app=manifest.app;
 const desired=Object.fromEntries(await Promise.all(files.map(async f=>[f,await fs.readFile(path.join(dir,'files',f))])));
 activeLock=await acquireLock(app);
 const record={app,started:new Date().toISOString(),files:files.map(f=>({path:f,sha256:hash(desired[f])}))};
 try{
  for(let attempt=0;attempt<3;attempt++){
   const live=await readLiveFiles(app,files);
   const build=path.join(dir,'build-'+crypto.randomUUID());await fs.mkdir(build,{recursive:true});
   for(const file of files){
    const base=manifest.files[file]===null?null:Buffer.from(manifest.files[file],'base64');
    const current=live.files[file]===null?null:Buffer.from(live.files[file],'base64');
    const content=await mergeFile(base,desired[file],current,path.join(dir,'conflicts'),file);
    const dest=path.join(build,'overlay',file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,content);
   }
   const deps=files.some(f=>['package.json','package-lock.json'].includes(f));
   await fs.writeFile(path.join(build,'Dockerfile'),`FROM ${live.image}\nCOPY overlay/ /app/\n${deps?'RUN npm ci --omit=dev --no-audit --no-fund\n':''}`);
   const config=path.join(build,'fly.toml');await fs.writeFile(config,`app = "${app}"\n`);
   await run('fly',['config','save','--app',app,'--config',config,'--yes']);
   const label='safe-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex');
   console.log('Preparo il pacchetto sulla versione live '+live.tag);
   await run('fly',['deploy','--app',app,'--config',config,'--dockerfile',path.join(build,'Dockerfile'),'--build-only','--push','--image-label',label,'--compression','gzip'],{cwd:build,stream:true});
   const beforeDeploy=await liveImage(app);
   if(beforeDeploy.image!==live.image){console.log('Un deploy esterno è terminato durante la preparazione: ricompongo il pacchetto sulla nuova versione.');continue;}
   const target=`registry.fly.io/${app}:${label}`;
   await run('fly',['deploy','--app',app,'--config',config,'--image',target],{cwd:build,stream:true});
   const after=await readLiveFiles(app,files);
   if(after.tag!==label)throw Error('Un altro deploy ha sostituito la versione appena pubblicata. Nessun successo dichiarato.');
   for(const file of files){const expected=await fs.readFile(path.join(build,'overlay',file));if(after.files[file]===null||hash(Buffer.from(after.files[file],'base64'))!==hash(expected))throw Error('Verifica live non riuscita: '+file);}
   record.image=after.image;record.tag=label;record.status='published';
   console.log('Pubblicazione verificata: '+label);return;
  }
  throw Error('Tre deploy esterni hanno cambiato la base. Nessuna versione obsoleta è stata pubblicata.');
 }catch(e){record.status='failed';record.error=e.message;throw e;}
 finally{
  record.finished=new Date().toISOString();
  try{await fs.appendFile(path.join(stateRoot,app+'.jsonl'),JSON.stringify(record)+'\n');}
  finally{await activeLock.release();activeLock=null;}
 }
}

export async function main(args){
 const [command,...rest]=args,options={file:[]};
 for(let i=0;i<rest.length;i+=2){const key=rest[i].replace(/^--/,'');if(!rest[i].startsWith('--')||!rest[i+1])throw Error('Argomenti non validi');if(key==='file')options.file.push(safeFile(rest[i+1]));else options[key]=rest[i+1];}
 if(!options.dir)throw Error('Usa snapshot --app APP --dir DIR --file public/file oppure publish --dir DIR');
 const dir=path.resolve(options.dir);
 if(command==='snapshot'){if(!options.app||!options.file.length)throw Error('Specifica --app e almeno un --file');if(!/^[a-z0-9-]+$/.test(options.app))throw Error('Nome app non valido');await snapshot(options.app,dir,[...new Set(options.file)]);}
 else if(command==='publish')await publish(dir);
 else throw Error('Comando non valido: snapshot o publish');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
