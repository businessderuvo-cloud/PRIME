// Loaded only by /demo/. Normal workspaces and existing live demos do not load this file.
(()=>{
  'use strict';
  window.PRIME_CUSTOMER_DEMO=true;
  document.documentElement.classList.add('customer-demo');
  const originalFetch=window.fetch.bind(window),names={standard:'Standard',pro:'Pro',vip:'VIP',elite:'Elite',secret:'Secret Plan'};
  window.fetch=(input,options)=>{
    const source=input instanceof Request?input.url:String(input),url=new URL(source,location.href);
    if(url.origin===location.origin&&url.pathname.startsWith('/api/')){
      url.pathname='/demo'+url.pathname;
      return originalFetch(input instanceof Request?new Request(url,input):url,options);
    }
    return originalFetch(input,options);
  };
  function scopeLink(el){for(const attr of ['href','src']){const value=el.getAttribute?.(attr);if(value?.startsWith('/api/'))el.setAttribute(attr,'/demo'+value);}}
  async function setup(){
    const bar=document.createElement('header');bar.className='customer-demo-bar';
    bar.innerHTML='<a class="customer-demo-home" href="/">← PRIME</a><div class="customer-demo-title"><strong>Demo clienti</strong><span>Dati fittizi · modifiche private in questa sessione</span></div><label for="customer-demo-plan">Esplora il piano<select id="customer-demo-plan" aria-label="Piano della demo">'+Object.entries(names).map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select></label><p id="customer-demo-notice" role="status">Nessun account richiesto. Nessuna azione esterna.</p>';
    document.body.prepend(bar);
    const select=bar.querySelector('select'),notice=bar.querySelector('[role="status"]');
    try{
      const response=await fetch('/api/me');const me=await response.json();if(!response.ok)throw Error(me.error);
      select.value=me.demo_plan;for(const option of select.options)option.defaultSelected=option.value===me.demo_plan;document.documentElement.dataset.demoPlan=me.demo_plan;
      notice.textContent=['vip','elite','secret'].includes(me.demo_plan)?'Vanessa: solo chat. Chiamate e azioni disattivate.':me.demo_plan==='pro'?'Veronica in chat. Vanessa disponibile da VIP.':'Funzioni Standard attive. Cambia piano per confrontarle.';
      select.onchange=async()=>{
        select.disabled=true;notice.textContent='Cambio piano…';
        try{const result=await fetch('/api/customer-demo/plan',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({plan:select.value})});const value=await result.json();if(!result.ok)throw Error(value.error);location.reload();}
        catch(error){notice.textContent=error.message;select.value=me.demo_plan;select.disabled=false;}
      };
    }catch(error){select.disabled=true;notice.textContent=error.message;}
    const observer=new MutationObserver(changes=>{for(const change of changes){if(change.type==='attributes')scopeLink(change.target);else for(const node of change.addedNodes)if(node.nodeType===1){scopeLink(node);node.querySelectorAll?.('[href^="/api/"],[src^="/api/"]').forEach(scopeLink);}}});
    observer.observe(document.querySelector('#app'),{subtree:true,childList:true,attributes:true,attributeFilter:['href','src']});
    document.addEventListener('click',event=>{const link=event.target.closest('a[href^="/api/"]');if(link)scopeLink(link);},true);
    // Keep the demo's exit separate from account logout and never show a live login form.
    document.addEventListener('click',event=>{if(event.target.closest('#logout')){event.preventDefault();event.stopImmediatePropagation();location.href='/';}},true);
  }
  document.addEventListener('DOMContentLoaded',()=>void setup(),{once:true});
})();
