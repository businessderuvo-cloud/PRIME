import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { createApp } from '../server.mjs';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/base');
mkdirSync(directory, { recursive: true });
// A separate archive and fixed edition: restarting the full edition cannot unlock Base.
const database = process.env.PRIME_BASE_DB || path.join(directory, 'prime.sqlite');
if (path.resolve(database) === path.resolve(directory, '../prime.sqlite')) throw Error('Usa un archivio distinto per PRIME Base.');
const { server, db } = createApp({ edition: 'base', database });
server.listen(Number(process.env.PORT || 4340), process.env.HOST || '127.0.0.1', () => {
  console.log(`PRIME Base disponibile su http://127.0.0.1:${server.address().port}`);
});
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { db.close(); process.exit(0); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
