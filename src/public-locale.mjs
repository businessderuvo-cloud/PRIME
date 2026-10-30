import english from '../public/en.json' with {type:'json'};
const normalize=s=>s.replace(/\s+/g,' ').trim();
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt|#39|#x27|nbsp);/g,x=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&#39;':"'",'&#x27;':"'",'&nbsp;':' '}[x]));
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const dictionary=new Map(Object.entries(english).map(([k,v])=>[normalize(decode(k)),v]));
export const publicLocalizedPages=new Set(['landing.html','sisters.html','partners.html','partners-test.html','privacy.html','checkout.html','private-demo-access.html']);
export function localizePublicPage(html,language){
 if(language!=='en')return html;
 return html.replace(/(<html\b[^>]*\blang=")it("[^>]*>)/i,'$1en$2').split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi).map(part=>{
  if(/^<(?:script|style)\b/i.test(part))return part;
  return part.split(/(<[^>]+>)/g).map(piece=>{
   if(piece.startsWith('<'))return piece.replace(/\b(placeholder|aria-label|title|alt|content)="([^"]*)"/g,(all,attr,text)=>{if(attr==='content'&&!/name="description"/.test(piece))return all;const value=dictionary.get(normalize(decode(text)));return value?attr+'="'+escape(value)+'"':all;});
   const value=dictionary.get(normalize(decode(piece)));return value?piece.replace(piece.trim(),escape(value)):piece;
  }).join('');
 }).join('');
}
