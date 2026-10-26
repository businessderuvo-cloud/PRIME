import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function createTotpSecret() {
  const bytes = randomBytes(20); let bits = 0, value = 0, out = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decodeBase32(value) {
  const source = String(value).replace(/=+$/g, "").toUpperCase(); let bits = 0, buffer = 0; const out = [];
  for (const char of source) { const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid base32"); buffer = (buffer << 5) | index; bits += 5; if (bits >= 8) { out.push((buffer >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totpCode(secret, time = Date.now()) {
  const counter = BigInt(Math.floor(time / 30000)); const msg = Buffer.alloc(8); msg.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(msg).digest(); const offset = digest[digest.length - 1] & 15;
  const code = ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
  return code;
}
export function verifyTotp(secret, input, time = Date.now()) {
  const code = String(input || "").replace(/\s/g, ""); if (!/^\d{6}$/.test(code)) return false;
  const actual = Buffer.from(code);
  for (const delta of [-30000, 0, 30000]) { const expected = Buffer.from(totpCode(secret, time + delta)); if (timingSafeEqual(actual, expected)) return true; }
  return false;
}
export function totpUri(secret, email, issuer = "PRIME") {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
