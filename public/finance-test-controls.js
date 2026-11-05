export function mountFinanceTestControls({main,state,api}){
  if(!state.me.customer_demo||!state.me.local_real_integrations)return;
  for(const provider of ['stripe','wallester']){
    const card=main.querySelector('[data-provider="'+provider+'"]');if(!card||card.querySelector('.finance-test-control'))continue;
    const label=document.createElement('label');label.className='finance-test-control';
    label.innerHTML='<input type="checkbox" '+(state.me[provider+'_demo_test']?'checked':'')+'> Test dimostrativo · dati fittizi';
    const note=document.createElement('p');note.className='small-note';note.textContent='In Test dimostrativo non viene collegato alcun conto reale e non vengono eseguite operazioni finanziarie.';
    card.append(label,note);
    label.querySelector('input').onchange=async event=>{
      const input=event.target;input.disabled=true;
      try{await api('/api/customer-demo/finance-test',{method:'POST',body:JSON.stringify({provider,enabled:input.checked})});location.reload();}
      catch(error){note.textContent=error.message;input.checked=!input.checked;input.disabled=false;}
    };
  }
}
