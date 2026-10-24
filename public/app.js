import { schema, roleLabels } from "./schema.js";
import { renderPlanner } from "./planner-view.js";
import { startWpsClock } from "./wps-clock.js";
import { finishedStatuses } from "./planner.js";
import { renderTerritory } from "./territory.js";
import { mountPersonRecaps } from "./person-recaps.js";
import { startVoiceInput } from "./voice-input.js";
let stopWpsClock;
const app = document.querySelector("#app");
const state = {
  me: null,
  page: "dashboard",
  data: {},
  members: [],
  query: "",
  day: "",
  span: "week",
  status: "",
  globalSeq: 0,
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
  connect: "M8 12h8M9 6l-3-3-4 4 3 3m10 8 3 3 4-4-3-3M7 7l10 10",
  audit: "M5 3h14v18H5zM9 7h6m-6 5h6m-6 5h4",
  roadmap: "M4 21V4m0 1c5-6 11 6 16 0v10c-5 6-11-6-16 0",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  menu: "M4 6h16M4 12h16M4 18h16",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.units}"/></svg>`;
const logo = () =>
  `<img class="brand-image" src="/assets/logo-${state.me?.theme || "dark"}.png" alt="PRIME — logo ufficiale">`;
const date = (x) =>
  x
    ? new Intl.DateTimeFormat("it-IT", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(x))
    : "";
