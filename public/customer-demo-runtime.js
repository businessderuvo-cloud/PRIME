// Loaded only by /demo/. Normal workspaces and existing live demos do not load this file.
(()=>{
  'use strict';
  window.PRIME_CUSTOMER_DEMO=true;
  document.documentElement.classList.add('customer-demo');
  const deadline=performance.now()+Number(document.currentScript.dataset.remainingMs);
  let showExpired=()=>{}, showThrottle=()=>{};
  const originalFetch=window.fetch.bind(window),names={standard:'Standard',pro:'Pro',vip:'VIP',elite:'Elite',secret:'Secret Plan'},planRanks={standard:0,pro:1,vip:2,elite:3,secret:4},themeRanks={light:0,pro:1,vip:2,elite:3,secret:4};
  const notifyParent=(plan,theme)=>{if(window.parent!==window)window.parent.postMessage({type:'prime-demo-state',plan,theme},location.origin);};
  window.fetch=(input,options)=>{
    const source=input instanceof Request?input.url:String(input),url=new URL(source,location.href),apiPath=url.pathname;
    if(url.origin===location.origin&&apiPath.startsWith('/api/')){
      url.pathname='/demo'+apiPath;
      return originalFetch(input instanceof Request?new Request(url,input):url,options).then(response=>{
        if(response.status===410)showExpired();
        if(response.status===429&&response.headers.has('Retry-After'))showThrottle(Number(response.headers.get('Retry-After')));
        if(!response.ok)return response;
        if(apiPath==='/api/preferences')return response.clone().json().then(value=>{const theme=value.theme==='light'?'light':value.theme_variant||document.documentElement.dataset.demoPlan;const next=new URL(location.href);if(theme==='light'&&window.parent===window)next.searchParams.delete('theme_variant');else next.searchParams.set('theme_variant',theme);history.replaceState(history.state,'',next);notifyParent(document.documentElement.dataset.demoPlan,theme);return response;}).catch(()=>response);
        if(apiPath==='/api/customer-demo/plan')return response.clone().json().then(value=>{if(value.plan)notifyParent(value.plan,value.plan==='standard'?'light':value.plan);return response;}).catch(()=>response);
        return response;
      });
    }
    return originalFetch(input,options);
  };
  function scopeLink(el){for(const attr of ['href','src']){const value=el.getAttribute?.(attr);if(value?.startsWith('/api/'))el.setAttribute(attr,'/demo'+value);}}
  async function setup(){
    const { demoSeasonalThemes } = await import('/seasonal-themes.js?v=20261104-capodanno');
    const bar=document.createElement('header');bar.className='customer-demo-bar';
    bar.innerHTML='<a class="customer-demo-home" href="/">← PRIME</a><div class="customer-demo-title"><strong>Demo clienti</strong><span>Dati fittizi · modifiche private in questa sessione</span></div><label for="customer-demo-plan">Esplora il piano<select id="customer-demo-plan" aria-label="Piano della demo">'+Object.entries(names).map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')+'</select></label><p id="customer-demo-notice" role="status">Demo isolata: Wallester mostra dati fittizi in sola lettura da Pro; i conti reali restano scollegati.</p>';
    const sessionControls=document.createElement('div');
    sessionControls.className='customer-demo-title';
    sessionControls.innerHTML='<small role="timer" aria-label="Tempo rimasto nella demo"></small><button type="button" class="customer-demo-season-button" title="Riparti dai dati di esempio">Riavvia demo</button>';
    bar.append(sessionControls);
    document.body.prepend(bar);\n    let barOpen=false;\n    const setBarOpen=open=>{barOpen=open;document.documentElement.classList.toggle('customer-demo-bar-open',open);};\n    document.addEventListener('mousemove',event=>{const inside=bar.contains(event.target);if(event.clientY<=24||inside)setBarOpen(true);else if(barOpen)setBarOpen(false);},{passive:true});
    const select=bar.querySelector('select'),notice=bar.querySelector('[role="status"]');
    const timer=sessionControls.querySelector('small'),restart=sessionControls.querySelector('button');
    let ended=false, throttleUntil=0;
    function updateTimer(){
      const seconds=Math.max(0,Math.ceil((deadline-performance.now())/1000));
      if(ended||seconds===0){showExpired();return;}
      const wait=Math.ceil((throttleUntil-performance.now())/1000);
      timer.textContent=wait>0?'Riprova tra '+wait+' s':'Tempo rimasto '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    }
    showExpired=()=>{
      if(ended)return;
      ended=true;
      clearInterval(tick);
      select.disabled=true;
      timer.textContent='Sessione scaduta';
      notice.textContent='Seleziona Riavvia demo per ripartire dai dati di esempio.';
    };
    showThrottle=seconds=>{throttleUntil=performance.now()+seconds*1000;updateTimer();};
    const tick=setInterval(updateTimer,1000);
    updateTimer();
    const updateBarHeight=()=>document.documentElement.style.setProperty('--customer-demo-height',bar.offsetHeight+'px');
    updateBarHeight();
    new ResizeObserver(updateBarHeight).observe(bar);
    restart.onclick=async()=>{
      restart.disabled=true;
      try{
        const response=await originalFetch('/demo/session/restart',{method:'POST',headers:{'X-Prime-Demo-Restart':'1'}});
        if(!response.ok)throw Error('Impossibile riavviare la demo. Riprova.');
        const next=new URL(location.href),plan=document.documentElement.dataset.demoPlan;
        if(plan)next.searchParams.set('plan',plan);
        const theme=document.documentElement.dataset.themeVariant;
        if(theme&&theme!=='light')next.searchParams.set('theme_variant',theme);
        location.replace(next.href);
      }catch(error){notice.textContent=error.message;restart.disabled=false;}
    };
    try{
      const response=await fetch('/api/me');const me=await response.json();if(!response.ok)throw Error(me.error);
      const pageUrl=new URL(location.href),requestedPlan=pageUrl.searchParams.get('plan');
      if(Object.hasOwn(names,requestedPlan)&&requestedPlan!==me.demo_plan){
        const result=await fetch('/api/customer-demo/plan',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({plan:requestedPlan})});
        const value=await result.json();if(!result.ok)throw Error(value.error);location.reload();return;
      }
      const requestedTheme=pageUrl.searchParams.get('theme_variant');
      // A plan URL must open with that plan's own palette. Older demo links
      // carried theme_variant=light into higher plans and made them white.
      if(requestedPlan===me.demo_plan&&requestedTheme==='light'&&me.demo_plan!=='standard'){
        const next=new URL(location.href);next.searchParams.set('theme_variant',me.demo_plan);location.replace(next.href);return;
      }
      const seasons = demoSeasonalThemes(me.demo_plan);
      const seasonAllowed = seasons.some(theme => theme.id === requestedTheme);
      if(seasonAllowed || (Object.hasOwn(themeRanks,requestedTheme)&&themeRanks[requestedTheme]<=planRanks[me.demo_plan])){
        const matches=requestedTheme==='light'?me.theme==='light':me.theme==='dark'&&me.theme_variant===requestedTheme;
        if(!matches){const result=await fetch('/api/preferences',{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({theme:requestedTheme==='light'?'light':'dark',theme_variant:requestedTheme==='light'?'':requestedTheme})});const value=await result.json();if(!result.ok)throw Error(value.error);location.reload();return;}
      }
      select.value=me.demo_plan;for(const option of select.options)option.defaultSelected=option.value===me.demo_plan;document.documentElement.dataset.demoPlan=me.demo_plan;const activeTheme=me.theme==='light'?'light':(Object.hasOwn(themeRanks,me.theme_variant)||seasons.some(theme=>theme.id===me.theme_variant))?me.theme_variant:me.demo_plan;notifyParent(me.demo_plan,activeTheme);
      const goldTest=me.demo_plan==='secret'&&new URL(location.href).searchParams.get('theme')==='gold-test';
      if(goldTest)document.documentElement.dataset.demoVariant='gold-test';
      else delete document.documentElement.dataset.demoVariant;
      if(['secret','elite'].includes(me.demo_plan)){
        const planName=me.demo_plan==='elite'?'Elite Plan':'Secret Plan';
        bar.querySelector('.customer-demo-title strong').textContent=planName+' · Demo';
        if(goldTest){
          bar.querySelector('.customer-demo-title strong').textContent='Secret Plan · Gold Test';
          bar.querySelector('.customer-demo-title').insertAdjacentHTML('beforeend','<div class="customer-demo-variant-controls"><span class="customer-demo-variant-badge">ORO · TEST</span><a class="customer-demo-compare" href="/demo/?plan=secret">Versione attuale ↗</a></div>');
        }
        const decorate=()=>{const label=document.querySelector('.sidebar-label');if(label&&label.textContent!==planName.toUpperCase())label.textContent=planName.toUpperCase();};
        decorate();const brandingObserver=new MutationObserver(decorate);brandingObserver.observe(document.querySelector('#app'),{subtree:true,childList:true});
      }
      notice.textContent=['vip','elite','secret'].includes(me.demo_plan)?'Vanessa: solo chat. Wallester mostra dati fittizi in sola lettura; gli altri collegamenti esterni sono disattivati.':me.demo_plan==='pro'?'Veronica in chat. Wallester mostra dati fittizi in sola lettura; Vanessa è disponibile da VIP.':'Funzioni Standard attive. Wallester demo da Pro in poi. Cambia piano per confrontarle.';
      const seasonalNote = document.createElement('p');
      seasonalNote.className = 'customer-demo-season-note';
      seasonalNote.textContent = 'Temi stagionali sempre in anteprima in demo. Nel gestionale, inclusi in Pro, VIP, Elite e Secret: San Valentino il 14 febbraio, Halloween il 31 ottobre, Natale dal 21 al 30 dicembre. Fuochi di Capodanno il 31 dicembre e il 1° gennaio.';
      if (seasons.length) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'customer-demo-season-button';
        button.textContent = 'Scegli un tema';
        button.onclick = () => document.querySelector('#theme')?.click();
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.className = 'customer-demo-season-button';
        const fireworksPreview = pageUrl.searchParams.get('fireworks') === '1';
        preview.textContent = fireworksPreview ? 'Disattiva anteprima fuochi' : 'Prova i fuochi';
        preview.onclick = () => {
          const next = new URL(location.href);
          if (fireworksPreview) next.searchParams.delete('fireworks');
          else {
            next.searchParams.set('fireworks','1');
            if (document.documentElement.dataset.themeVariant === 'christmas') {
              next.searchParams.set('theme_variant',me.demo_plan);
            }
          }
          location.assign(next.href);
        };
        seasonalNote.append(' ', button, ' ', preview);
      } else {
        seasonalNote.append(' Scegli Pro o un piano superiore per provarli.');
      }
      bar.append(seasonalNote);
      select.onchange=async()=>{
        select.disabled=true;notice.textContent='Cambio piano…';
        try{const result=await fetch('/api/customer-demo/plan',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({plan:select.value})});const value=await result.json();if(!result.ok)throw Error(value.error);const next=new URL(location.href);next.searchParams.set('plan',select.value);const keepSeason = demoSeasonalThemes(select.value).some(theme => theme.id === next.searchParams.get('theme_variant'));
          if (!keepSeason) next.searchParams.set('theme_variant',select.value==='standard'?'light':select.value);
          location.replace(next.href);}
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
