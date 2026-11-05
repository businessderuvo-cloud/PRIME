import {mountFinanceTestControls} from './finance-test-controls.js';
import {mountIntegrationGuideLinks} from './integration-guides.js';
export const stripeSectionVisible=(me,statuses)=>Boolean(me.stripe_enabled===true&&['owner','manager'].includes(me.role)&&(['test','live'].some(mode=>statuses?.[mode]?.configured===true)||(me.customer_demo&&me.stripe_demo_simulation===true)||(me.customer_demo&&me.local_real_integrations&&me.stripe_demo_test&&statuses?.test?.simulation===true)));

export async function renderStripeConnection({main,state,api,esc,onOpen}){
  if(state.me.stripe_enabled!==true||!['owner','manager'].includes(state.me.role))return;
  const card=document.createElement('section');card.className='panel connect-card stripe-connect-card';card.dataset.provider='stripe';
  main.querySelector('.connect-cards').append(card);
  const canLive=state.me.customer_demo?state.me.demo_plan==='secret':state.me.plan==='secret'||state.me.edition==='secret';
  let mode=canLive?(state.stripeMode||'live'):'test';
  async function draw(){
    card.innerHTML='<p role="status">Verifico il collegamento Stripe…</p>';
    let status;
    try{status=await api('/api/stripe/status?mode='+mode);}catch(error){card.innerHTML='<p role="status">'+esc(error.message)+'</p>';return;}
    if(!card.isConnected)return;
    state.stripeStatuses={...(state.stripeStatuses||{}),[mode]:status};
    const configured=status.configured||status.simulation,owner=state.me.role==='owner';
    card.innerHTML=`<header><div class="connect-card-title"><img src="/brands/stripe-wordmark-${state.me.theme==='dark'?'white':'slate'}.svg" alt="Stripe" width="112" height="48"></div><span class="pill">${status.simulation?'Test dimostrativo · dati fittizi':configured?'Account collegato':status.pending?'Verifica da completare':status.platformConfigured?'Da collegare':'Configurazione server necessaria'}</span></header><p>Collega il conto Stripe della tua agenzia. La sezione dedicata apparirà nel menu soltanto dopo la conferma del collegamento da Stripe.</p><label>Ambiente<select data-stripe-connect-mode><option value="test" ${mode==='test'?'selected':''}>Test · nessun denaro reale</option><option value="live" ${mode==='live'?'selected':''} ${canLive?'':'disabled'}>Live · operazioni reali</option></select></label>${configured&&!status.simulation?`<p class="small-note">Account: ${esc(status.accountId)}. ${status.chargesEnabled?'Incassi abilitati.':'Incassi non ancora abilitati da Stripe.'}</p>`:''}${!status.platformConfigured&&!status.simulation?'<p class="small-note">Il titolare della piattaforma deve configurare Stripe Connect sul server PRIME. Non inserire chiavi API nella chat o nel browser.</p>':''}${mode==='live'&&!status.simulation&&!status.callbackConfigured?'<p class="small-note">Per collegare Stripe LIVE dalla demo locale servono una chiave LIVE della piattaforma e URL di ritorno HTTPS protetti. Non pubblicare tutta la demo su Internet.</p>':''}${status.verificationError?`<p class="error">${esc(status.verificationError)}</p>`:''}<div class="connect-actions">${configured?'<button class="primary" data-open-stripe>Apri Stripe</button>':owner?`<button class="primary" data-connect-stripe ${!status.platformConfigured||(mode==='live'&&!status.callbackConfigured)?'disabled':''}>${status.pending?'Completa collegamento Stripe':'Collega Stripe'}</button>`:'<p>Il titolare collega l’account Stripe dell’agenzia.</p>'}<button class="secondary" data-refresh-stripe>Aggiorna collegamento</button></div><p class="connect-feedback" role="status"></p>`;
    if(state.me.customer_demo){const note=document.createElement('p');note.className='small-note';note.textContent='Stripe Connect Standard richiede un’autorizzazione di lettura e scrittura. In questa demo PRIME mostra solo i dati; ogni operazione di modifica è bloccata.';card.querySelector('[data-stripe-connect-mode]')?.closest('label')?.before(note);}
    card.querySelector('[data-stripe-connect-mode]').onchange=async event=>{mode=event.target.value;state.stripeMode=mode;await draw();mountFinanceTestControls({main,state,api});mountIntegrationGuideLinks({main,state});};
    card.querySelector('[data-refresh-stripe]').onclick=async()=>{const fresh=await api('/api/stripe/status?mode='+mode);if(fresh.configured)location.reload();else await draw();};
    card.querySelector('[data-open-stripe]')?.addEventListener('click',()=>{state.stripeMode=mode;onOpen?.();});
    card.querySelector('[data-connect-stripe]')?.addEventListener('click',async event=>{
      const button=event.currentTarget,feedback=card.querySelector('[role="status"]');button.disabled=true;feedback.textContent='Apro il collegamento protetto Stripe…';
      try{const result=await api('/api/stripe/connect?mode='+mode,{method:'POST',body:'{}'});const url=new URL(result.url);if(url.protocol!=='https:'||!['connect.stripe.com','onboarding.stripe.com'].includes(url.hostname))throw Error('Indirizzo di collegamento Stripe non valido.');location.assign(url.href);}catch(error){feedback.textContent=error.message;button.disabled=false;}
    });
  }
  await draw();
  mountFinanceTestControls({main,state,api});
  mountIntegrationGuideLinks({main,state});
}
