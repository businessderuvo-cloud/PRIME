import { initializeAppLanguage, mountAppLanguage } from './app-locale.js';
import { renderElite, mountEliteWidget, openEliteCallDialog } from './elite-ui.js?v=20261029-zadarma-auto';
import { renderUpgrade } from './upgrade.js';
import { baseExcludedEntities, baseExcludedPages } from './edition.js';
import {startDocumentRenewalNotifications} from './didit.js';
import { mountOperations } from './operations.js';
import { renderConnect } from "./connect.js?v=20261029-email-section";
import { renderStripeAgency } from './stripe-agency.js?v=20261030-stripe-chart-classic4';
import { renderPortals } from "./portals.js";
import { mountContactOutEnrichment } from "./contactout.js";
import { assistantResultMarkup, openAssistantRecordManager } from "./assistant-management.js";
import { renderMail } from "./mail.js?v=20261029-no-proton";
import { renderMap } from "./map.js";
import { mountRepeatableRecaps } from "./repeatable-recaps.js";
import { schema, roleLabels } from "./schema.js";
import { renderPlanner } from "./planner-view.js";
import { startWpsClock } from "./wps-clock.js";
import { finishedStatuses } from "./planner.js";
import { renderTerritory } from "./territory.js";
import { mountPersonRecaps } from "./person-recaps.js";
import { startVoiceInput } from "./voice-input.js?v=20261030-outline-mic";
import { startCustomSelects } from "./custom-selects.js?v=20261029-vanessa";
let stopWpsClock;
let stopDocumentRenewalNotifications;
let agendaRefreshTimer;
let breakReminderTimer;
let breakReminderVisibilityHandler;
const app = document.querySelector("#app");
const state = {
  me: null,
  page: new URLSearchParams(location.search).has("stripe_payment") ? "stripe" : new URLSearchParams(location.search).has("mail") ? "mail" : new URLSearchParams(location.search).has("connect") ? "connect" : "dashboard",
  data: {},
  members: [],
  namirialConfigured: false,
  query: "",
  day: "",
  span: "week",
  status: "",
  globalSeq: 0,
  assistantMessages: [],
  assistantTyping: false,
  assistantWidgetOpen: false,
  assistantWidgetResizeHandler: null,
};
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  upgrade: "M12 20V4m-6 6 6-6 6 6M4 20h16",
  stripe: "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm-3 5h18m-14 5h4",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  agents: "M9 3h6l-1 4h-4zM10 7h4l3 12-5 3-5-3z",
  map: "M3 6 9 3l6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15",
  territory: "M4 21 9 3m6 0 5 18M12 5v3m0 4v3m0 4v2",
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  streets: "M4 21 9 3m6 0 5 18M12 5v3m0 4v3m0 4v2",
  buildings: "M4 21V7h10v14M14 11h6v10M7 10h4m-4 4h4m-4 4h4",
  units: "m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7",
  contacts:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m9 3a4 4 0 0 1 4 4v3",
  properties: "M4 21V5h16v16M8 9h2m4 0h2M8 13h2m4 0h2M10 21v-4h4v4",
  activities: "M9 5h12M9 12h12M9 19h12M3 5l1 1 2-3M3 12l1 1 2-3M3 19l1 1 2-3",
  appointments: "M4 5h16v16H4zM7 2v6m10-6v6M4 10h16m-12 4h2m4 0h2",
  deals: "M3 7h18M5 3h14v18H5zM8 12h8m-8 4h5",
  offers: "M4 4h16v16H4zM8 9h8m-8 4h8m-8 4h5",
  valuations: "M4 20V9m6 11V4m6 16v-7m5 7H2",
  leases: "M4 21V5l8-3 8 3v16M8 9h2m4 0h2m-8 4h2m4 0h2m-4 8v-5h4v5",
  commissions: "M12 2v20m5-16H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6",
  documents: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8m-8 4h8",
  signature_requests: "M19.2 3.8a2.1 2.1 0 0 1 3 3L11 18l-4 1 1-4L19.2 3.8ZM15.5 7.5l3 3M3 21c1.2-1.4 2-.4 3-.2 1.1.2 1.8-1.7 3-.3 1 1.2 2.1.4 3-.4 1.2-1.1 2 .8 3.2.4 1.1-.3 1.6-1.2 2.8-1.7",
  connect: "M8 12h8M9 6l-3-3-4 4 3 3m10 8 3 3 4-4-3-3M7 7l10 10",
  support: "M3 13v-2a9 9 0 0 1 18 0v2m-18 0h4v7H5a2 2 0 0 1-2-2v-5Zm18 0h-4v7h2a2 2 0 0 0 2-2v-5Zm-5 7a4 4 0 0 1-4 2h-1",
  assistant: "M12 3 14.2 9.8 21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z",
  audit: "M5 3h14v18H5zM9 7h6m-6 5h6m-6 5h4",
  roadmap: "M4 21V4m0 1c5-6 11 6 16 0v10c-5 6-11-6-16 0",
  security: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11zm-3-11 2 2 4-4",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  menu: "M4 6h16M4 12h16M4 18h16",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.units}"/></svg>`;
const dashboardIcon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="stat-silver-${name}" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#bac5ce"/><stop offset=".43" stop-color="#f9fcff"/><stop offset=".49" stop-color="#ffffff"/><stop offset=".53" stop-color="#7c8a96"/><stop offset=".72" stop-color="#d8e2e9"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path stroke="url(#stat-silver-${name})" d="${icons[name] || icons.units}"/></svg>`;
const logo = () =>
  `<img class="brand-image" src="/assets/logo-${state.me?.theme || "dark"}.png" alt="PRIME — logo ufficiale">`;
