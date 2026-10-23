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
  if (entity === "contacts")
    output.phone = output.phone.replace(/[\s().-]/g, "");
  if (entity === "activities") {
    if (output.progress > output.goal)
      throw new ApiError(400, "L’avanzamento non può superare l’obiettivo");
    if (output.status === "completata" && !output.outcome)
      throw new ApiError(
        400,
        "Registra l’esito prima di completare l’attività",
      );
  }
  if (entity === "appointments") {
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
