import { randomUUID } from "node:crypto";
import { ApiError } from "./validation.mjs";

const normalize = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("it-IT");

const developerEmails = () => new Set(String(process.env.PRIME_DEVELOPER_EMAILS || process.env.PRIME_DEVELOPER_EMAIL || "")
  .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

function assistantContext(db, session) {
  const agentFilter = session.role === "agent";
  const properties = db
    .prepare(
      `SELECT p.title,p.marketing_status,p.price,u.property_type,u.area,u.rooms,u.condition,
              s.city,s.district
       FROM properties p
       LEFT JOIN units u ON u.tenant_id=p.tenant_id AND u.id=p.unit_id
       LEFT JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id
       LEFT JOIN streets s ON s.tenant_id=b.tenant_id AND s.id=b.street_id
       WHERE p.tenant_id=? AND p.marketing_status IN ('preparazione','in vendita','in affitto','in trattativa')
         AND (?=0 OR p.assigned_agent_id=?)
       ORDER BY p.updated_at DESC LIMIT 100`,
    )
    .all(session.tenant_id, agentFilter ? 1 : 0, session.user_id)
    .map((row) => ({
      title: row.title,
      status: row.marketing_status,
      price_eur: row.price,
      type: row.property_type || "non specificato",
      area_sqm: row.area || null,
      rooms: row.rooms || null,
      condition: row.condition || "non specificato",
      city: row.city || "non specificata",
      district: row.district || "",
    }));

  const units = db.prepare(
    `SELECT u.id,u.title,u.building_id,u.staircase,u.floor,u.area,u.rooms,u.property_type,
            u.condition,u.occupancy_status,u.commercial_status,u.acquisition_status,u.is_hot_lead,
            b.title AS building_title,b.concierge_name,b.concierge_phone,
            b.administrator_name,b.administrator_phone,s.title AS street,s.city,s.district
     FROM units u
     JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id
     JOIN streets s ON s.tenant_id=b.tenant_id AND s.id=b.street_id
     WHERE u.tenant_id=? ORDER BY s.city,s.title,b.title,u.floor,u.title LIMIT 500`,
  ).all(session.tenant_id);

  const contactPhones = new Map(db.prepare(
    `SELECT contact_id,group_concat(DISTINCT value) AS extra_phones
     FROM contact_methods WHERE tenant_id=? AND method_type IN ('telefono','WhatsApp')
     GROUP BY contact_id`,
  ).all(session.tenant_id).map((row) => [row.contact_id, row.extra_phones || ""]));
  const contacts = db.prepare(
    `SELECT id,title,email,phone,contact_type,is_hot_lead,do_not_contact,assigned_agent_id,
            notes,profession,preferred_channel,preferred_days,preferred_time_from,preferred_time_to,preference_notes,info_source,verified_on
     FROM contacts WHERE tenant_id=? ORDER BY title LIMIT 1000`,
  ).all(session.tenant_id).map((contact) => ({
    ...contact,
    phones: [contact.phone, ...(contactPhones.get(contact.id) || "").split(",")].filter(Boolean),
  }));
  const unitContacts = db.prepare(
    `SELECT uc.unit_id,uc.relationship,c.id AS contact_id,c.title,c.phone,c.email
     FROM unit_contacts uc JOIN contacts c ON c.tenant_id=uc.tenant_id AND c.id=uc.contact_id
     WHERE uc.tenant_id=? ORDER BY c.title`,
  ).all(session.tenant_id).map((relation) => ({
    ...relation,
    phones: [relation.phone, ...(contactPhones.get(relation.contact_id) || "").split(",")].filter(Boolean),
  }));

  const activityCounts = db
    .prepare(
      `SELECT activity_type,status,priority,COUNT(*) AS count
       FROM activities WHERE tenant_id=? AND agent_id=?
       GROUP BY activity_type,status,priority ORDER BY activity_type,status,priority`,
    )
    .all(session.tenant_id, session.user_id);

  const appointmentCounts = db
    .prepare(
      `SELECT status,appointment_type,COUNT(*) AS count
       FROM appointments WHERE tenant_id=? AND (?=0 OR agent_id=?)
       GROUP BY status,appointment_type ORDER BY status,appointment_type`,
    )
    .all(session.tenant_id, agentFilter ? 1 : 0, session.user_id);

  const upcomingAppointments = db.prepare(
    `SELECT a.title,a.appointment_type,a.starts_at,a.ends_at,a.status,
            p.title AS property_title,u.title AS unit_title,s.city
     FROM appointments a
     LEFT JOIN properties p ON p.tenant_id=a.tenant_id AND p.id=a.property_id
     LEFT JOIN units u ON u.tenant_id=p.tenant_id AND u.id=p.unit_id
     LEFT JOIN buildings b ON b.tenant_id=u.tenant_id AND b.id=u.building_id
     LEFT JOIN streets s ON s.tenant_id=b.tenant_id AND s.id=b.street_id
     WHERE a.tenant_id=? AND a.starts_at>=?
       AND a.status NOT IN ('annullato','saltato','riprogrammato')
       AND (?=0 OR a.agent_id=?)
     ORDER BY a.starts_at LIMIT 30`,
  ).all(session.tenant_id, new Date().toISOString(), agentFilter ? 1 : 0, session.user_id);

  const contactCounts = db
    .prepare(
      `SELECT contact_type,COUNT(*) AS count FROM contacts
       WHERE tenant_id=? AND (?=0 OR assigned_agent_id=?)
       GROUP BY contact_type ORDER BY contact_type`,
    )
    .all(session.tenant_id, agentFilter ? 1 : 0, session.user_id);

  const doNotContact = db
    .prepare(
      `SELECT COUNT(*) AS count FROM contacts
       WHERE tenant_id=? AND do_not_contact=1 AND (?=0 OR assigned_agent_id=?)`,
    )
    .get(session.tenant_id, agentFilter ? 1 : 0, session.user_id).count;

  return {
    scope: agentFilter ? "le attività assegnate a te" : "l'intera agenzia",
    active_properties: properties,
    units,
    contacts,
    unit_contacts: unitContacts,
    crm_counts_by_type: contactCounts,
    crm_do_not_contact_count: doNotContact,
    wps_counts: activityCounts,
    appointment_counts: appointmentCounts,
    upcoming_appointments: upcomingAppointments,
    privacy: "Risposte limitate ai dati della sola agenzia e ai permessi del ruolo; le informazioni restano nel server PRIME.",
  };
}

function has(text, expression) {
  return expression.test(text);
}

function formatGroups(rows, label) {
  if (!rows.length) return `Non risultano ${label} nei dati disponibili.`;
  return rows.map((row) => Object.entries(row)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value}`)
    .join(" · ")).join("\n");
}

function unitLabel(unit) {
  return [unit.street, unit.building_title, unit.staircase && `scala ${unit.staircase}`,
    unit.floor && `piano ${unit.floor}`, unit.title && `interno ${unit.title}`, unit.city]
    .filter(Boolean).join(", ");
}

function unitContactsFor(unit, context) {
  return context.unit_contacts.filter((relation) => relation.unit_id === unit.id);
}

function unitPhoneGaps(unit, context) {
  const related = unitContactsFor(unit, context);
  const gaps = [];
  if (!related.length) gaps.push("nessun referente collegato");
  for (const contact of related) {
    if (!contact.phones.length) gaps.push(`telefono mancante · ${contact.relationship}: ${contact.title}`);
  }
  if (unit.concierge_name && !unit.concierge_phone) gaps.push(`telefono custode mancante · ${unit.concierge_name}`);
  if (unit.administrator_name && !unit.administrator_phone) gaps.push(`telefono amministratore mancante · ${unit.administrator_name}`);
  return gaps;
}

function matchingUnits(query, context) {
  const q = normalize(query);
  const exactMatches = context.units.filter((unit) => [unit.title, unit.building_title, unit.street]
    .filter(Boolean).some((part) => q.includes(normalize(part))));
  if (exactMatches.length) return exactMatches;
  const cityMatches = context.units.filter((unit) => unit.city && q.includes(normalize(unit.city)));
  if (cityMatches.length) return cityMatches;
  return context.units;
}

function answerPhoneAudit(query, context) {
  const units = matchingUnits(query, context);
  const namedUnit = units.length === 1 && units[0] !== undefined &&
    [units[0].title, units[0].building_title, units[0].city].filter(Boolean)
      .some((part) => normalize(query).includes(normalize(part)));
  if (namedUnit) {
    const unit = units[0], gaps = unitPhoneGaps(unit, context);
    return gaps.length
      ? `Certo, ho controllato ${unitLabel(unit)}. Da completare: ${gaps.join("; ")}.`
      : `Ho controllato ${unitLabel(unit)}: i referenti collegati hanno un numero salvato; non risultano telefoni mancanti tra custode e amministratore registrati. Direi che qui siamo a posto 😉`;
  }
  const withGaps = units.map((unit) => ({ unit, gaps: unitPhoneGaps(unit, context) }))
    .filter(({ gaps }) => gaps.length);
  if (!withGaps.length) return "Non trovo numeri mancanti tra gli appartamenti visibili in PRIME. Se mi indichi via e interno, controllo proprio quello 😉";
  const lines = withGaps.slice(0, 12).map(({ unit, gaps }) => `• ${unitLabel(unit)}: ${gaps.join("; ")}`);
  return `Ho controllato i recapiti registrati: ${withGaps.length} appartamenti hanno qualcosa da completare.\n${lines.join("\n")}${withGaps.length > lines.length ? `\nMostro i primi ${lines.length}.` : ""}`;
}

function answerHotLeads(context) {
  const hotContacts = context.contacts.filter((contact) => contact.is_hot_lead);
  const hotUnits = context.units.filter((unit) => unit.is_hot_lead);
  if (!hotContacts.length && !hotUnits.length) return "Al momento non vedo lead marcati come caldi in PRIME. Se ne segni uno nella scheda contatto o appartamento, lo tengo subito d'occhio 😉";
  const lines = hotContacts.map((contact) => `• ${contact.title} · ${contact.contact_type}${contact.phones.length ? ` · tel. ${contact.phones.join(", ")}` : " · telefono mancante"}${contact.email ? ` · ${contact.email}` : " · email mancante"}${contact.preferred_channel && contact.preferred_channel !== "non indicato" ? ` · canale preferito: ${contact.preferred_channel}` : ""}${contact.do_not_contact ? " · non ricontattare" : ""}`);
  for (const unit of hotUnits) {
    const related = unitContactsFor(unit, context);
    lines.push(`• Lead caldo · ${unitLabel(unit)} · ${unit.acquisition_status} · ${unit.commercial_status}${related.length ? ` · referente: ${related.map((contact) => `${contact.title}${contact.phones.length ? ` (${contact.phones.join(", ")})` : " (telefono mancante)"}`).join(", ")}` : " · nessun referente collegato"}`);
  }
  return `Ho acceso i radar: questi sono i lead che PRIME segna come caldi.\n${lines.slice(0, 20).join("\n")}${lines.length > 20 ? `\nMostro i primi 20 di ${lines.length}.` : ""}`;
}

function answerOtherAgencies(query, context) {
  const rows = context.units.filter((unit) => unit.commercial_status === "altra agenzia");
  const q = normalize(query);
  const cityMatch = rows.filter((unit) => unit.city && q.includes(normalize(unit.city)));
  const found = cityMatch.length ? cityMatch : rows;
  if (!found.length) return "Non vedo appartamenti marcati «altra agenzia» nei dati PRIME. Il nome dell'agenzia esterna non ha un campo dedicato, quindi non lo invento.";
  return `Ho trovato ${found.length} appartamenti indicati come commercializzati da un'altra agenzia.\n${found.slice(0, 15).map((unit) => `• ${unitLabel(unit)} · ${unit.property_type || "tipologia non indicata"} · acquisizione: ${unit.acquisition_status}`).join("\n")}${found.length > 15 ? `\nMostro i primi 15.` : ""}\nPRIME registra lo stato «altra agenzia», ma non il nome dell'intermediario.`;
}

function answerUpcomingAppointments(query, context) {
  const appointments = context.upcoming_appointments;
  if (!appointments.length) return "Ho sbirciato l'agenda 😉 Non risultano appuntamenti futuri registrati in PRIME. I calendari esterni collegati mostrano solo i blocchi «Occupato», quindi non posso leggerne i dettagli.";
  if (has(normalize(query), /quant[ei]|quanti|numero di|conteggio/)) {
    const byStatus = appointments.reduce((counts, appointment) => {
      counts[appointment.status] = (counts[appointment.status] || 0) + 1;
      return counts;
    }, {});
    return `Ho contato gli appuntamenti futuri in agenda 😉 Totale: ${appointments.length}. ${Object.entries(byStatus).map(([status, count]) => `${status}: ${count}`).join(" · ")}.`;
  }
  const lines = appointments.slice(0, 10).map((appointment) => {
    const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(appointment.starts_at));
    return `• ${when} · ${appointment.title || appointment.appointment_type} · ${appointment.status}${appointment.property_title ? ` · ${appointment.property_title}` : ""}${appointment.city ? `, ${appointment.city}` : ""}`;
  });
  return `Agenda controllata 😉 Ecco i prossimi appuntamenti in PRIME:\n${lines.join("\n")}${appointments.length > lines.length ? `\nE altri ${appointments.length - lines.length} più avanti.` : ""}`;
}

function matchContacts(query, context) {
  const q = normalize(query);
  return context.contacts.filter((contact) => {
    const nameParts = normalize(contact.title).split(/\s+/).filter((part) => part.length > 2);
    return nameParts.length && nameParts.every((part) => q.includes(part));
  });
}

function answerContact(query, context) {
  const contacts = matchContacts(query, context);
  if (contacts.length !== 1) return contacts.length > 1
    ? `Ho trovato più contatti con quel nome: ${contacts.map((contact) => contact.title).join(", ")}. Quale intendevi?`
    : "Non trovo quel contatto nel CRM. Controlla il nome o chiedimi di cercare i lead caldi 😉";
  const contact = contacts[0];
  const details = [
    contact.contact_type,
    contact.is_hot_lead ? "lead caldo" : null,
    contact.phones.length ? `telefoni: ${contact.phones.join(", ")}` : "telefono mancante",
    contact.email ? `email: ${contact.email}` : "email mancante",
    contact.profession || null,
    contact.preferred_channel && contact.preferred_channel !== "non indicato" ? `canale preferito: ${contact.preferred_channel}` : null,
    contact.preferred_days || null,
    contact.preferred_time_from && contact.preferred_time_to ? `fascia preferita: ${contact.preferred_time_from}–${contact.preferred_time_to}` : null,
    contact.preference_notes || null,
    contact.notes || null,
    contact.info_source ? `fonte: ${contact.info_source}` : null,
    contact.verified_on ? `verificato il: ${contact.verified_on}` : null,
    contact.do_not_contact ? "ha chiesto di non essere ricontattato" : null,
  ].filter(Boolean);
  return `Certo, ho aperto la scheda di ${contact.title}: ${details.join(" · ")}.`;
}

function euro(value) {
  return Number(value).toLocaleString("it-IT", { maximumFractionDigits: 0 }) + " €";
}

function answerProperties(query, properties) {
  const allCities = [...new Set(properties.map((property) => property.city).filter((city) => city !== "non specificata"))];
  const cities = allCities.filter((city) => normalize(query).includes(normalize(city)));
  const mentionedCity = query.match(/\b(?:a|in)\s+(?:citta di\s+)?([a-zà-ÿ][a-zà-ÿ'-]+)/i)?.[1] || "";
  const ignoredPlaces = new Set(["vendita", "affitto", "gestione", "trattativa", "preparazione", "locazione", "agenzia", "prime"]);
  const unknownCity = mentionedCity && !ignoredPlaces.has(normalize(mentionedCity)) && !cities.length ? mentionedCity : "";
  let rows = [...properties];
  const askedRent = has(query, /\b(affitto|affitti|locazione|locare|locazione)\b/);
  const askedSale = has(query, /\b(vendita|vendite|vendere|comprare|acquistare|acquisto)\b/);
  if (askedRent && !askedSale) rows = rows.filter((property) => property.status === "in affitto");
  if (askedSale && !askedRent) rows = rows.filter((property) => property.status === "in vendita");
  if (cities.length) rows = rows.filter((property) => cities.includes(property.city));
  if (unknownCity) rows = [];

  const roomMatch = normalize(query).match(/(?:(?:almeno|minimo|da|con)\s+)?(\d+)\s+(?:locali|vani|stanze)/);
  if (roomMatch) rows = rows.filter((property) => Number(property.rooms) >= Number(roomMatch[1]));
  const priceMatch = normalize(query).match(/(?:entro|massimo|fino a|budget(?: di)?|sotto)\s*[€]?\s*(\d[\d.,]*)/);
  if (priceMatch) {
    const ceiling = Number(priceMatch[1].replace(/[.,]/g, ""));
    rows = rows.filter((property) => Number(property.price_eur) > 0 && Number(property.price_eur) <= ceiling);
  }

  const typeAliases = [
    ["appartamento", /appartament|bilocale|trilocale|quadrilocale/],
    ["villa", /villa|villette/],
    ["ufficio", /uffici/],
    ["negozio", /negozi|commercial/],
    ["terreno", /terreni|terreno/],
    ["casa indipendente", /casa indipendente|case indipendenti/],
  ];
  const requestedType = typeAliases.find(([, pattern]) => pattern.test(normalize(query)));
  if (requestedType) rows = rows.filter((property) => normalize(property.type).includes(normalize(requestedType[0])));

  const requestsDraft = has(normalize(query), /\b(bozza|descrizione|testo annuncio|annuncio)\b/);
  const singleMatch = rows.length === 1 && has(normalize(query), /\b(questo immobile|questa casa|questo appartamento|per questo|scheda|annuncio|descrizione|bozza)\b/);
  if (requestsDraft && singleMatch) {
    const property = rows[0];
    const facts = [property.type, property.city, property.district, property.area_sqm ? `${property.area_sqm} m²` : null,
      property.rooms ? `${property.rooms} locali` : null, property.price_eur ? euro(property.price_eur) : null,
      property.condition !== "non specificato" ? property.condition : null].filter(Boolean);
    const missing = [!property.area_sqm && "superficie", !property.rooms && "numero di locali", property.condition === "non specificato" && "condizioni"].filter(Boolean);
    return `Bozza basata sulla scheda «${property.title}»:\n${facts.join(" · ")}\n\nHo usato solo i dati presenti in PRIME; non ho aggiunto caratteristiche non verificate.${missing.length ? ` Da completare: ${missing.join(", ")}.` : ""}`;
  }

  const filters = [];
  if (askedRent && !askedSale) filters.push("in affitto");
  if (askedSale && !askedRent) filters.push("in vendita");
  if (cities.length) filters.push(`a ${cities.join(", ")}`);
  if (roomMatch) filters.push(`con almeno ${roomMatch[1]} locali`);
  if (priceMatch) filters.push(`entro ${euro(priceMatch[1].replace(/[.,]/g, ""))}`);
  if (requestedType) filters.push(requestedType[0]);

  const title = `Immobili ${filters.length ? filters.join(" · ") : "in gestione"} (${rows.length})`;
  const lines = rows.slice(0, 12).map((property) => {
    const features = [property.type, property.city, property.district, property.area_sqm ? `${property.area_sqm} m²` : null,
      property.rooms ? `${property.rooms} locali` : null, property.price_eur ? euro(property.price_eur) : "prezzo non indicato", property.status]
      .filter(Boolean).join(" · ");
    return `• ${property.title}: ${features}`;
  });
  if (!rows.length) {
    const applied = filters.length ? ` con i criteri ${filters.join(", ")}` : "";
    return `Non trovo immobili${applied} tra i dati visibili in PRIME.${unknownCity ? ` Non risultano immobili a ${unknownCity}.` : ""}${(unknownCity || (!cities.length && /\b(a|in)\s+[a-zà-ÿ-]+/i.test(query))) && allCities.length ? ` Le città presenti nei dati sono: ${allCities.join(", ")}.` : ""} Se vuoi, allento un criterio.`;
  }
  let result = `Certo, ho filtrato per te 😉\n${title}\n${lines.join("\n")}`;
  if (rows.length > lines.length) result += `\n\nMostro i primi ${lines.length} di ${rows.length}.`;
  if (requestsDraft && rows.length > 1) result += "\n\nPer scrivere una bozza senza inventare dati, dimmi il titolo dell'immobile.";
  return result;
}

function buildAnswer(query, context) {
  const q = normalize(query);
  if (has(q, /\b(come stai|come va|tutto bene|come te la passi)\b/)) {
    return "Sto bene, grazie per avermelo chiesto 😊 Sono Veronica, pronta a tenerti compagnia e a toglierti un po’ di lavoro. Tu come stai?";
  }
  if (has(q, /\b(grazie|ti ringrazio)\b/)) return "Ma figurati, è un piacere aiutarti. Quando vuoi, sono qui 😉";
  if (has(q, /\b(sei bella|sei carina|complimento|ti voglio bene)\b/)) return "Così mi fai arrossire 😊 Dimmi pure, cos'altro facciamo insieme?";
  if (has(q, /\b(barzelletta|fammi ridere|raccontami una battuta)\b/)) {
    return "Volentieri: perché l’agente immobiliare porta sempre una matita? Perché non vuole mai lasciarsi scappare una buona occasione 😉";
  }
  if (has(q, /\b(che ore sono|ora esatta|orario attuale)\b/)) {
    return `Da me sono le ${new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date())}.`;
  }

  const asksPhoneAudit = has(q, /telefon|numer|recapit/) && has(q, /manc|appartament|intern|immobil|civic|stabile/);
  const asksHotLeads = has(q, /lead cald|hot lead|lead priorit|potenzial.{0,12}client.{0,12}cald|contatt.{0,12}cald/);
  const asksOtherAgency = has(q, /altra agenzia|altre agenzie|altri intermediari|altri agenti|gestit[io].{0,15}agenz|concorrenza|non nostri/);
  const asksAppointments = has(q, /appuntament|agenda|in programma|calendar|visita|incontr/);
  const asksWps = has(q, /\bwps\b|attivit|richiam|follow.?up|porta a porta|censiment|acquisizion/);
  const asksProperties = has(q, /immobil|propert|appartament|case\b|ville\b|annuncio|prezz|affitt|vendit|acquist|bozza|descrizion|superficie|locali|stanze|bilocale|trilocale|quadrilocale/);
  const asksCrm = has(q, /\bcrm\b|contatt|client|proprietar|acquirent|telefon|email|\blead\b/);

  if (asksPhoneAudit) return answerPhoneAudit(q, context);
  if (asksOtherAgency) return answerOtherAgencies(q, context);
  if (asksHotLeads) return answerHotLeads(context);
  const namedContacts = matchContacts(q, context);
  if (namedContacts.length && (asksCrm || has(q, /scheda|dettagli|telefono|recapito|email|numero|informazioni su/))) {
    return answerContact(q, context);
  }

  const sections = [];

  if (asksProperties) sections.push(answerProperties(q, context.active_properties));
  if (asksWps) sections.push(`Certo, ho controllato il WPS 😉\n${context.scope}:\n${formatGroups(context.wps_counts, "attività WPS")}`);
  if (asksAppointments) sections.push(answerUpcomingAppointments(q, context));
  if (asksCrm) sections.push(`Ho dato un'occhiata al CRM per te 😉\n${context.scope}:\n${formatGroups(context.crm_counts_by_type, "contatti CRM")}\nDa non ricontattare: ${context.crm_do_not_contact_count}`);

  if (sections.length) return sections.join("\n\n");
  if (has(q, /\b(ciao|buongiorno|buonasera|salve|ehi)\b/)) {
    return "Ciao, sono Veronica 😊 Che piacere vederti. Dimmi pure cosa ti serve: sono tutta orecchi.";
  }
  if (has(q, /\b(aiuto|cosa sai fare|come funziona|che cosa puoi fare)\b/)) {
    return "Posso cercare immobili, riepilogare CRM, WPS e appuntamenti, preparare nuove schede, modifiche, note ed eliminazioni da confermare e ricordare appunti per le prossime conversazioni. Con «Gestisci schede» puoi aprire ogni sezione dati. Per una memoria scrivi «Ricorda che…»; per consultarla, «Cosa ricordi di me?».";
  }
  return "Non ho capito bene cosa cerchi, ma ci arriviamo insieme 😉 Sono Veronica: riformulami la domanda e ci penso io. Posso cercare immobili, lead, recapiti mancanti, appuntamenti e attività WPS. Per inviare un commento su PRIME allo sviluppatore usa l’opzione «Feedback sull’app».";
}

