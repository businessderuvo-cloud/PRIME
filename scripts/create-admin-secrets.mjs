import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createTotpSecret, totpUri } from '../src/totp.mjs';

if (!process.stdin.isTTY) throw new Error('Esegui questo comando da un terminale interattivo.');
const input = createInterface({ input: process.stdin, output: process.stdout });
input.question('Email Super Admin: ', email => {
  input.close();
  const secret = randomBytes(16).toString('hex');
  let password = '';
  process.stdout.write('Password Super Admin (minimo 16 caratteri): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', key => {
    if (key === '\u0003') { process.stdout.write('\n'); process.exit(130); }
    if (key === '\r' || key === '\n') {
      process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); input.close();
      if (password.length < 16) { process.stderr.write('Password troppo corta.\n'); process.exitCode = 1; return; }
      const hash = `${secret}:${scryptSync(password, secret, 64).toString('hex')}`;
      password = '';
      const totp = createTotpSecret();
      process.stdout.write(`PRIME_SUPER_ADMIN_EMAIL=${String(email).trim().toLowerCase()}\nPRIME_SUPER_ADMIN_PASSWORD_HASH=${hash}\nPRIME_SUPER_ADMIN_TOTP_SECRET=${totp}\nAuthenticator URI=${totpUri(totp,String(email).trim().toLowerCase())}\n`);
      return;
    }
    if (key === '\u007f' || key === '\b') password = password.slice(0, -1);
    else if (key.length === 1 && password.length < 128) password += key;
  });
});
