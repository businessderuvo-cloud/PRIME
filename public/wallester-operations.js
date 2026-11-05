import {renderWallesterCards} from './wallester-cards.js?v=20261101-secure-cards';
const labels={account_id:'Conto di addebito',card_id:'Carta',wire_transfer_id:'Identificativo bonifico',account_adjustment_id:'Identificativo movimento',payment_file_id:'Identificativo distinta',payment_record_id:'Identificativo disposizione',from_account_id:'Conto di origine',to_account_id:'Conto di destinazione',from_amount:'Importo da cambiare',to_amount:'Importo da ricevere',amount:'Importo',currency_code:'Valuta',receiver_iban:'IBAN beneficiario',receiver_name:'Nome beneficiario',reference:'Causale',offer_id:'Offerta di cambio',action_id:'Identificativo conferma',challenge_type:'Metodo di conferma',challenge_value:'Codice di conferma',from_record:'Dal risultato',records_count:'Numero risultati',block_type:'Motivo del blocco',type:'Tipo',name:'Nome',external_id:'Riferimento esterno',is_main:'Conto principale',order_direction:'Ordinamento',order_field:'Ordina per',beneficiary_iban:'IBAN beneficiario',beneficiary_name:'Nome beneficiario',beneficiary_type:'Tipo beneficiario',send_notification:'Invia notifica',cancellation_reason:'Motivo annullamento',limits:'Limiti',file:'File',payment_id:'Identificativo pagamento',matched_name:'Intestatario verificato',verification_result:'Esito verifica intestatario',is_from_client_portal:'Iniziato dal portale Wallester'};
const label=name=>name.split('.').slice(1).map(key=>labels[key]||key.replaceAll('_',' ')).join(' · ')||'Dati';
const sensitive=name=>/(challenge_value|password|(^|[._])(pin|cvv2?|cvc|pan|api_key|private_key)($|[._]))/i.test(name);
const shortcuts=[['InitiateWireTransferPayout','Nuovo bonifico','Conto, beneficiario, importo e causale'],['ValidateWireTransferPayout','Verifica beneficiario','Controlla intestatario, IBAN e importo'],['GetWireTransferPayout','Stato bonifico','Consulta una disposizione già creata'],['ConfirmWireTransferPayout','Conferma bonifico','Autorizza una disposizione preparata'],['CancelWireTransferPayout','Annulla bonifico','Annulla una disposizione consentita'],['GetWireTransferPayoutConfirmation','Ricevuta bonifico','Recupera la conferma del pagamento'],['CreatePaymentRecordsFromFile','Importa distinta','Disposizioni da CSV, Excel o XML'],['GetPaymentFiles','Distinte e pagamenti','Consulta e gestisci i bonifici da file']];
const icons={
 InitiateWireTransferPayout:'<rect x="3" y="6" width="15" height="14" rx="3"/><path d="M3 10h10M7 15h3M18 3v6m-3-3h6"/>',
 ValidateWireTransferPayout:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
 GetWireTransferPayout:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M4 4l2 2"/>',
 ConfirmWireTransferPayout:'<rect x="3" y="4" width="14" height="17" rx="3"/><path d="M7 8h6M7 12h3m3 4 3 3 5-6"/>',
 CancelWireTransferPayout:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
 GetWireTransferPayoutConfirmation:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
 CreatePaymentRecordsFromFile:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M12 18v-6m-3 3 3-3 3 3"/>',
 GetPaymentFiles:'<path d="M3 8V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="M8 11h8M8 15h8M8 18h4"/>'
};
export async function renderWallesterOperations({root,current,state,api,esc,refresh}){
 const catalog=await api('/api/connect/wallester/operations');
 const operations=catalog.operations.filter(op=>state.me.role==='owner'||op.method==='GET');
 root.classList.add('wallester-operations');
 root.innerHTML=`<div class="wallester-operation-heading"><div><h2>Bonifici e pagamenti</h2><p>Disposizioni singole, verifica del beneficiario, conferma, annullamento e distinte.</p></div><span class="wallester-plan-badge">VIP · ELITE · SECRET</span></div><div class="wallester-operation-shortcuts">${shortcuts.filter(([id])=>operations.some(op=>op.id===id)).map(([id,title,detail])=>`<button type="button" class="secondary" data-operation-shortcut="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icons[id]}</svg><strong>${title}</strong><small>${detail}</small></button>`).join('')}</div><h3 data-operation-title class="wallester-active-operation"></h3><p data-operation-description class="small-note"></p><form data-operation-form class="connect-form"></form><div data-result role="status" aria-live="polite"></div>`;
 const form=root.querySelector('form'),result=root.querySelector('[data-result]');
 let revision=0,context={},selectedId='',cardManager;
 const cardsRoot=document.createElement('section');root.append(cardsRoot);
 function drawForm(){
  revision++;result.replaceChildren();const op=operations.find(op=>op.id===selectedId);
  root.querySelectorAll('[data-operation-shortcut]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.operationShortcut===op?.id)));
  if(!op){form.replaceChildren();root.querySelector('[data-operation-description]').textContent='Nessuna funzione corrisponde alla ricerca.';return;}
  root.querySelector('[data-operation-title]').textContent=shortcuts.find(([id])=>id===op.id)?.[1]||op.label;
  root.querySelector('[data-operation-description]').textContent=op.sandbox?'Disponibile esclusivamente in un ambiente sandbox Wallester.':'Controlla i dati nel riepilogo prima di confermare. Le operazioni di modifica sono riservate al titolare.';
  form.innerHTML=op.fields.map(field=>{
   const required=field.required||(field.type==='file')||(op.id==='CreateCard'&&['body.account_id','body.name'].includes(field.name)),attrs=`name="${esc(field.name)}" ${required?'required':''}`;
   let control;
   if(field.enum||field.type==='boolean')control=`<select ${attrs}><option value="">Seleziona…</option>${(field.enum||['true','false']).map(value=>`<option ${field.name.endsWith('currency_code')?`data-currency="${esc(String(value))}"`: ''} value="${esc(String(value))}">${esc(field.type==='boolean'?(String(value)==='true'?'Sì':'No'):(op.id==='CreateCard'&&field.name==='body.type'?({Virtual:'Virtuale',ChipAndPin:'Fisica'}[value]||String(value)):String(value)))}</option>`).join('')}</select>`;
   else if(field.name.endsWith('account_id'))control=`<select ${attrs}><option value="">Seleziona conto…</option>${current.accounts.map(account=>`<option data-currency="${esc(account.currency_code)}" value="${esc(account.id)}">${esc(account.name)} · ${esc(account.currency_code)}</option>`).join('')}</select>`;
   else if(['array','object'].includes(field.type))control=`<textarea ${attrs} rows="4" placeholder="${field.type==='array'?'[]':'{}'}" spellcheck="false"></textarea><small>${field.type==='array'?'Elenco JSON; per elenchi semplici puoi separare i valori con virgole.':'Oggetto JSON secondo il formato Wallester.'}</small>`;
   else if(field.type==='file')control=`<input ${attrs} type="file" accept="${op.id==='CreatePaymentRecordsFromFile'?'.csv,.xlsx,.xls,.xml':'.docx,.pdf,.odt,.jpeg,.jpg,.png'}"><small>${op.id==='CreatePaymentRecordsFromFile'?'CSV, Excel o XML · massimo 3 MB':'Massimo 15 MB'}</small>`;
   else control=`<input ${attrs} type="${sensitive(field.name)?'password':['number','integer'].includes(field.type)?'number':field.format==='date'?'date':'text'}" ${field.type==='number'?'step="any"':''} ${field.min!==undefined?`min="${field.min}"`:''} ${field.max!==undefined?`max="${field.max}"`:''} ${field.maxLength?`maxlength="${field.maxLength}"`:''} ${field.minLength?`minlength="${field.minLength}"`:''} autocomplete="off" ${sensitive(field.name)?'data-no-voice="true"':''}>`;
   return `<label>${esc(label(field.name))}${required?' *':''}${control}</label>`;
  }).join('')+`<button class="primary" ${op.sandbox?'disabled':''}>${op.method==='GET'?'Consulta':'Prepara riepilogo'}</button>`;
  for(const field of op.fields){const el=form.elements.namedItem(field.name);if(!el||field.type==='file'||sensitive(field.name))continue;const saved=context[field.name];if(saved!==undefined)el.value=typeof saved==='object'?JSON.stringify(saved):String(saved);else if(field.enum?.length===1)el.value=field.enum[0];else if(field.name.endsWith('from_record'))el.value='0';else if(field.name.endsWith('records_count'))el.value='50';}
  const optional=document.createElement('details');optional.innerHTML='<summary>Altre opzioni (facoltative)</summary>';
  for(const field of op.fields.filter(field=>!field.required&&field.type!=='file'&&!(op.id==='CreateCard'&&['body.account_id','body.name'].includes(field.name)))){const el=form.elements.namedItem(field.name);if(el)optional.append(el.closest('label'));}
  if(optional.children.length>1)form.insertBefore(optional,form.querySelector('button'));
 }
 function choose(id){if(!operations.some(op=>op.id===id))return;selectedId=id;drawForm();}
 root.querySelectorAll('[data-operation-shortcut]').forEach(button=>button.onclick=()=>{context={};choose(button.dataset.operationShortcut);});
 choose(shortcuts.find(([id])=>operations.some(op=>op.id===id))?.[0]);
 const printable=(name,value)=>sensitive(name)?'••••••':value&&typeof value==='object'&&'data'in value?`${value.name} · ${Math.round(value.data.length*3/4/1024)} KB`:typeof value==='object'?JSON.stringify(value):String(value);
 form.onsubmit=async event=>{
  event.preventDefault();const op=operations.find(op=>op.id===selectedId),version=++revision,submit=form.querySelector('button');const values=Object.fromEntries(new FormData(form));submit.disabled=true;result.textContent='Preparazione…';
  try{
   for(const field of op.fields){
    if(field.type==='array'&&values[field.name])values[field.name]=values[field.name].trim().startsWith('[')?JSON.parse(values[field.name]):values[field.name].split(',').map(value=>{const trimmed=value.trim();return ['number','integer'].includes(field.items?.type)?Number(trimmed):trimmed;}).filter(value=>value!=='');
    else if(field.type==='object'&&values[field.name])values[field.name]=JSON.parse(values[field.name]);
    else if(field.type==='file'){const file=values[field.name],limit=op.id==='CreatePaymentRecordsFromFile'?3*1024*1024:15*1024*1024;if(!file?.size||file.size>limit)throw Error('Seleziona un file entro la dimensione consentita.');values[field.name]=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Impossibile leggere il file.'));reader.onload=()=>resolve({name:file.name,type:file.type,data:String(reader.result).split(',')[1]});reader.readAsDataURL(file);});}
   }
   if(version!==revision)return;
   const review=await api('/api/connect/wallester/operations/prepare',{method:'POST',body:JSON.stringify({operation:op.id,values})});if(version!==revision)return;
   result.innerHTML='<h3>'+esc(op.label)+'</h3><dl>'+Object.entries(values).filter(([,value])=>value!=='').map(([key,value])=>'<dt>'+esc(label(key))+'</dt><dd>'+esc(printable(key,value))+'</dd>').join('')+'</dl><button class="primary" data-confirm>'+(review.changes?'Conferma operazione reale':'Mostra risultati')+'</button><p class="small-note">Il riepilogo scade tra due minuti.</p>';
   result.querySelector('button').onclick=async click=>{
    click.target.disabled=true;form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=true);
    try{
     const response=await api('/api/connect/wallester/operations/execute',{method:'POST',body:JSON.stringify({token:review.token,confirmed:true})});if(version!==revision)return;
     result.replaceChildren();const heading=document.createElement('h3');heading.textContent='Risposta Wallester';result.append(heading);renderResult(result,response);
     if(op.id==='InitiateWireTransferPayout'){
      const payout=response.wire_transfer_payout||response.wire_transfer||response.payout_intention||response;const wireId=payout.wire_transfer_id||payout.id||response.wire_transfer_id;const actionId=payout.action_id||response.action_id;
      if(wireId){context=Object.fromEntries(Object.entries(values).filter(([key])=>!sensitive(key)));context['path.wire_transfer_id']=wireId;if(actionId)context['body.action_id']=actionId;const next=document.createElement('button');next.className='primary';next.type='button';next.textContent='Apri conferma bonifico';next.onclick=()=>choose('ConfirmWireTransferPayout');result.append(next);}
     }
     await refresh();if(/Card/.test(op.id))await cardManager?.refresh();
    }catch(error){if(version===revision)result.textContent=error.message;}
    finally{form.querySelectorAll('input,select,textarea,button').forEach(el=>el.disabled=false);}
   };
  }catch(error){if(version===revision)result.textContent=error instanceof SyntaxError?'Il contenuto JSON non è valido.':error.message;}
  finally{submit.disabled=false;}
 };
 form.oninput=()=>{revision++;result.replaceChildren();};
 cardManager=await renderWallesterCards({root:cardsRoot,current,api,esc,canManage:state.me.role==='owner',onAction:(id,values)=>{context=values;choose(id);root.querySelector('[data-operation-title]').scrollIntoView({block:'start'});}});
 function renderResult(parent,value,depth=0){
  if(depth>12)return;
  if(Array.isArray(value)){if(!value.length)parent.append(document.createTextNode('Nessun risultato.'));for(const item of value){const card=document.createElement('article');renderResult(card,item,depth+1);parent.append(card);}return;}
  if(value&&typeof value==='object'){const dl=document.createElement('dl');for(const [key,item]of Object.entries(value)){if(sensitive(key))continue;const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=labels[key]||key.replaceAll('_',' ');renderResult(dd,item,depth+1);dl.append(dt,dd);}parent.append(dl);return;}
  if(typeof value==='string'&&/^https:\/\//.test(value)){try{const url=new URL(value);if(!url.username&&!url.password){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Apri documento o risultato';parent.append(link);return;}}catch{}}
  parent.append(document.createTextNode(value===null?'—':String(value)));
 }
}
