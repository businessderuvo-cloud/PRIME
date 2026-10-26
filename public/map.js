const statuses = ["in vendita", "in affitto", "in trattativa", "opportunità", "altra agenzia", "acquisito", "censito"];
const labelStatus = value => ({ "in vendita": "In vendita", "in affitto": "In affitto", "in trattativa": "In trattativa", opportunità: "Opportunità", "altra agenzia": "Altra agenzia", acquisito: "In gestione", censito: "Censito" }[value] || value);

export async function renderMap(ctx) {
  const { state, main, pageHeader, esc, api, renderPage, navigate, openEditor, toast } = ctx;
  if (!window.L) {
    main.innerHTML = pageHeader("IL PATRIMONIO SULLA MAPPA", "Mappa immobiliare", "La mappa non è riuscita a caricarsi. Aggiorna la pagina e riprova.");
    return;
  }
  const d = state.data;
  const canManageZones = state.me.role === "owner";
  const assignableAgents = state.members.filter(member => member.role === "agent");
  state.mapView ||= { category: "all", status: "", agent: "", type: "", zone: "", query: "", minPrice: "", maxPrice: "", selected: null, placing: false, drawing: false };
  const view = state.mapView;
  state.mapZones ||= await api("/api/map/zones");
  const types = [...new Set(d.units.map(unit => unit.property_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
  const streets = new Map(d.streets.map(row => [row.id, row]));
  const buildings = new Map(d.buildings.map(row => [row.id, row]));
  const units = new Map(d.units.map(row => [row.id, row]));
  const agents = new Map(state.members.map(row => [row.id, row.title]));
  const locations = [];
  for (const building of d.buildings) {
    const street = streets.get(building.street_id), residents = d.units.filter(unit => unit.building_id === building.id);
    const flags = new Set(residents.map(unit => unit.commercial_status));
    locations.push({ entity: "buildings", row: building, id: building.id, title: `Civico ${building.title}`, address: [street?.title, building.title, street?.city].filter(Boolean).join(", "), latitude: building.latitude, longitude: building.longitude, agent_id: residents.find(unit => unit.assigned_agent_id)?.assigned_agent_id || "", status: flags.has("in vendita") ? "in vendita" : flags.has("altra agenzia") ? "altra agenzia" : flags.has("in affitto") ? "in affitto" : "censito", price: 0, category: "territory", search: [building.search_text, street?.title, street?.city, ...residents.map(unit => `${unit.title} ${unit.floor} ${unit.staircase}`)].join(" "), detail: `${residents.length} ${residents.length === 1 ? "appartamento censito" : "appartamenti censiti"}` });
  }
  for (const property of d.properties) {
    const unit = units.get(property.unit_id), building = unit && buildings.get(unit.building_id), street = building && streets.get(building.street_id), owner = d.contacts.find(contact => contact.id === property.owner_id);
    const status = property.marketing_status === "in vendita" || property.marketing_status === "in affitto" || property.marketing_status === "in trattativa" || property.marketing_status === "altra agenzia" ? property.marketing_status : unit?.acquisition_status === "opportunità" ? "opportunità" : property.marketing_status === "preparazione" && unit?.acquisition_status === "acquisito" ? "acquisito" : "censito";
    locations.push({ entity: "properties", row: property, id: property.id, title: property.title, address: [street?.title, building?.title, unit?.floor ? `piano ${unit.floor}` : "", unit?.title ? `interno ${unit.title}` : "", street?.city].filter(Boolean).join(", "), latitude: property.latitude ?? building?.latitude, longitude: property.longitude ?? building?.longitude, inherited: property.latitude == null && building?.latitude != null, agent_id: property.assigned_agent_id || unit?.assigned_agent_id || owner?.assigned_agent_id || "", status, price: property.price || 0, property_type: unit?.property_type || "", category: "properties", hot: !!(unit?.is_hot_lead || owner?.is_hot_lead), search: [property.search_text, unit?.search_text, building?.search_text, street?.title, street?.city, owner?.title].join(" "), detail: `${unit?.property_type || "Immobile"}${unit?.area ? ` · ${unit.area} m²` : ""}${owner?.title ? ` · ${owner.title}` : ""}` });
  }
  function withinZone(item, zone) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return false;
    const ring = zone.polygon;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i], [yj, xj] = ring[j];
      if (((xi > item.longitude) !== (xj > item.longitude)) && (item.latitude < (yj - yi) * (item.longitude - xi) / (xj - xi) + yi)) inside = !inside;
    }
    return inside;
  }
  const matches = () => locations.filter(item => {
    const q = view.query.trim().toLocaleLowerCase("it");
    const zone = view.zone && state.mapZones.find(row => row.id === view.zone);
    return (view.category === "all" || item.category === view.category) && (!view.status || item.status === view.status) && (!view.agent || item.agent_id === view.agent) && (!view.type || item.property_type === view.type) && (!zone || withinZone(item, zone)) && (!q || `${item.title} ${item.address} ${item.search}`.toLocaleLowerCase("it").includes(q)) && ((!view.minPrice && !view.maxPrice) || (item.category === "properties" && (!view.minPrice || item.price >= Number(view.minPrice)) && (!view.maxPrice || item.price <= Number(view.maxPrice))));
  });
  main.innerHTML = pageHeader("IL PATRIMONIO SULLA MAPPA", "Mappa immobiliare", "Mappa interattiva con indirizzi reali, civici e immobili.") + `<section class="map-toolbar panel"><label>Mostra<select id="map-category"><option value="all">Immobili e territorio</option><option value="properties">Immobili</option><option value="territory">Vie e civici</option></select></label><label>Tipologia<select id="map-type"><option value="">Tutte le tipologie</option>${types.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}</select></label><label>Stato<select id="map-status"><option value="">Tutti gli stati</option>${statuses.map(value => `<option value="${esc(value)}">${labelStatus(value)}</option>`).join("")}</select></label><label>Agente<select id="map-agent"><option value="">Tutti gli agenti</option>${state.members.map(agent => `<option value="${esc(agent.id)}">${esc(agent.title)}</option>`).join("")}</select></label><label>Zona<select id="map-zone"><option value="">Tutte le zone</option>${state.mapZones.map(zone => `<option value="${esc(zone.id)}">${esc(zone.title)}</option>`).join("")}</select></label><label>Prezzo da<input id="map-min-price" type="number" min="0" placeholder="€" /></label><label>Prezzo a<input id="map-max-price" type="number" min="0" placeholder="€" /></label><label class="map-search-label">Cerca via, civico o immobile<input id="map-query" type="search" placeholder="Indirizzo, appartamento…" /></label></section><section class="map-layout"><aside class="map-sidebar panel"><div class="map-sidebar-heading"><div><p class="eyebrow">RISULTATI</p><h2 id="map-result-count"></h2></div><button id="map-fit" class="text-button">Mostra tutto</button></div><p class="map-geocode-note">Per localizzare un indirizzo mancante, avvia la ricerca sul singolo civico. Viene inviato a OpenStreetMap solo l’indirizzo, senza dati dei contatti.</p><div id="map-results" class="map-results"></div><div id="map-selection"></div><section class="map-zones"><div class="map-sidebar-heading"><div><p class="eyebrow">TERRITORIO</p><h2>Zone agenti</h2></div><button id="map-zone-start" class="secondary">Disegna</button></div><p id="map-zone-help" class="map-note">Nessuna zona salvata. Premi Disegna, poi fai clic sulla mappa almeno tre volte.</p><div id="map-zone-form" hidden><label>Nome della zona<input id="map-zone-title" maxlength="120" placeholder="Es. Centro storico" /></label><label>Agente<select id="map-zone-agent">${state.members.map(agent => `<option value="${esc(agent.id)}" ${agent.id === state.me.id ? "selected" : ""}>${esc(agent.title)}</option>`).join("")}</select></label><button id="map-zone-save" class="primary">Salva zona</button><button id="map-zone-cancel" class="text-button">Annulla disegno</button></div><div id="map-zone-list"></div></section></aside><div class="map-stage"><div class="map-actions"><button id="map-place-toggle" class="secondary" disabled>Posiziona / sposta indicatore</button><button id="map-place-save" class="primary" hidden>Conferma posizione</button><button id="map-zone-finish" class="primary" hidden>Termina perimetro</button><span id="map-action-hint" role="status"></span></div><div id="prime-map" role="application" aria-label="Mappa immobiliare PRIME"></div><p class="map-attribution">© OpenStreetMap contributors · Riquadri caricati solo per la zona visualizzata. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Licenza</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Segnala un errore</a></p></div></section>`;
  view.drawing = false;
  const zoneStart = document.querySelector("#map-zone-start");
  zoneStart.hidden = !canManageZones;
  document.querySelector("#map-zone-agent").innerHTML = assignableAgents.map(agent => `<option value="${esc(agent.id)}">${esc(agent.title)}</option>`).join("");
  if (canManageZones && !assignableAgents.length) {
    zoneStart.disabled = true;
    document.querySelector("#map-zone-help").textContent = "Crea prima un account agente per assegnargli una zona.";
    const createAgent = document.createElement("button"); createAgent.className = "text-button"; createAgent.textContent = "Crea un agente ↗"; createAgent.onclick = () => navigate("agents");
    document.querySelector("#map-zone-help").after(createAgent);
  } else if (!canManageZones) document.querySelector("#map-zone-help").textContent = "Le zone e le assegnazioni sono gestite dal titolare. Riconosci le tue dal nome e dal colore sulla mappa.";
  const map = L.map("prime-map", { scrollWheelZoom: false }).setView([42.2, 12.6], 6);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map), zoneLayer = L.layerGroup().addTo(map), draftLayer = L.layerGroup().addTo(map);
  let selected = locations.find(item => item.id === view.selected) || null, pending = null, draftPoints = [];
  const fields = { category: "map-category", type: "map-type", status: "map-status", agent: "map-agent", zone: "map-zone", minPrice: "map-min-price", maxPrice: "map-max-price", query: "map-query" };
  for (const [key, id] of Object.entries(fields)) { const el = document.getElementById(id); el.value = view[key] || ""; el.addEventListener("input", () => { view[key] = el.value; drawResults(); drawMarkers(); }); }
  function openSelected() { if (!selected) return; if (selected.entity === "properties") openEditor("properties", selected.row); else { const street = streets.get(selected.row.street_id); Object.assign(state.territory ||= {}, { restored: true, streetId: street?.id || null, buildingId: selected.id, unitId: null, tab: "scheda" }); navigate("territory"); } }
  function select(item) { selected = item; view.selected = item?.id || null; drawResults(); drawMarkers(); drawSelection(); updateMoveButton(); }
  function card(item) { const needsGeocode = !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude); return `<article class="map-result-card"><button class="map-result ${selected?.id === item.id ? "selected" : ""}" data-map-id="${esc(item.id)}"><span class="map-result-pin ${item.category} ${esc(item.status.replaceAll(" ", "-"))}${item.hot ? " hot" : ""}">${item.category === "territory" ? "⌂" : "◆"}</span><span class="map-result-copy"><strong>${esc(item.title)}</strong><small>${esc(item.address || "Indirizzo da completare")}</small><span class="map-result-badges"><i>${esc(labelStatus(item.status))}</i>${item.hot ? "<i class=\"hot-badge\">Lead caldo</i>" : ""}${needsGeocode ? "<i class=\"map-unplaced-badge\">Da posizionare</i>" : ""}</span><small>${esc(item.detail)}${item.agent_id ? ` · ${esc(agents.get(item.agent_id) || "Agente")}` : ""}${item.price ? ` · € ${Number(item.price).toLocaleString("it-IT")}` : ""}</small></span><span class="map-result-arrow">↗</span></button>${needsGeocode && item.address ? `<button class="map-geocode-button" data-geocode-id="${esc(item.id)}">Trova indirizzo sulla mappa</button><div class="map-geocode-options" data-geocode-options hidden></div>` : ""}</article>`; }
  function drawResults() {
    const shown = matches();
    document.querySelector("#map-result-count").textContent = `${shown.length} schede`;
    document.querySelector("#map-results").innerHTML = shown.map(card).join("") || '<p class="map-empty">Nessuna scheda corrisponde ai filtri. Completa il censimento o modifica i filtri.</p>';
    document.querySelectorAll("[data-map-id]").forEach(button => button.onclick = () => {
      const item = locations.find(row => row.id === button.dataset.mapId); select(item);
      if (Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 15));
    });
    document.querySelectorAll("[data-geocode-id]").forEach(button => button.onclick = async event => {
      event.stopPropagation();
      const item = locations.find(row => row.id === button.dataset.geocodeId);
      const options = button.parentElement.querySelector("[data-geocode-options]");
      if (!item || !options) return;
      button.disabled = true; button.textContent = "Ricerca indirizzo…";
      options.hidden = false; options.innerHTML = '<p class="map-geocode-status" role="status">Cerco questo indirizzo su OpenStreetMap…</p>';
      try {
        const candidates = await api(`/api/map/geocode?q=${encodeURIComponent(item.address)}`);
        if (!candidates.length) { options.innerHTML = '<p class="map-geocode-status" role="status">Nessuna corrispondenza. Controlla via, civico e città.</p>'; button.disabled = false; button.textContent = "Riprova ricerca"; return; }
        options.innerHTML = `<label>Seleziona l’indirizzo corretto<select data-geocode-candidate>${candidates.map((candidate, index) => `<option value="${index}">${esc(candidate.label)}</option>`).join("")}</select></label><button class="map-geocode-save" type="button">Conferma indirizzo e posiziona</button>`;
        options.querySelector(".map-geocode-save").onclick = async () => {
          const point = candidates[Number(options.querySelector("[data-geocode-candidate]").value)];
          if (!point) return;
          const saveButton = options.querySelector(".map-geocode-save"); saveButton.disabled = true; saveButton.textContent = "Salvataggio…";
          try {
            const saved = await api("/api/map/position", { method: "PUT", body: JSON.stringify({ entity: item.entity, id: item.id, version: item.row.version, latitude: point.latitude, longitude: point.longitude }) });
            Object.assign(item.row, saved); item.latitude = saved.latitude; item.longitude = saved.longitude;
            if (item.entity === "buildings") propagateBuildingPosition(item.id, item.latitude, item.longitude);
            if (selected?.id === item.id) selected = item;
            document.querySelector("#map-action-hint").textContent = `Posizione trovata: ${point.label}`;
            drawMarkers(); drawResults(); drawSelection(); updateMoveButton(); map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 15));
          } catch (error) { saveButton.disabled = false; saveButton.textContent = error.message || "Riprova a salvare"; }
        };
        button.textContent = "Risultati trovati";
      } catch (error) { options.innerHTML = `<p class="map-geocode-status" role="status">${esc(error.message || "Ricerca non disponibile")}</p>`; button.disabled = false; button.textContent = "Riprova ricerca"; }
    });
  }
  function drawSelection() { const target = document.querySelector("#map-selection"); target.innerHTML = selected ? `<article class="map-selected-card"><p class="eyebrow">SCHEDA SELEZIONATA</p><h3>${esc(selected.title)}</h3><p>${esc(selected.address || "Indirizzo da completare")}</p><p>${esc(labelStatus(selected.status))}${selected.agent_id ? ` · ${esc(agents.get(selected.agent_id) || "Agente")}` : ""}</p><button class="text-button" id="map-open-selected">Apri scheda ↗</button></article>` : ""; target.querySelector("#map-open-selected")?.addEventListener("click", openSelected); }
  function drawMarkers() { markerLayer.clearLayers(); for (const item of matches()) { if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) continue; const marker = L.marker([item.latitude, item.longitude], { bubblingMouseEvents: true, icon: L.divIcon({ className: "prime-map-marker-wrap", html: `<span class="prime-map-marker ${item.category} ${esc(item.status.replaceAll(" ", "-"))}${item.hot ? " hot" : ""}">${item.category === "territory" ? "⌂" : "◆"}</span>`, iconSize: [34, 42], iconAnchor: [17, 38] }) }); marker.on("click", () => { if (!view.drawing) select(item); }); marker.bindTooltip(`${item.title} · ${labelStatus(item.status)}`); marker.addTo(markerLayer); } }
  function zoneColors(zones) {
    const palette = ["#2563eb", "#e05a27", "#16a085", "#a855d5", "#d59614", "#d63375", "#0899b8", "#74a51d", "#7954c4", "#bf453d", "#128269", "#a66c35"];
    const colors = new Map(), used = new Set();
    for (const zone of [...zones].sort((a, b) => a.id.localeCompare(b.id))) {
      let hash = 2166136261;
      for (const character of zone.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
      let slot = hash % palette.length, color = palette[slot];
      for (let offset = 0; used.has(color) && offset < palette.length; offset++) color = palette[(++slot) % palette.length];
      if (used.has(color)) { let hue = hash % 360; color = `hsl(${hue}, 68%, 45%)`; while (used.has(color)) color = `hsl(${++hue}, 68%, 45%)`; }
      used.add(color); colors.set(zone.id, color);
    }
    return colors;
  }
  function drawZones() {
    zoneLayer.clearLayers();
    const zones = state.mapZones || [], colors = zoneColors(zones);
    document.querySelector("#map-zone-list").innerHTML = zones.map(zone => `<article class="map-zone-row"><svg class="map-zone-swatch" viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="5" fill="${colors.get(zone.id)}" stroke="${colors.get(zone.id)}" /></svg><span><strong>${esc(zone.title)}</strong><small>${esc(agents.get(zone.agent_id) || "Agente")}${zone.agent_id === state.me.id ? " · La tua zona" : ""}</small>${canManageZones ? `<label>Agente assegnato<select class="map-zone-assignment" data-assign-zone="${esc(zone.id)}" aria-label="Agente assegnato a ${esc(zone.title)}"><option value="" disabled ${!assignableAgents.some(agent => agent.id === zone.agent_id) ? "selected" : ""}>Seleziona agente</option>${assignableAgents.map(agent => `<option value="${esc(agent.id)}" ${agent.id === zone.agent_id ? "selected" : ""}>${esc(agent.title)}</option>`).join("")}</select></label>` : ""}</span>${canManageZones ? `<button class="text-button" data-delete-zone="${esc(zone.id)}" aria-label="Rimuovi ${esc(zone.title)}">×</button>` : ""}</article>`).join("") || '<p class="map-note">Nessuna zona salvata finora.</p>';
    for (const zone of zones) {
      const color = colors.get(zone.id);
      const polygon = L.polygon(zone.polygon, { color, fillColor: color, weight: zone.agent_id === state.me.id ? 4 : 3, fillOpacity: .24 });
      const label = document.createElement("span");
      label.textContent = `${zone.title} · ${agents.get(zone.agent_id) || "Agente"}${zone.agent_id === state.me.id ? " · La tua zona" : ""}`;
      polygon.bindTooltip(label, { permanent: true, direction: "center", className: "map-zone-label" });
      polygon.addTo(zoneLayer);
    }
    document.querySelectorAll("[data-assign-zone]").forEach(select => select.onchange = async () => {
      const zone = zones.find(zone => zone.id === select.dataset.assignZone); if (!zone) return;
      select.disabled = true;
      try { await api(`/api/map/zones/${zone.id}`, { method: "PATCH", body: JSON.stringify({ agent_id: select.value, version: zone.version }) }); state.mapZones = await api("/api/map/zones"); document.querySelector("#map-zone").innerHTML = '<option value="">Tutte le zone</option>' + state.mapZones.map(zone => `<option value="${esc(zone.id)}">${esc(zone.title)}</option>`).join(""); document.querySelector("#map-zone").value = view.zone; drawZones(); toast("Zona assegnata all’agente."); } catch (error) { select.value = zone.agent_id; select.disabled = false; toast(error.message); }
    });
    document.querySelectorAll("[data-delete-zone]").forEach(button => button.onclick = async () => { if (!confirm("Rimuovere questa zona di competenza?")) return; await api(`/api/map/zones/${button.dataset.deleteZone}`, { method: "DELETE" }); state.mapZones = await api("/api/map/zones"); drawZones(); });
  }
  function updateMoveButton() { const button = document.querySelector("#map-place-toggle"); button.disabled = !selected; button.textContent = selected && !Number.isFinite(selected.latitude) ? "Posiziona sulla mappa" : "Sposta indicatore"; }
  function propagateBuildingPosition(buildingId, latitude, longitude) { for (const item of locations) { if (item.entity !== "properties" || Number.isFinite(item.row.latitude) || Number.isFinite(item.row.longitude)) continue; const unit = units.get(item.row.unit_id); if (unit?.building_id === buildingId) { item.latitude = latitude; item.longitude = longitude; item.inherited = true; } } }
  function renderDraftZone(previewPoint = null) { draftLayer.clearLayers(); const points = previewPoint ? [...draftPoints, previewPoint] : draftPoints; if (points.length >= 3) L.polygon(points, { color: "#b18131", weight: 8, opacity: .95, fillColor: "#e1b653", fillOpacity: .34, interactive: false }).addTo(draftLayer); if (points.length >= 3) L.polygon(points, { color: "#ffe29a", weight: 3, opacity: 1, fillColor: "#e1b653", fillOpacity: .18, interactive: false }).addTo(draftLayer); else if (points.length >= 2) L.polyline(points, { color: "#b18131", weight: 8, opacity: .95, interactive: false }).addTo(draftLayer); else if (points.length === 1) L.circleMarker(points[0], { radius: 9, color: "#171717", weight: 3, fillColor: "#f0c879", fillOpacity: 1, interactive: false }).addTo(draftLayer); if (points.length >= 2 && points.length < 3) L.polyline(points, { color: "#ffe29a", weight: 3, interactive: false }).addTo(draftLayer); for (const point of draftPoints) L.circleMarker(point, { radius: 7, color: "#171717", weight: 2, fillColor: "#f0c879", fillOpacity: 1, interactive: false }).addTo(draftLayer); }
  function finishZoneDraft() { if (draftPoints.length < 3) return; view.drawing = false; document.querySelector("#prime-map").classList.remove("drawing"); document.querySelector("#map-zone-start").textContent = "Disegna"; document.querySelector("#map-zone-finish").hidden = true; document.querySelector("#map-zone-form").hidden = false; document.querySelector("#map-zone-help").textContent = `Perimetro pronto con ${draftPoints.length} punti. Dai un nome alla zona e salvala.`; document.querySelector("#map-action-hint").textContent = `Perimetro pronto · ${draftPoints.length} punti. Completa il nome nel pannello Zone agenti.`; document.querySelector("#map-zone-title").scrollIntoView({ behavior: "smooth", block: "center" }); }
  document.querySelector("#map-zone-finish").onclick = finishZoneDraft;
  document.querySelector("#map-place-toggle").onclick = () => { if (!selected) return; view.placing = true; view.drawing = false; draftPoints = []; draftLayer.clearLayers(); document.querySelector("#map-zone-finish").hidden = true; document.querySelector("#map-zone-form").hidden = true; document.querySelector("#map-zone-start").textContent = "Disegna"; document.querySelector("#prime-map").classList.remove("drawing"); document.querySelector("#map-action-hint").textContent = `Clicca sulla mappa per posizionare: ${selected.title}.`; document.querySelector("#prime-map").classList.add("placing"); document.querySelector("#map-place-save").hidden = true; };
  map.on("mousemove", event => { if (!view.drawing || !draftPoints.length) return; renderDraftZone([event.latlng.lat, event.latlng.lng]); if (draftPoints.length >= 2) document.querySelector("#map-action-hint").textContent = `Area in anteprima · ${draftPoints.length} vertici fissati. Clicca per aggiungere il prossimo.`; });
  map.on("click", event => {
    if (view.drawing) { draftPoints.push([event.latlng.lat, event.latlng.lng]); renderDraftZone(); const hint = draftPoints.length < 2 ? "Fissa almeno un altro vertice con un clic." : draftPoints.length < 3 ? "Area in anteprima: muovi il puntatore e fai clic per fissare il terzo vertice." : "Area evidenziata: muovi il puntatore per vedere l’anteprima, poi premi “Termina perimetro”."; document.querySelector("#map-zone-help").textContent = `${draftPoints.length} ${draftPoints.length === 1 ? "vertice fissato" : "vertici fissati"}. ${hint}`; document.querySelector("#map-action-hint").textContent = `Disegno zona · ${draftPoints.length} ${draftPoints.length === 1 ? "vertice" : "vertici"}${draftPoints.length >= 3 ? " · area visibile, termina quando vuoi" : " · area in anteprima dal secondo clic"}`; document.querySelector("#map-zone-finish").hidden = draftPoints.length < 3; if (draftPoints.length >= 3) document.querySelector("#map-zone-form").hidden = false; return; }
    if (!view.placing || !selected) return; pending = { latitude: event.latlng.lat, longitude: event.latlng.lng }; selected.latitude = pending.latitude; selected.longitude = pending.longitude; if (selected.entity === "properties") selected.inherited = false; view.placing = false; document.querySelector("#prime-map").classList.remove("placing"); document.querySelector("#map-action-hint").textContent = `Nuova posizione selezionata per ${selected.title}. Conferma per salvarla.`; document.querySelector("#map-place-save").hidden = false; drawMarkers(); drawResults();
  });
  document.querySelector("#map-place-save").onclick = async () => { if (!pending || !selected) return; const button = document.querySelector("#map-place-save"); button.disabled = true; try { const saved = await api("/api/map/position", { method: "PUT", body: JSON.stringify({ entity: selected.entity, id: selected.id, version: selected.row.version, latitude: pending.latitude, longitude: pending.longitude }) }); Object.assign(selected.row, saved); selected.latitude = saved.latitude; selected.longitude = saved.longitude; if (selected.entity === "buildings") propagateBuildingPosition(selected.id, selected.latitude, selected.longitude); pending = null; button.hidden = true; document.querySelector("#map-action-hint").textContent = "Posizione salvata."; drawMarkers(); drawResults(); updateMoveButton(); } catch(error) { document.querySelector("#map-action-hint").textContent = error.message; } finally { button.disabled = false; } };
  document.querySelector("#map-fit").onclick = () => { const points = matches().filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map(item => [item.latitude, item.longitude]); if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 15 }); else map.setView([42.2, 12.6], 6); };
  document.querySelector("#map-zone-start").onclick = event => {
    if (!canManageZones || !assignableAgents.length) return;
    view.placing = false; pending = null; document.querySelector("#map-place-save").hidden = true; document.querySelector("#prime-map").classList.remove("placing");
    if (view.drawing) { view.drawing = false; document.querySelector("#map-zone-start").textContent = "Disegna"; document.querySelector("#map-zone-finish").hidden = true; document.querySelector("#map-action-hint").textContent = "Disegno in pausa. Premi Disegna per continuare o Annulla disegno per scartare i punti."; return; }
    if (draftPoints.length) { view.drawing = true; event.currentTarget.textContent = "Pausa disegno"; document.querySelector("#map-zone-finish").hidden = draftPoints.length < 3; document.querySelector("#map-zone-form").hidden = draftPoints.length < 3; document.querySelector("#map-zone-help").textContent = `Disegno ripreso · ${draftPoints.length} punti già segnati.`; document.querySelector("#map-action-hint").textContent = `Disegno zona ripreso · ${draftPoints.length} punti.`; document.querySelector("#prime-map").classList.add("drawing"); return; }
    draftLayer.clearLayers(); document.querySelector("#map-zone-form").hidden = true; view.drawing = true; event.currentTarget.textContent = "Pausa disegno"; document.querySelector("#map-zone-help").textContent = "Clicca per fissare i vertici: dopo il secondo clic l’area oro seguirà il puntatore."; document.querySelector("#map-action-hint").textContent = "Disegno zona attivo · fai clic sulla mappa per fissare il primo vertice."; document.querySelector("#prime-map").classList.add("drawing");
  };
  document.querySelector("#map-zone-save").onclick = async () => { if (draftPoints.length < 3) return; const title = document.querySelector("#map-zone-title").value.trim(), agent_id = document.querySelector("#map-zone-agent").value; if (!title) { document.querySelector("#map-zone-title").focus(); return; } const closed = [...draftPoints, draftPoints[0]]; try { await api("/api/map/zones", { method: "POST", body: JSON.stringify({ title, agent_id, polygon: closed }) }); state.mapZones = await api("/api/map/zones"); draftPoints = []; draftLayer.clearLayers(); view.drawing = false; document.querySelector("#map-zone-start").textContent = "Disegna"; document.querySelector("#map-zone-finish").hidden = true; document.querySelector("#map-zone-form").hidden = true; document.querySelector("#map-zone-title").value = ""; document.querySelector("#prime-map").classList.remove("drawing"); document.querySelector("#map-action-hint").textContent = "Zona salvata sulla mappa."; document.querySelector("#map-zone-help").textContent = "Zona salvata."; drawZones(); } catch(error) { document.querySelector("#map-zone-help").textContent = error.message; } };
  document.querySelector("#map-zone-cancel").onclick = () => { draftPoints = []; draftLayer.clearLayers(); view.drawing = false; document.querySelector("#map-zone-start").textContent = "Disegna"; document.querySelector("#map-zone-finish").hidden = true; document.querySelector("#map-zone-form").hidden = true; document.querySelector("#prime-map").classList.remove("drawing"); document.querySelector("#map-action-hint").textContent = "Disegno annullato."; document.querySelector("#map-zone-help").textContent = state.mapZones.length ? "Disegna un’altra zona oppure selezionane una salvata." : "Nessuna zona salvata. Premi Disegna, poi fai clic sulla mappa almeno tre volte."; };
  state.mapZones ||= await api("/api/map/zones");
  drawResults(); drawSelection(); drawMarkers(); drawZones(); updateMoveButton();
  const points = matches().filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map(item => [item.latitude, item.longitude]); if (points.length) map.fitBounds(points, { padding: [35, 35], maxZoom: 15 });
  setTimeout(() => map.invalidateSize(), 0);
}