export function assistantService({ db, readBody, json, audit = () => {}, management }) {
  async function route(req, res, url, session) {
    if (!url.pathname.startsWith("/api/assistant/")) return false;
    if (session.role === "external") throw new ApiError(403, "Assistente non disponibile per il ruolo esterno.");
    if (url.pathname === "/api/assistant/status" && req.method === "GET") {
      json(res, 200, { configured: true, mode: "internal", model: null, canManageRecords: !!management, persistentMemory: !!management, isDeveloper: developerEmails().has(String(session.email || "").toLowerCase()) });
      return true;
    }
    if (url.pathname === "/api/assistant/feedback" && req.method === "GET") {
      if (!developerEmails().has(String(session.email || "").toLowerCase())) throw new ApiError(403, "Feedback riservato allo sviluppatore di PRIME.");
      const items = db.prepare(`SELECT f.id,f.message,f.status,f.created_at,u.email,t.name AS agency FROM application_feedback f JOIN users u ON u.id=f.user_id JOIN tenants t ON t.id=f.tenant_id ORDER BY f.created_at DESC LIMIT 200`).all();
      json(res, 200, items);
      return true;
    }
    if (url.pathname !== "/api/assistant/chat" || req.method !== "POST") return false;

    const body = await readBody(req);
    const messages = body.messages;
    if (!Array.isArray(messages) || !messages.length || messages.some((message) => !message || !["user", "assistant"].includes(message.role)
      || typeof message.content !== "string" || !message.content.trim() || message.content.length > 2000)
      || messages.at(-1).role !== "user") {
      throw new ApiError(400, "Scrivi una domanda valida, fino a 2000 caratteri.");
    }
    const feedback = messages.at(-1).content.match(/^\s*feedback sull['’]app\s*:\s*([\s\S]*)$/i);
    if (feedback) {
      const message = feedback[1].trim();
      if (!message) {
        json(res, 200, { message: "Scrivi dopo «Feedback sull’app:» cosa vuoi segnalarci e, se utile, in quale schermata succede. Non inserire dati personali o informazioni dei clienti." , mode: "internal", model: null });
        return true;
      }
      const id = randomUUID(), createdAt = new Date().toISOString();
      db.prepare("INSERT INTO application_feedback(id,tenant_id,user_id,message,created_at) VALUES (?,?,?,?,?)")
        .run(id, session.tenant_id, session.user_id, message.slice(0, 2000), createdAt);
      audit(session, "application_feedback.create", id);
      json(res, 200, { message: "Feedback sull’app inviato allo sviluppatore di PRIME. Lo leggerà nella sua inbox riservata. Grazie!", mode: "internal", model: null });
      return true;
    }
    if (management) {
      try {
        const action = management.command(session, messages.at(-1).content);
        if (action) { json(res, 200, { ...action, mode: 'internal', model: null }); return true; }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        json(res, 200, { message: error.message, mode: 'internal', model: null, manager: true }); return true;
      }
    }
    const context = assistantContext(db, session);
    let answer = buildAnswer(messages.at(-1).content, context);
    if (management && answer.startsWith('Non ho capito bene')) answer = management.recall(session, messages.at(-1).content) || answer;
    json(res, 200, { message: answer.slice(0, 6000), mode: "internal", model: null });
    return true;
  }
  return { route, context: assistantContext };
}
