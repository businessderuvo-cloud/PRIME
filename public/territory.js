import { mountRepeatableRecaps } from "./repeatable-recaps.js";
import { unitHighlights, unitAgentIds } from "./territory-highlights.js";
import { groupUnitsByFloor } from "./territory-floors.js";
const sortBy = (rows, key = "title") =>
  [...rows].sort((a, b) =>
    String(a[key] || "").localeCompare(String(b[key] || ""), "it", {
      numeric: true,
      sensitivity: "base",
    }),
  );
const localDateTime = (value) => {
  const d = new Date(value);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export function renderTerritory(ctx) {
  const {
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
  } = ctx;
  const selection = (state.territory ??= {
    streetId: null,
    buildingId: null,
    unitId: null,
    tab: "scheda",
  });
  const storageKey =
    "prime.territory." + state.me.tenant_id + "." + state.me.id;
  if (!selection.restored) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) Object.assign(selection, saved);
    } catch {}
    selection.restored = true;
  }
  const d = state.data,
    canDelete = ["owner", "manager"].includes(state.me.role);
  const buildingsOf = (id) =>
    sortBy(d.buildings.filter((b) => b.street_id === id));
  const unitsOf = (id) =>
    [...d.units.filter((u) => u.building_id === id)].sort(
      (a, b) =>
        (a.staircase || "").localeCompare(b.staircase || "", "it", {
          numeric: true,
        }) ||
        (a.floor || "").localeCompare(b.floor || "", "it", { numeric: true }) ||
        a.title.localeCompare(b.title, "it", { numeric: true }),
    );
  const personOf = (id) => d.contacts.find((p) => p.id === id);
  function peopleOf(unit) {
    const links = d.unit_contacts
      .filter((l) => l.unit_id === unit.id)
      .map((link) => ({ ...link, person: personOf(link.contact_id) }))
      .filter((x) => x.person);
    for (const property of d.properties.filter(
      (p) => p.unit_id === unit.id && p.owner_id,
    )) {
      if (!links.some((l) => l.contact_id === property.owner_id)) {
        const person = personOf(property.owner_id);
        if (person)
          links.push({
            contact_id: person.id,
            person,
            relationship: "proprietario",
            fromProperty: true,
          });
      }
    }
    return links;
  }
  const flagsOf = (unit) =>
    unitHighlights(
      unit,
      peopleOf(unit).map((link) => link.person),
    );
  const agentsOf = (unit) =>
    unitAgentIds(
      unit,
      d.properties,
      peopleOf(unit).map((link) => link.person),
    );
  const agentLabel = (unit) =>
    agentsOf(unit)
      .map(
        (id) =>
          state.members.find((member) => member.id === id)?.title || "Agente",
      )
      .join(", ") || "Da assegnare";
  function badges(flags) {
    return (
      (flags.sale
        ? '<span class="spot-badge spot-sale">IN VENDITA</span>'
        : "") +
      (flags.agency
        ? '<span class="spot-badge spot-agency">ALTRA AGENZIA</span>'
        : "") +
      (flags.hot ? '<span class="spot-badge spot-hot">● LEAD CALDO</span>' : "")
    );
  }
  function flagClasses(unit) {
    const f = flagsOf(unit);
    return [
      f.sale ? "is-sale" : "",
      f.agency ? "is-agency" : "",
      f.hot ? "is-hot" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const photos = (kind, id) =>
    (state.media || []).filter(
      (m) => m[kind === "buildings" ? "building_id" : "unit_id"] === id,
    );
  const unitLabel = (u) =>
    [
      u.staircase ? "Scala " + u.staircase : "",
      u.floor ? "Piano " + u.floor : "",
      "Interno " + u.title,
    ]
      .filter(Boolean)
      .join(" · ");
  function remember() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          streetId: selection.streetId,
          buildingId: selection.buildingId,
          unitId: selection.unitId,
        }),
      );
    } catch {}
  }
  function choose(entity, id) {
    if (entity === "streets") {
      selection.streetId = id;
      selection.buildingId = null;
      selection.unitId = null;
    }
    if (entity === "buildings") {
      const b = d.buildings.find((x) => x.id === id);
      selection.streetId = b.street_id;
      selection.buildingId = id;
      selection.unitId = null;
    }
    if (entity === "units") {
      const u = d.units.find((x) => x.id === id),
        b = d.buildings.find((x) => x.id === u.building_id);
      selection.streetId = b.street_id;
      selection.buildingId = b.id;
      selection.unitId = id;
    }
    selection.tab = "scheda";
    remember();
    draw();
  }
  main.innerHTML =
    pageHeader(
      "DAL TERRITORIO ALLE RELAZIONI",
      "Vie e territorio",
      "Una sola scheda per vie, civici, appartamenti e persone.",
      `<button class="primary" id="territory-new-street">${icon("plus")} Aggiungi via</button>`,
    ) +
    `<section class="territory-workspace"><aside class="territory-tree"><div class="territory-tree-heading"><p class="eyebrow">IL TUO TERRITORIO</p>${searchBox("Via, civico, interno, nome o telefono…")}<div class="territory-tree-meta"><span>${d.streets.length} ${d.streets.length === 1 ? "via" : "vie"} · ${d.buildings.length} ${d.buildings.length === 1 ? "civico" : "civici"}</span><select id="territory-status" aria-label="Filtra stato delle vie"><option value="">Tutti gli stati</option><option>da censire</option><option>parziale</option><option>censita</option></select></div></div><nav id="territory-nodes" aria-label="Vie, civici e appartamenti"></nav></aside><section class="territory-detail" id="territory-detail" aria-label="Scheda territorio"></section></section>`;
  document.querySelector("#territory-new-street").onclick = () =>
    openEditor("streets");
  bindSearch(draw);
  document.querySelector("#territory-status").onchange = (e) => {
    state.territoryStatus = e.target.value;
    draw();
  };
  document.querySelector("#territory-status").value =
    state.territoryStatus || "";
  function match(text) {
    return state.query
      .toLocaleLowerCase("it")
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => text.toLocaleLowerCase("it").includes(w));
  }
  function unitSearch(u) {
    return [
      u.search_text,
      ...peopleOf(u).map((l) =>
        [
          l.person.title,
          l.person.phone,
          l.person.email,
          ...d.contact_methods
            .filter((m) => m.contact_id === l.contact_id)
            .map((m) => m.value),
        ].join(" "),
      ),
    ].join(" ");
  }
  function tree() {
    const streets = sortBy(d.streets).filter(
      (s) =>
        !state.territoryStatus || s.census_status === state.territoryStatus,
    );
    let visible = 0;
    const html = streets
      .map((s) => {
        const buildings = buildingsOf(s.id),
          streetMatch = match(s.search_text || s.title),
          matching = buildings.filter(
            (b) =>
              streetMatch ||
              match(b.search_text || b.title) ||
              unitsOf(b.id).some((u) => match(unitSearch(u))),
          );
        if (state.query && !streetMatch && !matching.length) return "";
        visible++;
        const expanded = selection.streetId === s.id || Boolean(state.query);
        return `<div class="tree-street"><button class="tree-street-button ${selection.streetId === s.id ? "selected" : ""}" data-pick="streets" data-id="${s.id}"><span class="tree-symbol">${icon("streets")}</span><span><strong>${esc(s.title)}</strong><small>${esc(s.city)}${s.district ? " · " + esc(s.district) : ""}</small></span><span class="tree-count">${buildings.length}</span></button>${
          expanded
            ? `<div class="tree-buildings">${matching
                .map((b) => {
                  const units = unitsOf(b.id),
                    open =
                      selection.buildingId === b.id || Boolean(state.query),
                    allMatches = streetMatch || match(b.search_text || b.title);
                  return `<button class="tree-building-button ${selection.buildingId === b.id && !selection.unitId ? "selected" : ""}" data-pick="buildings" data-id="${b.id}"><span class="tree-node-dot"></span><span>Civico <strong>${esc(b.title)}</strong></span><small>${units.length} ${units.length === 1 ? "interno" : "interni"}</small></button>${
                    open
                      ? `<div class="tree-units">${units
                          .filter(
                            (u) =>
                              !state.query ||
                              allMatches ||
                              match(unitSearch(u)),
                          )
                          .map(
                            (u) =>
                              `<button class="tree-unit-button ${flagClasses(u)} ${selection.unitId === u.id ? "selected" : ""}" data-pick="units" data-id="${u.id}"><span>${esc(u.floor || "—")}</span><span>Interno ${esc(u.title)}${u.staircase ? " · " + esc(u.staircase) : ""}<span class="tree-unit-highlights">${badges(flagsOf(u))}</span></span><i class="unit-state-dot ${u.commercial_status === "in vendita" ? "for-sale" : ""}"></i></button>`,
                          )
                          .join("")}</div>`
                      : ""
                  }`;
                })
                .join(
                  "",
                )}<button class="tree-add" data-add-building="${s.id}">+ Aggiungi civico</button></div>`
            : ""
        }</div>`;
      })
      .join("");
    document.querySelector("#territory-nodes").innerHTML =
      html ||
      `<div class="territory-empty"><h3>${d.streets.length ? "Nessun risultato" : "Il territorio parte da una via."}</h3><p>${d.streets.length ? "Prova un nome, un telefono o una parte dell’indirizzo." : "Aggiungi una via, poi i civici e gli appartamenti."}</p></div>`;
  }
  function facts(items) {
    return `<dl class="territory-facts">${items.map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value || "Non indicato")}</dd></div>`).join("")}</dl>`;
  }
  function photoFrame(entity, row, label) {
    const all = photos(entity, row.id);
    return `<div class="territory-cover ${all.length ? "has-photo" : ""}">${all.length ? `<img src="${all[0].url}" alt="${label}" loading="lazy"><button class="photo-preview" data-photo-preview="${all[0].id}" aria-label="Apri ${label}">Ingrandisci ↗</button>` : `<div class="photo-placeholder">${icon(entity === "buildings" ? "buildings" : "units")}<span>${label}</span><small>Nessuna foto caricata</small></div>`}<label class="photo-upload secondary">${icon("plus")} ${all.length ? "Aggiungi foto" : "Carica foto"}<input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Carica ${label}" data-photo-entity="${entity}" data-photo-id="${row.id}"></label></div>`;
  }
  function gallery(entity, row, label) {
    const all = photos(entity, row.id);
    return (
      photoFrame(entity, row, label) +
      (all.length
        ? `<div class="photo-gallery">${all.map((m) => `<article><button data-photo-preview="${m.id}" aria-label="Apri ${label}"><img src="${m.url}" alt="${label}" loading="lazy"></button><div><small>${date(m.created_at)}</small>${canDelete || m.created_by === state.me.id ? `<button class="text-button" data-delete-photo="${m.id}">Elimina foto</button>` : ""}</div></article>`).join("")}</div>`
        : "")
    );
  }
  function contactsCard(person, link) {
    const methods = d.contact_methods.filter((m) => m.contact_id === person.id),
      preferences = [
        person.preferred_channel !== "non indicato"
          ? person.preferred_channel
          : "",
        person.preferred_days,
        person.preferred_time_from
          ? person.preferred_time_from + "–" + person.preferred_time_to
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
    return `<article class="territory-person"><header><span class="person-avatar">${esc(person.title.slice(0, 2).toUpperCase())}</span><div><h3>${esc(person.title)}</h3><span class="pill">${esc(link.relationship)}</span>${person.assigned_agent_id ? `<small class="person-agent-label">Agente · ${esc(state.members.find((member) => member.id === person.assigned_agent_id)?.title || "Agente")}</small>` : ""}${Number(person.is_hot_lead) === 1 ? badges({ hot: true }) : ""}${person.do_not_contact ? '<span class="pill stop-contact">Non ricontattare</span>' : ""}</div><button class="text-button" data-edit-person="${person.id}">Scheda completa ↗</button></header><div class="person-primary-contacts">${person.phone ? `<a href="tel:${encodeURIComponent(person.phone)}">${esc(person.phone)}</a>` : ""}${person.email ? `<a href="mailto:${encodeURIComponent(person.email)}">${esc(person.email)}</a>` : ""}${!person.phone && !person.email ? '<span class="muted">Recapiti da aggiungere</span>' : ""}</div>${preferences ? `<p class="contact-preferences"><span>Preferenze di contatto</span>${esc(preferences)}</p>` : ""}${person.preference_notes ? `<p class="person-note">${esc(person.preference_notes)}</p>` : ""}${facts(
      [
        ["Professione", person.profession],
        [
          "Stato civile",
          person.marital_status === "non indicato" ? "" : person.marital_status,
        ],
        [
          "Figli",
          person.has_children === "non indicato" ? "" : person.has_children,
        ],
        ["Fonte", person.info_source],
      ],
    )}${methods.length ? `<div class="person-methods">${methods.map((m) => `<div><span>${esc(m.title || m.method_type)}</span><strong>${safeMethod(m.value)}</strong><button class="text-button" data-edit-method="${m.id}" aria-label="Modifica ${esc(m.title)}">↗</button></div>`).join("")}</div>` : ""}${person.notes ? `<p class="person-note">${esc(person.notes)}</p>` : ""}<footer><button class="text-button" data-add-method="${person.id}">+ Altro numero / social</button><button class="text-button" data-contact-person="${person.id}">Registra contatto</button>${canDelete && !link.fromProperty ? `<button class="text-button muted" data-unlink-person="${link.id}">Scollega</button>` : ""}</footer></article>`;
  }
  function safeMethod(value) {
    return /^https?:\/\//i.test(value)
      ? `<a href="${esc(value)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`
      : esc(value);
  }
  function timeline(street, building, unit) {
    const buildings = building ? [building] : buildingsOf(street.id),
      buildingIds = new Set(buildings.map((b) => b.id)),
      units = unit
        ? [unit]
        : d.units.filter((u) => buildingIds.has(u.building_id)),
      unitIds = new Set(units.map((u) => u.id)),
      personIds = new Set(
        units.flatMap((u) => peopleOf(u).map((p) => p.contact_id)),
      );
    const includes = (r) =>
      unit
        ? r.unit_id === unit.id ||
          (!r.unit_id &&
            !r.building_id &&
            !r.street_id &&
            personIds.has(r.contact_id))
        : building
          ? r.building_id === building.id || unitIds.has(r.unit_id)
          : r.street_id === street.id ||
            buildingIds.has(r.building_id) ||
            unitIds.has(r.unit_id);
    const calls = d.contact_interactions.filter(includes).map((r) => ({
      ...r,
      entity: "contact_interactions",
      when: r.occurred_at,
      kind: r.channel,
      result: r.outcome,
    }));
    const work = d.activities.filter(includes).map((r) => ({
      ...r,
      entity: "activities",
      when: r.updated_at,
      kind: "WPS · " + r.activity_type,
      result: r.outcome || r.status,
    }));
    const list = [...calls, ...work].sort((a, b) =>
      b.when.localeCompare(a.when),
    );
    return `<div class="section-heading"><div><p class="eyebrow">RELAZIONI NEL TEMPO</p><h3>Storico contatti e attività</h3></div><button class="secondary" data-log-contact>+ Registra contatto</button></div>${list.length ? `<div class="territory-timeline">${list.map((r) => `<article><span class="timeline-point"></span><div><div class="timeline-top"><span>${esc(r.kind)}</span><time>${date(r.when)}</time></div><button class="timeline-title" data-open-history="${r.entity}:${r.id}">${esc(r.title)}</button><p>${esc(r.result)}</p>${r.contact_id && personOf(r.contact_id) ? `<small>${esc(personOf(r.contact_id).title)}</small>` : ""}${r.notes ? `<p class="timeline-note">${esc(r.notes)}</p>` : ""}${r.next_action ? `<p class="next-action">Prossima azione · ${esc(r.next_action)}</p>` : ""}${r.follow_up_at ? `<span class="pill">Richiamo · ${date(r.follow_up_at)}</span>` : ""}<small class="timeline-author">${esc(state.members.find((m) => m.id === r.created_by)?.title || "Utente agenzia")}</small></div></article>`).join("")}</div>` : '<div class="territory-empty"><h3>Ogni contatto costruisce la relazione.</h3><p>Registra chiamate, telemarketing, porta a porta ed esiti commerciali. Lo storico resterà collegato alla scheda.</p></div>'}`;
  }
  function unitCards(building) {
    const agentFilter =
      state.assignedAgentFilter ??
      (state.me.role === "agent" ? state.me.id : "");
    const allUnits = unitsOf(building.id).filter(
      (unit) =>
        !agentFilter ||
        (agentFilter === "unassigned"
          ? !agentsOf(unit).length
          : agentsOf(unit).includes(agentFilter)),
    );
    const filter = state.territoryHighlight || "all";
    const units = allUnits.filter(
      (u) => filter === "all" || flagsOf(u)[filter],
    );
    const filters = [
      ["all", "Tutti gli appartamenti"],
      ["sale", "In vendita"],
      ["agency", "Altra agenzia"],
      ["hot", "Lead caldi"],
    ];
    const summary =
      '<div class="territory-spotlight" aria-label="Filtra appartamenti in evidenza">' +
      filters
        .map(
          ([key, label]) =>
            '<button type="button" class="spot-filter spot-' +
            key +
            '" data-highlight="' +
            key +
            '" aria-pressed="' +
            (filter === key) +
            '"><strong>' +
            (key === "all"
              ? allUnits.length
              : allUnits.filter((u) => flagsOf(u)[key]).length) +
            "</strong><span>" +
            label +
            "</span></button>",
        )
        .join("") +
      "</div>";
    return (
      `<label class="crm-type-filter territory-agent-filter">Agente<select id="territory-agent-filter" aria-label="Filtra appartamenti per agente"><option value="">Tutti gli agenti</option><option value="unassigned">Da assegnare</option>${state.members.map((member) => `<option value="${member.id}" ${agentFilter === member.id ? "selected" : ""}>${esc(member.title)}</option>`).join("")}</select></label>` +
      summary +
      `<div class="section-heading"><h3>Appartamenti · ${units.length}</h3><button class="secondary" data-add-unit="${building.id}">+ Aggiungi appartamento</button></div>${
        units.length
          ? groupUnitsByFloor(units)
              .map(
                (group) =>
                  `<section class="territory-floor-group"><header class="floor-group-header"><div><p class="eyebrow">APPARTAMENTI DELLO STABILE</p><h3>${esc(group.label)}</h3></div><span class="pill">${group.units.length} ${group.units.length === 1 ? "appartamento" : "appartamenti"}</span><button class="text-button" data-add-unit="${building.id}" data-unit-floor="${esc(group.units[0].floor)}">+ Aggiungi su questo piano</button></header><div class="territory-unit-grid">${group.units
                    .map((u) => {
                      const people = peopleOf(u),
                        photo = photos("units", u.id)[0];
                      return `<button class="unit-card ${flagClasses(u)}" data-pick="units" data-id="${u.id}">${badges(flagsOf(u)) ? `<div class="unit-priority-badges">${badges(flagsOf(u))}</div>` : ""}<div class="unit-card-top">${photo ? `<img src="${photo.url}" alt="Foto appartamento" loading="lazy">` : `<span class="floor-mark">${esc(u.floor || "—")}<small>PIANO</small></span>`}<div><h3>Interno ${esc(u.title)}</h3><p>${esc([u.staircase ? "Scala " + u.staircase : "", u.property_type, u.area ? u.area + " m²" : "", u.rooms ? u.rooms + " locali" : ""].filter(Boolean).join(" · ") || "Informazioni da completare")}</p></div></div><div class="unit-card-states">${!flagsOf(u).sale && !flagsOf(u).agency ? `<span class="pill">${esc(u.commercial_status)}</span>` : ""}<span class="pill">${esc(u.occupancy_status)}</span></div><p class="unit-agent-label">Agente · ${esc(agentLabel(u))}</p><footer>${people.length ? esc(people.map((p) => p.person.title).join(", ")) : "Persone da associare"}<span>Apri ↗</span></footer></button>`;
                    })
                    .join("")}</div></section>`,
              )
              .join("")
          : unitsOf(building.id).length
            ? '<div class="territory-empty"><h3>Nessun appartamento in questa categoria.</h3><p>Modifica il filtro agente o seleziona Tutti gli appartamenti per visualizzare lo stabile completo.</p></div>'
            : '<div class="territory-empty"><h3>Dal civico alle persone.</h3><p>Aggiungi gli interni con piano e scala per iniziare il censimento.</p></div>'
      }`
    );
  }
  function draw() {
    if (selection.unitId && !d.units.some((u) => u.id === selection.unitId))
      selection.unitId = null;
    if (
      selection.buildingId &&
      !d.buildings.some((b) => b.id === selection.buildingId)
    )
      selection.buildingId = null;
    if (!d.streets.some((s) => s.id === selection.streetId)) {
      selection.streetId = sortBy(d.streets)[0]?.id || null;
      selection.buildingId = null;
      selection.unitId = null;
    }
    tree();
    const target = document.querySelector("#territory-detail"),
      street = d.streets.find((s) => s.id === selection.streetId),
      building = d.buildings.find((b) => b.id === selection.buildingId),
      unit = d.units.find((u) => u.id === selection.unitId);
    if (!street) {
      target.innerHTML =
        '<div class="territory-start"><span class="territory-start-icon">' +
        icon("streets") +
        '</span><p class="eyebrow">CONOSCI OGNI INDIRIZZO</p><h2>Un territorio.<br>Tutte le sue storie.</h2><p>Parti da una via, entra nei civici e raccogli le informazioni degli appartamenti e delle persone.</p><button class="primary" id="empty-add-street">+ Aggiungi la prima via</button></div>';
      document.querySelector("#empty-add-street").onclick = () =>
        openEditor("streets");
      bindTree();
      return;
    }
    const entity = unit ? "units" : building ? "buildings" : "streets",
      row = unit || building || street,
      tab = selection.tab || "scheda";
    const header = `<div class="territory-breadcrumb"><button data-pick="streets" data-id="${street.id}">${esc(street.city)} · ${esc(street.title)}</button>${building ? `<span>/</span><button data-pick="buildings" data-id="${building.id}">Civico ${esc(building.title)}</button>` : ""}${unit ? `<span>/</span><span>Interno ${esc(unit.title)}</span>` : ""}</div><header class="territory-profile-header"><div><p class="eyebrow">${unit ? "APPARTAMENTO" : building ? "CIVICO E CONDOMINIO" : "VIA E TERRITORIO"}</p><h2>${esc(unit ? "Interno " + unit.title : building ? street.title + " " + building.title : street.title)}</h2><p>${esc(unit ? unitLabel(unit) : [street.city, street.district, street.postal_code].filter(Boolean).join(" · "))}</p></div><div class="territory-header-actions">${building ? `<button class="primary" data-add-unit="${building.id}">+ Aggiungi appartamento</button>` : `<button class="primary" data-add-building="${street.id}">+ Aggiungi civico</button>`}<button class="secondary" id="territory-edit">Modifica scheda</button></div></header><nav class="territory-tabs" aria-label="Sezioni della scheda">${[["scheda", unit ? "Appartamento" : building ? "Appartamenti" : "Civici"], ...(unit ? [["persone", "Persone"]] : building ? [["condominio", "Condominio"]] : []), ["storico", "Storico contatti"], ...(building ? [["foto", "Foto"]] : [])].map(([key, label]) => `<button data-tab="${key}" class="${tab === key ? "selected" : ""}">${label}${key === "persone" ? " · " + peopleOf(unit).length : ""}</button>`).join("")}</nav>`;
    let content = "";
    if (tab === "storico") content = timeline(street, building, unit);
    else if (tab === "persone" && unit) {
      const people = peopleOf(unit);
      content = `<div class="section-heading"><div><p class="eyebrow">UNA RUBRICA, PIÙ RELAZIONI</p><h3>Persone dell’appartamento</h3></div><button class="primary" id="add-person">+ Aggiungi persona</button></div><p class="small-note">Proprietari, comproprietari, inquilini e delegati condividono la stessa scheda CRM. Preferenze e informazioni personali sono facoltative.</p>${people.map((link) => contactsCard(link.person, link)).join("") || '<div class="territory-empty"><h3>Chi vive questa casa?</h3><p>Aggiungi una persona o collegane una già presente nella rubrica.</p></div>'}`;
    } else if (tab === "foto" && building)
      content = gallery(
        unit ? "units" : "buildings",
        unit || building,
        unit ? "Foto appartamento" : "Foto citofono",
      );
    else if (tab === "condominio" && building)
      content = `<div class="section-heading"><h3>Contatti dello stabile</h3><button class="text-button" id="edit-condominium">Modifica recapiti ↗</button></div><div class="condominium-grid"><article><p class="eyebrow">PORTINERIA</p><h3>${esc(building.concierge_name || "Custode da censire")}</h3>${facts(
        [
          ["Telefono", building.concierge_phone],
          ["Orari", building.concierge_hours],
        ],
      )}</article><article><p class="eyebrow">AMMINISTRATORE</p><h3>${esc(building.administrator_name || "Amministratore da censire")}</h3>${facts(
        [
          ["Telefono", building.administrator_phone],
          ["Email", building.administrator_email],
        ],
      )}</article></div>${facts([
        ["Fonte recapiti", building.contact_source],
        ["Ultima verifica", building.verified_on],
      ])}${building.notes ? `<p class="territory-notes">${esc(building.notes)}</p>` : ""}${photoFrame("buildings", building, "Foto citofono")}`;
    else if (unit) {
      const people = peopleOf(unit),
        managed = d.properties.find((p) => p.unit_id === unit.id);
      content = `<div class="unit-priority-badges profile-priority">${badges(flagsOf(unit))}</div><div class="unit-profile-summary">${photoFrame("units", unit, "Foto appartamento")}<div><div class="unit-status-list">${[
        ["Occupazione", unit.occupancy_status],
        ["Commercializzazione", unit.commercial_status],
        ["Acquisizione", unit.acquisition_status],
        ["Agente assegnato", agentLabel(unit)],
      ]
        .map(
          ([label, value]) =>
            `<div><span>${label}</span><strong class="${value === "in vendita" ? "sale-text" : ""}">${esc(value)}</strong></div>`,
        )
        .join("")}</div>${facts([
        ["Tipologia", unit.property_type],
        ["Superficie", unit.area ? unit.area + " m²" : ""],
        ["Locali", unit.rooms || ""],
        ["Condizioni", unit.condition],
      ])}</div></div>${unit.notes ? `<div class="territory-notes"><p class="eyebrow">NOTE DELL’APPARTAMENTO</p>${esc(unit.notes)}</div>` : ""}<div class="unit-quick-actions"><button class="primary" data-log-contact>Registra chiamata / contatto</button><button class="secondary" id="territory-wps">+ Attività WPS</button>${managed ? `<button class="text-button" id="managed-property">Apri immobile in gestione ↗</button>` : ""}</div><div class="section-heading"><h3>Persone · ${people.length}</h3><button class="text-button" id="add-person">+ Aggiungi persona</button></div>${
        people.length
          ? people
              .slice(0, 2)
              .map((link) => contactsCard(link.person, link))
              .join("")
          : '<p class="small-note">Nessun proprietario o altro interlocutore associato. Collega le persone per raccogliere recapiti e preferenze.</p>'
      }`;
    } else if (building)
      content = `<div class="building-overview"><div><p class="eyebrow">CONDOMINIO</p><h3>${esc(building.concierge_name || "Custode da censire")}</h3><p class="muted">${esc(building.concierge_phone || "Recapito portineria da aggiungere")}</p><div class="building-admin"><span>Amministratore</span><strong>${esc(building.administrator_name || "Da censire")}</strong><small>${esc(building.administrator_phone || "")}</small></div></div>${photoFrame("buildings", building, "Foto citofono")}</div>${unitCards(building)}`;
    else {
      const buildings = buildingsOf(street.id),
        allUnits = d.units.filter((u) =>
          buildings.some((b) => b.id === u.building_id),
        );
      content = `<div class="territory-summary"><div><strong>${buildings.length}</strong><span>Civici censiti</span></div><div><strong>${allUnits.length}</strong><span>Appartamenti</span></div><div><strong>${allUnits.filter((u) => u.commercial_status === "in vendita").length}</strong><span>In vendita</span></div><div><span class="pill">${esc(street.census_status)}</span><span>Stato censimento</span></div></div><div class="section-heading"><h3>Civici della via</h3><button class="primary" data-add-building="${street.id}">+ Aggiungi civico</button></div><div class="building-card-grid">${buildings.map((b) => `<button class="building-card" data-pick="buildings" data-id="${b.id}"><span class="civic-number">${esc(b.title)}</span><div><h3>Civico ${esc(b.title)}</h3><p>${unitsOf(b.id).length} ${unitsOf(b.id).length === 1 ? "appartamento" : "appartamenti"} · ${photos("buildings", b.id).length ? "Foto citofono presente" : "Foto citofono da aggiungere"}</p><small>${esc(b.concierge_name || b.administrator_name || "Contatti condominiali da censire")}</small></div><span>↗</span></button>`).join("") || '<div class="territory-empty"><h3>Entra nel primo civico.</h3><p>Aggiungi lo stabile, poi censisci gli interni con i loro piani.</p></div>'}</div>${street.notes ? `<p class="territory-notes">${esc(street.notes)}</p>` : ""}`;
    }
    target.innerHTML =
      header + '<div class="territory-content">' + content + "</div>";
    document.querySelector("#territory-edit").onclick = () =>
      openEditor(entity, row);
    document.querySelectorAll("[data-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          selection.tab = b.dataset.tab;
          draw();
        }),
    );
    document
      .querySelector("#edit-condominium")
      ?.addEventListener("click", () => openEditor("buildings", building));
    document
      .querySelector("#add-person")
      ?.addEventListener("click", () => personDialog(unit));
    document.querySelector("#territory-wps")?.addEventListener("click", () =>
      openEditor("activities", null, {
        street_id: street.id,
        building_id: building.id,
        unit_id: unit.id,
        contact_id: peopleOf(unit)[0]?.contact_id || "",
        activity_type: "richiamo",
      }),
    );
    document.querySelector("#managed-property")?.addEventListener("click", () =>
      openEditor(
        "properties",
        d.properties.find((p) => p.unit_id === unit.id),
      ),
    );
    target
      .querySelectorAll("[data-log-contact]")
      .forEach(
        (b) => (b.onclick = () => interactionDialog(street, building, unit)),
      );
    target
      .querySelectorAll("[data-edit-person]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            openEditor("contacts", personOf(b.dataset.editPerson))),
      );
    target.querySelectorAll("[data-add-method]").forEach(
      (b) =>
        (b.onclick = () =>
          openEditor("contact_methods", null, {
            contact_id: b.dataset.addMethod,
          })),
    );
    target.querySelectorAll("[data-edit-method]").forEach(
      (b) =>
        (b.onclick = () =>
          openEditor(
            "contact_methods",
            d.contact_methods.find((m) => m.id === b.dataset.editMethod),
          )),
    );
    target
      .querySelectorAll("[data-contact-person]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            interactionDialog(street, building, unit, b.dataset.contactPerson)),
      );
    target.querySelectorAll("[data-open-history]").forEach(
      (b) =>
        (b.onclick = () => {
          const [kind, id] = b.dataset.openHistory.split(":");
          openEditor(
            kind,
            d[kind].find((r) => r.id === id),
          );
        }),
    );
    target.querySelectorAll("[data-unlink-person]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (
            !confirm(
              "Scollegare la persona da questo appartamento? La scheda CRM viene conservata.",
            )
          )
            return;
          try {
            const link = d.unit_contacts.find(
              (l) => l.id === b.dataset.unlinkPerson,
            );
            await api("/api/entities/unit_contacts/" + link.id, {
              method: "DELETE",
              body: JSON.stringify({ version: link.version }),
            });
            await loadData();
            await renderPage();
            toast("Persona scollegata. Scheda CRM conservata.");
          } catch (e) {
            toast(e.message);
          }
        }),
    );
    target.querySelectorAll("[data-highlight]").forEach(
      (button) =>
        (button.onclick = () => {
          state.territoryHighlight = button.dataset.highlight;
          draw();
        }),
    );
    const agentSelect = target.querySelector("#territory-agent-filter");
    if (agentSelect) {
      agentSelect.value =
        state.assignedAgentFilter ??
        (state.me.role === "agent" ? state.me.id : "");
      agentSelect.onchange = () => {
        state.assignedAgentFilter = agentSelect.value;
        draw();
      };
    }
    bindTree();
    bindPhotos(target);
    remember();
  }
  function bindTree() {
    main
      .querySelectorAll("[data-pick]")
      .forEach((b) => (b.onclick = () => choose(b.dataset.pick, b.dataset.id)));
    main.querySelectorAll("[data-add-building]").forEach(
      (b) =>
        (b.onclick = () =>
          openEditor("buildings", null, {
            street_id: b.dataset.addBuilding,
          })),
    );
    main.querySelectorAll("[data-add-unit]").forEach(
      (b) =>
        (b.onclick = () =>
          openEditor("units", null, {
            building_id: b.dataset.addUnit,
            floor: b.dataset.unitFloor || "",
          })),
    );
  }
  function bindPhotos(target) {
    target.querySelectorAll("[data-photo-entity]").forEach(
      (input) =>
        (input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          input.disabled = true;
          try {
            toast("Preparazione e caricamento della foto…");
            const image = await photoBlob(file);
            await api(
              `/api/media?${input.dataset.photoEntity === "buildings" ? "building_id" : "unit_id"}=${input.dataset.photoId}`,
              {
                method: "POST",
                headers: { "Content-Type": "image/jpeg" },
                body: image,
              },
            );
            await loadData();
            await renderPage();
            toast("Foto salvata nella scheda.");
          } catch (e) {
            toast(e.message);
            input.disabled = false;
            input.value = "";
          }
        }),
    );
    target.querySelectorAll("[data-photo-preview]").forEach(
      (b) =>
        (b.onclick = () => {
          const media = state.media.find(
              (m) => m.id === b.dataset.photoPreview,
            ),
            dialog = document.querySelector("#editor");
          dialog.innerHTML = `<header class="dialog-header"><h2 id="editor-title">Foto ${media.photo_type}</h2><button class="icon-button" id="close-photo" aria-label="Chiudi foto">×</button></header><img class="photo-full" src="${media.url}" alt="Foto ${media.photo_type}">`;
          dialog.showModal();
          dialog.querySelector("button").onclick = () => dialog.close();
        }),
    );
    target.querySelectorAll("[data-delete-photo]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm("Eliminare definitivamente questa foto?")) return;
          try {
            await api("/api/media/" + b.dataset.deletePhoto, {
              method: "DELETE",
              body: "{}",
            });
            await loadData();
            await renderPage();
            toast("Foto eliminata.");
          } catch (e) {
            toast(e.message);
          }
        }),
    );
  }
  async function personDialog(unit) {
    const dialog = document.querySelector("#editor");
    dialog.innerHTML = `<form id="territory-person-form"><header class="dialog-header"><div><p class="eyebrow">${esc(unitLabel(unit))}</p><h2 id="editor-title">Aggiungi una persona</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">×</button></header><div class="dialog-body"><p class="error" role="alert" hidden></p><div class="form-grid"><label class="full">Persona già in rubrica<select name="contact_id"><option value="">Nuova persona</option>${sortBy(
      d.contacts,
    )
      .map(
        (p) =>
          `<option value="${p.id}">${esc(p.title)}${p.phone ? " · " + esc(p.phone) : ""}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Relazione<select name="relationship">${["proprietario", "comproprietario", "inquilino", "occupante", "delegato", "altro interlocutore"].map((x) => `<option>${x}</option>`).join("")}</select></label><label>Nome e cognome<input name="title" required maxlength="200" autocomplete="off"></label><label>Telefono<input name="phone" type="tel" maxlength="200"></label><label>Tipo di numero<select name="phone_kind"><option value="">Seleziona tipo…</option><option>Ufficio</option><option>Casa</option><option>Cell personale</option><option>Cell di lavoro</option></select></label><label>Agente assegnato<select name="assigned_agent_id"><option value="">Da assegnare</option>${state.members.map((member) => `<option value="${member.id}">${esc(member.title)}</option>`).join("")}</select></label><label>Email<input name="email" type="email" maxlength="200"></label></div><p class="small-note">Usa Aggiungi numero e Aggiungi social per inserire più recapiti. Fasce orarie e informazioni personali facoltative sono nella scheda completa. Le persone già presenti non vengono duplicate.</p></div><footer class="dialog-footer"><button class="primary" type="submit">Salva e collega</button></footer></form>`;
    let collectRecaps = mountRepeatableRecaps({
      container: dialog.querySelector(".form-grid"),
      phoneInput: dialog.querySelector("[name=phone]"),
      esc,
    });
    dialog.showModal();
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    const form = dialog.querySelector("form");
    form.elements.contact_id.onchange = () => {
      const existing = Boolean(form.elements.contact_id.value);
      for (const key of [
        "title",
        "phone",
        "phone_kind",
        "assigned_agent_id",
        "email",
      ])
        form.elements[key].disabled = existing;
      form.elements.title.required = !existing;
      dialog
        .querySelectorAll(".repeatable-recaps")
        .forEach((element) => element.remove());
      const selected = d.contact_methods.filter(
        (method) => method.contact_id === form.elements.contact_id.value,
      );
      collectRecaps = mountRepeatableRecaps({
        container: dialog.querySelector(".form-grid"),
        phoneInput: existing ? null : form.elements.phone,
        esc,
        methods: selected,
      });
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const f = new FormData(form),
          relationship = f.get("relationship");
        await api("/api/territory/people", {
          method: "POST",
          body: JSON.stringify({
            unit_id: unit.id,
            contact_id: f.get("contact_id") || undefined,
            contact_methods: collectRecaps(),
            relationship,
            contact: {
              title: f.get("title"),
              phone: f.get("phone") || "",
              phone_kind: f.get("phone_kind") || "",
              assigned_agent_id: f.get("assigned_agent_id") || null,
              email: f.get("email") || "",
              contact_type:
                relationship === "proprietario" ||
                relationship === "comproprietario" ||
                relationship === "inquilino"
                  ? relationship
                  : "potenziale cliente",
            },
          }),
        });
        await loadData();
        dialog.close();
        selection.tab = "persone";
        await renderPage();
        toast("Persona collegata all’appartamento.");
      } catch (ex) {
        const error = form.querySelector(".error");
        error.textContent = ex.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
  }
  function interactionDialog(street, building, unit, contactId = "") {
    const dialog = document.querySelector("#editor"),
      people = unit ? peopleOf(unit).map((l) => l.person) : d.contacts;
    dialog.innerHTML = `<form id="interaction-form"><header class="dialog-header"><div><p class="eyebrow">${esc(street.title)}${building ? " · " + esc(building.title) : ""}${unit ? " · Interno " + esc(unit.title) : ""}</p><h2 id="editor-title">Registra un contatto</h2></div><button type="button" class="icon-button" data-close aria-label="Chiudi">×</button></header><div class="dialog-body"><p class="error" role="alert" hidden></p><div class="form-grid"><label>Canale<select name="channel">${["chiamata", "telemarketing", "porta a porta", "email", "WhatsApp", "social", "altro"].map((v) => `<option>${v}</option>`).join("")}</select></label><label>Esito<select name="outcome">${["da richiamare", "non risponde", "interessato", "non interessato", "in vendita", "non in vendita", "in affitto", "informazioni aggiornate", "altro"].map((v) => `<option>${v}</option>`).join("")}</select></label><label>Data e ora<input name="occurred_at" type="datetime-local" required value="${localDateTime(new Date())}"></label><label>Persona<select name="contact_id"><option value="">Non specificata</option>${people.map((p) => `<option value="${p.id}" ${contactId === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select></label><label class="full">Note del contatto<textarea name="notes" rows="3" maxlength="4000"></textarea></label><label>Prossima azione<input name="next_action" maxlength="200"></label><label>Richiamare il<input name="follow_up_at" type="datetime-local"></label>${unit ? '<label class="checkbox-label full" id="update-commercial-label" hidden><input name="update_unit_status" type="checkbox">Aggiorna anche lo stato commerciale dell’appartamento</label>' : ""}</div><p class="small-note">Il richiamo viene annotato nello storico. Pianifica un blocco WPS per riservare il tempo necessario.</p></div><footer class="dialog-footer"><button class="primary" type="submit">Salva nel registro</button></footer></form>`;
    dialog.showModal();
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    const form = dialog.querySelector("form");
    form.elements.outcome.onchange = () => {
      if (!unit) return;
      const relevant = ["in vendita", "non in vendita", "in affitto"].includes(
        form.elements.outcome.value,
      );
      form.querySelector("#update-commercial-label").hidden = !relevant;
      if (!relevant) form.elements.update_unit_status.checked = false;
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const f = new FormData(form);
        await api("/api/territory/interactions", {
          method: "POST",
          body: JSON.stringify({
            data: {
              street_id: street.id,
              building_id: building?.id || null,
              unit_id: unit?.id || null,
              contact_id: f.get("contact_id") || null,
              channel: f.get("channel"),
              occurred_at: new Date(f.get("occurred_at")).toISOString(),
              outcome: f.get("outcome"),
              notes: f.get("notes"),
              next_action: f.get("next_action"),
              follow_up_at: f.get("follow_up_at")
                ? new Date(f.get("follow_up_at")).toISOString()
                : "",
            },
            update_unit_status: f.get("update_unit_status") === "on",
            unit_version: unit?.version,
          }),
        });
        await loadData();
        dialog.close();
        selection.tab = "storico";
        await renderPage();
        toast("Contatto registrato nello storico.");
      } catch (ex) {
        const error = form.querySelector(".error");
        error.textContent = ex.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
  }
  draw();
}

async function photoBlob(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Scegli una foto JPEG, PNG o WebP");
  if (file.size > 20 * 1024 * 1024)
    throw Error("La foto originale supera 20 MB");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.width || !image.height) throw Error("Foto non valida");
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob) throw Error("Impossibile preparare la foto");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