const date = (x) =>
  x
    ? new Intl.DateTimeFormat((document.documentElement.lang==='en'?'en-GB':'it-IT'), {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(x))
    : "";
const money = (x) =>
  new Intl.NumberFormat((document.documentElement.lang==='en'?'en-GB':'it-IT'), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(x || 0);
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.me ? { "X-CSRF-Token": state.me.csrf } : {}),
      ...options.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) {
    const error = Error(value.error || "Operazione non riuscita");
    error.status = response.status;
    throw error;
  }
  return value;
}
function toast(message) {
  const el = document.querySelector("#notice");
  if (el) {
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => (el.hidden = true), 7000);
  }
}
function assistantAvatarSrc() {
  if (["vip","elite"].includes(state.me?.edition)) return "/assets/vanessa-poster.png";
  return state.me?.theme === "light" ? "/assistant-avatar-light.png?v=20261026" : "/assistant-avatar-v5.png?v=20261026";
}
function assistantAvatarThumbSrc() {
  if (["vip","elite"].includes(state.me?.edition)) return "/assets/vanessa-icon-v2.png";
  return state.me?.theme === "light" ? "/assistant-avatar-light-chat-crop-v3.png" : "/assistant-avatar-v5-chat-crop-v3.png";
}
const assistantShortcuts = [
  { label: "Memorizza", prompt: "Ricorda che " },
  { label: "La mia memoria", prompt: "Cosa ricordi di me?" },
  { label: "Feedback sull’app", prompt: "Feedback sull’app: " },
  { label: "Lead caldi", prompt: "Mostrami i lead caldi registrati in PRIME." },
  { label: "Prossimi appuntamenti", prompt: "Mostrami i prossimi appuntamenti in agenda." },
  { label: "Immobili in vendita", prompt: "Cerca gli immobili in vendita." },
  { label: "Riepilogo WPS", prompt: "Riepiloga le attività WPS per stato e priorità." },
  { label: "Recapiti mancanti", prompt: "Quali appartamenti hanno numeri di telefono mancanti?" },
  { label: "Altre agenzie", prompt: "Mostrami gli appartamenti gestiti da altre agenzie." },
  { label: "Riepilogo CRM", prompt: "Riepiloga i contatti del CRM per tipo di contatto." },
  { label: "Bozza annuncio", prompt: "Prepara una bozza di annuncio per l’immobile: " },
];
function assistantShortcutsMarkup(compact = false, items = assistantShortcuts) {
  return items.map((item) => `<button type="button" class="${compact ? "assistant-shortcut" : "secondary"}" ${item.action ? `data-assistant-action="${item.action}"` : `data-assistant-prompt="${esc(item.prompt)}"`} aria-pressed="false">${esc(item.label)}</button>`).join("");
}
function bindAssistantShortcuts(container, question) {
  const buttons = container.querySelectorAll("[data-assistant-prompt],[data-assistant-action]");
  buttons.forEach((button) => button.addEventListener("click", () => {
    if (question.disabled) return;
    if (button.dataset.assistantAction) { openAssistantManager(button.dataset.assistantAction); return; }
    question.value = button.dataset.assistantPrompt;
    buttons.forEach((item) => {
      item.classList.toggle("is-selected", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    question.dispatchEvent(new Event("input", { bubbles: true }));
    question.focus();
    question.setSelectionRange(question.value.length, question.value.length);
  }));
}
async function openAssistantManager(mode = 'manage') {
  try { await loadData(); openAssistantRecordManager({ state, esc, openEditor, navigate, mode }); }
  catch (error) { toast(error.message); }
}
function assistantRequestMessages() {
  return state.assistantMessages.slice(-8).map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }));
}
function assistantMessageMarkup(message, index) {
  return `<article class="assistant-bubble ${message.role}">${message.role === "assistant" ? `<img class="assistant-message-avatar" src="${assistantAvatarThumbSrc()}" alt="" width="32" height="32" loading="lazy" decoding="async">` : ""}<strong>${message.role === "user" ? "Tu" : "Veronica"}</strong><p>${esc(message.content)}</p>${message.role === 'assistant' ? assistantResultMarkup(message, index, esc) : ''}</article>`;
}
function bindAssistantResults(container) {
  const redraw = () => {
    drawAssistantMessages(document.querySelector('#assistant-thread'));
    drawAssistantMessages(document.querySelector('#assistant-chat-thread'));
  };
  container.querySelectorAll('[data-assistant-manager]').forEach((button) => { button.onclick = () => openAssistantManager(); });
  container.querySelectorAll('[data-assistant-editor]').forEach((button) => { button.onclick = async () => {
    const draft = state.assistantMessages[Number(button.dataset.assistantEditor)]?.editor;
    if (!draft) return;
    button.disabled = true;
    try {
      const record = draft.id ? await api(`/api/entities/${draft.entity}/${draft.id}`) : null;
      await openEditor(draft.entity, record, draft.prefill);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  }; });
  container.querySelectorAll('[data-assistant-confirm],[data-assistant-cancel]').forEach((button) => { button.onclick = async () => {
    const index = Number(button.dataset.assistantConfirm ?? button.dataset.assistantCancel);
    const message = state.assistantMessages[index], proposal = message?.proposal;
    if (!proposal || proposal.status !== 'pending') return;
    const card = button.closest('.assistant-action-card'), status = card.querySelector('[data-assistant-action-status]');
    card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    status.textContent = 'Operazione in corso…';
    try {
      const operation = button.dataset.assistantConfirm !== undefined ? 'confirm' : 'cancel';
      const result = await api(`/api/assistant/manage/actions/${proposal.id}/${operation}`, { method: 'POST', body: '{}' });
      proposal.status = result.status; message.content = result.message;
      if (result.status === 'applied') {
        await loadData();
        if (state.page !== 'assistant') await renderPage();
      }
      redraw();
    } catch (error) {
      status.textContent = error.message;
      card.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    }
  }; });
  container.querySelectorAll('[data-assistant-forget]').forEach((button) => { button.onclick = async () => {
    button.disabled = true;
    try {
      const result = await api('/api/assistant/manage/plan', { method: 'POST', body: JSON.stringify({ operation: 'forget', id: button.dataset.assistantForget }) });
      state.assistantMessages.push({ ...result, role: 'assistant', content: result.message });
      redraw();
    } catch (error) { button.closest('article').querySelector('[role="status"]').textContent = error.message; button.disabled = false; }
  }; });
}
function drawAssistantMessages(container) {
  if (!container) return;
  container.innerHTML = state.assistantMessages.map(assistantMessageMarkup).join("") +
    (state.assistantTyping ? `<article class="assistant-bubble assistant-typing" role="status" aria-label="Veronica sta scrivendo"><img class="assistant-message-avatar" src="${assistantAvatarThumbSrc()}" alt=""><strong>Veronica</strong><span class="assistant-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></article>` : "");
  container.scrollTop = container.scrollHeight;
  bindAssistantResults(container);
}
function assistantReplyDelay() {
  return new Promise((resolve) => setTimeout(resolve, 1500 + Math.random() * 900));
}
function startBreakReminders() {
  clearInterval(breakReminderTimer);
  if (breakReminderVisibilityHandler) document.removeEventListener("visibilitychange", breakReminderVisibilityHandler);
  if (!state.me || state.me.role === "external") return;
  const key = `prime-break-reminder:${state.me.id}`;
  let lastReminder = Date.now();
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) lastReminder = saved;
    else localStorage.setItem(key, String(lastReminder));
  } catch { /* The reminder still works for this open session. */ }
  const check = () => {
    if (document.visibilityState === "hidden" || Date.now() - lastReminder < 2 * 60 * 60 * 1000) return;
    lastReminder = Date.now();
    try { localStorage.setItem(key, String(lastReminder)); } catch { /* Keep the in-memory schedule. */ }
    toast("Mini pausa? Acqua, spalle giù e cinque minuti per respirare. Ti aspetto qui 😉");
  };
  breakReminderVisibilityHandler = () => { if (document.visibilityState === "visible") check(); };
  document.addEventListener("visibilitychange", breakReminderVisibilityHandler);
  breakReminderTimer = setInterval(check, 60 * 1000);
}
function localDay(x = new Date()) {
  const d = new Date(x);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function refLabel(entity, id) {
  if (!id) return "—";
  const t=value=>window.primeI18n?.t(value)??value;
  const row = (
    entity === "members" ? state.members : state.data[entity] || []
  ).find((x) => x.id === id);
  if (!row) return "Elemento non disponibile";
  if (entity === "buildings")
    return refLabel("streets", row.street_id) + " " + row.title;
  if (entity === "units")
    return (
      refLabel("buildings", row.building_id) +
      " · " +
      [
        row.staircase ? t("Scala") + " " + row.staircase : "",
        row.floor ? t("piano") + " " + row.floor : "",
        t("Interno") + " " + String(row.title).replace(/^interno\s+/i, ""),
      ]
        .filter(Boolean)
        .join(" · ")
    );
  if (entity === "streets") return row.title + " · " + row.city;
  return row.title;
}
function displayValue(entity, key, value) {
  const f = schema[entity].fields[key];
  if (f?.type === "ref") return refLabel(f.entity, value);
  if (f?.type === "datetime-local") return date(value);
  if (f?.type === "checkbox") return value ? "Sì" : "No";
  if (entity === "signature_requests" && key === "signature_format") return value === "Cades" ? "P7M (CAdES)" : "PDF firmato (PAdES)";
  if (f?.type === "number" && f.label.includes("€")) return value === null || value === undefined || value === "" ? "—" : money(value);
  if (f?.type === "number") return value === null || value === undefined || value === "" ? "—" : new Intl.NumberFormat((document.documentElement.lang==='en'?'en-GB':'it-IT'), { maximumFractionDigits: 2 }).format(Number(value));
  return value || "—";
}
function recordCell(entity, key, value) {
  const field = schema[entity].fields[key];
  const label = displayValue(entity, key, value);
  if (key === 'is_hot_lead') return `<span class="pill ${Number(value) === 1 ? 'spot-badge spot-hot' : ''}">${Number(value) === 1 ? '✓ Lead caldo' : '—'}</span>`;
  if (field.type === 'select') {
    const semantic = { aperta: 207, 'in attesa': 38, vinta: 151, persa: 355, annullata: 265, bozza: 220, presentata: 38, accettata: 151, rifiutata: 355, scaduta: 285, ritirata: 320, attiva: 172, 'in rinnovo': 38, disdetta: 350, conclusa: 151, prevista: 210, maturata: 275, fatturata: 38, 'parzialmente incassata': 185, incassata: 151 };
    const index = Math.max(0, field.options.indexOf(value));
    const hue = semantic[value] ?? (205 + index * 137.508) % 360;
    return `<span class="pill record-status status-hue-${Math.round(hue / 30) * 30 % 360}"><span class="status-dot" aria-hidden="true"></span>${esc(label)}</span>`;
  }
  if (field.type === 'number') return `<span class="record-number ${field.label.includes('€') ? 'record-money' : ''}">${esc(label)}</span>`;
  return `<span class="record-value ${field.type === 'ref' ? 'record-reference' : ''}">${esc(label)}</span>`;
}
function auth(mode = "login", error = "") {
  stopDocumentRenewalNotifications?.();
  clearInterval(breakReminderTimer);
  if (breakReminderVisibilityHandler) document.removeEventListener("visibilitychange", breakReminderVisibilityHandler);
  stopWpsClock?.();
  state.me = null;
  state.assistantMessages = [];
  state.assistantTyping = false;
  state.assistantWidgetOpen = false;
  document.querySelector('#assistant-record-manager')?.remove();
  document.documentElement.dataset.theme = "dark";
  const params=new URLSearchParams(location.search),tokenType=["verify","reset","invite"].find(k=>params.has(k));
  const token=tokenType?params.get(tokenType):"";
  const tokenForm=tokenType?`<h2>${tokenType==="verify"?"Verifica email.":tokenType==="invite"?"Accetta l’invito.":"Scegli una nuova password."}</h2><p class="muted">${tokenType==="verify"?"Conferma il tuo indirizzo per accedere a PRIME.":"Imposta una password sicura, di almeno 12 caratteri."}</p><form id="token-form"><div class="error" role="alert" hidden></div>${tokenType!=="verify"?'<label>Nuova password<input name="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label><label>Ripeti password<input name="confirm" type="password" minlength="12" maxlength="128" required autocomplete="new-password"></label>':''}<button class="primary wide">${tokenType==="verify"?"Verifica email":tokenType==="invite"?"Attiva account":"Aggiorna password"}</button></form><p class="auth-switch"><button id="back-login" class="text-button">Torna all’accesso</button></p>`:"";
  app.innerHTML = `<main class="auth"><section class="auth-story"><div class="auth-brand">${logo()}</div><div><p class="eyebrow">IL TUO LAVORO. UNA NUOVA PROSPETTIVA.</p><h1>Il territorio diventa<br>opportunità.</h1><p class="lead">Persone, immobili e attività.<br>Uno spazio per farli crescere insieme.</p></div><footer>PRIME <span>GESTIONE IMMOBILIARE</span></footer></section><section class="auth-panel"><div class="auth-form"><span class="eyebrow">IL TUO SPAZIO OPERATIVO</span>${tokenType?tokenForm:`<h2>${mode === "register" ? "Benvenuto in PRIME." : "Bentornato."}</h2><p class="muted">${mode === "register" ? "Crea l’ambiente indipendente della tua agenzia." : "Accedi al workspace della tua agenzia."}</p><form id="auth-form"><div class="error" role="alert" ${error ? "" : "hidden"}>${esc(error)}</div>${mode === "register" ? '<label>Nome agenzia<input name="agency" required maxlength="120" autocomplete="organization"></label>' : ""}<label>Email<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Password<input name="password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" minlength="12" maxlength="128" required></label><small>Da 12 a 128 caratteri.</small><button class="primary wide" type="submit">${mode === "register" ? "Crea la tua agenzia" : "Accedi"} ${icon("arrow")}</button></form>${mode==="login"?'<p><button id="forgot-password" class="text-button">Password dimenticata?</button></p>':''}<p class="auth-switch">${mode === "register" ? "Hai già un account?" : "Nuova agenzia?"} <button id="auth-toggle" class="text-button">${mode === "register" ? "Accedi" : "Crea il tuo spazio"}</button></p><p class="setup-note">La verifica email e la protezione Authenticator sono disponibili. L’email viene consegnata dal provider configurato in produzione.</p>`}<p><a href="/privacy">Informativa privacy PRIME</a></p></div></section></main>`;
  if(tokenType){
    document.querySelector("#back-login").onclick=()=>{history.replaceState(null,"",location.pathname);auth();};
    document.querySelector("#token-form").onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,err=form.querySelector(".error"),values=Object.fromEntries(new FormData(form));if(values.password&&values.password!==values.confirm){err.textContent="Le password non coincidono.";err.hidden=false;return;}try{const endpoint=tokenType==="verify"?"/api/auth/verify-email":tokenType==="invite"?"/api/auth/invitations/accept":"/api/auth/reset-password";const result=await api(endpoint,{method:"POST",body:JSON.stringify({token,password:values.password})});history.replaceState(null,"",location.pathname);auth("login",result.message);}catch(ex){err.textContent=ex.message;err.hidden=false;}};
    return;
  }
  document.querySelector("#auth-toggle").onclick = () =>
    auth(mode === "login" ? "register" : "login");
  document.querySelector("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target,
      button = form.querySelector("button"),
      err = form.querySelector(".error");
    button.disabled = true;
    err.hidden = true;
    try {
      const result=await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(form)),
          mode,
        }),
      });
      if(result.requires_email_verification){app.innerHTML=`<main class="auth"><section class="auth-panel"><div class="auth-form"><h2>Controlla la tua email.</h2><p>Abbiamo inviato il link di verifica a <strong>${esc(new FormData(form).get("email"))}</strong>.</p>${result.mailbox_url?`<p><a class="primary" href="${esc(result.mailbox_url)}" target="_blank" rel="noreferrer">Apri la casella locale di sviluppo</a></p>`:""}<button class="text-button" id="resend-verification">Invia di nuovo</button><button class="text-button" id="return-login">Torna all’accesso</button></div></section></main>`;document.querySelector("#return-login").onclick=()=>auth();document.querySelector("#resend-verification").onclick=async()=>{try{await api("/api/auth/resend-verification",{method:"POST",body:JSON.stringify({email:new FormData(form).get("email")})});toast("Link di verifica inviato.");}catch(ex){toast(ex.message);}};return;}
      if(result.requires_two_factor){const challenge=result.challenge;app.innerHTML=`<main class="auth"><section class="auth-panel"><div class="auth-form"><h2>Verifica in due passaggi.</h2><p>Inserisci il codice a sei cifre della tua app Authenticator.</p><form id="totp-login"><label>Codice<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label><button class="primary wide">Verifica e accedi</button><p class="error" hidden role="alert"></p></form></div></section></main>`;document.querySelector("#totp-login").onsubmit=async ev=>{ev.preventDefault();const f=ev.currentTarget,err=f.querySelector(".error");try{await api("/api/auth/2fa/verify",{method:"POST",body:JSON.stringify({challenge,code:new FormData(f).get("code")})});await boot();}catch(ex){err.textContent=ex.message;err.hidden=false;}};return;}
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      if(mode==="login"&&ex.message.toLowerCase().includes("email non verificata")){
        const resend=document.createElement("button");resend.type="button";resend.className="text-button";resend.textContent="Invia di nuovo il link di verifica";resend.onclick=async()=>{try{const result=await api("/api/auth/resend-verification",{method:"POST",body:JSON.stringify({email:new FormData(form).get("email")})});err.textContent=result.message;const link=document.createElement("a");link.href=result.mailbox_url||"#";link.textContent=result.mailbox_url?"Apri la casella di sviluppo":"";if(result.mailbox_url)err.after(link);}catch(e){err.textContent=e.message;}};err.after(resend);
      }
      button.disabled = false;
    }
  };
  document.querySelector("#forgot-password")?.addEventListener("click",async()=>{const email=document.querySelector('#auth-form input[name="email"]').value.trim();if(!email){document.querySelector('#auth-form input[name="email"]').focus();return;}try{const result=await api("/api/auth/recovery",{method:"POST",body:JSON.stringify({email})});if(result.mailbox_url)location.href=result.mailbox_url;else toast(result.message);}catch(ex){toast(ex.message);}});
}
async function loadData() {
  const entries = await Promise.all(
    Object.keys(schema).map(async (k) => [k, state.me.edition === "base" && baseExcludedEntities.includes(k) ? [] : await api("/api/entities/" + k)]),
  );
  state.data = Object.fromEntries(entries);
  state.members = await api("/api/members");
  state.media = await api("/api/media");
}
function focusTerritoryRow(entity, row) {
  const selection = (state.territory ??= {});
  selection.restored = true;
  selection.tab = "scheda";
  if (entity === "streets") {
    selection.streetId = row.id;
    selection.buildingId = null;
    selection.unitId = null;
  }
  if (entity === "buildings") {
    selection.streetId = row.street_id;
    selection.buildingId = row.id;
    selection.unitId = null;
  }
  if (entity === "units") {
    const building = state.data.buildings.find((b) => b.id === row.building_id);
    selection.streetId = building?.street_id || null;
    selection.buildingId = row.building_id;
    selection.unitId = row.id;
  }
}
const globalNavigation = [
  ["dashboard", "Panoramica"],
  ["territory", "Vie e territorio"],
  ["map", "Mappa immobiliare"],
  ["agents", "Agenti"],
  ["contacts", "CRM · Persone"],
  ["properties", "Immobili in gestione"],
  ["activities", "WPS"],
  ["appointments", "Agenda appuntamenti"],
  ["section", "COMMERCIALE"],
  ["buyer_profiles", "Esigenze acquirenti"],
  ["viewing_feedback", "Feedback visite"],
  ["deals", "Trattative"],
  ["offers", "Proposte e offerte"],
  ["valuations", "Valutazioni"],
  ["leases", "Locazioni"],
  ["commissions", "Provvigioni"],
  ["portals", "Portali immobiliari"],
  ["documents", "Documenti"],
  ["signature_requests", "Firme elettroniche"],
  ["section", "CONNESSIONI"],
  ["connect", "PRIME Connect"],
  ["stripe", "Stripe · Pagamenti"],
  ["mail", "Email"],
  ["assistant", "Veronica"],
  ["roadmap", "Stato sviluppo"],
  ["upgrade", "Piano e upgrade"],
  ["security", "Sicurezza account"],
];
function shell() {
  const isBase = state.me.edition === 'base';
  const hasStripe = state.me.stripe_enabled===true || (state.me.stripe_enabled===undefined && state.me.edition==='elite');
  if (!hasStripe && state.page === 'stripe') state.page = 'dashboard';
  if (isBase && baseExcludedPages.includes(state.page)) state.page = 'dashboard';
  const navigation = globalNavigation.filter(([page,label]) => (state.me.role === 'owner' || !['agents','upgrade'].includes(page)) && (page !== 'stripe' || hasStripe) && (!isBase || (!baseExcludedPages.includes(page) && label !== 'CONNESSIONI')));
  stopWpsClock?.();
  document.documentElement.dataset.theme = state.me.theme;
  app.innerHTML = `<a class="skip" href="#main">Vai al contenuto</a><div class="workspace"><aside class="sidebar"><div class="brand">${logo()}</div><p class="sidebar-label">WORKSPACE</p><nav aria-label="Navigazione principale">${navigation.map(([k, label]) => k === "section" ? `<p class="nav-section-label">${label}</p>` : `<button data-page="${k}" class="nav-item ${state.page === k ? "active" : ""}">${icon(k)}<span>${label}</span>${k === "activities" ? '<span class="nav-dot"></span>' : ""}</button>`).join("")}${["owner", "manager"].includes(state.me.role) ? `<button data-page="audit" class="nav-item">${icon("audit")}<span>Registro attività</span></button>` : ""}</nav><div class="sidebar-bottom"><div class="avatar">${esc(state.me.tenant.slice(0, 2).toUpperCase())}</div><div><strong>${esc(state.me.tenant)}</strong><small>${roleLabels[state.me.role]}</small></div><button id="logout" title="Esci" aria-label="Esci">↗</button></div></aside><div class="main-wrap"><header class="topbar"><button class="icon-button" id="menu" aria-label="Apri o chiudi menu" aria-expanded="true">${icon("menu")}</button><div class="global-search">${icon("search")}<input id="global-search" aria-label="Ricerca universale" placeholder="Cerca in tutto PRIME…" autocomplete="off"><span class="key-hint">/</span><div id="global-results" class="search-results" hidden></div></div><button id="theme" class="icon-button" aria-label="${state.me.theme === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro"}">${icon("sun")}</button><span class="workspace-badge">ANTEPRIMA DI SVILUPPO</span></header><main id="main" tabindex="-1"></main><footer class="main-footer">PRIME <span>Uno spazio, tutte le connessioni.</span><a href="mailto:phoenix@primegestionale.it">Assistenza: phoenix@primegestionale.it</a><a href="/privacy">Privacy</a><span>Versione 0.4 · Sviluppo</span></footer></div></div><div id="notice" role="status" hidden></div><dialog id="editor" aria-labelledby="editor-title"></dialog>`;
  if (state.me.edition === 'elite') {
    document.querySelector('.sidebar nav').insertAdjacentHTML('beforeend', '<a class="nav-item remote-support-nav" href="https://www.teamviewer.com/it/download/portal/" target="_blank" rel="noopener noreferrer">'+icon('support')+'<span>Assistenza remota</span></a>');
  }
  if (!isBase) { mountMailInbox(); if(["vip","elite"].includes(state.me.edition)) mountEliteWidget({api,esc,state,navigate,loadData}); else mountAssistantChatWidget(); }
  if(["vip","elite"].includes(state.me.edition)) {document.querySelector('[data-page="assistant"] span').textContent="Vanessa";document.querySelector(".sidebar-label").textContent=state.me.edition === "vip" ? "PRIME VIP" : "PRIME ELITE";}
  if (isBase) { document.title = "PRIME Base · Gestionale immobiliare"; document.querySelector(".sidebar-label").textContent = "PRIME BASE · STANDARD"; }
  const compactBrand = document.createElement("div");
  compactBrand.className = "compact-brand";
  compactBrand.innerHTML = logo();
  document.querySelector(".global-search").before(compactBrand);
  if (innerWidth < 850)
    document.querySelector("#global-search").placeholder = "Cerca…";
  document.querySelector(".workspace-badge").textContent =
    isBase ? "PRIME BASE · STANDARD" : state.me.environment === "demo"
      ? "DEMO · DATI DI ESEMPIO"
      : "AMBIENTE LOCALE";
  if (state.me.environment === "demo") {
    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.textContent =
      "AMBIENTE DEMO · Dati di esempio in un database separato";
    document.querySelector(".topbar").after(banner);
  }
  mountAppLanguage();
  if (innerWidth < 850) document.body.classList.add("nav-collapsed");
  document
    .querySelector("#menu")
    .setAttribute(
      "aria-expanded",
      String(!document.body.classList.contains("nav-collapsed")),
    );
  window.scrollTo(0, 0);
  document
    .querySelectorAll("[data-page]")
    .forEach((el) => (el.onclick = () => navigate(el.dataset.page)));
  document.querySelector("#menu").onclick = (e) => {
    document.body.classList.toggle("nav-collapsed");
    e.currentTarget.setAttribute(
      "aria-expanded",
      String(!document.body.classList.contains("nav-collapsed")),
    );
  };
  document.querySelector("#theme").onclick = async () => {
    try {
      const value = await api("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          theme: state.me.theme === "dark" ? "light" : "dark",
        }),
      });
      state.me.theme = value.theme;
      shell();
      await renderPage();
    } catch (e) {
      toast(e.message);
    }
  };
  document.querySelector("#logout").onclick = async () => {
    try {
      await api("/api/logout", { method: "POST", body: "{}" });
      auth();
    } catch (e) {
      toast(e.message);
    }
  };
  let timer;
  document.querySelector("#global-search").oninput = (e) => {
    clearTimeout(timer);
    const q = e.target.value,
      seq = ++state.globalSeq;
    timer = setTimeout(async () => {
      const out = document.querySelector("#global-results");
      if (q.length < 2) {
        out.hidden = true;
        return;
      }
      try {
        const results = await api("/api/search?q=" + encodeURIComponent(q));
        if (seq !== state.globalSeq) return;
        out.innerHTML = results.length
          ? results
              .map(
                (r) =>
                  `<button data-entity="${r.entity}" data-id="${r.id}"><small>${schema[r.entity].label}</small><strong>${esc(r.title)}</strong><span>${esc(r.context)}</span></button>`,
              )
              .join("")
          : "<p>Nessun risultato nell’agenzia.</p>";
        out.hidden = false;
        out.querySelectorAll("button").forEach(
          (b) =>
            (b.onclick = async () => {
              out.hidden = true;
              if (
                ["streets", "buildings", "units"].includes(b.dataset.entity)
              ) {
                await loadData();
                focusTerritoryRow(
                  b.dataset.entity,
                  state.data[b.dataset.entity].find(
                    (r) => r.id === b.dataset.id,
                  ),
                );
                await navigate("territory");
                return;
              }
              openEditor(
                b.dataset.entity,
                state.data[b.dataset.entity].find((r) => r.id === b.dataset.id),
              );
            }),
        );
      } catch (e) {
        toast(e.message);
      }
    }, 180);
  };
  if (state.me.role !== "external")
    stopWpsClock = startWpsClock({
      state,
      api,
      loadData,
      renderPage,
      esc,
      openEditor,
      toast,
    });
}
async function navigate(page) {
  if (["streets", "buildings", "units"].includes(page)) page = "territory";
  state.page = page;
  state.query = "";
  state.status = "";
  state.day = "";
  document
    .querySelectorAll("[data-page]")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  document.querySelector("#global-results").hidden = true;
  try {
    await loadData();
    await renderPage();
    if (innerWidth < 850) document.body.classList.add("nav-collapsed");
    document
      .querySelector("#menu")
      .setAttribute(
        "aria-expanded",
        String(!document.body.classList.contains("nav-collapsed")),
      );
    window.scrollTo(0, 0);
  } catch (e) {
    toast(e.message);
  }
}
function pageHeader(eyebrow, title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="muted">${description}</p></div>${action}</div>`;
}
const searchBox = (placeholder = "Cerca in questa sezione…") =>
  `<div class="context-search">${icon("search")}<input id="context-search" aria-label="Ricerca nella sezione" placeholder="${placeholder}" value="${esc(state.query)}"></div>`;
function bindSearch(callback) {
  document.querySelector("#context-search").oninput = (e) => {
    state.query = e.target.value;
    callback();
  };
}
function matches(r) {
  const text = (r.search_text || JSON.stringify(r)).toLocaleLowerCase("it");
  return state.query
    .toLocaleLowerCase("it")
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}
function inPeriod(value) {
  if (!state.day) return true;
  const d = new Date(value),
    from = new Date(state.day + "T00:00:00"),
    to = new Date(from);
  to.setDate(to.getDate() + (state.span === "week" ? 7 : 1));
  return d >= from && d < to;
}
function periodControls() {
  return `<label class="inline-label">Dal<input id="day-filter" type="date" value="${state.day}"></label><select id="span-filter" aria-label="Intervallo"><option value="week" ${state.span === "week" ? "selected" : ""}>Settimana</option><option value="day" ${state.span === "day" ? "selected" : ""}>Giorno</option></select><button class="secondary" id="all-dates">Tutte le date</button>`;
}
function bindPeriod(callback) {
  document.querySelector("#day-filter").onchange = (e) => {
    state.day = e.target.value;
    callback();
  };
  document.querySelector("#span-filter").onchange = (e) => {
    state.span = e.target.value;
    callback();
  };
  document.querySelector("#all-dates").onclick = () => {
    state.day = "";
    document.querySelector("#day-filter").value = "";
    callback();
  };
}
async function renderPage() {
  clearInterval(agendaRefreshTimer);
  if (state.page === "upgrade") return renderUpgrade({main:document.querySelector("#main"),api,esc});
  const main = document.querySelector("#main"),
    page = state.page;
  if(page==="security"){
    const security=await api("/api/account/security");
    main.innerHTML=pageHeader("ACCOUNT PRIME","Sicurezza account","Verifica email e proteggi l’accesso con un codice temporaneo Authenticator.")+`<section class="panel"><h2>Email</h2><p>${security.email_verified?"Indirizzo verificato":"Indirizzo non verificato"}</p></section><section class="panel"><h2>Autenticazione a due fattori</h2><p>${security.two_factor_enabled?"Authenticator attivo su questo account.":"Aggiungi un secondo passaggio con Google Authenticator, Microsoft Authenticator o un’app TOTP compatibile."}</p>${security.two_factor_enabled?`<form id="totp-disable" class="stack-form"><label>Password attuale<input name="password" type="password" required autocomplete="current-password"></label><label>Codice Authenticator<input name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label><button class="secondary">Disattiva 2FA</button></form>`:`<form id="totp-setup" class="stack-form"><label>Password attuale<input name="password" type="password" required autocomplete="current-password"></label><button class="primary">Configura Authenticator</button></form><div id="totp-enroll" hidden></div>`}<p id="security-status" role="status" class="small-note"></p></section><section class="panel"><h2>Email di sicurezza</h2><p>${security.email_provider_configured?"Provider email transazionale configurato.":"In produzione serve configurare Resend e un dominio mittente verificato per consegnare inviti, verifica e recupero password."}</p></section>`;
    const status=document.querySelector("#security-status");
    document.querySelector("#totp-setup")?.addEventListener("submit",async e=>{e.preventDefault();try{const result=await api("/api/account/security/totp/setup",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});const box=document.querySelector("#totp-enroll");box.hidden=false;box.innerHTML=`<p>Inserisci questa chiave nella tua app Authenticator:</p><p><code>${esc(result.secret)}</code></p><p>Oppure apri questo URI se il dispositivo supporta l’importazione:</p><p><code>${esc(result.otpauth_url)}</code></p><form id="totp-enable" class="stack-form"><label>Codice a sei cifre<input name="code" inputmode="numeric" maxlength="6" required autocomplete="one-time-code"></label><button class="primary">Conferma e attiva</button></form>`;document.querySelector("#totp-enable").onsubmit=async ev=>{ev.preventDefault();try{await api("/api/account/security/totp/enable",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(ev.currentTarget)))});await renderPage();}catch(ex){status.textContent=ex.message;}};}catch(ex){status.textContent=ex.message;}});
    document.querySelector("#totp-disable")?.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/account/security/totp/disable",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});await renderPage();}catch(ex){status.textContent=ex.message;}});
    return;
  }
  if (page === "mail") { await renderMail({ state, main, api, pageHeader, esc, navigate }); return; }
  if (page === "agents") {
    if (state.me.role !== "owner") { main.innerHTML = pageHeader("TEAM", "Agenti", "Pagina riservata al titolare."); return; }
    const agents = await api("/api/agents");
    const t=value=>window.primeI18n?.t(value)??value;
    main.innerHTML = pageHeader("IL TEAM DELLA TUA AGENZIA", "Agenti", "Invita i tuoi agenti via email e assegna a ciascuno le zone di competenza dalla mappa.") + `<section class="agents-layout"><form id="agent-create" class="panel agent-create-panel"><h2>Invita un agente</h2><label>Email<input name="email" type="email" maxlength="254" required autocomplete="off" placeholder="nome@agenzia.it"></label><p class="small-note">L’agente riceverà un link per impostare in autonomia una password personale.</p><button class="primary" type="submit">Invia invito</button><p id="agent-create-status" role="status" class="small-note"></p></form><section class="panel agent-list-panel"><div class="map-sidebar-heading"><h2>${t('Agenti')} (${agents.length})</h2><button id="agents-open-map" class="text-button">Assegna zone sulla mappa ↗</button></div><label>Cerca agente<input id="agent-search" type="search" placeholder="Cerca per email…"></label><div id="agent-list"></div></section></section>`;
    if (state.me.edition === 'base') {
      const used = state.members.length, limit = state.me.human_seat_limit;
      const note = document.createElement('p'); note.className = 'small-note';
      note.textContent = 'PRIME Base: ' + used + ' di ' + limit + ' posti utilizzati, titolare e inviti pendenti compresi. Due posti inclusi; ogni posto aggiuntivo costa 50 €/mese e richiede attivazione.';
      document.querySelector('#agent-create h2').after(note);
      if (used >= limit) { const button = document.querySelector('#agent-create [type="submit"]'); button.disabled = true; document.querySelector('#agent-create-status').textContent = 'Tutti i posti attivi sono utilizzati. Contatta l’assistenza per un posto aggiuntivo.'; }
    }
    const drawAgents = () => {
      const query = document.querySelector("#agent-search").value.trim().toLowerCase();
      const filtered = agents.filter(agent => agent.email.toLowerCase().includes(query));
      document.querySelector("#agent-list").innerHTML = filtered.map(agent => `<article class="agent-account-row"><strong>${esc(agent.email)}</strong><span class="pill">${agent.email_verified?"Attivo":"Invito in attesa"}</span></article>`).join("") || `<p class="small-note">${agents.length ? "Nessun agente corrisponde alla ricerca." : "Non hai ancora invitato agenti. Aggiungi il primo con il modulo."}</p>`;
    };
    drawAgents();
    document.querySelector("#agent-search").oninput = drawAgents;
    document.querySelector("#agents-open-map").onclick = () => navigate("map");
    document.querySelector("#agent-create").onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, submit = form.querySelector('[type="submit"]'), status = document.querySelector("#agent-create-status");
      submit.disabled = true; status.textContent = "Invio invito…";
      try {
        const values = new FormData(form), agent = await api("/api/agents", { method: "POST", body: JSON.stringify({ email: values.get("email") }) });
        form.reset();
        state.members = await api("/api/members");
        await renderPage();
        document.querySelector("#agent-create-status").textContent = `Invito inviato a ${agent.email}.`;
      } catch (error) { status.textContent = error.message; submit.disabled = false; }
    };
    return;
  }
  main.classList.toggle(
    "has-planner",
    ["activities", "appointments"].includes(page),
  );
  main.classList.toggle("has-territory", page === "territory");
  if (page === "territory") {
    renderTerritory({
      state,
      main,
      pageHeader,
      searchBox,
      bindSearch,
      esc,
      icon,
      openEditor,
      api,
      loadData,
      renderPage,
      toast,
      date,
    });
    return;
  }
  if (page === "map") {
    renderMap({ state, main, pageHeader, esc, icon, api, renderPage, navigate, openEditor, toast });
    return;
  }
  if (["activities", "appointments"].includes(page)) {
    if(page==="appointments")state.externalBusy=await api("/api/connect/busy");
    renderPlanner({
      state,
      main,
      pageHeader,
      searchBox,
      bindSearch,
      matches,
      esc,
      icon,
      openEditor,
      refLabel,
    });
    if (page === "appointments") {
      let refreshing = false;
      agendaRefreshTimer = setInterval(async () => {
        if (refreshing || document.hidden || state.page !== "appointments" || document.querySelector("#editor")?.open) return;
        refreshing = true;
        try {
          const appointments = await api("/api/entities/appointments");
          if (state.page !== "appointments") return;
          state.data.appointments = appointments;
          main.querySelector(".planner")?.dispatchEvent(new Event("prime:refresh"));
        } catch { /* Keep the last loaded agenda if the connection is interrupted. */ }
        finally { refreshing = false; }
      }, 30000);
    }
    return;
  }
  if (page === "assistant" && ["vip","elite"].includes(state.me.edition)) { await renderElite({main,api,esc,state,loadData});return; }
  if (page === "assistant") {
    const status = await api("/api/assistant/status");
    const feedbackItems = status.isDeveloper ? await api("/api/assistant/feedback") : null;
    main.innerHTML =
      pageHeader(
        "IL TUO COPILOTA OPERATIVO",
        "Veronica",
        "Cerca informazioni, gestisci le schede di PRIME e conserva appunti per le prossime conversazioni.",
      ) +
      `<section class="assistant-panel panel"><div class="assistant-profile"><img class="assistant-avatar" src="${assistantAvatarSrc()}" alt="Veronica" width="240" height="360" loading="eager" fetchpriority="high" decoding="async"><div><p class="eyebrow">VERONICA</p><h2>Il tuo lavoro, sotto controllo.</h2><p>Immobili, contatti e appuntamenti: partiamo dai dati della tua agenzia.</p><span class="pill">Solo dati interni</span></div></div><p class="assistant-privacy">Veronica lavora sui dati interni di PRIME. Può preparare creazioni, modifiche, note ed eliminazioni: ogni proposta viene salvata solo dopo la tua conferma, con i permessi del tuo account. Le informazioni aggiunte con “Ricorda che…” rimangono nella tua memoria privata per questa agenzia e puoi rimuoverle. Il feedback sull’app viene recapitato allo sviluppatore.</p><div class="assistant-prompts" role="group" aria-label="Azioni rapide di Veronica">${assistantShortcutsMarkup()}</div><div id="assistant-thread" class="assistant-thread" aria-live="polite"></div><p id="assistant-feedback" class="connect-feedback" role="status">${status.configured ? "Veronica è pronta 😉" : "Veronica non è disponibile."}</p><form id="assistant-form" class="assistant-form"><label for="assistant-question">La tua domanda</label><textarea id="assistant-question" rows="3" maxlength="2000" placeholder="Chiedi di immobili, WPS, appuntamenti o CRM. Aggiungi città, budget o locali per una ricerca mirata." required ${status.configured ? "" : "disabled"}></textarea><div class="assistant-submit"><small>${status.configured ? "Modalità base · dati interni" : "Riprova tra poco."}</small><button class="primary" type="submit" ${status.configured ? "" : "disabled"}>Invia domanda</button></div></form></section>${feedbackItems ? `<section class="panel developer-feedback"><p class="eyebrow">PRIME · SVILUPPO</p><h2>Feedback sull’app ricevuti</h2><p>Inbox riservata allo sviluppatore · ${feedbackItems.length} segnalazioni</p>${feedbackItems.length ? feedbackItems.map(item => `<article class="developer-feedback-item"><header><strong>${esc(item.agency)}</strong><time>${esc(new Date(item.created_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT')))}</time></header><p>${esc(item.message)}</p><small>${esc(item.email)}</small></article>`).join("") : `<p class="muted">Non ci sono ancora segnalazioni.</p>`}</section>` : ""}`;
    const thread = document.querySelector("#assistant-thread");
    const drawMessages = () => {
      drawAssistantMessages(thread);
    };
    drawMessages();
    bindAssistantShortcuts(main.querySelector(".assistant-prompts"), document.querySelector("#assistant-question"));
    document.querySelector("#assistant-form").onsubmit = async (event) => {
      event.preventDefault();

      const question = document.querySelector("#assistant-question"),
        submit = event.currentTarget.querySelector("button[type=submit]"),
        feedback = document.querySelector("#assistant-feedback"),
        value = question.value.trim();
      if (!value) return;
      state.assistantMessages.push({ role: "user", content: value });
      drawMessages();
      question.value = "";
      question.disabled = true;
      submit.disabled = true;
      feedback.textContent = "Sto preparando la risposta…";
      state.assistantTyping = true;
      drawMessages();
      try {
        const [result] = await Promise.all([
          api("/api/assistant/chat", {
            method: "POST",
            body: JSON.stringify({ messages: assistantRequestMessages() }),
          }),
          assistantReplyDelay(),
        ]);
        state.assistantTyping = false;
        state.assistantMessages.push({ ...result, role: "assistant", content: result.message });
        feedback.textContent = "Risposta pronta. Verifica i dati prima di usarli.";
        drawMessages();
      } catch (error) {
        state.assistantTyping = false;
        state.assistantMessages.pop();
        question.value = value;
        feedback.textContent = error.message;
        drawMessages();
      } finally {
        state.assistantTyping = false;
        question.disabled = !status.configured;
        submit.disabled = !status.configured;
        question.focus();
      }
    };
    return;
  }
  if (page === "dashboard") {
    const d = state.data;
    main.innerHTML =
      pageHeader(
        "IL TUO WORKSPACE",
        "Ogni connessione conta.",
        "La tua agenzia, vista da vicino.",
        `<button class="primary" id="quick-create">${icon("plus")} Nuova attività</button>`,
      ) +
      `<div class="stats">${[
        ["Immobili in gestione", d.properties.length, "properties"],
        ["Appartamenti censiti", d.units.length, "units"],
        [
          "Attività WPS aperte",
          d.activities.filter((x) => !finishedStatuses.has(x.status)).length,
          "activities",
        ],
        ["Contatti in rubrica", d.contacts.length, "contacts"],
        ["Trattative aperte", d.deals.filter((x) => ["aperta", "in attesa"].includes(x.status)).length, "deals"],
        ["Proposte in attesa", d.offers.filter((x) => ["bozza", "presentata"].includes(x.status)).length, "offers"],
        ["Locazioni attive", d.leases.filter((x) => x.status === "attiva").length, "leases"],
        ["Provvigioni incassate", money(d.commissions.reduce((sum, x) => sum + Number(x.collected_amount || 0), 0)), "commissions"],
      ]
        .filter(([, , key]) => state.me.edition !== "base" || !baseExcludedPages.includes(key))
        .map(
          ([label, n, key]) =>
            `<button class="stat" data-nav="${key}"><span class="stat-heading"><span class="stat-symbol stat-symbol-${key}">${dashboardIcon(key)}</span><span>${label}</span></span><strong>${n}</strong><span class="stat-bottom">Apri sezione ${icon("arrow")}</span></button>`,
        )
        .join(
          "",
        )}</div><div class="overview-grid"><section class="panel"><div class="panel-header"><div><p class="eyebrow">OPERATIVITÀ</p><h2>Le prossime azioni</h2></div><button class="text-button" data-nav="activities">Apri WPS →</button></div>${searchBox("Cerca attività, persone e appuntamenti…")}<div id="overview-list"></div></section><section class="panel"><p class="eyebrow">UN PASSO ALLA VOLTA</p><h2>Costruisci il tuo territorio.</h2><p class="muted">Parti dalle vie. Collega i civici, censisci gli interni e trasforma le informazioni in nuove relazioni.</p><div class="territory-steps">${[
        ["01", "Aggiungi una via", "streets"],
        ["02", "Conosci gli stabili", "buildings"],
        ["03", "Censisci gli appartamenti", "units"],
      ]
        .map(
          ([n, t, k]) =>
            `<button data-nav="${k}"><span>${n}</span>${t}${icon("arrow")}</button>`,
        )
        .join(
          "",
        )}</div><p class="small-note">I contatori mostrano solo dati reali della tua agenzia.</p></section></div>`;
    if (state.me.edition === 'elite') main.querySelector('.stats').insertAdjacentHTML('afterend', '<section class="panel remote-support-card" aria-labelledby="remote-support-title"><span class="remote-support-illustration">'+icon('support')+'</span><div><p class="eyebrow">INCLUSO DA ELITE · ANCHE SECRET PLAN</p><h2 id="remote-support-title">Assistenza remota</h2><p>Il team PRIME ti assiste da remoto su richiesta. Scarica il programma dal link e concorda la sessione con l’assistenza.</p></div><a class="primary remote-support-download" href="https://www.teamviewer.com/it/download/portal/" target="_blank" rel="noopener noreferrer">Apri assistenza remota ↗</a></section>');
    const draw = () => {
      const upcoming = d.activities
        .filter((x) => !finishedStatuses.has(x.status) && matches(x))
        .sort((a, b) => a.due_at.localeCompare(b.due_at));
      document.querySelector("#overview-list").innerHTML = upcoming.length
        ? upcoming
            .slice(0, 6)
            .map(
              (r) =>
                `<button class="overview-row" data-id="${r.id}"><span class="activity-mark">${icon("activities")}</span><span><strong>${esc(r.title)}</strong><small>${esc(r.activity_type)} · ${date(r.due_at)}</small></span><span class="pill">${esc(r.priority)}</span></button>`,
            )
            .join("")
        : empty(
            "Spazio alle prossime opportunità.",
            "Le attività WPS che aggiungi appariranno qui.",
          );
      document.querySelectorAll(".overview-row").forEach(
        (b) =>
          (b.onclick = () =>
            openEditor(
              "activities",
              d.activities.find((r) => r.id === b.dataset.id),
            )),
      );
    };
    draw();
    bindSearch(draw);
    document.querySelector("#quick-create").onclick = () =>
      openEditor("activities");
    main
      .querySelectorAll("[data-nav]")
      .forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
    await mountOperations({main,api,esc,state,openEditor,loadData,renderPage,toast});
    return;
  }
  if (schema[page]) {
    const def = schema[page];
    main.innerHTML =
      pageHeader(
        page === "activities"
          ? "PIANIFICA · AGISCI · MISURA"
          : page === "appointments"
            ? "IL TEMPO DELLE RELAZIONI"
            : "IL PATRIMONIO DELLA TUA AGENZIA",
        def.label,
        page === "activities"
          ? "Organizza il lavoro, registra gli esiti e prepara la prossima azione."
          : page === "appointments"
            ? "Appuntamenti condivisi con il WPS. Un solo evento, nessuna duplicazione."
            : "Dati collegati, informazioni sempre a portata di mano.",
        `<button class="primary" id="create">${icon("plus")} ${page === "activities" ? "Nuova attività" : page === "appointments" ? "Nuovo appuntamento" : "Aggiungi"}</button>`,
      ) +
    `<section class="panel records-panel"><div class="toolbar ${page === "contacts" ? "crm-toolbar" : ""}">${searchBox(page === "streets" ? "Cerca via, città, CAP o quartiere…" : page === "units" ? "Cerca via, civico, scala o interno…" : "Cerca in " + def.label.toLowerCase() + "…")}${["activities", "appointments"].includes(page) ? periodControls() : ""}${page === "streets" ? '<select id="status-filter" aria-label="Filtra stato censimento"><option value="">Tutti gli stati</option><option>da censire</option><option>parziale</option><option>censita</option></select>' : ""}${page === "contacts" ? `<label class="crm-type-filter">Tipo di contatto<select id="contact-type-filter" aria-label="Filtra per tipo di contatto"><option value="">Tutti i tipi</option>${schema.contacts.fields.contact_type.options.map((type) => `<option value="${esc(type)}" ${state.contactType === type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>` : ""}${page === "contacts" ? `<label class="checkbox-label crm-hot-filter"><input id="crm-hot-only" type="checkbox" ${state.onlyHotLeads ? "checked" : ""}>Solo lead caldi</label>` : ""}${["contacts", "properties", "buyer_profiles", "deals"].includes(page) ? `<label class="crm-type-filter">Agente<select id="assigned-agent-filter" aria-label="Filtra per agente"><option value="">Tutti gli agenti</option><option value="unassigned">Da assegnare</option>${state.members.map((member) => `<option value="${member.id}">${esc(member.title)}</option>`).join("")}</select></label>` : ""}<span id="result-count" class="muted"></span></div>${["activities", "appointments"].includes(page) ? '<p class="small-note">Il periodo parte dalla data selezionata. Senza data, sono visibili tutte le attività.</p>' : page === "viewing_feedback" ? '<p class="small-note">Completando una prima o seconda visita, PRIME crea qui la scheda feedback da compilare con impressioni, rifiuti e prossima azione.</p>' : page === "documents" ? '<p class="small-note">I PDF sono salvati nell’archivio privato dell’agenzia e serviti solo dopo autenticazione.</p>' : page === "signature_requests" ? '<p class="small-note">Firma veloce sul sito LetteraSenzaBusta oppure richieste di firma tramite Namirial dopo la configurazione API. Il registro non aggiorna automaticamente gli stati delle firme eseguite su siti esterni.</p>' : ""}<div id="record-list"></div></section>`;
    document.querySelector("#create").onclick = () => openEditor(page);
    if (page === "signature_requests") installNamirialPanel();
    bindSearch(drawRecords);
    if (["activities", "appointments"].includes(page)) bindPeriod(drawRecords);
    if (page === "streets")
      document.querySelector("#status-filter").onchange = (e) => {
        state.status = e.target.value;
        drawRecords();
      };
    if (page === "contacts")
      document.querySelector("#contact-type-filter").onchange = (event) => {
        state.contactType = event.target.value;
        drawRecords();
      };
    if (page === "contacts")
      document.querySelector("#crm-hot-only").onchange = (event) => {
        state.onlyHotLeads = event.target.checked;
        drawRecords();
      };
    if (["contacts", "properties", "buyer_profiles", "deals"].includes(page)) {
      const select = document.querySelector("#assigned-agent-filter");
      select.value =
        state.assignedAgentFilter ??
        (state.me.role === "agent" ? state.me.id : "");
      select.onchange = () => {
        state.assignedAgentFilter = select.value;
        drawRecords();
      };
    }
    drawRecords();
    return;
  }
  if (page === "connect") {
    await renderConnect({main,state,api,esc,pageHeader,toast});
    return;
  }
  if (page === "stripe") {
    await renderStripeAgency({main,state,api,esc,pageHeader,toast});
    return;
  }
  if (page === "portals") {
    await renderPortals({main,api,esc,toast});
    return;
  }
  if (page === "audit") {
    let list = await api("/api/audit");
    main.innerHTML =
      pageHeader(
        "TRACCIABILITÀ",
        "Registro attività",
        "Filtra le registrazioni per data e agente. Ogni riga conserva autore e ora dell’operazione.",
      ) +
      `<section class="panel audit-panel">${searchBox("Cerca azione, autore o record…")}<div class="audit-filters"><label>Dal<input id="audit-from" type="date"></label><label>Al<input id="audit-to" type="date"></label><label>Agente<select id="audit-agent"><option value="">Tutti gli agenti</option>${state.members.map(member => `<option value="${esc(member.id)}">${esc(member.title)}</option>`).join("")}</select></label><button type="button" class="text-button" id="audit-clear">Reimposta</button></div><div id="audit-list"></div></section>`;
    const draw = () =>
      (document.querySelector("#audit-list").innerHTML =
        list
          .filter(matches)
          .map(
            (r) =>
              `<div class="audit-row"><strong>${esc(r.action)}</strong><span>${esc(state.members.find(member => member.id === r.agent_id)?.title || r.email || "Utente")}</span><small>${date(r.created_at.endsWith("Z") ? r.created_at : r.created_at.replace(" ", "T") + "Z")}</small><code>${esc(r.record_id)}</code></div>`,
          )
          .join("") ||
        empty(
          "Nessuna operazione.",
          "Le modifiche vengono registrate automaticamente.",
        ));
    const dateBoundary = (value, end = false) => {
      if (!value) return "";
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(year, month - 1, day + (end ? 1 : 0));
      return date.toISOString();
    };
    const refreshAudit = async () => {
      const params = new URLSearchParams(), from = document.querySelector("#audit-from").value,
        to = document.querySelector("#audit-to").value, agent = document.querySelector("#audit-agent").value;
      if (from) params.set("from", dateBoundary(from));
      if (to) params.set("before", dateBoundary(to, true));
      if (agent) params.set("agent_id", agent);
      try { list = await api("/api/audit?" + params.toString()); draw(); }
      catch (error) { toast(error.message); }
    };
    draw();
    bindSearch(draw);
    document.querySelectorAll("#audit-from,#audit-to,#audit-agent").forEach(control => control.addEventListener("change", refreshAudit));
    document.querySelector("#audit-clear").onclick = () => {
      document.querySelector("#audit-from").value = "";
      document.querySelector("#audit-to").value = "";
      document.querySelector("#audit-agent").value = "";
      document.querySelector("#audit-agent").dispatchEvent(new Event("change", { bubbles: true }));
    };
    return;
  }
  if (page === "roadmap") {
    const phases = [
      [
        "01",
        "Fondamenta",
        "In corso",
        "Database con migrazioni, autenticazione, controlli tenant e ruoli, temi per utente, navigazione e ricerche. Mancano inviti, verifica email, recupero password, 2FA e console Super Admin.",
      ],
      [
        "02",
        "Gestione territoriale",
        "Parziale",
        "CRUD vie, civici e interni collegati; recapiti condominiali. Da completare gerarchia città/zone/scale/piani, censimento rapido, mappe, offline e ricerca salvata.",
      ],
      [
        "03",
        "Operatività e WPS",
        "Parziale",
        "Attività WPS assegnate, priorità, scadenze, obiettivi, avanzamento, esiti, prossime azioni e appuntamenti condivisi con controlli di sovrapposizione. CRM e immobili di base. Mancano ricorrenze, disponibilità, feedback e matching.",
      ],
      [
        "04",
        "Gestione commerciale",
        "Da sviluppare",
        "Trattative, offerte, contratti, locazioni, valutazioni, provvigioni, documenti e report approfonditi.",
      ],
      [
        "05",
        "Ecosistema",
        "Da sviluppare",
        "Didit, Stripe, calendari, portali, PRIME Connect, aree proprietari/acquirenti, AI Assistant e app mobile. Start €50/mese (2 utenti), Pro €100/mese (10 utenti), utenti oltre 10 €25/mese: fatturazione e limiti ancora da implementare.",
      ],
    ];
    main.innerHTML =
      pageHeader(
        "TRASPARENZA SUL PRODOTTO",
        "Il percorso di PRIME.",
        "Requisiti preservati. Stato dei flussi dichiarato senza simulazioni.",
      ) +
      `<section class="panel">${searchBox("Cerca modulo o funzionalità…")}<div id="roadmap-list"></div></section>`;
    const draw = () =>
      (document.querySelector("#roadmap-list").innerHTML = phases
        .filter((x) =>
          x.join(" ").toLowerCase().includes(state.query.toLowerCase()),
        )
        .map(
          ([n, title, status, text]) =>
            `<article class="roadmap-row"><span class="phase-number">${n}</span><div><h2>${title}</h2><p class="muted">${text}</p></div><span class="pill">${status}</span></article>`,
        )
        .join(""));
    draw();
    bindSearch(draw);
  }
}
function empty(title, description) {
  return `<div class="empty">${icon("units")}<h3>${title}</h3><p>${description}</p></div>`;
}
const columns = {
  streets: ["city", "district", "census_status"],
  buildings: ["street_id", "concierge_phone", "administrator_phone"],
  units: [
    "building_id",
    "staircase",
    "floor",
    "has_garage",
    "occupancy_status",
    "commercial_status",
    "acquisition_status",
  ],
  contacts: [
    "contact_type",
    "is_hot_lead",
    "assigned_agent_id",
    "email",
    "phone",
  ],
  properties: ["unit_id", "assigned_agent_id", "price", "marketing_status"],
  activities: ["activity_type", "agent_id", "due_at", "priority", "status"],
  appointments: [
    "starts_at",
    "ends_at",
    "agent_id",
    "status",
    "commercial_outcome",
  ],
  buyer_profiles: ["contact_id", "assigned_agent_id", "budget_max", "preferred_areas", "status"],
  viewing_feedback: ["visited_at", "contact_id", "property_id", "outcome", "second_visit"],
  deals: ["property_id", "contact_id", "assigned_agent_id", "stage", "expected_value"],
  offers: ["deal_id", "contact_id", "amount", "offer_type", "status", "valid_until"],
  valuations: ["property_id", "agent_id", "assessed_on", "low_value", "high_value", "status"],
  leases: ["property_id", "tenant_contact_id", "rent_monthly", "starts_on", "ends_on", "status"],
  commissions: ["deal_id", "agent_id", "expected_amount", "invoiced_amount", "collected_amount", "status"],
  documents: ["document_type", "property_id", "deal_id", "expires_on", "status"],
  signature_requests: ["document_id", "signer_contact_id", "provider", "signature_level", "signature_format", "status"],
};
function drawRecords() {
  const entity = state.page;
  let records = (state.data[entity] || []).filter(matches);
  if (entity === "contacts" && state.onlyHotLeads)
    records = records.filter((record) => Number(record.is_hot_lead) === 1);
  const agentFilter =
    state.assignedAgentFilter ?? (state.me.role === "agent" ? state.me.id : "");
  if (["contacts", "properties", "buyer_profiles", "deals"].includes(entity) && agentFilter)
    records = records.filter((record) =>
      agentFilter === "unassigned"
        ? !record.assigned_agent_id
        : record.assigned_agent_id === agentFilter,
    );
  if (entity === "contacts" && state.contactType)
    records = records.filter((r) => r.contact_type === state.contactType);
  if (entity === "streets" && state.status)
    records = records.filter((r) => r.census_status === state.status);
  if (entity === "activities")
    records = records
      .filter((r) => inPeriod(r.due_at))
      .sort((a, b) => a.due_at.localeCompare(b.due_at));
  if (entity === "appointments")
    records = records
      .filter((r) => inPeriod(r.starts_at))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const t=value=>window.primeI18n?.t(value)??value;
  document.querySelector("#result-count").textContent =
    records.length + " " + t(records.length===1?"risultato":"risultati");
  const out = document.querySelector("#record-list");
  out.innerHTML = records.length
    ? `<div class="table-wrap records-table-wrap"><table class="records-table"><thead><tr><th>${entity === "units" ? "Interno" : entity === "buildings" ? "Civico" : "Titolo"}</th>${columns[entity].map((k) => `<th>${schema[entity].fields[k].label}</th>`).join("")}<th><span class="sr-only">Azioni</span></th></tr></thead><tbody>${records.map((r) => `<tr data-record-status="${esc(r.status || r.marketing_status || "")}" data-record-stage="${esc(r.stage || "")}"><td><button class="record-open" data-id="${r.id}">${esc(r.title)}</button>${entity === "activities" ? `<small>${r.progress}/${r.goal} · ${esc(r.next_action || "Prossima azione da definire")}</small>` : ""}</td>${columns[entity].map((k) => `<td data-label="${schema[entity].fields[k].label}">${recordCell(entity, k, entity === "deals" && k === "stage" ? ({vinta:"conclusa",persa:"persa",annullata:"annullata"}[r.status] || r.stage) : r[k])}</td>`).join("")}<td><button class="text-button record-open" data-id="${r.id}" aria-label="Apri ${esc(r.title)}">Apri ↗</button>${entity === "signature_requests" && r.provider === "Namirial" && state.namirialConfigured ? `${r.status === "da configurare" || r.status === "bozza" ? `<button class="text-button" data-signature-action="send" data-id="${r.id}">Invia</button>` : `<button class="text-button" data-signature-action="refresh" data-id="${r.id}">Aggiorna</button>`}${r.provider_envelope_id ? `<button class="text-button" data-signature-action="link" data-id="${r.id}">Copia link</button>` : ""}` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : empty(
        state.query || (entity === "contacts" && state.contactType)
          ? "Nessun risultato."
          : "Il primo passo parte da qui.",
        state.query || (entity === "contacts" && state.contactType)
          ? "Prova a modificare la ricerca o seleziona Tutti i tipi."
          : "Aggiungi il primo elemento: verrà salvato nel database della tua agenzia.",
      );
  if (entity === "signature_requests") {
    out.querySelectorAll("[data-signature-action]").forEach((button) => {
      button.onclick = async () => {
        const id = button.dataset.id, action = button.dataset.signatureAction;
        button.disabled = true;
        try {
          if (action === "send") {
            if (!confirm("Inviare ora la richiesta di firma al cliente tramite Namirial? Namirial invierà una notifica all’indirizzo email salvato.")) return;
            await api(`/api/signatures/${encodeURIComponent(id)}/send`, { method: "POST", body: "{}" });
            await loadData(); drawRecords(); toast("Richiesta inviata tramite Namirial.");
          } else if (action === "refresh") {
            const result = await api(`/api/signatures/${encodeURIComponent(id)}/refresh`, { method: "POST", body: "{}" });
            await loadData(); drawRecords(); toast(`Stato Namirial aggiornato: ${result.status}.`);
          } else if (action === "link") {
            const result = await api(`/api/signatures/${encodeURIComponent(id)}/link`);
            await navigator.clipboard.writeText(result.url); toast("Link di firma copiato.");
          }
        } catch (error) { toast(error.message || "Operazione Namirial non riuscita."); }
        finally { button.disabled = false; }
      };
    });
  }
  out.querySelectorAll(".record-open").forEach(
    (b) =>
      (b.onclick = () =>
        openEditor(
          entity,
          state.data[entity].find((r) => r.id === b.dataset.id),
        )),
  );
}
const quickSignatureUrl = "https://www.letterasenzabusta.com/che_firma_digitale.html";
async function installNamirialPanel() {
  const section = document.querySelector(".records-panel");
  if (!section || section.dataset.namirialReady) return;
  section.dataset.namirialReady = "1";
  state.namirialConfigured = false;
  const letterPanel = document.createElement("section");
  letterPanel.className = "panel signature-provider-panel";
  letterPanel.innerHTML = '<p class="eyebrow">FIRMA VELOCE</p><h2 class="provider-brand-title"><span class="integration-brand-icon"><img src="/brands/providers/letterasenzabusta.png" alt="Logo LetteraSenzaBusta" width="28" height="28"></span><span>LetteraSenzaBusta · cheFIRMA!</span></h2><p>Firma online con pagamento a consumo. Apri cheFIRMA!, carica il documento e completa la firma sul sito del servizio.</p><div class="connect-actions"><a class="primary" href="' + quickSignatureUrl + '" target="_blank" rel="noopener noreferrer">Firma veloce con LetteraSenzaBusta ↗</a><button type="button" class="secondary" data-copy-letter-link>Copia link per il cliente</button></div><p class="small-note">Dopo la firma puoi caricare il PDF firmato nella sezione Documenti di PRIME.</p><p class="small-note" role="status"></p>';
  section.before(letterPanel);
  letterPanel.querySelector("[data-copy-letter-link]").onclick = async () => {
    const status = letterPanel.querySelector('[role="status"]');
    try {
      await navigator.clipboard.writeText(quickSignatureUrl);
      status.textContent = "Link copiato. Puoi condividerlo con il cliente.";
    } catch {
      status.textContent = "Copia questo link: " + quickSignatureUrl;
    }
  };
  const panel = document.createElement("section");
  panel.className = "panel signature-provider-panel";
  panel.innerHTML = '<p class="eyebrow">FIRMA DIGITALE · INTEGRAZIONE API</p><h2 class="provider-brand-title"><span class="integration-brand-icon"><img src="/brands/providers/namirial.svg" alt="Logo Namirial" width="116" height="28"></span><span>Namirial Sign Enterprise</span></h2><span class="pill">Da configurare</span><p>Collega Namirial Sign Enterprise per inviare richieste di firma e seguirne lo stato da PRIME. Occorre un account Namirial con accesso API abilitato.</p><p class="small-note" role="status">Controllo dello stato…</p>';
  section.before(panel);
  const status = panel.querySelector('[role="status"]');
  try {
    const cfg = await api("/api/signatures/settings");
    if (!section.isConnected) return;
    state.namirialConfigured = cfg.configured;
    panel.querySelector('.pill').textContent = cfg.configured ? "Configurato" : "Da configurare";
    status.textContent = cfg.configured ? "Credenziali API salvate per l’agenzia." : "Completa la guida per collegare il tuo account Namirial.";
    if (["owner", "manager"].includes(state.me.role)) {
      mountNamirialSetup(panel, cfg);
    } else if (!cfg.configured) {
      status.textContent = "Il titolare o il responsabile può configurare Namirial da questa pagina.";
    }
    if (state.page === "signature_requests") drawRecords();
  } catch (error) {
    status.textContent = error.message;
  }
}
function mountNamirialSetup(panel, cfg) {
  const endpoints = {
    demo: { api_base_url: "https://demo-eu-ie1-api.namirialsign.com/api/", token_url: "https://auth-preprod.namirial.app/realms/namirial/protocol/openid-connect/token" },
    production: { api_base_url: "", token_url: "https://auth.namirial.app/realms/namirial/protocol/openid-connect/token" },
  };
  const environment = cfg.environment === "production" ? "production" : "demo";
  panel.insertAdjacentHTML("beforeend", `<details class="namirial-setup" ${cfg.configured ? "" : "open"}><summary>${cfg.configured ? "Gestisci configurazione API Namirial" : "Collega Namirial · guida alla configurazione API"}</summary><ol class="namirial-steps"><li>Accedi alla tua istanza <strong>Namirial Sign Enterprise</strong> e verifica che il contratto includa le API. Usa l’ambiente demo per le prove.</li><li>Apri <strong>Organization Settings → Users → Service Accounts</strong> (Impostazioni organizzazione → Utenti → Account di servizio) e scegli <strong>Create Service Account</strong>. Copia il Client ID e il Client Secret: il secret viene mostrato una sola volta.</li><li>Recupera l’<strong>ID organizzazione</strong> e l’indirizzo API della tua istanza Namirial. Inserisci i dati qui sotto e controlla gli endpoint nelle Impostazioni tecniche.</li><li>Premi <strong>Verifica e salva collegamento</strong>. Poi carica il PDF in Documenti, crea una richiesta di firma, seleziona il firmatario e premi Invia. L’invio richiede una conferma.</li></ol><div class="connect-actions"><a class="text-button" href="https://docs.namirial.app/products/namirialsignenterprise/namirialsignenterprise-knowledge-center/03-developer-documentation/01-api-reference/authentication" target="_blank" rel="noopener noreferrer">Guida ufficiale: account di servizio e credenziali ↗</a><a class="text-button" href="https://www.namirial.it/gestione-pratiche-firma/" target="_blank" rel="noopener noreferrer">Account e abilitazione API Namirial ↗</a></div><form class="namirial-setup-form" id="namirial-settings"><label>Ambiente<select name="environment"><option value="demo" ${environment === "demo" ? "selected" : ""}>Demo · per provare</option><option value="production" ${environment === "production" ? "selected" : ""}>Produzione</option></select></label><label>ID organizzazione<input name="organization_id" required maxlength="500" value="${esc(cfg.organization_id || "")}" autocomplete="off" placeholder="ID della tua organizzazione"></label><label>Client ID<input name="client_id" required maxlength="500" value="${esc(cfg.client_id || "")}" autocomplete="off" placeholder="ID dell’account di servizio"></label><label>Client Secret <span data-secret-note>${cfg.client_secret_set ? "Già salvato · lascia vuoto per mantenerlo" : "Mostrato da Namirial alla creazione"}</span><input name="client_secret" type="password" maxlength="500" autocomplete="new-password" ${cfg.client_secret_set ? "" : "required"} data-no-voice="true" placeholder="Inserisci il Client Secret"></label><details class="namirial-advanced" ${environment === "production" && !cfg.api_base_url ? "open" : ""}><summary>Impostazioni tecniche · endpoint API e OAuth</summary><p>Gli indirizzi demo sono precompilati. In produzione inserisci l’URL API della tua istanza e verifica l’endpoint OAuth fornito da Namirial.</p><label>Indirizzo API<input name="api_base_url" type="url" required value="${esc(cfg.api_base_url || endpoints[environment].api_base_url)}" placeholder="https://…/api/" data-no-voice="true"></label><label>Indirizzo OAuth token<input name="token_url" type="url" required value="${esc(cfg.token_url || endpoints[environment].token_url)}" data-no-voice="true"></label></details><button class="primary" type="submit">Verifica e salva collegamento</button><p class="connect-feedback" role="status" aria-live="polite"></p></form><p class="small-note">Il Client Secret è cifrato nell’archivio dell’agenzia e non viene mostrato dopo il salvataggio. La verifica controlla il rilascio del token OAuth; abilitazioni e flusso di firma si verificano con una richiesta di prova.</p></details>`);
  const form = panel.querySelector("#namirial-settings");
  const feedback = form.querySelector('[role="status"]');
  const advanced = form.querySelector(".namirial-advanced");
  form.elements.environment.onchange = () => {
    const environment = form.elements.environment.value;
    form.elements.api_base_url.value = environment === cfg.environment && cfg.api_base_url ? cfg.api_base_url : endpoints[environment].api_base_url;
    form.elements.token_url.value = environment === cfg.environment && cfg.token_url ? cfg.token_url : endpoints[environment].token_url;
    form.elements.client_secret.value = "";
    form.elements.client_secret.required = !cfg.client_secret_set || environment !== cfg.environment;
    advanced.open = true;
  };
  form.addEventListener("invalid", () => { advanced.open = true; }, true);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    feedback.textContent = "Verifica delle credenziali OAuth Namirial…";
    try {
      const saved = await api("/api/signatures/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      if (!panel.isConnected) return;
      Object.assign(cfg, saved);
      state.namirialConfigured = saved.configured;
      form.elements.client_secret.required = false;
      form.querySelector('[data-secret-note]').textContent = "Già salvato · lascia vuoto per mantenerlo";
      panel.querySelector('.pill').textContent = saved.configured ? "Configurato" : "Da configurare";
      panel.querySelector('[role="status"]').textContent = "Credenziali API salvate per l’agenzia.";
      feedback.textContent = "Credenziali OAuth verificate e configurazione salvata. Puoi creare una richiesta di firma.";
      panel.querySelector('.namirial-setup > summary').textContent = "Gestisci configurazione API Namirial";
      if (state.page === "signature_requests") drawRecords();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      form.elements.client_secret.value = "";
      button.disabled = false;
    }
  };
}
async function openEditor(entity, record = null, prefill = {}) {
  if (
    !record &&
    ["contacts", "units", "properties"].includes(entity) &&
    state.me.role === "agent"
  )
    prefill = { assigned_agent_id: state.me.id, ...prefill };
  if (entity === "activities" && !record) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    prefill = {
      starts_at: start.toISOString(),
      due_at: new Date(+start + 3600000).toISOString(),
      ...prefill,
    };
  }
  const def = schema[entity],
    dialog = document.querySelector("#editor"),
    values = record ? { ...record, ...prefill } : prefill;
  function field(key, f) {
    if (entity === 'deals' && key === 'stage') f = { ...f, options: [...f.options, 'annullata'] };
    let v =
      values[key] ??
      f.default ??
      (f.type === "ref" && f.entity === "members"
        ? state.me.id
        : f.type === "number"
          ? 0
          : "");
    if (entity === 'deals' && key === 'stage' && values.status === 'annullata') v = 'annullata';
    let input;
    const props = `name="${key}" id="field-${key}" ${f.required ? "required" : ""}`;
    if (f.type === "ref") {
      input = `<select ${props}><option value="">${f.required ? "Seleziona…" : "Nessun collegamento"}</option>${(f.entity === "members" ? state.members.filter(member => (entity !== "activities" || member.id === state.me.id) && (entity !== "commissions" || ["owner", "agent"].includes(member.role))) : state.data[f.entity] || []).map((r) => `<option value="${r.id}" ${v === r.id ? "selected" : ""}>${esc(refLabel(f.entity, r.id))}${f.entity === "members" ? " · " + esc(roleLabels[r.role] || r.role) : ""}</option>`).join("")}</select>`;
    } else if (f.type === "select")
      input = `<select ${props}>${f.options.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o || "Non registrato")}</option>`).join("")}</select>`;
    else if (f.type === "textarea")
      input = `<textarea ${props} rows="3" maxlength="${f.max || 200}">${esc(v)}</textarea>`;
    else if (f.type === "checkbox")
      input = `<input ${props} type="checkbox" ${v ? "checked" : ""}>`;
    else {
      if (f.type === "datetime-local" && v) {
        const d = new Date(v);
        v = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
      }
      input = `<input ${props} type="${f.type}" value="${esc(v)}" ${f.type === "number" ? `min="${f.min || 0}" step="${f.integer ? "1" : "0.01"}"` : `maxlength="${f.max || 200}"`}>`;
    }
    return `<label class="${f.type === "textarea" ? "full" : f.type === "checkbox" ? "checkbox-label" : ""}" for="field-${key}">${f.label}${f.required ? ' <span aria-hidden="true">*</span>' : ""}${input}</label>`;
  }
  const canDelete = record && ["owner", "manager"].includes(state.me.role);
  dialog.innerHTML = `<form id="record-form"><header class="dialog-header"><div><p class="eyebrow">${def.label}</p><h2 id="editor-title">${record ? "Modifica" : "Nuovo elemento"} · ${esc(record?.title || def.singular)}</h2></div><button type="button" class="icon-button" id="close-editor" aria-label="Chiudi">×</button></header><div class="dialog-body"><p class="form-error error" role="alert" hidden></p><div class="form-grid">${Object.entries(
    def.fields,
  )
    .filter(([k]) => entity !== 'deals' || k !== 'status')
    .map(([k, f]) => field(k, f))
    .join(
      "",
    )}</div>${entity === "activities" ? '<p class="small-note">Completa il lavoro registrando l’esito. Usa “Collega appuntamento” per definire quando incontrare il cliente in agenda.</p>' : ""}${record ? `<p class="small-note">Aggiornato il ${date(record.updated_at)} · Versione ${record.version}</p><div id="history-content"></div>` : ""}</div><footer class="dialog-footer">${canDelete ? '<button type="button" class="danger" id="delete-record">Elimina</button>' : ""}${record ? '<button type="button" class="secondary" id="history">Cronologia</button>' : ""}${entity === "activities" && record ? '<button type="button" class="secondary" id="schedule">Collega appuntamento</button>' : ""}<button type="submit" class="primary">Salva</button></footer></form>`;
  let collectRecaps;
  if (entity === "contacts")
    collectRecaps = mountRepeatableRecaps({
      container: dialog.querySelector(".form-grid"),
      phoneInput: dialog.querySelector("[name=phone]"),
      esc,
      methods: (state.data.contact_methods || []).filter(
        (method) => method.contact_id === record?.id,
      ),
    });
  if (entity === "properties")
    mountPersonRecaps({ dialog, entity, record, state, esc, api, loadData });
  if (!dialog.open) dialog.showModal();
  if (entity === "appointments") {
    if(record?.meeting_url){
      const link=document.createElement('a');link.className='meeting-link';link.href=record.meeting_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Apri la videocall ↗';dialog.querySelector('.dialog-body').prepend(link);
    }
    const hint=document.createElement('p');hint.className='small-note';hint.textContent='Google Meet viene generato dopo il salvataggio e la sincronizzazione con il tuo Google Calendar. Per Calendly crea il link nella sezione PRIME Connect. Per una videocall già organizzata incolla il collegamento HTTPS.';dialog.querySelector('.dialog-body').append(hint);
    const quick = document.createElement("div");
    quick.className = "appointment-type-shortcuts";
    quick.innerHTML = `<span class="eyebrow">TIPO RAPIDO</span><div>${[
      ["1ª visita immobile", "1ª visita"],
      ["2ª visita immobile", "2ª visita"],
      ["servizio fotografico immobile", "Servizio fotografico"],
      ["appuntamento con proprietario", "Con proprietario"],
    ]
      .map(
        ([value, label]) =>
          `<button type="button" data-quick-type="${value}" class="${dialog.querySelector("[name=appointment_type]").value === value ? "selected" : ""}">${label}</button>`,
      )
      .join(
        "",
      )}</div><p>Il titolo è facoltativo: se lo lasci vuoto, viene usato il tipo di appuntamento.</p>`;
    dialog.querySelector(".form-grid").before(quick);
    const select = dialog.querySelector("[name=appointment_type]");
    const refresh = () =>
      quick
        .querySelectorAll("button")
        .forEach((b) =>
          b.classList.toggle("selected", b.dataset.quickType === select.value),
        );
    quick.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          const title = dialog.querySelector("[name=title]");
          if (title.value === select.value) title.value = "";
          select.value = b.dataset.quickType;
          refresh();
        }),
    );
    select.addEventListener("change", refresh);
  }
  if (entity === "contacts") {
    const hint = document.createElement("p");
    hint.className = "small-note";
    hint.textContent =
      "Preferenze e informazioni personali sono facoltative: annota dati pertinenti e forniti dal contatto.";
    dialog.querySelector(".dialog-body").append(hint);
    if(record && state.me.edition !== "base"){
      mountContactOutEnrichment({ dialog, record, methods: (state.data.contact_methods || []).filter((item) => item.contact_id === record.id), api, esc });
      const panel=document.createElement('section');panel.className='datagma-enrichment panel';panel.innerHTML=`<div><p class="eyebrow">RICERCA PROFESSIONALE</p><h3>Arricchisci con Datagma</h3><p class="small-note">PRIME invierà a Datagma l’email professionale oppure il profilo LinkedIn salvato. La ricerca può consumare crediti. Nessun risultato viene registrato senza la tua revisione e il successivo salvataggio della scheda.</p><label class="checkbox-label"><input type="checkbox" data-datagma-consent>Ho verificato che questa ricerca sia consentita e desidero inviare questi dati a Datagma.</label><button type="button" class="secondary" data-datagma-run ${record.do_not_contact?'disabled':''}>Cerca contatto</button><p class="small-note" role="status" data-datagma-status>${record.do_not_contact?'Ricerca disabilitata: il contatto ha chiesto di non essere ricontattato.':''}</p><div data-datagma-results></div></div>`;dialog.querySelector('.dialog-body').append(panel);
      const runSearch=panel.querySelector('[data-datagma-run]'),status=panel.querySelector('[data-datagma-status]'),results=panel.querySelector('[data-datagma-results]'),consent=panel.querySelector('[data-datagma-consent]');
      runSearch.onclick=async()=>{if(!consent.checked){status.textContent='Conferma di aver verificato la base giuridica e di poter condividere questi dati con Datagma.';return;}runSearch.disabled=true;status.textContent='Ricerca Datagma in corso…';results.replaceChildren();try{const result=await api('/api/connect/datagma/enrich',{method:'POST',body:JSON.stringify({contact_id:record.id})});const c=result.candidate||{};status.textContent=result.found?`Risultati trovati${c.credit_burn?` · crediti usati: ${esc(c.credit_burn)}`:''}. Seleziona cosa vuoi inserire, poi salva la scheda.`:'Datagma non ha trovato dati utilizzabili.';const suggestions=[];if(c.profession)suggestions.push({field:'profession',label:'Professione',value:c.profession});if(c.email)suggestions.push({field:'email',label:'Email professionale',value:c.email});for(const phone of c.phones||[])suggestions.push({field:'phone',label:phone.kind||'Telefono',value:phone.value,kind:phone.kind});if(c.linkedin)suggestions.push({field:'linkedin',label:'LinkedIn',value:c.linkedin});results.innerHTML=suggestions.map(item=>`<div class="datagma-result-row"><span><strong>${esc(item.label)}</strong><small>${esc(item.value)}</small></span><button type="button" class="text-button" data-apply="${esc(item.field)}" data-value="${esc(item.value)}" data-kind="${esc(item.kind||'')}">Inserisci</button></div>`).join('')||'';results.querySelectorAll('[data-apply]').forEach(button=>button.onclick=()=>{const value=button.dataset.value,field=button.dataset.apply;if(field==='profession'){const input=dialog.querySelector('[name="profession"]');if(!input.value.trim())input.value=value;else{status.textContent='Professione già presente: non è stata sovrascritta.';return;}}else if(field==='email'){const input=dialog.querySelector('[name="email"]');if(!input.value.trim())input.value=value;else{status.textContent='Email già presente: non è stata sovrascritta.';return;}}else if(field==='phone'){const primary=dialog.querySelector('[name="phone"]'),kind=button.dataset.kind||'Cell di lavoro';if(!primary.value.trim()){primary.value=value;const selector=dialog.querySelector('[name="phone_kind"]');if(selector)selector.value=kind;}else{dialog.querySelector('[data-add-phone]')?.click();const row=[...dialog.querySelectorAll('.repeatable-recap-row')].reverse().find(el=>el.querySelector('[data-recap-value]')&&!el.querySelector('[data-recap-value]').value);if(row){row.querySelector('[data-recap-value]').value=value;row.querySelector('[data-recap-type]').value=kind;}}}else if(field==='linkedin'){const exists=(state.data.contact_methods||[]).some(m=>m.contact_id===record.id&&m.method_type==='LinkedIn'&&m.value===value);if(exists){status.textContent='Questo profilo LinkedIn è già presente.';return;}dialog.querySelector('[data-add-social]')?.click();const row=[...dialog.querySelectorAll('.repeatable-recap-row')].reverse().find(el=>el.querySelector('[data-recap-value]')&&!el.querySelector('[data-recap-value]').value);if(row){row.querySelector('[data-recap-value]').value=value;row.querySelector('[data-recap-type]').value='LinkedIn';}}button.textContent='Inserito';button.disabled=true;});}catch(error){status.textContent=error.message;}finally{runSearch.disabled=false;}};
    }
  }
  if (entity === "documents" && record) {
    const uploadPanel = document.createElement("section");
    uploadPanel.className = "document-file-actions";
    uploadPanel.innerHTML = `<p class="small-note">PDF nell’archivio privato dell’agenzia · massimo 20 MB.</p><input id="document-file-input" type="file" accept="application/pdf,.pdf" hidden><button type="button" class="secondary" id="document-upload">${record.status === "disponibile" ? "Sostituisci PDF" : "Carica PDF"}</button>${record.status === "disponibile" ? ` <a class="text-button" href="/api/documents/${encodeURIComponent(record.id)}/content" target="_blank" rel="noopener noreferrer">Apri PDF ↗</a>` : ""}<p id="document-upload-status" class="small-note" role="status"></p>`;
    dialog.querySelector(".dialog-body").append(uploadPanel);
    const fileInput = uploadPanel.querySelector("#document-file-input"), uploadButton = uploadPanel.querySelector("#document-upload"), uploadStatus = uploadPanel.querySelector("#document-upload-status");
    uploadButton.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0]; if (!file) return;
      uploadButton.disabled = true; uploadStatus.textContent = "Caricamento PDF…";
      try {
        const response = await fetch(`/api/documents/${encodeURIComponent(record.id)}/content`, { method: "POST", headers: { "Content-Type": "application/pdf", "X-CSRF-Token": state.me.csrf }, body: file });
        const result = await response.json(); if (!response.ok) throw Error(result.error || "Caricamento non riuscito");
        await loadData(); const updated = state.data.documents.find((item) => item.id === record.id); Object.assign(record, updated);
        dialog.querySelector('[name="file_name"]').value = updated.file_name; dialog.querySelector('[name="file_reference"]').value = updated.file_reference; dialog.querySelector('[name="status"]').value = updated.status;
        uploadStatus.textContent = "PDF salvato nell’archivio privato."; uploadButton.textContent = "Sostituisci PDF";
        uploadPanel.querySelector("a")?.remove(); const link = document.createElement("a"); link.className="text-button"; link.href=`/api/documents/${encodeURIComponent(record.id)}/content`; link.target="_blank"; link.rel="noopener noreferrer"; link.textContent="Apri PDF ↗"; uploadButton.after(link);
      } catch (error) { uploadStatus.textContent = error.message; }
      finally { uploadButton.disabled = false; fileInput.value = ""; }
    };
  }
  if (entity === "buyer_profiles" && record) {
    const matchingPanel = document.createElement("section"); matchingPanel.className="buyer-matches panel";
    matchingPanel.innerHTML = `<button type="button" class="secondary" id="buyer-find-matches">Trova immobili compatibili</button><p class="small-note">Le preferenze non vengono modificate automaticamente. Gli immobili già rifiutati dopo una visita sono esclusi.</p><div id="buyer-match-results" aria-live="polite"></div>`;
    dialog.querySelector(".dialog-body").append(matchingPanel);
    matchingPanel.querySelector("#buyer-find-matches").onclick = async () => {
      const button=matchingPanel.querySelector("#buyer-find-matches"), results=matchingPanel.querySelector("#buyer-match-results"); button.disabled=true; results.textContent="Ricerca in corso…";
      try { const matches=await api(`/api/matching/${encodeURIComponent(record.id)}`); results.innerHTML=matches.length?matches.map((item)=>`<button type="button" class="buyer-match-row" data-property="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.address||"Indirizzo non indicato")} · ${money(item.price)} · ${item.area?esc(item.area)+" m²":"superficie non indicata"}${item.rooms?" · "+esc(item.rooms)+" locali":""}</span><small>${item.score}% · ${esc(item.quality)} · ${esc(item.reasons.join(" · "))}</small></button>`).join(""):`<p class="small-note">Nessun immobile disponibile corrisponde ai criteri registrati.</p>`; results.querySelectorAll("[data-property]").forEach((item)=>item.onclick=()=>{const property=state.data.properties.find((row)=>row.id===item.dataset.property);dialog.close();if(property)openEditor("properties",property);}); }
      catch(error){results.textContent=error.message;} finally{button.disabled=false;}
    };
  }
  if (entity === "signature_requests") {
    const hint = document.createElement("p"); hint.className = "small-note";
    hint.textContent = "Per usare Namirial, il titolare o responsabile configura prima le credenziali API nella pagina Firme elettroniche. Carica il PDF in Documenti e invia la richiesta al firmatario. In alternativa puoi usare il link a LetteraSenzaBusta per la firma veloce.";
    dialog.querySelector(".dialog-body").append(hint);
    if (record?.provider === "Namirial" && state.namirialConfigured) {
      const actions=document.createElement("section"); actions.className="panel signature-provider-panel";
      actions.innerHTML=`<h3>Firma Namirial</h3><p class="small-note" role="status"></p>${record.provider_envelope_id?'<button type="button" class="secondary" data-signature-refresh>Aggiorna stato</button> <button type="button" class="secondary" data-signature-link>Copia link di firma</button>':'<button type="button" class="primary" data-signature-send>Invia richiesta al firmatario</button>'}`;
      dialog.querySelector(".dialog-body").append(actions);
      const status=actions.querySelector('[role="status"]');
      actions.querySelector('[data-signature-send]')?.addEventListener('click',async()=>{if(!confirm('Inviare ora la richiesta al cliente? Namirial invierà la notifica all’indirizzo email del firmatario.'))return;const button=actions.querySelector('[data-signature-send]');button.disabled=true;status.textContent='Invio a Namirial…';try{await api(`/api/signatures/${encodeURIComponent(record.id)}/send`,{method:'POST',body:'{}'});status.textContent='Richiesta inviata. Aggiorna i dati per vedere lo stato.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
      actions.querySelector('[data-signature-refresh]')?.addEventListener('click',async()=>{const button=actions.querySelector('[data-signature-refresh]');button.disabled=true;try{const result=await api(`/api/signatures/${encodeURIComponent(record.id)}/refresh`,{method:'POST',body:'{}'});status.textContent=`Stato aggiornato: ${result.status}.`;await loadData();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
      actions.querySelector('[data-signature-link]')?.addEventListener('click',async()=>{const button=actions.querySelector('[data-signature-link]');button.disabled=true;try{const result=await api(`/api/signatures/${encodeURIComponent(record.id)}/link`);await navigator.clipboard.writeText(result.url);status.textContent='Link di firma copiato negli appunti.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    }
  }
  if (
    entity === "activities" &&
    record &&
    state.data.appointments.some((a) => a.activity_id === record.id)
  ) {
    dialog.querySelector("[name=starts_at]").disabled = true;
    dialog.querySelector("[name=due_at]").disabled = true;
    const hint = document.createElement("p");
    hint.className = "small-note";
    hint.textContent =
      "Orario condiviso con l’Agenda appuntamenti: usa “Collega appuntamento” per modificarlo.";
    dialog.querySelector(".dialog-body").append(hint);
  }
  document.querySelector("#close-editor").onclick = () => dialog.close();
  function showError(message) {
    const el = dialog.querySelector(".form-error");
    el.textContent = message;
    el.hidden = false;
    el.scrollIntoView({ block: "nearest" });
  }
  document.querySelector("#record-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.target.querySelector("[type=submit]");
    button.disabled = true;
    const data = {};
    for (const [key, f] of Object.entries(def.fields)) {
      if (entity === 'deals' && key === 'status') continue;
      const el = e.target.elements[key];
      data[key] =
        f.type === "checkbox"
          ? Number(el.checked)
          : f.type === "number"
            ? el.value === ""
              ? ""
              : Number(el.value)
            : el.value;
      if (f.type === "datetime-local" && data[key])
        data[key] = new Date(data[key]).toISOString();
    }
    if (entity === 'deals' && data.stage === 'annullata') { data.stage = 'persa'; data.status = 'annullata'; }
    try {
      const saved = await api(
        "/api/entities/" + entity + (record ? "/" + record.id : ""),
        {
          method: record ? "PUT" : "POST",
          body: JSON.stringify({
            data,
            version: record?.version,
            ...(collectRecaps ? { contact_methods: collectRecaps() } : {}),
          }),
        },
      );
      await loadData();
      if (["streets", "buildings", "units"].includes(entity))
        focusTerritoryRow(entity, saved);
      dialog.close();
      await renderPage();
      toast(entity === "appointments" && data.status === "effettuato" && ["1ª visita immobile", "2ª visita immobile"].includes(data.appointment_type) ? "Visita registrata. Completa il feedback nella sezione Feedback visite." : "Salvataggio completato.");
    } catch (ex) {
      showError(ex.message);
      button.disabled = false;
    }
  };
  if (canDelete)
    document.querySelector("#delete-record").onclick = async () => {
      if (
        !confirm(
          "Eliminare questo record? Le modifiche precedenti rimarranno nel registro.",
        )
      )
        return;
      try {
        await api("/api/entities/" + entity + "/" + record.id, {
          method: "DELETE",
          body: JSON.stringify({ version: record.version }),
        });
        await loadData();
        dialog.close();
        await renderPage();
        toast("Record eliminato.");
      } catch (e) {
        showError(e.message);
      }
    };
  if (record)
    document.querySelector("#history").onclick = async () => {
      try {
        const history = await api(
          `/api/entities/${entity}/${record.id}/history`,
        );
        document.querySelector("#history-content").innerHTML =
          `<h3>Cronologia delle versioni</h3>${history
            .map(
              (h) =>
                `<details><summary>Versione ${h.version} · ${date(h.created_at)}</summary><dl>${Object.keys(
                  def.fields,
                )
                  .map(
                    (k) =>
                      `<dt>${def.fields[k].label}</dt><dd>${esc(displayValue(entity, k, h.snapshot[k]))}</dd>`,
                  )
                  .join("")}</dl></details>`,
            )
            .join("")}`;
      } catch (e) {
        showError(e.message);
      }
    };
  if (entity === "activities" && record)
    document.querySelector("#schedule").onclick = () => {
      const existing = state.data.appointments.find(
        (a) => a.activity_id === record.id,
      );
      if (existing) {
        openEditor("appointments", existing);
        return;
      }
      const start = new Date(record.starts_at),
        end = new Date(record.due_at);
      openEditor("appointments", null, {
        title: record.title,
        activity_id: record.id,
        agent_id: record.agent_id,
        contact_id: record.contact_id,
        property_id: record.property_id,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
      });
    };
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const results = document.querySelector("#global-results");
    if (results) results.hidden = true;
  }
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    document.querySelector("#global-search")?.focus();
  }
});
async function boot() {
  try {
    state.me = await api("/api/me");
    await initializeAppLanguage(state.me);
    state.clockOffset = (state.me.server_now || Date.now()) - Date.now();
    document.documentElement.dataset.theme = state.me.theme;
    if (state.me.role === "external") {
      shell();
      document.querySelector("#main").innerHTML = pageHeader(
        "ACCESSO LIMITATO",
        "Area esterna in preparazione.",
        "Il tuo ruolo non consente l’accesso ai dati operativi dell’agenzia.",
      );
      return;
    }
    await loadData();
    shell();
    await renderPage();
    if (state.me.edition !== "base") startMailNotifications();
    stopDocumentRenewalNotifications?.();
    stopDocumentRenewalNotifications = startDocumentRenewalNotifications({state,api});
    startBreakReminders();
  } catch (e) {
    if (e.status === 401) auth();
    else {
      app.innerHTML = `<main class="fatal"><h1>Impossibile aprire PRIME</h1><p role="alert">${esc(e.message)}</p><button id="retry" class="primary">Riprova</button></main>`;
      document.querySelector("#retry").onclick = boot;
    }
  }
}
function mountMailInbox() {
  const inbox = document.createElement("div");
  inbox.className = "mail-inbox";
  inbox.innerHTML = `<button id="mail-inbox-toggle" aria-expanded="false" aria-controls="mail-inbox-panel" aria-label="Inbox email">${icon("mail")}<span>Inbox</span><b id="mail-inbox-count" hidden>0</b></button><section id="mail-inbox-panel" aria-label="Notifiche email" hidden><header><strong>Inbox · Notifiche email</strong><button id="mail-inbox-close" class="icon-button" aria-label="Chiudi inbox">×</button></header><div id="mail-inbox-items"><p>Caricamento…</p></div><footer><button id="mail-inbox-all" class="text-button">Apri tutte le email →</button><small>Solo mittente e oggetto</small></footer></section>`;
  document.querySelector("#theme").before(inbox);
  const toggle = inbox.querySelector("#mail-inbox-toggle"), panel = inbox.querySelector("#mail-inbox-panel");
  const close = () => { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) refreshMailInbox(); };
  inbox.querySelector("#mail-inbox-close").onclick = () => { close(); toggle.focus(); };
  inbox.querySelector("#mail-inbox-all").onclick = () => { close(); navigate("mail"); };
  inbox.addEventListener("keydown", event => { if (event.key === "Escape") { close(); toggle.focus(); } });
  inbox.addEventListener("focusout", event => { if (!inbox.contains(event.relatedTarget)) close(); });
  refreshMailInbox();
}
function mountAssistantChatWidget() {
  if (!state.me || state.me.role === "external") return;
  if (state.assistantWidgetResizeHandler) window.removeEventListener("resize", state.assistantWidgetResizeHandler);
  const root = document.createElement("div");
  root.className = "assistant-chat-widget";
  root.innerHTML = `<button id="assistant-chat-fab" class="assistant-chat-fab" type="button" aria-label="Apri la chat con Veronica" aria-expanded="${state.assistantWidgetOpen}" title="Trascina per spostare · clicca per chattare"><img src="${assistantAvatarThumbSrc()}" alt="Volto di Veronica" decoding="async"></button><section id="assistant-chat-panel" class="assistant-chat-panel" role="dialog" aria-label="Chat con Veronica" ${state.assistantWidgetOpen ? "" : "hidden"}><header class="assistant-chat-header"><img src="${assistantAvatarSrc()}" alt="Veronica" loading="lazy" decoding="async"><div><strong>Veronica</strong><p class="assistant-chat-intro-message">Ciao! 😊 Sono qui per aiutarti con la tua agenzia. Da dove cominciamo?</p></div><button id="assistant-chat-close" type="button" class="icon-button" aria-label="Chiudi la chat">×</button></header><div id="assistant-chat-thread" class="assistant-chat-thread" aria-live="polite"></div><div class="assistant-chat-actions" role="group" aria-label="Azioni rapide di Veronica">${assistantShortcutsMarkup(true)}</div><form id="assistant-chat-form" class="assistant-chat-form"><textarea id="assistant-chat-question" rows="2" maxlength="2000" aria-label="Scrivi a Veronica" placeholder="Scrivimi qui…" required></textarea><button class="primary" type="submit" aria-label="Invia messaggio">Invia</button></form><p class="assistant-chat-footnote">Feedback sull’app visibile allo sviluppatore PRIME</p></section>`;
  app.append(root);

  const fab = root.querySelector("#assistant-chat-fab");
  const panel = root.querySelector("#assistant-chat-panel");
  const thread = root.querySelector("#assistant-chat-thread");
  const form = root.querySelector("#assistant-chat-form");
  const question = root.querySelector("#assistant-chat-question");
  const size = 64;
  const positionKey = `prime-assistant-chat-position-v2:${state.me.id}`;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(positionKey) || "null"); } catch { /* Use the default corner. */ }
  let x = Number.isFinite(saved?.x) ? saved.x * Math.max(0, innerWidth - size) : innerWidth - size - 24;
  let y = Number.isFinite(saved?.y) ? saved.y * Math.max(0, innerHeight - size) : innerHeight - size - 24;
  const clampPosition = () => {
    x = Math.max(12, Math.min(x, innerWidth - size - 12));
    y = Math.max(12, Math.min(y, innerHeight - size - 12));
  };
  const place = () => {
    clampPosition();
    root.style.left = `${x}px`;
    root.style.top = `${y}px`;
    if (!panel.hidden) {
      const { width, height } = panel.getBoundingClientRect();
      const left = x + size + 12 + width <= innerWidth - 12 ? x + size + 12 : x - width - 12;
      panel.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(y + size - height, innerHeight - height - 12))}px`;
    }
  };
  const draw = () => {
    if (state.assistantMessages.length) drawAssistantMessages(thread);
    else thread.replaceChildren();
  };
  const setOpen = (open) => {
    state.assistantWidgetOpen = open;
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? "Chiudi la chat con Veronica" : "Apri la chat con Veronica");
    if (open) { draw(); place(); question.focus(); }
  };

  place();
  if (state.assistantWidgetOpen) draw();
  fab.addEventListener("click", () => setOpen(!state.assistantWidgetOpen));
  root.querySelector("#assistant-chat-close").addEventListener("click", () => setOpen(false));
  bindAssistantShortcuts(panel, question);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setOpen(false); fab.focus(); }
  });

  let pointerId = null, pointerX = 0, pointerY = 0, originX = 0, originY = 0;
  let dragged = false, suppressClick = false;
  fab.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointerId = event.pointerId;
    pointerX = event.clientX;
    pointerY = event.clientY;
    originX = x;
    originY = y;
    dragged = false;
    fab.setPointerCapture(event.pointerId);
  });
  fab.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - pointerX, dy = event.clientY - pointerY;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged = true;
    if (!dragged) return;
    x = originX + dx;
    y = originY + dy;
    place();
  });
  const finishDrag = (event) => {
    if (event.pointerId !== pointerId) return;
    if (dragged) {
      suppressClick = true;
      try { localStorage.setItem(positionKey, JSON.stringify({ x: x / Math.max(1, innerWidth - size), y: y / Math.max(1, innerHeight - size) })); } catch { /* Position remains until the page reloads. */ }
    }
    pointerId = null;
  };
  fab.addEventListener("pointerup", finishDrag);
  fab.addEventListener("pointercancel", finishDrag);
  fab.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, true);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const value = question.value.trim(), submit = form.querySelector("button[type=submit]");
    if (!value || submit.disabled) return;
    state.assistantMessages.push({ role: "user", content: value });
    state.assistantTyping = true;
    draw();
    question.value = "";
    question.disabled = true;
    submit.disabled = true;
    try {
      const [result] = await Promise.all([
        api("/api/assistant/chat", {
          method: "POST",
          body: JSON.stringify({ messages: assistantRequestMessages() }),
        }),
        assistantReplyDelay(),
      ]);
      state.assistantTyping = false;
      state.assistantMessages.push({ ...result, role: "assistant", content: result.message });
      draw();
    } catch (error) {
      state.assistantTyping = false;
      state.assistantMessages.pop();
      question.value = value;
      draw();
      toast(error.message);
    } finally {
      state.assistantTyping = false;
      question.disabled = false;
      submit.disabled = false;
      question.focus();
    }
  });

  state.assistantWidgetResizeHandler = place;
  window.addEventListener("resize", place);
}
function drawMailInbox(items) {
  items = [...items].sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at));
  const list = document.querySelector("#mail-inbox-items"), count = document.querySelector("#mail-inbox-count"), toggle = document.querySelector("#mail-inbox-toggle");
  if (!list || !count || !toggle) return;
  count.textContent = items.length; count.hidden = !items.length;
  toggle.setAttribute("aria-label", `Inbox email, ${items.length} notifiche`);
  const providers = {gmail:"Gmail",outlook:"Outlook"};
  list.innerHTML = items.map(item => `<a class="mail-inbox-item" href="${esc(item.provider_url)}" target="_blank" rel="noopener noreferrer"><div><span>${esc(providers[item.provider] || "Email")}</span><time>${esc(new Date(item.received_at).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT'), {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}))}</time></div><strong>${esc(item.sender)}</strong><p>${esc(item.subject || "Senza oggetto")}</p><small>${esc(item.account_label)} · Apri email ↗</small></a>`).join("") || `<div class="mail-inbox-empty">${icon("mail")}<strong>Nessuna notifica email</strong><p>Le notifiche degli account collegati compariranno qui. Gestisci i collegamenti dalla pagina Email.</p></div>`;
}
async function refreshMailInbox() {
  try { drawMailInbox(await api("/api/connect/mail-notifications")); }
  catch { const list = document.querySelector("#mail-inbox-items"); if (list) list.innerHTML = '<p>Impossibile aggiornare le notifiche. Riapri l’inbox per riprovare.</p>'; }
}
let mailNotificationTimer,mailNotificationSince=0,mailNotificationBusy=false;
function startMailNotifications(){
  clearInterval(mailNotificationTimer);
  mailNotificationSince=Date.now();
  async function check(){
    if(!state.me||mailNotificationBusy)return;
    mailNotificationBusy=true;
    try{
      const items=await api('/api/connect/mail-notifications'),fresh=items.filter(item=>Date.parse(item.notified_at)>mailNotificationSince).sort((a,b)=>a.notified_at.localeCompare(b.notified_at));
      drawMailInbox(items);
      mailNotificationSince=Date.now();
      const item=fresh.at(-1);if(!item)return;
      let alert=document.querySelector('#mail-live-alert');
      if(!alert){alert=document.createElement('aside');alert.id='mail-live-alert';alert.className='mail-live-alert';alert.setAttribute('role','status');document.body.append(alert);}
      const provider={gmail:'Gmail',outlook:'Outlook'}[item.provider]||'Email';
      alert.innerHTML=`<span class="mail-alert-dot" aria-hidden="true"></span><div><strong>Nuova email · ${esc(provider)}</strong><p><b>${esc(item.sender)}</b><br>${esc(item.subject)}</p></div><a href="${esc(item.provider_url)}" target="_blank" rel="noopener noreferrer">Apri email ↗</a><button type="button" aria-label="Chiudi notifica">×</button>`;
      alert.querySelector('button').onclick=()=>alert.remove();
      clearTimeout(state.mailNotificationHide);state.mailNotificationHide=setTimeout(()=>alert.remove(),15000);
    }catch(error){if(error.status===401)clearInterval(mailNotificationTimer);}finally{mailNotificationBusy=false;}
  }
  mailNotificationTimer=setInterval(check,30000);
}
startCustomSelects();
startVoiceInput();
boot();
