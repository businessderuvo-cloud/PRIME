import {readFileSync} from 'node:fs';
import {restoreBackup} from '../src/backups.mjs';
const [file,destination]=process.argv.slice(2);
const key=Buffer.from(process.env.PRIME_BACKUP_KEY||'','base64');
if(!file||!destination||key.length!==32){console.error('Uso: node scripts/restore-backup.mjs FILE.prb NUOVA_CARTELLA (PRIME_BACKUP_KEY base64 da 32 byte)');process.exitCode=1;}
else {try{const result=restoreBackup(readFileSync(file),key,destination);console.log(`Ripristino verificato: ${result.files} file in una nuova cartella. Nessun database attivo sostituito.`);}catch(error){console.error('Ripristino fallito:',error.message);process.exitCode=1;}}
