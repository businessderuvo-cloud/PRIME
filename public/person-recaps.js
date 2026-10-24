import { schema } from "./schema.js";

export function mountPersonRecaps({
  dialog,
  entity,
  record,
  state,
  esc,
  api,
  loadData,
}) {
  const section = document.createElement("section");
  section.className = "property-person-recaps";
  dialog.querySelector(".form-grid").after(section);
  function people() {
    const ids = new Set();
    if (entity === "contacts") {
      if (record) ids.add(record.id);
    } else {
      const owner = dialog.querySelector("[name=owner_id]").value;
      const unit = dialog.querySelector("[name=unit_id]").value;
      if (owner) ids.add(owner);
      for (const link of state.data.unit_contacts || [])
        if (unit && link.unit_id === unit) ids.add(link.contact_id);
    }
    return (state.data.contacts || []).filter((p) => ids.has(p.id));
  }
  function draw() {
    section.innerHTML = `<h3>Persone · Numeri e social</h3><p class="small-note">I recapiti appartengono alla singola persona e sono condivisi con CRM e territorio. Si salvano con il pulsante dedicato.</p>${
      people()
        .map(
          (p) =>
            `<article class="territory-person"><h4>${esc(p.title)}</h4>${Number(p.is_hot_lead) === 1 ? '<span class="spot-badge spot-hot">● LEAD CALDO</span>' : ""}<div class="person-primary-contacts">${p.phone ? `<span>Telefono principale: ${esc(p.phone)}</span>` : ""}${p.email ? `<span>${esc(p.email)}</span>` : ""}</div><div class="person-methods">${(
              state.data.contact_methods || []
            )
              .filter((m) => m.contact_id === p.id)
              .map(
                (m) =>
                  `<div><span>${esc(m.method_type)} · ${esc(m.title)}</span><strong>${esc(m.value)}</strong><button type="button" class="text-button" data-recap-edit="${m.id}">Modifica</button></div>`,
              )
              .join(
                "",
              )}</div><button type="button" class="secondary" data-recap-add="${p.id}">+ Numero / profilo social</button><div data-recap-editor="${p.id}"></div></article>`,
        )
        .join("") ||
      `<p class="small-note">${entity === "contacts" ? "Salva prima la persona per aggiungere più recapiti." : "Seleziona il proprietario o un appartamento con persone collegate per aggiungere numeri e social."}</p>`
    }`;
    section
      .querySelectorAll("[data-recap-add]")
      .forEach((b) => (b.onclick = () => editor(b.dataset.recapAdd)));
    section.querySelectorAll("[data-recap-edit]").forEach((b) => {
      b.onclick = () => {
        const m = state.data.contact_methods.find(
          (m) => m.id === b.dataset.recapEdit,
        );
        editor(m.contact_id, m);
      };
    });
  }
  function editor(personId, method = null) {
    const host = section.querySelector(`[data-recap-editor="${personId}"]`);
    host.innerHTML = `<div class="recap-fields"><label>Tipo di recapito<select data-recap-type>${schema.contact_methods.fields.method_type.options.map((t) => `<option ${method?.method_type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><label>Etichetta (facoltativa)<input data-recap-title maxlength="200" value="${esc(method?.title || "")}" placeholder="Es. cellulare personale"></label><label>Numero, indirizzo o profilo<input data-recap-value maxlength="400" value="${esc(method?.value || "")}" placeholder="Numero o link al profilo"></label><p class="error" role="alert" hidden></p><div><button type="button" class="primary" data-recap-save>Salva recapito</button> <button type="button" class="secondary" data-recap-cancel>Annulla</button></div></div>`;
    host.querySelector("[data-recap-cancel]").onclick = () =>
      host.replaceChildren();
    host.querySelector("[data-recap-save]").onclick = async () => {
      const button = host.querySelector("[data-recap-save]"),
        error = host.querySelector(".error");
      button.disabled = true;
      error.hidden = true;
      try {
        const value = host.querySelector("[data-recap-value]").value.trim();
        if (!value)
          throw new Error("Inserisci un numero, un indirizzo o un profilo.");
        await api(
          "/api/entities/contact_methods" + (method ? "/" + method.id : ""),
          {
            method: method ? "PUT" : "POST",
            body: JSON.stringify({
              version: method?.version,
              data: {
                title: host.querySelector("[data-recap-title]").value.trim(),
                contact_id: personId,
                method_type: host.querySelector("[data-recap-type]").value,
                value,
                notes: method?.notes || "",
              },
            }),
          },
        );
        await loadData();
        draw();
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
        button.disabled = false;
      }
    };
    host.querySelector("[data-recap-value]").focus();
  }
  if (entity === "properties") {
    dialog.querySelector("[name=owner_id]").addEventListener("change", draw);
    dialog.querySelector("[name=unit_id]").addEventListener("change", draw);
  }
  draw();
}
