import { schema } from "./schema.js";
import { mountRepeatableRecaps } from "./repeatable-recaps.js";
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
      const owner = dialog.querySelector("[name=owner_id]").value,
        unit = dialog.querySelector("[name=unit_id]").value;
      if (owner) ids.add(owner);
      for (const link of state.data.unit_contacts || [])
        if (unit && link.unit_id === unit) ids.add(link.contact_id);
    }
    return (state.data.contacts || []).filter((person) => ids.has(person.id));
  }
  function draw() {
    section.innerHTML =
      '<h3>Persone · Telefoni e social</h3><p class="small-note">Aggiungi più campi con i pulsanti +. Salva i recapiti della persona con il pulsante dedicato.</p>';
    const persons = people();
    if (!persons.length)
      section.insertAdjacentHTML(
        "beforeend",
        '<p class="small-note">Seleziona un proprietario o un appartamento con persone collegate.</p>',
      );
    for (const person of persons) {
      const card = document.createElement("article");
      card.className = "territory-person";
      card.innerHTML = `<h4>${esc(person.title)}</h4>${Number(person.is_hot_lead) === 1 ? '<span class="spot-badge spot-hot">● LEAD CALDO</span>' : ""}<div class="form-grid"><label class="full">Telefono principale · ${esc(person.title)}<input type="tel" data-person-phone maxlength="200" value="${esc(person.phone || "")}"></label></div><p class="error" role="alert" hidden></p><button type="button" class="primary" data-save-person-recaps>Salva telefoni e social</button>`;
      section.append(card);
      const primary = card.querySelector("[data-person-phone]");
      const collect = mountRepeatableRecaps({
        container: card.querySelector(".form-grid"),
        phoneInput: primary,
        esc,
        methods: (state.data.contact_methods || []).filter(
          (method) => method.contact_id === person.id,
        ),
      });
      card.querySelector("[data-save-person-recaps]").onclick = async () => {
        const button = card.querySelector("[data-save-person-recaps]"),
          error = card.querySelector(".error");
        button.disabled = true;
        error.hidden = true;
        try {
          const data = Object.fromEntries(
            Object.keys(schema.contacts.fields).map((key) => [
              key,
              person[key],
            ]),
          );
          data.phone = primary.value;
          await api("/api/entities/contacts/" + person.id, {
            method: "PUT",
            body: JSON.stringify({
              version: person.version,
              data,
              contact_methods: collect(),
            }),
          });
          await loadData();
          draw();
        } catch (e) {
          error.textContent = e.message;
          error.hidden = false;
          button.disabled = false;
        }
      };
    }
  }
  if (entity === "properties")
    for (const name of ["owner_id", "unit_id"])
      dialog.querySelector(`[name=${name}]`).addEventListener("change", draw);
  draw();
}
