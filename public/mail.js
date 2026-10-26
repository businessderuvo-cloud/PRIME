const providers = { gmail: "Gmail", outlook: "Outlook", yahoo: "Yahoo Mail" };
const brandIcons = { gmail: "gmail", outlook: "outlook", yahoo: "yahoo" };
const brandIcon = provider => `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${brandIcons[provider]}.svg" alt="" width="28" height="28"></span>`;

export async function renderMail({ state, main, api, pageHeader, esc, navigate }) {
  const data = await api("/api/connect");
  const owner = state.me.role === "owner";
  main.innerHTML = pageHeader("LA TUA POSTA, A COLPO D’OCCHIO", "Email", "Collega il tuo account e ricevi mittente e oggetto. Apri i messaggi nel browser del provider.") + `<p class="small-note">La posta è personale: ogni utente vede soltanto le proprie notifiche. PRIME non importa corpo o allegati e non invia email. Il controllo automatico avviene ogni 5 minuti.</p><div class="mail-provider-grid">${data.mailProviders.map(provider => {
    const account = data.connections.find(account => account.provider === provider.provider);
    const status = !account ? provider.provider === "yahoo" && !provider.configured ? "In attesa accesso Yahoo" : provider.configured ? "Da collegare" : "Non configurato" : account.status === "reauthorize" ? "Da ricollegare" : account.status === "error" ? "Controllo non riuscito" : "Collegato";
    return `<section class="panel mail-provider" data-mail-account="${provider.provider}"><h2 class="mail-provider-title">${brandIcon(provider.provider)}<span>${providers[provider.provider]}</span></h2><span class="pill">${status}</span>${account ? `<p>${esc(account.account_label)}</p><p class="small-note">Ultimo controllo: ${account.last_sync_at ? esc(new Date(account.last_sync_at).toLocaleString("it-IT")) : "in attesa del primo controllo"}</p>${account.last_error ? `<p class="error">${esc(account.last_error)}</p>` : ""}` : "<p>Accedi sul sito del provider e autorizza PRIME a mostrarti le notifiche.</p>"}${!account || account.status === "reauthorize" ? provider.configured ? `<button class="primary" data-mail-connect="${provider.provider}">${account ? "Ricollega" : "Collega"} ${providers[provider.provider]}</button>` : `<p class="small-note">${provider.provider === "yahoo" ? "Yahoo richiede l’approvazione dell’app prima di consentire l’accesso alla posta." : "Il collegamento dell’agenzia deve essere preparato prima del primo accesso."}</p>${owner ? '<button class="secondary" data-mail-settings>Prepara collegamento</button>' : '<p class="small-note">Chiedi al titolare di attivare questo provider.</p>'}` : ""}${account ? `<div class="connect-actions"><button class="secondary" data-mail-check="${esc(account.id)}">Controlla ora</button><button class="text-button" data-mail-unlink="${esc(account.id)}">Scollega</button></div>` : ""}<p class="connect-feedback" role="status"></p></section>`;
  }).join("")}</div><section class="panel mail-panel"><h2>Notifiche email</h2><label>Cerca mittente o oggetto<input id="mail-search" type="search" placeholder="Cerca nelle notifiche…"></label><p class="small-note">“Nascondi notifica” agisce soltanto in PRIME: non archivia e non modifica la casella email.</p><div id="mail-list" class="mail-notifications"></div><p id="mail-feedback" role="status"></p></section>`;
  function draw() {
    const query = main.querySelector("#mail-search").value.trim().toLocaleLowerCase("it");
    const notifications = data.mail.filter(mail => `${mail.sender} ${mail.subject}`.toLocaleLowerCase("it").includes(query));
    main.querySelector("#mail-list").innerHTML = notifications.map(mail => `<article class="mail-notification"><span class="pill">${providers[mail.provider]}</span><div><strong>${esc(mail.sender)}</strong><p>${esc(mail.subject)}</p><small>${esc(mail.account_label)} · ${esc(new Date(mail.received_at).toLocaleString("it-IT"))}</small></div><a href="${esc(mail.provider_url)}" target="_blank" rel="noopener noreferrer">Apri email ↗</a><button class="text-button" data-hide-mail="${esc(mail.message_id)}" data-connection="${esc(mail.connection_id)}">Nascondi notifica</button></article>`).join("") || '<p class="muted">Nessuna notifica da mostrare.</p>';
    main.querySelectorAll("[data-hide-mail]").forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { await api(`/api/connect/mail/connections/${button.dataset.connection}/dismiss`, { method: "POST", body: JSON.stringify({ message_id: button.dataset.hideMail }) }); data.mail = data.mail.filter(mail => !(mail.connection_id === button.dataset.connection && mail.message_id === button.dataset.hideMail)); draw(); }
      catch (error) { main.querySelector("#mail-feedback").textContent = error.message; button.disabled = false; }
    });
  }
  main.querySelector("#mail-search").oninput = draw; draw();
  main.querySelectorAll("[data-mail-settings]").forEach(button => button.onclick = () => navigate("connect"));
  const run = async (button, action) => {
    button.disabled = true;
    const feedback = button.closest("[data-mail-account]").querySelector(".connect-feedback");
    feedback.textContent = "Attendi…";
    try { await action(); } catch (error) { feedback.textContent = error.message; button.disabled = false; }
  };
  main.querySelectorAll("[data-mail-connect]").forEach(button => button.onclick = () => run(button, async () => { const result = await api(`/api/connect/mail/authorize/${button.dataset.mailConnect}`, { method: "POST", body: "{}" }); location.assign(result.url); }));
  main.querySelectorAll("[data-mail-check]").forEach(button => button.onclick = () => run(button, async () => { await api(`/api/connect/mail/connections/${button.dataset.mailCheck}/sync`, { method: "POST", body: "{}" }); await renderMail({ state, main, api, pageHeader, esc, navigate }); }));
  main.querySelectorAll("[data-mail-unlink]").forEach(button => button.onclick = () => run(button, async () => { await api(`/api/connect/connections/${button.dataset.mailUnlink}`, { method: "DELETE" }); await renderMail({ state, main, api, pageHeader, esc, navigate }); }));
  const panel = main.querySelector(".mail-panel"); let refreshing = false;
  const timer = setInterval(async () => {
    if (!panel.isConnected) { clearInterval(timer); return; }
    if (refreshing || document.hidden) return;
    refreshing = true;
    try { const fresh = await api("/api/connect"); if (panel.isConnected) { data.mail = fresh.mail; draw(); } }
    catch { /* Keep the current notification list while the connection is unavailable. */ }
    finally { refreshing = false; }
  }, 30000);
}
