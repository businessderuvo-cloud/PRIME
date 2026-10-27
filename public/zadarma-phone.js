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

export function mountZadarmaPhone({ api, container, status }) {
  let timer = 0, stopped = false;
  const launch = container.querySelector('#elite-zadarma-launch');
  const supervisor = container.querySelector('#elite-zadarma-supervisor');
  const listen = container.querySelector('#elite-zadarma-listen');
  const update = () => {
    if (stopped) return;
    const sdk = window.zdrmWebPhone;
    const connection = sdk?.webCallSession?.connection;
    const tracks = connection?.getReceivers?.().map(receiver => receiver.track)
      .filter(track => track?.kind === 'audio' && track.readyState === 'live') || [];
    listen.disabled = !tracks.length;
    if (tracks.length) status.textContent = 'Audio del centralino pronto per il copilot.';
    else if (sdk?.callState === 'incoming') status.textContent = 'Chiamata in arrivo sull’interno supervisore.';
    else if (sdk?.callState === 'outgoing') status.textContent = 'Chiamata supervisore in corso. Segui il menu vocale.';
    timer = setTimeout(update, 500);
  };
  launch.onclick = async () => {
    launch.disabled = true;
    status.textContent = 'Collegamento al centralino Zadarma…';
    try {
      const session = await api('/api/elite/telephony/session');
      await loadLibrary();
      if (window.zdrmWebPhone?.unreg) window.zdrmWebPhone.unreg();
      document.getElementById('zdrmWPhI')?.remove();
      window.zadarmaWidgetFn(session.key, session.sip, 'rounded', 'it', false, { left: '0px', top: '0px' });
      const phone = await waitForPhone();
      container.querySelector('#elite-zadarma-widget').append(phone);
      window.primeZadarmaPhone = {
        getMonitorStream() {
          const receivers = window.zdrmWebPhone?.webCallSession?.connection?.getReceivers?.() || [];
          const tracks = receivers.map(receiver => receiver.track)
            .filter(track => track?.kind === 'audio' && track.readyState === 'live')
            .map(track => track.clone());
          return tracks.length ? new MediaStream(tracks) : null;
        }
      };
      supervisor.disabled = false;
      status.textContent = 'Telefono Zadarma connesso sull’interno supervisore.';
      launch.hidden = true;
      void update();
    } catch (error) {
      status.textContent = error.message;
      launch.disabled = false;
    }
  };
  supervisor.onclick = () => {
    const sdk = window.zdrmWebPhone;
    if (!sdk?.apiWidget) return;
    document.getElementById('zdrm-webphone-phonenumber-input').value = '007';
    sdk.apiWidget.call('007');
    status.textContent = 'Chiama l’interno 100 e poi premi 4 per il solo ascolto.';
  };
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (window.zdrmWebPhone?.unreg) window.zdrmWebPhone.unreg();
    document.getElementById('zdrmWPhI')?.remove();
    delete window.primeZadarmaPhone;
  };
}
