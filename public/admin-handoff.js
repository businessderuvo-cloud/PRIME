(async()=>{
 const status=document.querySelector('#handoff-status');
 const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');
 history.replaceState(null,'','/admin/access');
 try{const response=await fetch('/api/admin/handoff/redeem',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Accesso non riuscito');location.replace('/admin');}
 catch(error){status.textContent=error.message;}
})();