const money = (x) =>
  new Intl.NumberFormat("it-IT", {
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
function localDay(x = new Date()) {
  const d = new Date(x);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
function refLabel(entity, id) {
  if (!id) return "—";
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
        row.staircase ? "Scala " + row.staircase : "",
        row.floor ? "Piano " + row.floor : "",
        "Interno " + row.title,
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
  if (key === "price") return money(value);
  return value || "—";
}
function auth(mode = "login", error = "") {
  stopWpsClock?.();
  state.me = null;
  document.documentElement.dataset.theme = "dark";
  app.innerHTML = `<main class="auth"><section class="auth-story"><div class="auth-brand">${logo()}</div><div><p class="eyebrow">IL TUO LAVORO. UNA NUOVA PROSPETTIVA.</p><h1>Il territorio diventa<br>opportunità.</h1><p class="lead">Persone, immobili e attività.<br>Uno spazio per farli crescere insieme.</p></div><footer>PRIME <span>GESTIONE IMMOBILIARE</span></footer></section><section class="auth-panel"><div class="auth-form"><span class="eyebrow">IL TUO SPAZIO OPERATIVO</span><h2>${mode === "register" ? "Benvenuto in PRIME." : "Bentornato."}</h2><p class="muted">${mode === "register" ? "Crea l’ambiente indipendente della tua agenzia." : "Accedi al workspace della tua agenzia."}</p><form id="auth-form"><div class="error" role="alert" ${error ? "" : "hidden"}>${esc(error)}</div>${mode === "register" ? '<label>Nome agenzia<input name="agency" required maxlength="120" autocomplete="organization"></label>' : ""}<label>Email<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Password<input name="password" type="password" autocomplete="${mode === "register" ? "new-password" : "current-password"}" minlength="12" maxlength="128" required></label><small>Da 12 a 128 caratteri.</small><button class="primary wide" type="submit">${mode === "register" ? "Crea la tua agenzia" : "Accedi"} ${icon("arrow")}</button></form><p class="auth-switch">${mode === "register" ? "Hai già un account?" : "Nuova agenzia?"} <button id="auth-toggle" class="text-button">${mode === "register" ? "Accedi" : "Crea il tuo spazio"}</button></p><p class="setup-note">Versione di sviluppo locale. Verifica email, recupero password, 2FA e verifica aziendale Didit non ancora configurati.</p></div></section></main>`;
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
      await api("/api/auth", {
        method: "POST",
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(form)),
          mode,
        }),
      });
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      button.disabled = false;
    }
  };
}
async function loadData() {
  const entries = await Promise.all(
    Object.keys(schema).map(async (k) => [k, await api("/api/entities/" + k)]),
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
const navigation = [
  ["dashboard", "Panoramica"],
  ["territory", "Vie e territorio"],
  ["contacts", "CRM · Persone"],
  ["properties", "Immobili in gestione"],
  ["activities", "WPS"],
  ["appointments", "Agenda appuntamenti"],
  ["connect", "PRIME Connect"],
  ["roadmap", "Stato sviluppo"],
];
function shell() {
  stopWpsClock?.();
  document.documentElement.dataset.theme = state.me.theme;
  app.innerHTML = `<a class="skip" href="#main">Vai al contenuto</a><div class="workspace"><aside class="sidebar"><div class="brand">${logo()}</div><p class="sidebar-label">WORKSPACE</p><nav aria-label="Navigazione principale">${navigation.map(([k, label]) => `<button data-page="${k}" class="nav-item ${state.page === k ? "active" : ""}">${icon(k)}<span>${label}</span>${k === "activities" ? '<span class="nav-dot"></span>' : ""}</button>`).join("")}${["owner", "manager"].includes(state.me.role) ? `<button data-page="audit" class="nav-item">${icon("audit")}<span>Registro attività</span></button>` : ""}</nav><div class="sidebar-bottom"><div class="avatar">${esc(state.me.tenant.slice(0, 2).toUpperCase())}</div><div><strong>${esc(state.me.tenant)}</strong><small>${roleLabels[state.me.role]}</small></div><button id="logout" title="Esci" aria-label="Esci">↗</button></div></aside><div class="main-wrap"><header class="topbar"><button class="icon-button" id="menu" aria-label="Apri o chiudi menu" aria-expanded="true">${icon("menu")}</button><div class="global-search">${icon("search")}<input id="global-search" aria-label="Ricerca universale" placeholder="Cerca in tutto PRIME…" autocomplete="off"><span class="key-hint">/</span><div id="global-results" class="search-results" hidden></div></div><button id="theme" class="icon-button" aria-label="${state.me.theme === "dark" ? "Attiva tema chiaro" : "Attiva tema scuro"}">${icon("sun")}</button><span class="workspace-badge">AMBIENTE LOCALE</span></header><main id="main" tabindex="-1"></main><footer class="main-footer">PRIME <span>Uno spazio, tutte le connessioni.</span><span>Versione 0.4 · Sviluppo</span></footer></div></div><div id="notice" role="status" hidden></div><dialog id="editor" aria-labelledby="editor-title"></dialog>`;
  const compactBrand = document.createElement("div");
  compactBrand.className = "compact-brand";
  compactBrand.innerHTML = logo();
  document.querySelector(".global-search").before(compactBrand);
  if (innerWidth < 850)
    document.querySelector("#global-search").placeholder = "Cerca…";
  document.querySelector(".workspace-badge").textContent =
    state.me.environment === "demo"
      ? "DEMO · DATI DI ESEMPIO"
      : "AMBIENTE LOCALE";
  if (state.me.environment === "demo") {
    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.textContent =
      "AMBIENTE DEMO · Dati di esempio in un database separato";
    document.querySelector(".topbar").after(banner);
  }
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
  const main = document.querySelector("#main"),
    page = state.page;
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
  if (["activities", "appointments"].includes(page)) {
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
      ]
        .map(
          ([label, n, key]) =>
            `<button class="stat" data-nav="${key}"><span>${label}</span><strong>${n}</strong><span class="stat-bottom">Apri sezione ${icon("arrow")}</span></button>`,
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
      `<section class="panel records-panel"><div class="toolbar">${searchBox(page === "streets" ? "Cerca via, città, CAP o quartiere…" : page === "units" ? "Cerca via, civico, scala, piano o interno…" : "Cerca in " + def.label.toLowerCase() + "…")}${["activities", "appointments"].includes(page) ? periodControls() : ""}${page === "streets" ? '<select id="status-filter" aria-label="Filtra stato censimento"><option value="">Tutti gli stati</option><option>da censire</option><option>parziale</option><option>censita</option></select>' : ""}${page === "contacts" ? `<label class="crm-type-filter">Tipo di contatto<select id="contact-type-filter" aria-label="Filtra per tipo di contatto"><option value="">Tutti i tipi</option>${schema.contacts.fields.contact_type.options.map((type) => `<option value="${esc(type)}" ${state.contactType === type ? "selected" : ""}>${esc(type)}</option>`).join("")}</select></label>` : ""}<span id="result-count" class="muted"></span></div>${["activities", "appointments"].includes(page) ? '<p class="small-note">Il periodo parte dalla data selezionata. Senza data, sono visibili tutte le attività.</p>' : ""}<div id="record-list"></div></section>`;
    document.querySelector("#create").onclick = () => openEditor(page);
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
    drawRecords();
    return;
  }
  if (page === "connect") {
    const list = await api("/api/integrations");
    main.innerHTML =
      pageHeader(
        "ECOSISTEMA",
        "PRIME Connect",
        "Stato effettivo delle connessioni esterne.",
      ) +
      `<section class="panel">${searchBox("Cerca un’integrazione…")}<div id="connect-list" class="connect-grid"></div><p class="small-note">Nessun servizio esterno è attivo. Le connessioni saranno disponibili dopo implementazione, credenziali e verifica del fornitore.</p></section>`;
    const draw = () =>
      (document.querySelector("#connect-list").innerHTML =
        list
          .filter(matches)
          .map(
            (r) =>
              `<article class="integration"><span class="integration-symbol">${icon("connect")}</span><h3>${esc(r.name)}</h3><span class="pill">${r.status}</span></article>`,
          )
          .join("") ||
        empty("Nessuna integrazione trovata.", "Prova un’altra ricerca."));
    draw();
    bindSearch(draw);
    return;
  }
  if (page === "audit") {
    const list = await api("/api/audit");
    main.innerHTML =
      pageHeader(
        "TRACCIABILITÀ",
        "Registro attività",
        "Ultime 200 operazioni della tua agenzia.",
      ) +
      `<section class="panel">${searchBox("Cerca azione, autore o record…")}<div id="audit-list"></div></section>`;
    const draw = () =>
      (document.querySelector("#audit-list").innerHTML =
        list
          .filter(matches)
          .map(
            (r) =>
              `<div class="audit-row"><strong>${esc(r.action)}</strong><span>${esc(r.email)}</span><small>${date(r.created_at.endsWith("Z") ? r.created_at : r.created_at.replace(" ", "T") + "Z")}</small><code>${esc(r.record_id)}</code></div>`,
          )
          .join("") ||
        empty(
          "Nessuna operazione.",
          "Le modifiche vengono registrate automaticamente.",
        ));
    draw();
    bindSearch(draw);
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
    "occupancy_status",
    "commercial_status",
    "acquisition_status",
  ],
  contacts: ["contact_type", "is_hot_lead", "email", "phone"],
  properties: ["unit_id", "price", "marketing_status"],
  activities: ["activity_type", "agent_id", "due_at", "priority", "status"],
  appointments: [
    "starts_at",
    "ends_at",
    "agent_id",
    "status",
    "commercial_outcome",
  ],
};
function drawRecords() {
  const entity = state.page;
  let records = (state.data[entity] || []).filter(matches);
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
  document.querySelector("#result-count").textContent =
    records.length + " risultati";
  const out = document.querySelector("#record-list");
  out.innerHTML = records.length
    ? `<div class="table-wrap"><table><thead><tr><th>${entity === "units" ? "Interno" : entity === "buildings" ? "Civico" : "Titolo"}</th>${columns[entity].map((k) => `<th>${schema[entity].fields[k].label}</th>`).join("")}<th><span class="sr-only">Azioni</span></th></tr></thead><tbody>${records.map((r) => `<tr><td><button class="record-open" data-id="${r.id}">${esc(r.title)}</button>${entity === "activities" ? `<small>${r.progress}/${r.goal} · ${esc(r.next_action || "Prossima azione da definire")}</small>` : ""}</td>${columns[entity].map((k) => `<td data-label="${schema[entity].fields[k].label}">${k.includes("status") || k === "priority" || k === "is_hot_lead" ? `<span class="pill ${k === "is_hot_lead" && Number(r[k]) === 1 ? "spot-badge spot-hot" : ""} ${["completata", "effettuato", "censita"].includes(r[k]) ? "positive" : ""}">${k === "is_hot_lead" ? (Number(r[k]) === 1 ? "✓ Lead caldo" : "—") : esc(displayValue(entity, k, r[k]))}</span>` : esc(displayValue(entity, k, r[k]))}</td>`).join("")}<td><button class="text-button record-open" data-id="${r.id}" aria-label="Apri ${esc(r.title)}">Apri ↗</button></td></tr>`).join("")}</tbody></table></div>`
    : empty(
        state.query || (entity === "contacts" && state.contactType)
          ? "Nessun risultato."
          : "Il primo passo parte da qui.",
        state.query || (entity === "contacts" && state.contactType)
          ? "Prova a modificare la ricerca o seleziona Tutti i tipi."
          : "Aggiungi il primo elemento: verrà salvato nel database della tua agenzia.",
      );
  out.querySelectorAll(".record-open").forEach(
    (b) =>
      (b.onclick = () =>
        openEditor(
          entity,
          state.data[entity].find((r) => r.id === b.dataset.id),
        )),
  );
}
async function openEditor(entity, record = null, prefill = {}) {
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
    values = record || prefill;
  function field(key, f) {
    let v =
      values[key] ??
      f.default ??
      (f.type === "ref" && f.entity === "members"
        ? state.me.id
        : f.type === "number"
          ? 0
          : "");
    let input;
    const props = `name="${key}" id="field-${key}" ${f.required ? "required" : ""}`;
    if (f.type === "ref") {
      input = `<select ${props}><option value="">${f.required ? "Seleziona…" : "Nessun collegamento"}</option>${(f.entity === "members" ? state.members : state.data[f.entity] || []).map((r) => `<option value="${r.id}" ${v === r.id ? "selected" : ""}>${esc(refLabel(f.entity, r.id))}</option>`).join("")}</select>`;
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
    .map(([k, f]) => field(k, f))
    .join(
      "",
    )}</div>${entity === "activities" ? '<p class="small-note">Completa il lavoro registrando l’esito. Usa “Collega appuntamento” per definire quando incontrare il cliente in agenda.</p>' : ""}${record ? `<p class="small-note">Aggiornato il ${date(record.updated_at)} · Versione ${record.version}</p><div id="history-content"></div>` : ""}</div><footer class="dialog-footer">${canDelete ? '<button type="button" class="danger" id="delete-record">Elimina</button>' : ""}${record ? '<button type="button" class="secondary" id="history">Cronologia</button>' : ""}${entity === "activities" && record ? '<button type="button" class="secondary" id="schedule">Collega appuntamento</button>' : ""}<button type="submit" class="primary">Salva</button></footer></form>`;
  if (entity === "properties" || entity === "contacts")
    mountPersonRecaps({ dialog, entity, record, state, esc, api, loadData });
  if (!dialog.open) dialog.showModal();
  if (entity === "appointments") {
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
    try {
      const saved = await api(
        "/api/entities/" + entity + (record ? "/" + record.id : ""),
        {
          method: record ? "PUT" : "POST",
          body: JSON.stringify({ data, version: record?.version }),
        },
      );
      await loadData();
      if (["streets", "buildings", "units"].includes(entity))
        focusTerritoryRow(entity, saved);
      dialog.close();
      await renderPage();
      toast("Salvataggio completato.");
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
  } catch (e) {
    if (e.status === 401) auth();
    else {
      app.innerHTML = `<main class="fatal"><h1>Impossibile aprire PRIME</h1><p role="alert">${esc(e.message)}</p><button id="retry" class="primary">Riprova</button></main>`;
      document.querySelector("#retry").onclick = boot;
    }
  }
}
startVoiceInput();
boot();
