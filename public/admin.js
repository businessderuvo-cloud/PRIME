const $=s=>document.querySelector(s);let csrf='',rows=[];
async function api(path,options={}){const headers={'Content-Type':'application/json',...(options.headers||{})};if(options.method&&options.method!=='GET'&&csrf)headers['X-CSRF-Token']=csrf;const response=await fetch(path,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Errore ${response.status}`);return data;}
function toast(text){const node=$('#toast');node.textContent=text;node.classList.add('visible');setTimeout(()=>node.classList.remove('visible'),2800)}
function date(value){if(!value)return'—';const parsed=new Date(value);return Number.isNaN(+parsed)?'—':new Intl.DateTimeFormat('it-IT',{dateStyle:'medium'}).format(parsed)}
const statusLabels={
 active:['Attivo','active'],approved:['Approvata','approved'],paid:['Pagato','paid'],
 pending:['In attesa','pending'],creating:['In preparazione','processing'],in_progress:['In corso','processing'],in_review:['In revisione','review'],
 unverified:['Da verificare','unverified'],not_started:['Non iniziata','unverified'],resubmitted:['Da riesaminare','resubmitted'],
 suspended:['Sospeso','suspended'],closed:['Chiuso','closed'],cancelled:['Annullato','cancelled'],rejected:['Rifiutata','rejected'],
 failed:['Non riuscito','failed'],expired:['Scaduto','expired'],unpaid:['Non pagato','unpaid'],awaiting_activation:['Pagato · da attivare','activation'],
 paid_active:['Pagato · attivo','paid'],standard:['Base','plan-base'],pro:['Pro','plan-pro'],vip:['VIP','plan-vip'],elite:['Elite','plan-elite'],
 nessuno:['Nessun piano','none'],none:['Nessun piano','none']
};
const cycleLabels={monthly:'Mensile',annual:'Annuale',annually:'Annuale',yearly:'Annuale',month:'Mensile',year:'Annuale'};
const euro=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',useGrouping:'always',minimumFractionDigits:2,maximumFractionDigits:2});
function paymentStatus(row){
 if(row.subscription_state==='active'&&row.period_end>new Date().toISOString())return ['vip','elite'].includes(row.plan)&&row.kyb_status!=='approved'?'awaiting_activation':'paid_active';
 if(['pending','creating'].includes(row.latest_payment_state))return row.latest_payment_state;
 if(row.subscription_state==='suspended')return 'suspended';
 if(row.subscription_state==='cancelled')return 'cancelled';
 if(row.subscription_state==='active')return 'expired';
 if(['paid','failed','cancelled','expired'].includes(row.latest_payment_state))return row.latest_payment_state;
 return 'unpaid';
}
function payState(row){return statusLabels[paymentStatus(row)][0]}
function badge(value){const status=statusLabels[String(value||'').toLowerCase()]||['Stato non disponibile','none'];return '<span class="badge badge--'+status[1]+'">'+escapeHtml(status[0])+'</span>'}
function amountCell(row){
 const pending=['pending','creating'].includes(paymentStatus(row));
 const valid=value=>value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0;
 const cents=pending?row.latest_payment_cents:valid(row.paid_plan_cents)?row.paid_plan_cents:row.latest_payment_cents;
 const amount=valid(cents)?euro.format(Number(cents)/100):'—';
 const caption=valid(cents)?pending?'Da incassare':valid(row.paid_plan_cents)?'Importo del piano':row.latest_payment_state==='paid'?'Ultimo pagamento':'Ultimo ordine':'Nessun importo registrato';
 return '<td class="amount-cell"><strong class="amount'+(pending?' amount--pending':'')+'">'+escapeHtml(amount)+'</strong><small>'+caption+'</small></td>';
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function render(){
 const filtered=rows.filter(x=>[x.name,x.owner_email,x.plan,x.kyb_status,x.account_status,payState(x),statusLabels[x.account_status]?.[0],statusLabels[x.kyb_status]?.[0]].join(' ').toLowerCase().includes($('#filter').value.toLowerCase()));
 $('#agency-rows').innerHTML=filtered.map(row=>`<tr>
 <td class="agency-name">${escapeHtml(row.name)}<small>${escapeHtml(row.tenant_id)}</small></td>
 <td>${escapeHtml(row.owner_email||'—')}</td>
 <td>${badge(row.plan||'none')}<small>${escapeHtml(cycleLabels[row.cycle]||'')}</small></td>
 <td>${badge(paymentStatus(row))}</td>
 ${amountCell(row)}
 <td>${badge(row.kyb_status)}${row.didit_status?'<small>'+escapeHtml(statusLabels[row.didit_status]?.[0]||'Stato non disponibile')+'</small>':''}</td>
 <td>${date(row.period_end)}</td><td>${badge(row.account_status)}</td>
 <td><div class="row-actions"><button class="mini" data-action="reset_owner_password" data-id="${escapeHtml(row.tenant_id)}">Reset accesso</button><button class="mini" data-action="revoke_sessions" data-id="${escapeHtml(row.tenant_id)}">Revoca sessioni</button>${row.account_status==='active'?`<button class="mini danger" data-action="suspend" data-id="${escapeHtml(row.tenant_id)}">Sospendi</button>`:row.account_status==='suspended'?`<button class="mini good" data-action="reactivate" data-id="${escapeHtml(row.tenant_id)}">Riattiva</button>`:''}<button class="mini danger" data-action="close" data-id="${escapeHtml(row.tenant_id)}">Chiudi</button></div></td></tr>`).join('')||'<tr><td class="empty" colspan="9">Nessun account corrispondente.</td></tr>';
}
async function load(){const data=await api('/api/admin/overview');rows=data.agencies;$('#stat-agencies').textContent=data.summary.agencies;$('#stat-active').textContent=data.summary.active;$('#stat-approval').textContent=data.summary.awaitingApproval;$('#stat-payment').textContent=data.summary.awaitingPayment;$('#stat-expired').textContent=data.summary.expired;$('#stat-suspended').textContent=data.summary.suspended;$('#queue-count').textContent=`${data.pending.length} richieste`;
 $('#approval-list').innerHTML=data.pending.map(x=>`<article class="approval-row"><div class="approval-name"><b>${escapeHtml(x.name)} · ${escapeHtml(x.plan||'VIP/Elite')}</b><small>${escapeHtml(x.owner_email||'')} · KYB ${escapeHtml(statusLabels[x.kyb_status]?.[0]||'Stato non disponibile')} · pagamento ${escapeHtml(payState(x))}</small></div>${badge(x.didit_status||x.kyb_status)}<span>${date(x.period_end)}</span><div class="approval-actions"><button class="mini good" data-action="approve_vip_elite" data-id="${escapeHtml(x.tenant_id)}">Approva</button><button class="mini danger" data-action="reject_vip_elite" data-id="${escapeHtml(x.tenant_id)}">Rifiuta</button></div></article>`).join('')||'<p class="empty">Nessuna richiesta VIP o Elite in attesa.</p>';
 $('#audit-rows').innerHTML=data.recentAudit.map(x=>`<tr><td>${date(x.created_at)}</td><td>${escapeHtml(x.admin_email)}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.tenant_id||'—')}</td></tr>`).join('')||'<tr><td class="empty" colspan="4">Nessuna azione amministrativa registrata.</td></tr>';render();$('#status').textContent=`Aggiornato ${new Intl.DateTimeFormat('it-IT',{timeStyle:'short'}).format(new Date())}`;}
async function enter(email,token){csrf=token;$('#login-view').hidden=true;$('#console').hidden=false;$('#admin-who').hidden=false;$('#admin-who').textContent=email;$('#refresh').hidden=false;$('#logout').hidden=false;await load()}
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);$('#login-message').textContent='';try{const data=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:f.get('email'),password:f.get('password'),code:f.get('code')})});await enter(data.email,data.csrf)}catch(error){$('#login-message').textContent=error.message}});
$('#refresh').addEventListener('click',()=>load().catch(e=>toast(e.message)));$('#filter').addEventListener('input',render);
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST'})}catch{}location.reload()});
document.addEventListener('click',async e=>{const button=e.target.closest('[data-action]');if(!button)return;const action=button.dataset.action,id=button.dataset.id;const confirmation={close:'Chiudere definitivamente l’account? L’accesso e il piano verranno revocati; i dati saranno conservati per la gestione e gli obblighi di legge.',suspend:'Sospendere l’account e revocare tutte le sessioni?',reset_owner_password:'Inviare al titolare un link monouso per reimpostare la password?',revoke_sessions:'Revocare tutte le sessioni attive?' }[action];if(confirmation&&!window.confirm(confirmation))return;button.disabled=true;try{const data=await api(`/api/admin/tenants/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action})});if(data.resetUrl)window.prompt('Link monouso per l’accesso locale:',data.resetUrl);toast(action==='approve_vip_elite'?'Verifica approvata. Il piano resta legato al pagamento.':'Operazione completata.');await load()}catch(error){toast(error.message)}finally{button.disabled=false}});
api('/api/admin/me').then(data=>enter(data.email,data.csrf)).catch(()=>{});
