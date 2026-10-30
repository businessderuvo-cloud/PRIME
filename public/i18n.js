(() => {
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
  const skip=node=>node.parentElement?.closest('script,style,textarea,[contenteditable],.bubble.user,.voice-line,[data-no-translate]');
  function translate(root){
    if(root.nodeType===3){if(!skip(root)&&seen.get(root)!==root.nodeValue){root.nodeValue=t(root.nodeValue);seen.set(root,root.nodeValue);}return;}
    if(root.nodeType!==1&&root.nodeType!==9)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode())if(!skip(node)&&seen.get(node)!==node.nodeValue){node.nodeValue=t(node.nodeValue);seen.set(node,node.nodeValue);}
    const elements=root.querySelectorAll?.('*')||[];
    for(const el of elements)for(const attr of ['placeholder','aria-label','title','alt'])if(el.hasAttribute(attr)){const old=el.getAttribute(attr),v=t(old);if(v!==old)el.setAttribute(attr,v);}
    for(const el of root.querySelectorAll?.('meta[name="description"]')||[]){const v=t(el.content);if(v!==el.content)el.content=v;}
  }
  function change(lang){try{localStorage.setItem('prime-language',lang);}catch{}const url=new URL(location.href);url.searchParams.set('lang',lang);location.assign(url.href);}
  function selector(parent,label){if(!parent||parent.querySelector(':scope > .language-control'))return;const wrap=document.createElement('label');wrap.className='language-control';wrap.innerHTML='<span>'+label+'</span><select aria-label="Language / Lingua"><option value="it">Italiano</option><option value="en">English</option></select>';const select=wrap.querySelector('select');select.value=language;select.onchange=()=>change(select.value);if(parent.id==='vanessa-call')parent.prepend(wrap);else parent.append(wrap);}
  const ready=(async()=>{
    if(language==='en'){
      const response=await fetch('/en.json');if(!response.ok)throw Error('English language file unavailable');
      const raw=await response.json(),decode=document.createElement('textarea');
      for(const [key,value]of Object.entries(raw)){decode.innerHTML=key;dictionary[normalize(decode.value)]=value;}
      phrases=Object.entries(dictionary).filter(([a,b])=>a!==b&&a.length>=4&&!/[{}<>]/.test(a)).sort((a,b)=>b[0].length-a[0].length);
    }
    selector(document.querySelector('.header-actions')||document.querySelector('body > header')||document.querySelector('main'),'Language');
    selector(document.querySelector('#vanessa-call'),language==='en'?'Vanessa’s language':'Lingua di Vanessa');
    translate(document);
    let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;observer.disconnect();translate(document);observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});});});
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','alt']});
    document.dispatchEvent(new CustomEvent('prime-language-ready',{detail:{language}}));
  })();
  window.primeI18n={language,t,ready,change};
  document.addEventListener('click',event=>{const a=event.target.closest('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||u.pathname==='/app'||u.pathname.startsWith('/demo'))return;u.searchParams.set('lang',language);a.href=u.href;},true);
})();
