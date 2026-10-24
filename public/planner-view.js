import { daysFor, dayKey, layoutDay } from "./planner.js";

export function renderPlanner({
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
}) {
  const entity = state.page,
    isWps = entity === "activities";
  const views = (state.plannerViews ??= {
    activities: "day",
    appointments: "week",
  });
  state.day ||= dayKey();
  const view = views[entity],
    title = isWps ? "WPS · La tua giornata" : "Agenda appuntamenti";
  main.innerHTML =
    pageHeader(
      isWps ? "UN’ORA. UN OBIETTIVO." : "IL TEMPO DELLE RELAZIONI",
      title,
      isWps
        ? "Suddividi il lavoro in blocchi orari e registra il risultato di ogni attività."
        : "Tutti gli incontri su una griglia. Ogni appuntamento al suo posto.",
      `<button class="primary" id="planner-create">${icon("plus")} ${isWps ? "Pianifica attività" : "Nuovo appuntamento"}</button>`,
    ) +
    (isWps
      ? '<section class="wps-focus" id="wps-live-timer" aria-label="Timer della tua attività"></section>'
      : "") +
    `<section class="planner panel"><div class="planner-toolbar"><div class="planner-date-nav"><button class="icon-button" id="planner-prev" aria-label="Periodo precedente">‹</button><button class="secondary" id="planner-today">Oggi</button><button class="icon-button" id="planner-next" aria-label="Periodo successivo">›</button><h2 id="planner-period"></h2></div><div class="planner-view-toggle" aria-label="Vista calendario"><button data-view="day" class="${view === "day" ? "selected" : ""}">Giorno</button><button data-view="week" class="${view === "week" ? "selected" : ""}">Settimana</button></div></div><div class="planner-filters">${searchBox(isWps ? "Cerca attività, tipo o risultato…" : "Cerca appuntamenti…")}<label class="sr-only" for="planner-date">Data da visualizzare</label><input type="date" id="planner-date" value="${state.day}"><select id="planner-agent" aria-label="Filtra per agente"><option value="">Tutti gli agenti</option>${state.members.map((r) => `<option value="${r.id}">${esc(r.title)}</option>`).join("")}</select><span id="planner-count" class="muted"></span></div><div class="planner-legend"><span class="legend-item"><i class="legend-swatch planned"></i>${isWps ? "Pianificata" : "Da confermare"}</span><span class="legend-item"><i class="legend-swatch confirmed"></i>${isWps ? "In corso" : "Confermato"}</span><span class="legend-item"><i class="legend-swatch done"></i>${isWps ? "Completata" : "Effettuato"}</span><span class="legend-item"><i class="legend-swatch missed"></i>${isWps ? "Non completata" : "Saltato / annullato"}</span></div><div id="planner-grid"></div><p class="small-note">${isWps ? "Seleziona una fascia vuota per pianificare un compito. Il timer segue le tue attività, anche mentre consulti altre sezioni." : "Seleziona una fascia vuota per aggiungere un appuntamento. Gli eventi collegati al WPS sono gli stessi presenti nella scheda dell’attività."}</p></section>`;
  const agent = document.querySelector("#planner-agent");
  agent.value = state.plannerAgents?.[entity] ?? (isWps ? state.me.id : "");
  function newBlock(
    start = new Date(),
    end = new Date(+start + 3600000),
    extra = {},
  ) {
    openEditor(entity, null, {
      agent_id: agent.value || state.me.id,
      starts_at: start.toISOString(),
      [isWps ? "due_at" : "ends_at"]: end.toISOString(),
      ...extra,
    });
  }
  if (!isWps) {
    const quick = document.createElement("div");
    quick.className = "appointment-quick-actions";
    quick.innerHTML = [
      ["1ª visita immobile", "+ 1ª visita"],
      ["2ª visita immobile", "+ 2ª visita"],
      ["servizio fotografico immobile", "+ Servizio fotografico"],
      ["appuntamento con proprietario", "+ Con proprietario"],
    ]
      .map(
        ([value, label]) =>
          `<button data-appointment-type="${value}">${label}</button>`,
      )
      .join("");
    main.querySelector(".planner-filters").after(quick);
    quick.querySelectorAll("button").forEach(
      (b) =>
        (b.onclick = () => {
          const start = new Date(state.day + "T09:00:00");
          if (state.day === dayKey()) {
            const now = new Date();
            start.setHours(now.getHours() + 1, 0, 0, 0);
          }
          newBlock(start, new Date(+start + 3600000), {
            appointment_type: b.dataset.appointmentType,
            title: "",
          });
        }),
    );
  }
  document.querySelector("#planner-create").onclick = () => {
    const start = new Date(state.day + "T09:00:00");
    if (state.day === dayKey()) {
      const now = new Date();
      start.setHours(now.getHours() + 1, 0, 0, 0);
    }
    newBlock(start);
  };
  document.querySelector("#planner-date").onchange = (e) => {
    if (!e.target.value) return;
    state.day = e.target.value;
    draw();
  };
  agent.onchange = () => {
    state.plannerAgents ??= {};
    state.plannerAgents[entity] = agent.value;
    draw();
  };
  for (const [id, delta] of [
    ["planner-prev", -1],
    ["planner-next", 1],
  ])
    document.getElementById(id).onclick = () => {
      const d = new Date(state.day + "T12:00:00");
      d.setDate(d.getDate() + delta * (view === "week" ? 7 : 1));
      state.day = dayKey(d);
      document.querySelector("#planner-date").value = state.day;
      draw();
    };
  document.querySelector("#planner-today").onclick = () => {
    state.day = dayKey();
    document.querySelector("#planner-date").value = state.day;
    draw();
  };
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        views[entity] = b.dataset.view;
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
      }),
  );
  bindSearch(() => draw(false));
  function draw(resetScroll = true) {
    const days = daysFor(state.day, view),
      all = [...(state.data[entity] || []),...(!isWps?(state.externalBusy||[]).map(b=>({...b,id:'busy-'+b.id,external_busy:true,status:'Occupato',search_text:'occupato'})):[])]
        .filter(matches)
        .filter((r) => !agent.value || r.agent_id === agent.value),
      endField = isWps ? "due_at" : "ends_at";
    const segments = days.map((day) => layoutDay(all, day, { endField }));
    const dayFmt = new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const dateFmt = new Intl.DateTimeFormat("it-IT", {
      month: "long",
      year: "numeric",
    });
    document.querySelector("#planner-period").textContent =
      view === "day"
        ? new Intl.DateTimeFormat("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(state.day + "T12:00:00"))
        : dateFmt.format(new Date(days[0] + "T12:00:00")) +
          " · " +
          new Date(days[0] + "T12:00:00").getDate() +
          "–" +
          new Date(days.at(-1) + "T12:00:00").getDate();
    document.querySelector("#planner-count").textContent =
      new Set(segments.flat().map((x) => x.record.id)).size +
      " " +
      (isWps ? "attività" : "appuntamenti");
    let startHour = 7,
      endHour = 21;
    for (const segment of segments.flat()) {
      startHour = Math.min(startHour, Math.floor(segment.top / 60));
      endHour = Math.max(
        endHour,
        Math.ceil((segment.top + segment.minutes) / 60),
      );
    }
    const hours = Array.from(
      { length: endHour - startHour },
      (_, i) => startHour + i,
    );
    const target = document.querySelector("#planner-grid"),
      previousScroll = target.querySelector(".planner-scroll")?.scrollTop || 0;
    target.innerHTML = `<div class="planner-scroll"><div class="time-grid ${view === "day" ? "single-day" : "seven-days"}"><div class="time-grid-head"><div class="time-zone">ORA<br>LOCALE</div>${days.map((day, i) => `<div class="day-heading ${day === dayKey() ? "is-today" : ""}"><span>${esc(dayFmt.format(new Date(day + "T12:00:00")))}</span><strong>${new Date(day + "T12:00:00").getDate()}</strong><small>${segments[i].length} ${isWps ? "attività" : "incontri"}</small></div>`).join("")}</div><div class="time-grid-body"><div class="hour-labels">${hours.map((h) => `<span data-hour="${h}">${String(h).padStart(2, "0")}:00</span>`).join("")}</div>${days
      .map(
        (day, i) =>
          `<div class="day-column ${day === dayKey() ? "today-column" : ""}" data-day="${day}">${hours.map((h) => `<button class="time-slot" data-hour="${h}" aria-label="${isWps ? "Pianifica attività" : "Nuovo appuntamento"} ${day} ore ${h}:00"></button>`).join("")}${segments[
            i
          ]
            .map((segment, index) => {
              const r = segment.record;
              const style = isWps
                ? r.status === "completata"
                  ? "done"
                  : r.status === "non completata" || r.status === "annullata"
                    ? "missed"
                    : r.status === "in corso"
                      ? "confirmed"
                      : "planned"
                : r.status === "effettuato"
                  ? "done"
                  : ["saltato", "annullato", "riprogrammato"].includes(r.status)
                    ? "missed"
                    : r.status === "confermato"
                      ? "confirmed"
                      : "planned";
              return `<button class="calendar-event ${r.external_busy?'external-busy':style} ${segment.minutes < 35 ? "short-event" : segment.minutes < 90 ? "compact-event" : ""}" data-event="${r.id}" data-segment="${index}" aria-label="${esc(r.title)} · ${esc(r.status)}"><span class="event-time">${time(r.starts_at)}–${time(r[endField])}</span><strong>${esc(r.title)}</strong><small>${esc(isWps ? r.activity_type : refLabel("members", r.agent_id))}</small><span class="event-status">${esc(r.status)}${!isWps && r.activity_id ? " · WPS" : ""}</span></button>`;
            })
            .join(
              "",
            )}<div class="now-line" hidden aria-hidden="true"><span></span></div></div>`,
      )
      .join("")}</div></div></div>`;
    const height = hours.length * 64;
    target.querySelector(".time-grid-body").style.height = height + "px";
    target
      .querySelectorAll(".hour-labels [data-hour],.time-slot")
      .forEach((el) => {
        el.style.top = (Number(el.dataset.hour) - startHour) * 64 + "px";
      });
    target.querySelectorAll(".day-column").forEach((column, i) => {
      column.querySelectorAll(".calendar-event").forEach((el) => {
        const segment = segments[i][Number(el.dataset.segment)];
        el.style.top = ((segment.top - startHour * 60) / 60) * 64 + "px";
        el.style.height = Math.max(25, (segment.minutes / 60) * 64 - 3) + "px";
        el.style.left = `calc(${(segment.lane / segment.lanes) * 100}% + 4px)`;
        el.style.width = `calc(${100 / segment.lanes}% - 8px)`;
        if(segment.record.external_busy){el.setAttribute('aria-label','Occupato · calendario personale');el.onclick=()=>{};}else el.onclick = () => openEditor(entity, segment.record);
      });
      column.querySelectorAll(".time-slot").forEach(
        (el) =>
          (el.onclick = () => {
            const start = new Date(
              column.dataset.day +
                `T${String(el.dataset.hour).padStart(2, "0")}:00:00`,
            );
            newBlock(start);
          }),
      );
    });
    target.dataset.startHour = startHour;
    target.dataset.endHour = endHour;
    updateNowLine(target);
    const scroll = target.querySelector(".planner-scroll");
    if (!resetScroll) scroll.scrollTop = previousScroll;
    else {
      const first = segments.flat().sort((a, b) => a.top - b.top)[0];
      const scrollHour = first
        ? Math.floor(first.top / 60)
        : new Date().getHours();
      scroll.scrollTop = Math.max(0, (scrollHour - startHour - 1) * 64);
    }
  }
  draw();
}
const time = (x) =>
  new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(x));
export function updateNowLine(
  target = document.querySelector("#planner-grid"),
) {
  if (!target) return;
  const now = new Date(),
    today = dayKey(now),
    start = Number(target.dataset.startHour),
    end = Number(target.dataset.endHour),
    minutes = now.getHours() * 60 + now.getMinutes();
  target.querySelectorAll(".day-column").forEach((column) => {
    const line = column.querySelector(".now-line");
    line.hidden =
      column.dataset.day !== today ||
      minutes < start * 60 ||
      minutes > end * 60;
    if (!line.hidden)
      line.style.top = ((minutes - start * 60) / 60) * 64 + "px";
  });
}
