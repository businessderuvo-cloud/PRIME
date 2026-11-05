import {generateKeyPairSync,sign} from 'node:crypto';
import {ApiError} from '../validation.mjs';

const apiBase='https://api-frontend.wallester.com';

export function generateWallesterCredentials(){
 const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:4096,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 return {public_key:Buffer.from(publicKey,'utf8').toString('base64'),private_key:privateKey,api_key:''};
}

function jwt(apiKey,privateKey){
 const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({api_key:apiKey,ts:Math.floor(Date.now()/1000)})).toString('base64url');
 const input=header+'.'+payload;
 return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function wallesterJson({fetcher=fetch,apiKey,privateKey,path,method='GET',body,multipart}){
 if(!/^\/v[12]\/[A-Za-z0-9_/?=&%.,:+\-]*$/.test(path)||path.includes('..'))throw new ApiError(400,'Percorso Wallester non consentito.');
 let payload=body===undefined?undefined:JSON.stringify(body);
 if(multipart){payload=new FormData();for(const [key,value]of Object.entries(multipart)){if(value&&typeof value==='object'&&value.data!==undefined)payload.append(key,new Blob([Buffer.from(value.data,'base64')],{type:value.type}),value.name);else payload.append(key,String(value));}}
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{
   response=await fetcher(apiBase+path,{method,...(payload!==undefined?{body:payload}:{}),headers:{Accept:'application/json',...(!multipart?{'Content-Type':'application/json'}:{}),Authorization:'Bearer '+jwt(apiKey.trim(),privateKey)},redirect:'error',signal:AbortSignal.timeout(20000)});
  }catch(error){
   if(error?.name==='AbortError'||error?.name==='TimeoutError')throw new ApiError(504,'Wallester non ha risposto in tempo. La sincronizzazione verrà riprovata.');
   throw new ApiError(502,'Impossibile raggiungere l’API Wallester. La sincronizzazione verrà riprovata.');
  }
  if(method==='GET'&&(response.status===429||response.status>=500)&&attempt<2){await pause(300*(2**attempt));continue;}
  if(response.status===401)throw new ApiError(401,'Wallester ha rifiutato le credenziali. Verifica la chiave API e la chiave pubblica registrata.');
  if(response.status===403)throw new ApiError(403,'Wallester non autorizza questa funzione con i permessi della chiave collegata. Verifica le abilitazioni del conto nel portale Wallester.');
  if(response.status===429)throw new ApiError(429,'Limite temporaneo di richieste Wallester raggiunto. La sincronizzazione verrà riprovata.');
  if(!response.ok)throw new ApiError(response.status>=500?502:400,'L’API Wallester ha risposto con errore HTTP '+response.status+'.');
  if(response.status===204)return {ok:true};try{return await response.json();}catch{throw new ApiError(502,'Risposta non valida dall’API Wallester.');}
 }
 throw new ApiError(502,'Richiesta Wallester non completata.');
}

export async function wallesterAccounts({fetcher=fetch,apiKey,privateKey}){
 if(typeof apiKey!=='string'||!apiKey.trim()||typeof privateKey!=='string'||!privateKey.includes('PRIVATE KEY'))throw new ApiError(400,'Credenziali API Wallester non valide.');
 const all=[];let offset=0,total=Infinity;
 while(offset<total){
  const query=new URLSearchParams({from_record:String(offset),records_count:'1000'});
  const raw=await wallesterJson({fetcher,apiKey,privateKey,path:'/v1/accounts?'+query});
  if(!Array.isArray(raw?.accounts))throw new ApiError(502,'Formato risposta API Wallester inatteso: elenco dei conti non trovato.');
  const rows=raw.accounts.map(account=>({id:String(account.id||''),name:String(account.name||'Conto Wallester'),currency_code:String(account.currency_code||''),balance:Number.isFinite(account.balance)?account.balance:null,available_amount:Number.isFinite(account.available_amount)?account.available_amount:null,blocked_amount:Number.isFinite(account.blocked_amount)?account.blocked_amount:null,status:String(account.status||''),is_main:!!account.is_main}));
  all.push(...rows);total=Number.isFinite(raw.total_records_number)?raw.total_records_number:offset+rows.length;offset+=rows.length;
  if(!rows.length)break;
 }
 return all;
}

export async function wallesterStatement({fetcher=fetch,apiKey,privateKey,accountId,fromRecord=0,recordsCount=1000,fromDate='',toDate='',orderDirection='desc'}){
 if(typeof apiKey!=='string'||!apiKey.trim()||typeof privateKey!=='string'||!privateKey.includes('PRIVATE KEY'))throw new ApiError(400,'Credenziali API Wallester non valide.');
 if(typeof accountId!=='string'||!accountId)throw new ApiError(400,'Conto Wallester non valido.');
 const query=new URLSearchParams({from_record:String(fromRecord),records_count:String(recordsCount),include_authorizations:'true',include_transactions:'true',include_account_adjustments:'true',include_fees:'true',include_wire_transfer_payout_intentions:'true',order_direction:orderDirection==='asc'?'asc':'desc',order_field:'date'});
 if(fromDate&&toDate){query.set('from_date',fromDate);query.set('to_date',toDate);}
 const raw=await wallesterJson({fetcher,apiKey,privateKey,path:'/v1/accounts/'+encodeURIComponent(accountId)+'/statement?'+query});
 if(!Array.isArray(raw?.records)||!Number.isFinite(raw?.total_records_number))throw new ApiError(502,'Formato risposta estratto conto Wallester inatteso.');
 const fields=['account_amount','account_currency_code','account_external_id','card_id','card_name','currency_exchange_offer','date','description','embossing_company_name','embossing_first_name','embossing_last_name','embossing_name','enriched_merchant_data','exchange_rate','group','has_payment_document_files','has_payment_notes','id','is_cleared','is_declined','is_reversal','marked_for_dispute_at','marked_for_dispute_by','masked_card_number','merchant_category_code','merchant_city','merchant_country_code','merchant_id','merchant_name','original_authorization_id','purchase_date','receiver_iban','receiver_name','reference','response','response_code','sender_iban','sender_name','status','sub_type','tags','terminal_id','total_amount','transaction_amount','transaction_currency_code','type'];
 return {total_records_number:raw.total_records_number,records:raw.records.map(record=>{const details={};for(const key of fields)if(record[key]!==undefined)details[key]=record[key];return {id:String(record.id||''),date:String(record.date||record.purchase_date||''),type:String(record.type||''),group:String(record.group||''),status:String(record.status||''),description:String(record.description||record.merchant_name||record.receiver_name||record.sender_name||record.group||record.type||'Movimento Wallester'),merchant_name:String(record.merchant_name||''),account_amount:Number.isFinite(record.account_amount)?record.account_amount:null,account_currency_code:String(record.account_currency_code||''),transaction_amount:Number.isFinite(record.transaction_amount)?record.transaction_amount:null,transaction_currency_code:String(record.transaction_currency_code||''),details};})};
}

