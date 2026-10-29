let libraryPromise;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(Error('Impossibile caricare il telefono web Zadarma.'));
    document.head.append(script);
  });
}

async function loadLibrary() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const base = 'https://my.zadarma.com/webphoneWebRTCWidget/v9/js/';
      await loadScript(base + 'loader-phone-lib.js?sub_v=2');
      const deadline = Date.now() + 15000;
      while (!(window.io && window.DetectRTC && window.JsSIP && window.md5)) {
        if (Date.now() > deadline) throw Error('Le librerie del telefono Zadarma non sono pronte.');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await loadScript(base + 'loader-phone-fn.js?sub_v=2');
      if (typeof window.zadarmaWidgetFn !== 'function') throw Error('Il telefono Zadarma non si è inizializzato.');
    })();
  }
  return libraryPromise;
}

function waitForPhone() {
  const existing = document.getElementById('zdrmWPhI');
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const phone = document.getElementById('zdrmWPhI');
      if (phone) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(phone);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(Error('Il telefono Zadarma non è apparso nella pagina.'));
    }, 10000);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

export function mountZadarmaPhone({api,container,status}) {
  let stopped=false,pending=null,ownedPhone=null,supervising=false,callSession=null;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const message=text=>{if(!stopped)status.textContent=text;};
  const waitUntil=async(predicate,timeout,error)=>{
    const deadline=Date.now()+timeout;
    while(!stopped&&Date.now()<deadline){if(predicate())return;await pause(200);}
    throw Error(stopped?'Collegamento Zadarma chiuso.':error);
  };
  const stream=()=>{
    const connection=window.zdrmWebPhone?.webCallSession?.connection;
    const tracks=connection?.getReceivers?.().map(receiver=>receiver.track)
      .filter(track=>track?.kind==='audio'&&track.readyState==='live')||[];
    return tracks.length?new MediaStream(tracks.map(track=>track.clone())):null;
  };
  async function prepare(){
    // Recheck the agency's real connection before opening WebRTC or monitoring.
    const connection=await api('/api/connect/telephony');
    if(connection.demo||!connection.providers.some(p=>p.provider==='zadarma'&&p.configured&&!p.demo&&p.verified_at&&p.sip))
      throw Error('Collega e verifica Zadarma in PRIME Connect prima di avviare il copilot.');
    if(stopped)throw Error('Collegamento Zadarma chiuso.');
    if(supervising&&callSession===window.zdrmWebPhone?.webCallSession){
      const audio=stream();if(audio)return audio;
    }
    message('Collego automaticamente l’audio della chiamata Zadarma…');
    if(!ownedPhone){
      const session=await api('/api/elite/telephony/session');
      await loadLibrary();
      if(stopped)throw Error('Collegamento Zadarma chiuso.');
      if(window.zdrmWebPhone?.unreg)window.zdrmWebPhone.unreg();
      document.getElementById('zdrmWPhI')?.remove();
      window.zadarmaWidgetFn(session.key,session.sip,'rounded','it',false,{left:'0px',top:'0px'});
      const phone=await waitForPhone();
      if(stopped){phone.remove();window.zdrmWebPhone?.unreg?.();throw Error('Collegamento Zadarma chiuso.');}
      ownedPhone=phone;
      // The SDK stays mounted; PRIME owns the single copilot start control.
      phone.hidden=true;container.append(phone);
    }
    await waitUntil(()=>typeof window.zdrmWebPhone?.apiWidget?.call==='function'&&window.zdrmWebPhone.webPhoneUA?.isRegistered?.(),15000,'Il telefono Zadarma non è connesso. Verifica il centralino e riprova.');
    const sdk=window.zdrmWebPhone;
    sdk.apiWidget.call('007');
    await waitUntil(()=>sdk.callState==='talking'&&sdk.webCallSession,30000,'Impossibile collegare l’audio Zadarma. Verifica la chiamata attiva e i permessi del centralino.');
    await pause(500);
    for(const digit of ['1','0','0']){if(stopped)throw Error('Collegamento Zadarma chiuso.');sdk.apiWidget.sendDTMF(digit);await pause(300);}
    await pause(1200);if(stopped)throw Error('Collegamento Zadarma chiuso.');
    sdk.apiWidget.sendDTMF('4');
    await waitUntil(()=>sdk.webCallSession?.connection?.getReceivers?.().some(receiver=>receiver.track?.kind==='audio'&&receiver.track.readyState==='live'),12000,'La chiamata Zadarma non fornisce audio. Verifica che sia attiva e riprova.');
    supervising=true;callSession=sdk.webCallSession;
    message('Audio Zadarma collegato al copilot.');
    return stream();
  }
  const endMonitoring=()=>{
    supervising=false;callSession=null;
    if(ownedPhone){window.zdrmWebPhone?.unreg?.();ownedPhone.remove();ownedPhone=null;}
  };
  return {
    endMonitoring,
    ensureMonitorStream(){
      if(stopped)return Promise.reject(Error('Collegamento Zadarma chiuso.'));
      if(!pending)pending=prepare().catch(error=>{endMonitoring();message(error.message);throw error;}).finally(()=>{pending=null;});
      return pending;
    },
    dispose(){
      if(stopped)return;stopped=true;
      endMonitoring();
    }
  };
}
