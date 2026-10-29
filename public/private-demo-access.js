const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
const status=document.querySelector('#access-status');
if(!token)status.textContent='Apri il link personale completo oppure accedi con le tue credenziali.';
else try{
  const response=await fetch('/api/private-demo-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}),data=await response.json();
  if(!response.ok)throw Error(data.error||'Accesso non riuscito.');
  location.replace('/app');
}catch(error){status.textContent=error.message;}
