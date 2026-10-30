(() => {
  const config=window.primeLocaleConfig||{},workspace=config.workspace===true;
  const query=new URLSearchParams(location.search);
  let saved='it';try{saved=localStorage.getItem('prime-language')||'it';}catch{}
  const language=['it','en'].includes(query.get('lang'))?query.get('lang'):saved==='en'?'en':'it';
  document.documentElement.lang=language;try{localStorage.setItem('prime-language',language);}catch{}
  let dictionary={},phrases=[];const seen=new WeakMap();
  const normalize=s=>s.replace(/\s+/g,' ').trim();
  function t(value){
    if(language!=='en'||typeof value!=='string')return value;
    const key=normalize(value),exact=dictionary[key];
    if(exact)return value.replace(value.trim(),exact);
    let result=value;
    for(const [a,b] of phrases)if(result.includes(a)){const escape=a.replace(/[.*+?^$()|[\]\\]/g,'\\$&');result=result.replace(new RegExp('(?<![\\p{L}])'+escape+'(?![\\p{L}])','gu'),()=>b);}
    return result;
  }
  const skip=node=>node.parentElement?.closest('script,style,textarea,[contenteditable],.bubble.user,.voice-line,[data-no-translate]'+(workspace?',.record-value,.record-open:not(.text-button),.sidebar-bottom strong,.sidebar-bottom .avatar,#global-results strong,#global-results span,.overview-row strong,.assistant-bubble p,.elite-message,.mail-body,.mail-message-body,[data-mail-body],select[data-reference] option[value]:not([value=""])':''));
  function translate(root){
    if(root.nodeType===3){if(!skip(root)&&seen.get(root)!==root.nodeValue){root.nodeValue=t(root.nodeValue);seen.set(root,root.nodeValue);}return;}
    if(root.nodeType!==1&&root.nodeType!==9)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode())if(!skip(node)&&seen.get(node)!==node.nodeValue){node.nodeValue=t(node.nodeValue);seen.set(node,node.nodeValue);}
    const elements=root.querySelectorAll?.('*')||[];
    for(const el of elements)for(const attr of ['placeholder','aria-label','title','alt','data-label'])if(el.hasAttribute(attr)&&!skip({parentElement:el})){const old=el.getAttribute(attr),v=t(old);if(v!==old)el.setAttribute(attr,v);}
    for(const el of root.querySelectorAll?.('meta[name="description"]')||[]){const v=t(el.content);if(v!==el.content)el.content=v;}
  }
  function change(lang){try{localStorage.setItem('prime-language',lang);}catch{}const url=new URL(location.href);url.searchParams.set('lang',lang);location.assign(url.href);}
  let flagSequence=0;
  function houseFlag(code){
    const id='language-house-'+(++flagSequence),shape='M2 14 16 2 30 14V30H2Z';
    const flag=code==='it'?'<path fill="#009246" d="M0 0h11v32H0z"/><path fill="#fff" d="M11 0h10v32H11z"/><path fill="#ce2b37" d="M21 0h11v32H21z"/>':'<path fill="#012169" d="M0 0h32v32H0z"/><path stroke="#fff" stroke-width="7" d="m0 0 32 32M32 0 0 32"/><path stroke="#c8102e" stroke-width="3" d="m0 0 32 32M32 0 0 32"/><path stroke="#fff" stroke-width="10" d="M16 0v32M0 16h32"/><path stroke="#c8102e" stroke-width="6" d="M16 0v32M0 16h32"/>';
    return '<svg class="language-house" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><clipPath id="'+id+'"><path d="'+shape+'"/></clipPath></defs><g clip-path="url(#'+id+')">'+flag+'</g><path class="language-house-outline" d="'+shape+'"/></svg>';
  }
  function enhanceLanguageControls(){
    for(const select of document.querySelectorAll('.language-control select:not([data-house-picker])')){
      select.dataset.housePicker='true';select.hidden=true;select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      const picker=document.createElement('span');picker.className='language-picker';picker.dataset.noTranslate='';
      const trigger=document.createElement('button');trigger.type='button';trigger.className='language-trigger';trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
      const names={it:'Italiano',en:'English'},current=select.value==='en'?'en':'it';
      trigger.setAttribute('aria-label',(language==='en'?'Language: ':'Lingua: ')+names[current]);
      trigger.innerHTML=houseFlag(current)+'<span>'+names[current]+'</span><svg class="language-chevron" viewBox="0 0 12 8" aria-hidden="true"><path d="m1 1 5 5 5-5"/></svg>';
      const menu=document.createElement('span');menu.className='language-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label',language==='en'?'Choose language':'Scegli lingua');
      menu.id='language-menu-'+flagSequence;trigger.setAttribute('aria-controls',menu.id);
      for(const code of ['it','en']){const option=document.createElement('button');option.type='button';option.className='language-option';option.setAttribute('role','menuitemradio');option.setAttribute('aria-checked',String(code===current));option.lang=code;option.innerHTML=houseFlag(code)+'<span>'+names[code]+'</span><span class="language-check" aria-hidden="true">'+(code===current?'✓':'')+'</span>';option.onclick=()=>{close();if(code===select.value)return;select.value=code;select.dispatchEvent(new Event('change',{bubbles:true}));};menu.append(option);}
      const options=[...menu.children];
      function close(restore=false){menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();}
      function open(index=options.findIndex(o=>o.getAttribute('aria-checked')==='true')){menu.hidden=false;trigger.setAttribute('aria-expanded','true');options[Math.max(0,index)].focus();}
      trigger.onclick=()=>menu.hidden?open():close();
      trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowDown'?0:options.length-1);}else if(event.key==='Escape')close(true);};
      menu.onkeydown=event=>{const i=options.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();options[event.key==='Home'?0:event.key==='End'?options.length-1:(i+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}else if(event.key==='Escape'){event.preventDefault();close(true);}else if(event.key==='Tab')close();};
      picker.addEventListener('focusout',event=>{if(!picker.contains(event.relatedTarget))close();});
      picker.append(trigger,menu);select.after(picker);
    }
  }
  document.addEventListener('pointerdown',event=>{for(const trigger of document.querySelectorAll('.language-trigger[aria-expanded="true"]'))if(!trigger.closest('.language-picker').contains(event.target)){trigger.setAttribute('aria-expanded','false');document.getElementById(trigger.getAttribute('aria-controls')).hidden=true;}});
  function selector(parent,label){if(!parent||parent.querySelector(':scope > .language-control'))return;const wrap=document.createElement('label');wrap.className='language-control';wrap.innerHTML='<select aria-label="'+(language==='en'?'Language':'Lingua')+'"><option value="it">Italiano</option><option value="en">English</option></select>';const select=wrap.querySelector('select');select.value=language;select.onchange=()=>change(select.value);parent.append(wrap);}
  const ready=(async()=>{
    if(language==='en'){
      const responses=await Promise.all((workspace?['/en.json','/app-en.json']:['/en.json']).map(url=>fetch(url)));if(responses.some(r=>!r.ok))throw Error('English language file unavailable');
      const raw=Object.assign({},...await Promise.all(responses.map(r=>r.json()))),decode=document.createElement('textarea');
      for(const [key,value]of Object.entries(raw)){decode.innerHTML=key;dictionary[normalize(decode.value)]=value;}
      phrases=workspace?[]:Object.entries(dictionary).filter(([a,b])=>a!==b&&a.length>=4&&!/[{}<>]/.test(a)).sort((a,b)=>b[0].length-a[0].length);
    }
    if(!workspace)selector(document.querySelector('.header-actions')||document.querySelector('body > header')||document.querySelector('main'),'Language');
    enhanceLanguageControls();
    translate(document);
    let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;observer.disconnect();enhanceLanguageControls();translate(document);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});});});
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});
    document.dispatchEvent(new CustomEvent('prime-language-ready',{detail:{language}}));
  })();
  window.primeI18n={language,t,ready,change,mount(parent,label=''){selector(parent,label);enhanceLanguageControls();},translate};
  document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname==='/app'||u.pathname.startsWith('/demo'))return;u.searchParams.set('lang',language);a.href=u.href;},true);
})();
