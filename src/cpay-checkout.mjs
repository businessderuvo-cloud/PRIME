import QRCode from 'qrcode';
import {ApiError} from './validation.mjs';
import {plans} from '../public/pricing.js';

export const cryptoNetworks=Object.freeze([
 {id:'5edf2767c9ca4d5a342bf8ac',symbol:'BTC',network:'Bitcoin',node:'btc'},
 {id:'6336da3bca5405284b73d9ae',symbol:'USDC',network:'Ethereum · ERC20',node:'eth'},
 {id:'647c3c108268113f59a7197e',symbol:'USDC',network:'Polygon',node:'matic'},
 {id:'6867e8d06b6b4ec18c2a0d84',symbol:'USDC',network:'Base',node:'base'},
 {id:'653621140b4afe0330d6bfff',symbol:'USDC',network:'Solana',node:'solana'}
]);
export function assertCharge(order,detail,merchant){
 const c=detail?.checkout,m=typeof c?.merchant==='object'?(c.merchant._id||c.merchant.id):c?.merchant;
 if(detail?.typeNetwork!=='mainnet'||(order.active_charge_id&&detail.id!==order.active_charge_id)||!Number.isFinite(Date.parse(detail.expiredDate))||c?.identifier!==order.identifier||m!==merchant||c.type!=='Sale'||c.fiatCurrency!=='EUR'||Math.round(Number(c.price)*100)!==order.cents)throw new ApiError(409,'I dati del pagamento non corrispondono all’ordine.');
}
export function paymentWallet(detail,currencyId){
 const network=cryptoNetworks.find(x=>x.id===currencyId);
 const wallet=detail?.wallets?.find(w=>(w.currency?.id||w.currency?._id)===currencyId);
 if(!network||!wallet)return null;
 const amount=String(wallet.amountCurrency??''),address=wallet.address;
 if(wallet.currency.name!==network.symbol||wallet.currency.nodeType!==network.node||typeof address!=='string'||!address||address.length>200||!/^[a-zA-Z0-9]+$/.test(address)||!/^\d+(?:\.\d+)?$/.test(amount)||!Number.isFinite(Number(amount))||Number(amount)<=0)throw new ApiError(503,'Importo o indirizzo CPAY non disponibile.');
 return {currencyId,symbol:network.symbol,network:network.network,address,amount,minimum:String(wallet.currency.minReplenish||0)};
}
export function nativeCheckout({db,json,readBody,request,reconcile,env,clock}){
 const locks=new Set();
 async function detail(order){const d=(await request('/api/checkout-client/'+order.active_charge_id+'/charge',undefined,false)).data;assertCharge(order,d,env.PRIME_CPAY_MERCHANT_ID);return d;}
 async function present(order,d){
  const payment=d&&paymentWallet(d,order.active_currency_id),expired=d&&(d.systemStatus==='Expired'||Date.parse(d.expiredDate)<=clock());
  const out={id:order.id,plan:order.plan,name:plans[order.plan].name,cycle:order.cycle,cents:order.cents,state:order.state,networks:cryptoNetworks,providerUrl:'https://checkouts.cpay.world/checkout/'+order.identifier,chargeStatus:d?.systemStatus||null,expiresAt:d?.expiredDate||null,expired:!!expired};
  if(payment&&!expired&&!['Done','Failed'].includes(d.systemStatus)&&order.state!=='paid'){
   out.payment=payment;
   // BTC uses BIP21; the USDC QR contains only the address, avoiding an ambiguous network/amount URI.
   const payload=payment.symbol==='BTC'?`bitcoin:${payment.address}?amount=${payment.amount}`:payment.address;
   out.qrSvg=await QRCode.toString(payload,{type:'svg',errorCorrectionLevel:'M',margin:4,width:240,color:{dark:'#101820',light:'#ffffff'}});
  }
  return out;
 }
 return async function(req,res,url,s){
  const match=/^\/api\/billing\/crypto-order\/([a-f0-9-]{36})(\/prepare)?$/.exec(url.pathname);if(!match)return false;
  if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può gestire il pagamento.');
  const get=()=>db.prepare('SELECT * FROM cpay_orders WHERE id=? AND tenant_id=?').get(match[1],s.tenant_id);
  let order=get();if(!order||!order.identifier)throw new ApiError(404,'Ordine non disponibile.');
  if(order.state!=='paid'&&db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id)?.kyb_status!=='approved')throw new ApiError(403,'Verifica aziendale non approvata.');
  res.setHeader?.('Cache-Control','no-store');
  if(req.method==='GET'&&!match[2]){
   if(order.state==='pending'&&clock()-order.checked_at>=15000){await reconcile(order);order=get();}
   json(res,200,await present(order,order.state!=='paid'&&order.active_charge_id?await detail(order):null));return true;
  }
  if(req.method!=='POST'||!match[2])throw new ApiError(405,'Operazione non disponibile.');
  if(db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id)?.kyb_status!=='approved')throw new ApiError(403,'Verifica aziendale non approvata.');
  const body=await readBody(req),network=cryptoNetworks.find(x=>x.id===body.currencyId);if(!network)throw new ApiError(400,'Seleziona una rete disponibile.');
  if(locks.has(order.id))throw new ApiError(409,'Preparazione del pagamento in corso.');locks.add(order.id);
  try{
   await reconcile(order);order=get();if(order.state==='paid'){json(res,200,await present(order,null));return true;}
   let d=order.active_charge_id?await detail(order):null;
   if(d&&d.systemStatus!=='Expired'){
    if(order.active_currency_id!==network.id)throw new ApiError(409,'Hai già un indirizzo attivo. Completa il pagamento sulla rete indicata oppure attendi la scadenza.');
    if(['Done','Failed'].includes(d.systemStatus))throw new ApiError(409,'Pagamento in verifica: aggiorna lo stato prima di continuare.');
   }else{
    const result=(await request('/api/checkout-client/'+order.identifier+'/charge?createWallet=false',{},false)).data;
    if(!/^[a-f0-9]{24}$/.test(result?.id||''))throw new ApiError(503,'CPAY non ha restituito il riferimento del pagamento.');
    db.prepare('UPDATE cpay_orders SET active_charge_id=?,active_currency_id=? WHERE id=?').run(result.id,network.id,order.id);order=get();d=null;
   }
   if(!d||!paymentWallet(d,network.id)){
    await request('/api/checkout-client/'+order.active_charge_id+'/wallet/'+network.id,{},false);
   }
   d=await detail(order);
   if(!paymentWallet(d,network.id))throw new ApiError(503,'Indirizzo in preparazione: riprova tra poco.');
   json(res,200,await present(order,d));return true;
  }finally{locks.delete(order.id);}
 };
}
