import { schema } from "../public/schema.js";
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function validate(entity, input) {
  const def = schema[entity];
  if (!def) throw new ApiError(404, "Sezione non disponibile");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(400, "Dati non validi");
  for (const key of Object.keys(input))
    if (!def.fields[key])
      throw new ApiError(400, `Campo non consentito: ${key}`);
  const output = {};
  for (const [key, f] of Object.entries(def.fields)) {
    let value =
      input[key] ??
      f.default ??
      (f.type === "number"
        ? 0
        : f.type === "checkbox"
          ? 0
          : f.type === "ref"
            ? null
            : f.options
              ? f.options[0]
              : "");
    if (f.type === "number") {
      if (value === "" || !["number", "string"].includes(typeof value))
        throw new ApiError(400, `${f.label}: numero richiesto`);
      value = Number(value);
      if (
        !Number.isFinite(value) ||
        value < (f.min ?? 0) ||
        value > 1e12 ||
        (f.integer && !Number.isInteger(value))
      )
        throw new ApiError(400, `${f.label}: valore non valido`);
    } else if (f.type === "checkbox") {
      if (![0, 1, true, false].includes(value))
        throw new ApiError(400, `${f.label}: valore non valido`);
      value = Number(value);
    } else if (f.type === "ref") {
      if (value === "") value = null;
      if (value !== null && (typeof value !== "string" || value.length > 100))
        throw new ApiError(400, `${f.label}: collegamento non valido`);
    } else {
      if (typeof value !== "string")
        throw new ApiError(400, `${f.label}: testo richiesto`);
      value = value.trim();
      if (value.length > (f.max ?? 200))
        throw new ApiError(400, `${f.label}: testo troppo lungo`);
      if (f.options && !f.options.includes(value))
        throw new ApiError(400, `${f.label}: opzione non valida`);
      if (f.type === "email" && value && !/^\S+@\S+\.\S+$/.test(value))
        throw new ApiError(400, `${f.label}: email non valida`);
      if (f.type === "email") value = value.toLowerCase();
      if (
        f.type === "time" &&
        value &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
      )
        throw new ApiError(400, `${f.label}: orario non valido`);
      if (f.type === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new ApiError(400, `${f.label}: data non valida`);
      if (f.type === "datetime-local" && value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime()))
          throw new ApiError(400, `${f.label}: data non valida`);
        value = d.toISOString();
      }
    }
    if (f.required && (value === null || value === ""))
      throw new ApiError(400, `${f.label}: campo obbligatorio`);
    output[key] = value;
  }
  if(entity==='appointments'&&output.meeting_url){try{const u=new URL(output.meeting_url);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{throw new ApiError(400,'Il link videocall deve essere un indirizzo HTTPS valido.');}}
  if (entity === "contacts")
    output.phone = output.phone.replace(/[\s().-]/g, "");
  if (
    entity === "contacts" &&
    (Boolean(output.preferred_time_from) !==
      Boolean(output.preferred_time_to) ||
      (output.preferred_time_from &&
        output.preferred_time_to <= output.preferred_time_from))
  )
    throw new ApiError(
      400,
      "Indica una fascia di contatto valida, con inizio e fine",
    );
  if (entity === "unit_contacts" && !output.title)
    output.title = output.relationship;
  if (entity === "contact_methods") {
    if (!output.title) output.title = output.method_type;
    if (["telefono", "WhatsApp"].includes(output.method_type))
      output.value = output.value.replace(/[\s().-]/g, "");
    if (output.method_type === "email") {
      output.value = output.value.toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(output.value))
        throw new ApiError(400, "Indirizzo email non valido");
    }
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(output.value) &&
      !/^https?:\/\//i.test(output.value)
    )
      throw new ApiError(
        400,
        "Il profilo deve usare un indirizzo http/https o un nome utente",
      );
  }
  if (entity === "contact_interactions") {
    if (
      !["street_id", "building_id", "unit_id", "contact_id"].some(
        (k) => output[k],
      )
    )
      throw new ApiError(
        400,
        "Collega il contatto a una via, un civico, un appartamento o una persona",
      );
    if (!output.title) output.title = output.channel + " · " + output.outcome;
  }
  if (entity === "activities") {
    if (output.due_at <= output.starts_at)
      throw new ApiError(
        400,
        "La fine dell’attività deve essere successiva all’inizio",
      );
    if (output.progress > output.goal)
      throw new ApiError(400, "L’avanzamento non può superare l’obiettivo");
    if (
      ["completata", "non completata"].includes(output.status) &&
      !output.outcome
    )
      throw new ApiError(
        400,
        "Registra l’esito prima di completare l’attività",
      );
  }
  if (entity === "appointments") {
    if (!output.title) output.title = output.appointment_type;
    if (output.ends_at <= output.starts_at)
      throw new ApiError(400, "La fine deve essere successiva all’inizio");
    if (output.commercial_outcome && output.status !== "effettuato")
      throw new ApiError(
        400,
        "L’esito commerciale richiede un appuntamento effettuato",
      );
  }
  return output;
}
