// Local vault unlock: the PRF output from a verified platform passkey wraps the
// vault password. Neither the password, the PRF key nor biometrics go to a server.
const storageKey='prime-authenticator-biometric-v1';
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const random=()=>crypto.getRandomValues(new Uint8Array(32));
const aad=()=>new TextEncoder().encode('PRIME Authenticator biometric v1:'+location.origin);
export async function biometricAvailable(){
 try{return !!(globalThis.isSecureContext&&globalThis.PublicKeyCredential&&navigator.credentials&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch{return false;}
}
export function hasBiometric(){try{const v=JSON.parse(localStorage.getItem(storageKey)||'null');return v?.version===1&&v.origin===location.origin&&typeof v.credential==='string';}catch{return false;}}
export function removeBiometric(){localStorage.removeItem(storageKey);}
function verified(credential){
 if(!credential?.response?.authenticatorData)throw Error('Verifica del dispositivo non completata.');
 const auth=new Uint8Array(credential.response.authenticatorData);if(auth.length<37||(auth[32]&5)!==5)throw Error('È richiesta la verifica personale del dispositivo.');
}
async function prf(credential,salt){
 const result=await navigator.credentials.get({publicKey:{challenge:random(),allowCredentials:[{id:credential,type:'public-key'}],userVerification:'required',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
 if(!result||b64(result.rawId)!==b64(credential))throw Error('Credenziale del dispositivo non valida.');verified(result);
 const bytes=result.getClientExtensionResults()?.prf?.results?.first;
 if(!bytes||new Uint8Array(bytes).length!==32)throw Error('Questo browser o dispositivo non supporta lo sblocco cifrato con biometria. Usa la password dell’archivio.');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function enableBiometric(password){
 if(typeof password!=='string'||password.length<12)throw Error('Sblocca prima il tuo archivio con la password.');
 if(!await biometricAvailable())throw Error('Biometria non disponibile in questo browser. Apri l’app in Safari su iPhone o Chrome su Android, con blocco dispositivo attivo.');
 const salt=random(),credential=await navigator.credentials.create({publicKey:{challenge:random(),rp:{name:'PRIME Authenticator'},user:{id:random(),name:'PRIME Authenticator',displayName:'Archivio PRIME su questo dispositivo'},pubKeyCredParams:[{type:'public-key',alg:-7}],authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'required',requireResidentKey:true,userVerification:'required'},attestation:'none',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
 if(!credential||!credential.getClientExtensionResults()?.prf?.enabled)throw Error('La credenziale creata non supporta lo sblocco cifrato PRF. La password dell’archivio rimane necessaria.');
 const key=await prf(credential.rawId,salt),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad()},key,new TextEncoder().encode(password));
 localStorage.setItem(storageKey,JSON.stringify({version:1,origin:location.origin,credential:b64(credential.rawId),salt:b64(salt),iv:b64(iv),cipher:b64(cipher)}));
}
export async function unlockBiometric(){
 if(!hasBiometric())throw Error('Sblocca con la password e attiva prima la biometria su questo dispositivo.');
 const v=JSON.parse(localStorage.getItem(storageKey));
 if(v.credential.length>2048||v.cipher.length>4096||un64(v.salt).length!==32||un64(v.iv).length!==12)throw Error('Configurazione biometrica non valida. Usa la password.');
 const key=await prf(un64(v.credential),un64(v.salt));
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(v.iv),additionalData:aad()},key,un64(v.cipher)));}catch{throw Error('Sblocco biometrico non riuscito. Usa la password dell’archivio.');}
}
export function biometricError(error){return error?.name==='NotAllowedError'?'Verifica annullata o scaduta. Puoi usare la password dell’archivio.':error?.message||'Verifica del dispositivo non disponibile.';}
