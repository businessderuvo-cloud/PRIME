const phoneKinds = ["Ufficio", "Casa", "Cell personale", "Cell di lavoro"];
const phoneTypes = ["telefono", "WhatsApp"];
const socialTypes = ["Facebook", "Instagram", "LinkedIn", "altro social"];
export function mountRepeatableRecaps({
  container,
  esc,
  methods = [],
  phoneInput = null,
}) {
  const phone = document.createElement("section"),
    social = document.createElement("section");
  phone.className = social.className = "repeatable-recaps full";
  phone.innerHTML =
    '<div data-recap-rows></div><button type="button" class="secondary" data-add-phone>+ Aggiungi numero</button>';
  social.innerHTML =
    '<h3>Profili social</h3><div data-recap-rows></div><button type="button" class="secondary" data-add-social>+ Aggiungi social</button>';
  const label = phoneInput?.closest("label");
  if (label) {
    label.classList.add("full");
    label.after(phone);
  } else container.append(phone);
  phone.after(social);
  let nextPhone = phoneInput ? 2 : 1,
    nextSocial = 1;
  const rows = [];
  const preserved = methods.filter(
    (m) =>
      !phoneTypes.includes(m.method_type) &&
      !socialTypes.includes(m.method_type),
  );
  function add(kind, method = null) {
    const section = kind === "phone" ? phone : social;
    const row = document.createElement("div");
    row.className = "repeatable-recap-row";
    const count = kind === "phone" ? nextPhone++ : nextSocial++;
    const types = kind === "phone" ? phoneKinds : socialTypes;
    row.innerHTML = `<label>${kind === "phone" ? "Telefono " + count : "Profilo social " + count}<input type="${kind === "phone" ? "tel" : "text"}" data-recap-value maxlength="400" value="${esc(method?.value || "")}" placeholder="${kind === "phone" ? "Numero di telefono" : "Link o nome del profilo"}"></label><label>${kind === "phone" ? "Tipo di numero" : "Social"}<select data-recap-type>${kind === "phone" ? '<option value="">Seleziona tipo…</option>' : ""}${types.map((t) => `<option ${(kind === "phone" ? method?.phone_kind : method?.method_type) === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label><label>Etichetta (facoltativa)<input data-recap-label maxlength="200" value="${esc(method?.title || "")}" placeholder="${kind === "phone" ? "Es. cellulare personale" : "Es. profilo personale"}"></label>${!method ? '<button type="button" class="text-button" data-remove-recap aria-label="Rimuovi campo aggiunto">×</button>' : ""}`;
    section.querySelector("[data-recap-rows]").append(row);
    const entry = { row, kind, method };
    rows.push(entry);
    row.querySelector("[data-remove-recap]")?.addEventListener("click", () => {
      rows.splice(rows.indexOf(entry), 1);
      row.remove();
    });
    return row;
  }
  for (const method of methods) {
    if (phoneTypes.includes(method.method_type)) add("phone", method);
    if (socialTypes.includes(method.method_type)) add("social", method);
  }
  phone.querySelector("[data-add-phone]").onclick = () =>
    add("phone").querySelector("input").focus();
  social.querySelector("[data-add-social]").onclick = () =>
    add("social").querySelector("input").focus();
  const toDraft = (m) => ({
    id: m.id,
    version: m.version,
    data: {
      title: m.title,
      method_type: m.method_type,
      phone_kind: m.phone_kind || "",
      value: m.value,
      notes: m.notes || "",
    },
  });
  return () => [
    ...preserved.map(toDraft),
    ...rows
      .filter(
        ({ row, method }) =>
          method || row.querySelector("[data-recap-value]").value.trim(),
      )
      .map(({ row, method, kind }) => ({
        id: method?.id,
        version: method?.version,
        data: {
          title: row.querySelector("[data-recap-label]").value.trim(),
          method_type:
            kind === "phone"
              ? method?.method_type || "telefono"
              : row.querySelector("[data-recap-type]").value,
          phone_kind:
            kind === "phone"
              ? row.querySelector("[data-recap-type]").value
              : "",
          value: row.querySelector("[data-recap-value]").value.trim(),
          notes: method?.notes || "",
        },
      })),
  ];
}
