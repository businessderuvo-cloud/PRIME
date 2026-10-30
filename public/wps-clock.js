import {
  clockState,
  countdown,
  activityData,
  finishedStatuses,
} from "./planner.js";
import { schema } from "./schema.js";
import { updateNowLine } from "./planner-view.js";

export function startWpsClock({
  state,
  api,
  loadData,
  renderPage,
  esc,
  openEditor,
  toast,
}) {
  let stopped = false,
    busy = false,
    polling = false,
    reviewId = null,
    autoReviewDismissed = false;
  const offset = state.clockOffset || 0;
  const bar = document.createElement("div");
  bar.id = "wps-expired-banner";
  bar.className = "wps-expired-banner";
  bar.hidden = true;
  document.querySelector(".topbar").after(bar);
  const dialog = document.createElement("dialog");
  dialog.id = "wps-resolution";
  dialog.setAttribute("aria-labelledby", "wps-resolution-title");
  document.body.append(dialog);
  function dismissReview() {
    autoReviewDismissed = true;
    dialog.close();
    reviewId = null;
  }
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    dismissReview();
  });
  function tick() {
    if (stopped || !state.me || state.me.role === "external") return;
    const clock = clockState(
      state.data.activities || [],
      state.me.id,
      Date.now() + offset,
    );
    if (reviewId) {
      const live = (state.data.activities || []).find((a) => a.id === reviewId);
      if (!live || finishedStatuses.has(live.status)) {
        dialog.close();
        reviewId = null;
      }
    }
    const card = document.querySelector("#wps-live-timer");
    if (card) {
      const a = clock.activity;
      card.classList.toggle("needs-review", clock.phase === "review");
      const key = [
        clock.phase,
        a?.id,
        a?.version,
        clock.next?.id,
        clock.next?.version,
        clock.overdue.length,
      ].join(":");
      if (card.dataset.clockKey !== key) {
        card.dataset.clockKey = key;
        card.innerHTML = `<div class="focus-copy"><p class="eyebrow">${clock.phase === "running" ? "IL TUO BLOCCO ATTUALE" : clock.phase === "waiting" ? "LA TUA PROSSIMA ATTIVITÀ" : clock.phase === "review" ? "È IL MOMENTO DI REGISTRARE L’ESITO" : "IL TUO TEMPO, SOTTO CONTROLLO"}</p><h2>${esc(a?.title || "Nessuna attività in programma")}</h2><p>${clock.phase === "running" ? "Tempo residuo prima della fine del blocco." : clock.phase === "waiting" ? "Il conto alla rovescia indica quanto manca all’inizio." : clock.phase === "review" ? `${clock.overdue.length} attività ${clock.overdue.length === 1 ? "attende" : "attendono"} la tua conferma.` : "Pianifica un blocco nella griglia per organizzare la giornata."}</p></div><div class="focus-clock"><span class="countdown" role="timer" aria-label="Conto alla rovescia">${countdown(clock.seconds)}</span><small>${clock.phase === "running" ? "ALLA FINE DEL BLOCCO" : clock.phase === "waiting" ? "ALL’INIZIO DEL BLOCCO" : clock.phase === "review" ? "ESITO DA REGISTRARE" : "PRONTO PER IL PROSSIMO OBIETTIVO"}</small></div>${a ? `<button class="secondary" id="focus-action">${clock.phase === "review" ? "Registra esito" : "Apri attività"}</button>` : ""}`;
        if (a)
          card.querySelector("#focus-action").onclick = () =>
            clock.phase === "review"
              ? showReview(a)
              : openEditor("activities", a);
        if (clock.next) {
          const next = document.createElement("p");
          next.className = "focus-next";
          next.innerHTML = `Prossima attività: <strong>${esc(clock.next.title)}</strong> · tra <span data-next-countdown></span>`;
          card.querySelector(".focus-copy").append(next);
        }
      }
      card.querySelector(".countdown").textContent = countdown(clock.seconds);
      const nextCounter = card.querySelector("[data-next-countdown]");
      if (nextCounter && clock.next)
        nextCounter.textContent = countdown(
          Math.ceil(
            (Date.parse(clock.next.starts_at) - Date.now() - offset) / 1000,
          ),
        );
    }
    bar.hidden = clock.phase !== "review";
    if (clock.phase === "review") {
      if (bar.dataset.activityId !== clock.activity.id) {
        bar.dataset.activityId = clock.activity.id;
        bar.innerHTML = `<span><strong>Blocco WPS terminato.</strong> ${esc(clock.activity.title)} · registra se l’attività è stata completata.</span><button class="secondary" id="expired-review">Registra esito</button>`;
        bar.querySelector("button").onclick = () => showReview(clock.activity);
      }
      if (
        !autoReviewDismissed &&
        !dialog.open &&
        !document.querySelector("#editor")?.open &&
        !busy
      )
        showReview(clock.activity);
    }
    updateNowLine();
  }
  function showReview(initial) {
    if (dialog.open || busy) return;
    reviewId = initial.id;
    let current = initial;
    const fmt = new Intl.DateTimeFormat((document.documentElement.lang==='en'?'en-GB':'it-IT'), {
      dateStyle: "medium",
      timeStyle: "short",
    });
    dialog.innerHTML = `<form id="wps-result-form"><header class="dialog-header"><div><p class="eyebrow">BLOCCO ORARIO TERMINATO</p><h2 id="wps-resolution-title">Come è andata l’attività?</h2></div><button type="button" class="icon-button" id="close-wps-review" aria-label="Chiudi pannello WPS" title="Chiudi">×</button></header><div class="dialog-body"><h3>${esc(initial.title)}</h3><p class="muted">${esc(fmt.format(new Date(initial.starts_at)))} → ${esc(fmt.format(new Date(initial.due_at)))}</p><p class="small-note">Il tempo è scaduto. Puoi chiudere questo pannello e registrare l’esito più tardi dal WPS o dal promemoria. Nessuna attività viene completata automaticamente.</p><div class="error" role="alert" hidden></div><fieldset class="resolution-options"><legend>Esito del blocco</legend><label><input type="radio" name="result" value="completata" required>Completata</label><label><input type="radio" name="result" value="non completata" required>Non completata</label></fieldset><label class="resolution-label">Risultato / motivo<textarea name="outcome" rows="3" required maxlength="200" placeholder="Descrivi il lavoro svolto o il motivo del mancato completamento."></textarea></label><label class="resolution-label">Prossima azione<input name="next_action" maxlength="200" value="${esc(initial.next_action)}"></label></div><footer class="dialog-footer"><button class="primary" type="submit">Conferma esito</button></footer></form>`;
    dialog.querySelector("#close-wps-review").onclick = dismissReview;
    dialog.showModal();
    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const button = e.target.querySelector("[type=submit]"),
        error = e.target.querySelector(".error");
      button.disabled = true;
      error.hidden = true;
      try {
        const form = new FormData(e.target);
        const data = {
          ...activityData(current, schema.activities.fields),
          status: form.get("result"),
          outcome: String(form.get("outcome")).trim(),
          next_action: String(form.get("next_action")).trim(),
        };
        await api("/api/entities/activities/" + current.id, {
          method: "PUT",
          body: JSON.stringify({ version: current.version, data }),
        });
        await loadData();
        dialog.close();
        reviewId = null;
        if (!document.querySelector("#editor")?.open) await renderPage();
        toast("Esito WPS registrato.");
      } catch (ex) {
        error.textContent = ex.message;
        error.hidden = false;
        if (ex.status === 409) {
          await loadData();
          current =
            (state.data.activities || []).find((a) => a.id === initial.id) ||
            current;
          error.textContent += " Verifica i dati e conferma nuovamente.";
        }
      } finally {
        busy = false;
        button.disabled = false;
        tick();
      }
    };
  }
  const timer = setInterval(tick, 1000);
  const poll = setInterval(async () => {
    if (stopped || polling || busy || !state.me) return;
    polling = true;
    try {
      const rows = await api("/api/entities/activities");
      if (!stopped) {
        state.data.activities = rows;
        tick();
      }
    } catch (e) {
      if (e.status === 401) {
        stopped = true;
        clearInterval(timer);
        clearInterval(poll);
        dialog.close();
        bar.hidden = true;
        toast("Sessione scaduta. Accedi nuovamente per continuare.");
      }
    } finally {
      polling = false;
    }
  }, 30000);
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  queueMicrotask(tick);
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(poll);
    document.removeEventListener("visibilitychange", onVisible);
    dialog.close();
    dialog.remove();
    bar.remove();
  };
}
