import { demoCallbackService } from './src/demo-callback.mjs';
import { billingService, publicOverage } from './src/billing.mjs';
import { deviceBackupService } from './src/device-backups.mjs';
import { diditService, diditConfig } from './src/didit.mjs';
import { insightsService } from './src/insights.mjs';
import { importService, parseImport, importEntities } from './src/imports.mjs';
import { backupService } from './src/backups.mjs';
import { portalService } from './src/portals.mjs';
import http from "node:http";
import { connectService } from "./src/connect/service.mjs";
import { assistantService } from "./src/assistant.mjs";
import { readFileSync, createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { openDatabase, root, transaction } from "./src/database.mjs";
import { ApiError, validate } from "./src/validation.mjs";
import { schema } from "./public/schema.js";
import { territoryApi } from "./src/territory-api.mjs";
import { saveContactMethods } from "./src/contact-methods.mjs";
import { createVault } from "./src/connect/store.mjs";
import { createAuthMailer } from "./src/auth-mail.mjs";
import { createTotpSecret, totpUri, verifyTotp } from "./src/totp.mjs";
import { namirialService } from "./src/namirial.mjs";
import { contactOutService } from "./src/contactout.mjs";
import { assistantManagement } from "./src/assistant-management.mjs";
const scrypt = promisify(scryptCallback),
  hash = (x) => createHash("sha256").update(x).digest("hex");
const dummySalt = randomBytes(16).toString("hex");
async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + Buffer.from(await scrypt(password, salt, 64)).toString("hex")
  );
}
async function passwordCheck(password, stored) {
  const [salt, key] = stored?.split(":") || [dummySalt, "0".repeat(128)];
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    Buffer.from(await scrypt(password, salt, 64)),
  );
}
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function readBody(req, limit = 65536) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "Formato JSON richiesto");
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (Buffer.byteLength(raw) > limit)
      throw new ApiError(413, "Richiesta troppo grande");
  }
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new ApiError(400, "Oggetto JSON non valido");
  }
}
const integrations = [
  "Didit · KYB",
  "Stripe",
  "Google Calendar",
  "Calendari Apple",
  "Portali immobiliari",
  "Email",
  "WhatsApp Business API",
  "Telefonia / VoIP",
  "Datagma",
  "Mappe",
  "Firma elettronica",
  "Zapier / Make / n8n",
  "AI Assistant",
].map((name) => ({ name, status: "Non configurata" }));
export function createApp({
  database = process.env.PRIME_DB,
  production = process.env.NODE_ENV === "production",
  demo = process.env.PRIME_DEMO === "1",
  connectFetch = fetch,
  connectInterval = 60000,
  assistantFetch = fetch,
  assistantApiKey = process.env.PRIME_OPENAI_API_KEY || "",
  assistantModel = process.env.PRIME_AI_MODEL || "gpt-6-astra",
  authEmailFetch = fetch,
  authEmailApiKey = process.env.PRIME_RESEND_API_KEY || "",
  authEmailFrom = process.env.PRIME_EMAIL_FROM || "",
  diditOptions,
} = {}) {
  const db = openDatabase(database),
    attempts = new Map(),
    dataDirectory = database && database !== ":memory:"
      ? path.dirname(path.resolve(database))
      : database === ":memory:" ? null : path.join(root,"data"),
    authVault = createVault({ directory: dataDirectory || undefined }),
    authMailer = createAuthMailer({ fetcher: authEmailFetch, apiKey: authEmailApiKey, from: authEmailFrom, production });
  const handleDemoCallback = demoCallbackService({db,json,readBody,production});
  const handleBilling = billingService({db,json,readBody});
  const geocodeCache = new Map();
  const didit = diditService({db,json,readBody,audit,fetcher:connectFetch,config:diditOptions || diditConfig({production})});
  const signatures = namirialService({ db, vault: authVault, directory: dataDirectory || path.join(root, "data"), fetcher: connectFetch, json, readBody, audit });
  const contactOut = contactOutService({ db, vault: authVault, fetcher: connectFetch, json, readBody, audit });
  let lastGeocodeAt = 0;
  let geocodeQueue = Promise.resolve();
  const handleTerritory = territoryApi({
    db,
    uploadsDirectory: path.join(dataDirectory || path.join(root,"data"), "uploads"),
    audit,
    json,
    readBody,
  });
  function currentSession(req) {
    const token = /prime_session=([a-f0-9]{64})(?:;|$)/.exec(
      req.headers.cookie || "",
    )?.[1];
    if (!token) return null;
    return db
      .prepare(
        `SELECT s.*,m.role,t.name tenant_name,u.email,u.theme FROM sessions s JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?`,
      )
      .get(hash(token), Date.now());
  }
  function audit(s, action, id) {
    db.prepare(
      "INSERT INTO audit(tenant_id,user_id,action,record_id) VALUES (?,?,?,?)",
    ).run(s.tenant_id, s.user_id, action, id);
  }
  function authOrigin(req) {
    if (process.env.PRIME_PUBLIC_URL) return new URL(process.env.PRIME_PUBLIC_URL).origin;
    if(production)throw new ApiError(503,"PRIME_PUBLIC_URL non configurato: link email non disponibili.");
    return `${production ? "https" : "http"}://${req.headers.host || "127.0.0.1:4319"}`;
  }
  async function sendAuthLink(req, { userId, tenantId, email, purpose, subject, message, label, queryKey, ttl }) {
    const token = randomBytes(32).toString("hex"), expires = Date.now() + ttl;
    db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose=?").run(userId,purpose);
    db.prepare("INSERT INTO auth_tokens(token_hash,user_id,tenant_id,purpose,expires_at,created_at) VALUES (?,?,?,?,?,?)")
      .run(hash(token),userId,tenantId,purpose,expires,new Date().toISOString());
    let actionUrl;
    try {
      actionUrl = `${authOrigin(req)}/app?${queryKey}=${encodeURIComponent(token)}`;
      await authMailer.send({ to: email, subject, message, actionUrl, actionLabel: label });
    } catch (error) {
      db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(hash(token));
      throw error;
    }
    return production ? null : actionUrl;
  }
  function createSession(res,userId,tenantId,now=Date.now()) {
    const token = randomBytes(32).toString("hex"), csrf = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
    db.prepare("INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)").run(hash(token),userId,tenantId,now+86400000,csrf);
    res.setHeader("Set-Cookie",`prime_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${production ? "; Secure" : ""}`);
  }
  function authorize(s, entity, record) {
    if (entity === "activities" && record && record.agent_id !== s.user_id)
      throw new ApiError(403, "Il WPS è privato: puoi accedere solo alle tue attività");
    if (s.role === "external")
      throw new ApiError(
        403,
        "Accesso limitato: area esterna non ancora disponibile",
      );
    if (
      record &&
      ["activities", "appointments"].includes(entity) &&
      s.role === "agent" &&
      record.agent_id !== s.user_id
    )
      throw new ApiError(
        403,
        "Puoi modificare solo le tue attività e i tuoi appuntamenti",
      );
  }
  function rows(entity, s) {
    if (entity === "activities") return db.prepare("SELECT * FROM activities WHERE tenant_id=? AND agent_id=? ORDER BY updated_at DESC,id").all(s.tenant_id, s.user_id);
    return db
      .prepare(
        `SELECT * FROM ${entity} WHERE tenant_id=? ORDER BY updated_at DESC,id`,
      )
      .all(s.tenant_id);
  }
  function enrich(entity, row, s) {
    const parts = Object.keys(schema[entity].fields)
      .filter((k) => schema[entity].fields[k].type !== "ref")
      .map((k) => String(row[k] ?? ""));
    if (entity === "buildings") {
      const street = db
        .prepare(
          "SELECT title,city,district,postal_code FROM streets WHERE tenant_id=? AND id=?",
        )
        .get(s.tenant_id, row.street_id);
      if (street) parts.push(...Object.values(street));
    }
    if (entity === "units") {
      const building = db
        .prepare("SELECT * FROM buildings WHERE tenant_id=? AND id=?")
        .get(s.tenant_id, row.building_id);
      if (building) parts.push(enrich("buildings", building, s).search_text);
    }
    return { ...row, search_text: parts.filter((x) => x !== "").join(" · ") };
  }
  const matchesQuery = (value, q) =>
    q
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => value.toLocaleLowerCase("it").includes(word));
  function validateLinks(entity, b, s, id) {
    if (entity === 'commissions') {
      const member = db.prepare('SELECT role FROM memberships WHERE tenant_id=? AND user_id=?').get(s.tenant_id, b.agent_id);
      if (!member || !['owner', 'agent'].includes(member.role)) throw new ApiError(400, 'Assegna la provvigione a un agente o al titolare della tua agenzia.');
    }
    if (
      ["units", "contacts", "properties"].includes(entity) &&
      s.role === "agent"
    ) {
      const original = id
        ? db
            .prepare(
              `SELECT assigned_agent_id FROM ${entity} WHERE tenant_id=? AND id=?`,
            )
            .get(s.tenant_id, id)
        : null;
      if (
        (b.assigned_agent_id &&
          b.assigned_agent_id !== s.user_id &&
          b.assigned_agent_id !== original?.assigned_agent_id) ||
        (original?.assigned_agent_id &&
          original.assigned_agent_id !== s.user_id &&
          b.assigned_agent_id !== original.assigned_agent_id)
      )
        throw new ApiError(
          403,
          "Solo titolare o responsabile possono riassegnare il lavoro di un altro agente.",
        );
    }
    for (const [key, f] of Object.entries(schema[entity].fields))
      if (f.type === "ref" && b[key]) {
        const row =
          f.entity === "members"
            ? db
                .prepare(
                  "SELECT role FROM memberships WHERE tenant_id=? AND user_id=?",
                )
                .get(s.tenant_id, b[key])
            : db
                .prepare(`SELECT * FROM ${f.entity} WHERE tenant_id=? AND id=?`)
                .get(s.tenant_id, b[key]);
        if (!row || (f.entity === "members" && row.role === "external"))
          throw new ApiError(
            400,
            `${f.label}: collegamento non valido per questa agenzia`,
          );
      }
    if (
      ["activities", "appointments"].includes(entity) &&
      s.role === "agent" &&
      b.agent_id !== s.user_id
    )
      throw new ApiError(
        403,
        "Solo titolare o responsabile possono assegnare ad altri agenti",
      );
    if (entity === "activities") {
      if (b.agent_id !== s.user_id) throw new ApiError(403, "Il WPS è privato: puoi pianificare solo le tue attività");
      const original =
        id &&
        db
          .prepare("SELECT * FROM activities WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, id);
      const moved =
        !original ||
        original.starts_at !== b.starts_at ||
        original.due_at !== b.due_at ||
        original.agent_id !== b.agent_id;
      if (b.status !== "annullata" && moved) {
        const clash = db
          .prepare(
            "SELECT id FROM activities WHERE tenant_id=? AND agent_id=? AND id<>? AND status<>'annullata' AND starts_at<? AND due_at>?",
          )
          .get(s.tenant_id, b.agent_id, id || "", b.due_at, b.starts_at);
        if (clash)
          throw new ApiError(
            409,
            "L’agente ha già un’attività WPS in questa fascia oraria",
          );
      }
      const unit =
        b.unit_id &&
        db
          .prepare("SELECT building_id FROM units WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, b.unit_id);
      if (unit && b.building_id && unit.building_id !== b.building_id)
        throw new ApiError(400, "Appartamento e stabile non corrispondono");
      const buildingId = b.building_id || unit?.building_id;
      const building =
        buildingId &&
        db
          .prepare("SELECT street_id FROM buildings WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, buildingId);
      if (building && b.street_id && building.street_id !== b.street_id)
        throw new ApiError(400, "Stabile e via non corrispondono");
      if (
        b.contact_id &&
        ["chiamata", "richiamo"].includes(b.activity_type) &&
        db
          .prepare(
            "SELECT do_not_contact FROM contacts WHERE tenant_id=? AND id=?",
          )
          .get(s.tenant_id, b.contact_id).do_not_contact
      )
        throw new ApiError(
          409,
          "Questa persona è contrassegnata come da non ricontattare",
        );
      const appointment = db
        .prepare(
          "SELECT agent_id,contact_id,property_id,starts_at,ends_at FROM appointments WHERE tenant_id=? AND activity_id=?",
        )
        .get(s.tenant_id, id || "");
      if (
        appointment &&
        ["agent_id", "contact_id", "property_id"].some(
          (k) => appointment[k] !== b[k],
        )
      )
        throw new ApiError(
          409,
          "Aggiorna prima il collegamento nell’agenda: agente e riferimenti devono coincidere",
        );
      if (
        appointment &&
        (appointment.starts_at !== b.starts_at ||
          appointment.ends_at !== b.due_at)
      )
        throw new ApiError(
          409,
          "L’orario è condiviso: modificalo dall’Agenda appuntamenti",
        );
    }
    if (entity === "contact_interactions") {
      const unit =
        b.unit_id &&
        db
          .prepare("SELECT building_id FROM units WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, b.unit_id);
      if (unit && b.building_id && unit.building_id !== b.building_id)
        throw new ApiError(
          400,
          "L’appartamento non appartiene al civico selezionato",
        );
      const buildingId = b.building_id || unit?.building_id;
      const building =
        buildingId &&
        db
          .prepare("SELECT street_id FROM buildings WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, buildingId);
      if (building && b.street_id && building.street_id !== b.street_id)
        throw new ApiError(
          400,
          "Il civico non appartiene alla via selezionata",
        );
    }
    if (entity === "appointments") {
      const isVisit = ["1ª visita immobile", "2ª visita immobile"].includes(b.appointment_type);
      if (isVisit && b.status === "effettuato" && (!b.contact_id || !b.property_id))
        throw new ApiError(400, "Collega acquirente e immobile prima di registrare la visita come effettuata.");
      if(!["annullato","saltato","riprogrammato"].includes(b.status)&&db.prepare('SELECT 1 FROM external_busy_events b JOIN integration_connections c ON c.id=b.connection_id WHERE c.tenant_id=? AND c.user_id=? AND c.sync_enabled=1 AND b.starts_at<? AND b.ends_at>?').get(s.tenant_id,b.agent_id,b.ends_at,b.starts_at))throw new ApiError(409,'L’agente ha un impegno nel calendario collegato in questa fascia.');
      if (b.activity_id) {
        const task = db
          .prepare("SELECT * FROM activities WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, b.activity_id);
        if (
          ["agent_id", "contact_id", "property_id"].some(
            (k) => task[k] !== b[k],
          )
        )
          throw new ApiError(
            400,
            "Agente, persona e immobile devono coincidere con l’attività WPS",
          );
        const blocked = db
          .prepare(
            "SELECT id FROM activities WHERE tenant_id=? AND agent_id=? AND id<>? AND status<>'annullata' AND starts_at<? AND due_at>?",
          )
          .get(s.tenant_id, b.agent_id, b.activity_id, b.ends_at, b.starts_at);
        if (blocked)
          throw new ApiError(
            409,
            "La nuova fascia si sovrappone a un’altra attività WPS dell’agente",
          );
      }
      if (!["annullato", "saltato", "riprogrammato"].includes(b.status)) {
        const clash = db
          .prepare(
            `SELECT id FROM appointments WHERE tenant_id=? AND id<>? AND status NOT IN ('annullato','saltato','riprogrammato') AND starts_at<? AND ends_at>? AND (agent_id=? OR (property_id IS NOT NULL AND property_id=?))`,
          )
          .get(
            s.tenant_id,
            id || "",
            b.ends_at,
            b.starts_at,
            b.agent_id,
            b.property_id,
          );
        if (clash)
          throw new ApiError(
            409,
            "Fascia oraria già occupata per l’agente o l’immobile",
          );
      }
    }
    if (entity === "viewing_feedback") {
      const appointment = db.prepare("SELECT * FROM appointments WHERE tenant_id=? AND id=?").get(s.tenant_id, b.appointment_id);
      if (!appointment || !["1ª visita immobile", "2ª visita immobile"].includes(appointment.appointment_type))
        throw new ApiError(400, "Il feedback deve collegarsi a un appuntamento di visita immobile.");
      const wasCompleted = appointment.status === "effettuato" || db.prepare("SELECT 1 FROM record_history WHERE tenant_id=? AND entity='appointments' AND record_id=? AND json_extract(snapshot,'$.status')='effettuato' LIMIT 1").get(s.tenant_id,appointment.id);
      if (!wasCompleted)
        throw new ApiError(409, "Registra prima la visita come effettuata nell’agenda.");
      if (["contact_id", "property_id", "agent_id"].some((key) => appointment[key] !== b[key]))
        throw new ApiError(400, "Acquirente, immobile e agente devono coincidere con l’appuntamento.");
    }
    if (entity === "documents" && b.status === "disponibile") {
      const stored = id && db.prepare("SELECT file_reference,status FROM documents WHERE tenant_id=? AND id=?").get(s.tenant_id,id);
      if (!stored || stored.file_reference !== id || stored.status !== "disponibile" || b.file_reference !== id)
        throw new ApiError(409, "Il documento diventa disponibile solo dopo il caricamento verificato del PDF.");
    }
  }
  function previewEntity(entity,raw,s,id=null) {
    if (!Object.hasOwn(schema,entity)) throw new ApiError(404, 'Scheda non disponibile.');
    const live = id ? db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id,id) : null;
    if (id && !live) throw new ApiError(404, 'Scheda non trovata.');
    authorize(s,entity,live);
    if (id && raw.version !== live.version) throw new ApiError(409, 'La scheda è stata modificata. Riaprila prima di salvare.');
    const data = validate(entity,raw.data);
    validateLinks(entity,data,s,id);
    return data;
  }
  function deleteEntity(entity,id,version,s,onDeleted) {
    if (!Object.hasOwn(schema,entity)) throw new ApiError(404, 'Scheda non disponibile.');
    if (!['owner','manager'].includes(s.role)) throw new ApiError(403, 'Eliminazione riservata a titolare e responsabile');
    transaction(db,()=>{
      const live=db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id,id);
      if (!live) throw new ApiError(404,'Scheda non trovata.');
      authorize(s,entity,live);
      if (live.version!==version) throw new ApiError(409,'Record modificato: aggiorna la pagina');
      db.prepare(`DELETE FROM ${entity} WHERE tenant_id=? AND id=?`).run(s.tenant_id,id);
      audit(s,`${entity}.delete`,id);
      onDeleted?.();
    });
  }
  function saveEntity(entity,raw,s,id=null,onSaved){
            const b = previewEntity(entity,raw,s,id);
            const now = new Date().toISOString(),
              rid = id || randomUUID();
            const fields = Object.keys(b);
            transaction(db, () => {
              if (id) {
                const live = db
                  .prepare(
                    "SELECT * FROM " + entity + " WHERE tenant_id=? AND id=?",
                  )
                  .get(s.tenant_id, id);
                if (!live || live.version !== raw.version)
                  throw new ApiError(
                    409,
                    "Record modificato: riaprilo prima di salvare",
                  );
                authorize(s, entity, live);
                db.prepare(
                  `UPDATE ${entity} SET ${fields.map((k) => k + "=?").join(",")},version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?`,
                ).run(...Object.values(b), s.user_id, now, s.tenant_id, id);
              } else {
                db.prepare(
                  `INSERT INTO ${entity}(id,tenant_id,${fields.join(",")},created_by,updated_by,created_at,updated_at) VALUES (${Array(
                    fields.length + 6,
                  )
                    .fill("?")
                    .join(",")})`,
                ).run(
                  rid,
                  s.tenant_id,
                  ...Object.values(b),
                  s.user_id,
                  s.user_id,
                  now,
                  now,
                );
              }
              const saved = db
                .prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`)
                .get(s.tenant_id, rid);
              db.prepare(
                "INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
              ).run(
                s.tenant_id,
                entity,
                rid,
                saved.version,
                JSON.stringify(saved),
                s.user_id,
                now,
              );
              audit(s, `${entity}.${id ? "update" : "create"}`, rid);
              if (entity === "contacts")
                saveContactMethods(db, s, rid, raw.contact_methods, audit);
              if (entity === "appointments" && b.activity_id) {
                const task = db
                  .prepare(
                    "SELECT * FROM activities WHERE tenant_id=? AND id=?",
                  )
                  .get(s.tenant_id, b.activity_id);
                if (
                  task.starts_at !== b.starts_at ||
                  task.due_at !== b.ends_at
                ) {
                  db.prepare(
                    "UPDATE activities SET starts_at=?,due_at=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?",
                  ).run(
                    b.starts_at,
                    b.ends_at,
                    s.user_id,
                    now,
                    s.tenant_id,
                    task.id,
                  );
                  const updated = db
                    .prepare(
                      "SELECT * FROM activities WHERE tenant_id=? AND id=?",
                    )
                    .get(s.tenant_id, task.id);
                  db.prepare(
                    "INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
                  ).run(
                    s.tenant_id,
                    "activities",
                    task.id,
                    updated.version,
                    JSON.stringify(updated),
                    s.user_id,
                    now,
                  );
                  audit(s, "activities.reschedule_from_appointment", task.id);
                }
              }
              if (entity === "appointments" && b.status === "effettuato" && ["1ª visita immobile", "2ª visita immobile"].includes(b.appointment_type)) {
                const feedbackExists = db.prepare("SELECT 1 FROM viewing_feedback WHERE tenant_id=? AND appointment_id=?").get(s.tenant_id, rid);
                if (!feedbackExists) {
                  const feedbackId = randomUUID();
                  const feedbackTitle = `Visita · ${b.commercial_outcome || "da valutare"}`;
                  db.prepare("INSERT INTO viewing_feedback(id,tenant_id,title,appointment_id,contact_id,property_id,agent_id,visited_at,outcome,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
                    .run(feedbackId,s.tenant_id,feedbackTitle,rid,b.contact_id,b.property_id,b.agent_id,b.starts_at,b.commercial_outcome || "da valutare",s.user_id,s.user_id,now,now);
                  db.prepare("INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)")
                    .run(s.tenant_id,"viewing_feedback",feedbackId,1,JSON.stringify(db.prepare("SELECT * FROM viewing_feedback WHERE tenant_id=? AND id=?").get(s.tenant_id,feedbackId)),s.user_id,now);
                  audit(s,"viewing_feedback.created_from_completed_visit",feedbackId);
                }
              }
              onSaved?.(db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id,rid));
            });

    return db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id,rid);
  }

  const insights = insightsService(db);
  const importer = importService({db,previewEntity,saveEntity,audit});
  const backupDevices = deviceBackupService({db,database:database||path.join(root,'data/prime.sqlite'),readBody,json,audit});
  const backups = backupService({db,database:database||path.join(root,'data/prime.sqlite')});
  const connect = connectService({db,directory:database===':memory:'?null:path.dirname(path.resolve(database||path.join(root,'data/prime.sqlite'))),fetcher:connectFetch,json,readBody,audit,interval:connectInterval,saveAppointment:(session,record,delta)=>saveEntity('appointments',{data:{...Object.fromEntries(Object.keys(schema.appointments.fields).map(key=>[key,record?.[key]])),...delta},version:record?.version},session,record?.id)});
  const portalRoute = portalService({db,readBody,json});
  const assistantManager = assistantManagement({db,readBody,json,audit,previewSave:previewEntity,saveEntity,deleteEntity,authorize,rows});
  const assistant = assistantService({db,fetcher:assistantFetch,apiKey:assistantApiKey,model:assistantModel,readBody,json,audit,management:assistantManager});
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost"),
        method = req.method;
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://tile.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      if (production)
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      if (url.pathname === '/' && method === 'GET' && ['verify','reset','invite','connect','mail'].some(key=>url.searchParams.has(key))) { res.writeHead(302,{Location:'/app'+url.search,'Cache-Control':'no-store'});res.end();return; }
      if(await handleDemoCallback(req,res,url))return;
      if (url.pathname === '/api/public/pricing' && method === 'GET') return json(res,200,{overage:publicOverage()});
      if (url.pathname === "/healthz" && method === "GET") {
        db.prepare("SELECT 1").get();
        return json(res, 200, { status: "ok" });
      }
      if (url.pathname === "/api/dev/mail" && method === "GET") {
        if (production) throw new ApiError(404,"Non trovato");
        const messages=authMailer.localMessages();
        const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
        res.end(`<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Posta locale PRIME</title><body style="font:16px system-ui;max-width:760px;margin:3rem auto;padding:0 1rem;background:#111;color:#eee"><h1>Posta locale di sviluppo</h1><p>Solo anteprima locale, non attiva in produzione.</p>${messages.map(m=>`<article style="padding:1.25rem;margin:1rem 0;border:1px solid #444;border-radius:14px"><small>${escapeHtml(m.to)} · ${escapeHtml(m.created_at)}</small><h2>${escapeHtml(m.subject)}</h2><p>${escapeHtml(m.message)}</p><a href="${escapeHtml(m.action_url)}" style="display:inline-block;background:#eee;color:#111;padding:.7rem 1rem;border-radius:8px;text-decoration:none">${escapeHtml(m.action_label)}</a></article>`).join("")||"<p>Nessun messaggio locale.</p>"}</body></html>`);
        return;
      }
      if (await didit.publicRoute(req,res,url)) return;
      if (await connect.publicRoute(req,res,url)) return;
      const mutating = !["GET", "HEAD"].includes(method);
      if (["/api/auth/recovery","/api/auth/resend-verification"].includes(url.pathname) && method === "POST") {
        const key=`${req.socket.remoteAddress}:auth-email`,now=Date.now(),bucket=attempts.get(key);
        if(!bucket||bucket.until<now)attempts.set(key,{count:1,until:now+600000});
        else if(++bucket.count>5)throw new ApiError(429,"Troppe richieste email. Riprova tra dieci minuti.");
      }
      if (
        mutating &&
        req.headers.origin &&
        req.headers.origin !==
          `${production ? "https" : "http"}://${req.headers.host}`
      )
        throw new ApiError(403, "Origine non consentita");
      if (url.pathname === "/api/auth" && method === "POST") {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        if (attempts.size > 10000)
          for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
        let limit = attempts.get(key);
        if (!limit || limit.until < now)
          limit = { count: 0, until: now + 600000 };
        attempts.set(key, limit);
        if (++limit.count > 30)
          throw new ApiError(
            429,
            "Troppi tentativi. Riprova tra dieci minuti.",
          );
        const b = await readBody(req);
        if (!["login", "register"].includes(b.mode))
          throw new ApiError(400, "Operazione di accesso non valida");
        const email = String(b.email || "")
          .trim()
          .toLowerCase();
        if (
          email.length > 254 ||
          !/^\S+@\S+\.\S+$/.test(email) ||
          typeof b.password !== "string" ||
          b.password.length < 12 ||
          b.password.length > 128
        )
          throw new ApiError(
            400,
            "Inserisci un’email valida e una password da 12 a 128 caratteri",
          );
        if (b.mode === "register") {
          if (production && !authMailer.configured)
            throw new ApiError(503,"Verifica email non disponibile: il provider email transazionale non è configurato.");
          const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
          if (user) throw new ApiError(409, "Indirizzo già registrato");
          const agency = String(b.agency || "").trim();
          if (!agency || agency.length > 120)
            throw new ApiError(
              400,
              "Nome agenzia richiesto, massimo 120 caratteri",
            );
          const password = await passwordHash(b.password), uid = randomUUID(), tid = randomUUID();
          transaction(db, () => {
            db.prepare("INSERT INTO tenants VALUES (?,?)").run(tid, agency);
            db.prepare(
              "INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,0)",
            ).run(uid, email, password);
            db.prepare("INSERT INTO memberships VALUES (?,?,?)").run(
              uid,
              tid,
              "owner",
            );
            audit({ tenant_id: tid, user_id: uid }, "agency.register", tid);
          });
          let verificationUrl;
          try {
            verificationUrl = await sendAuthLink(req,{userId:uid,tenantId:tid,email,purpose:"verify_email",subject:"Verifica il tuo indirizzo email · PRIME",message:"Conferma il tuo indirizzo email per attivare PRIME.",label:"Verifica email",queryKey:"verify",ttl:24*60*60*1000});
          } catch (error) {
            transaction(db,()=>{db.prepare("DELETE FROM tenants WHERE id=?").run(tid);db.prepare("DELETE FROM users WHERE id=?").run(uid);});
            throw error;
          }
          return json(res,201,{ok:true,requires_email_verification:true,...(verificationUrl?{verification_url:verificationUrl,mailbox_url:"/api/dev/mail"}:{})});
        }
        const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
        let tenantId;
        {
          const ok = await passwordCheck(b.password, user?.password);
          if (!user || !ok) throw new ApiError(401, "Credenziali non valide");
          if (!user.email_verified) throw new ApiError(403,"Email non verificata. Apri il link inviato o richiedine uno nuovo.");
          tenantId = db
            .prepare(
              "SELECT tenant_id FROM memberships WHERE user_id=? ORDER BY tenant_id",
            )
            .get(user.id)?.tenant_id;
          if (!tenantId) throw new ApiError(403, "Nessuna agenzia associata");
        }
        if (user.totp_enabled) {
          const challenge=randomBytes(32).toString("hex");
          db.prepare("DELETE FROM auth_challenges WHERE expires_at<?").run(now);
          db.prepare("INSERT INTO auth_challenges(token_hash,user_id,tenant_id,expires_at,created_at) VALUES (?,?,?,?,?)").run(hash(challenge),user.id,tenantId,now+5*60*1000,new Date(now).toISOString());
          return json(res,200,{ok:true,requires_two_factor:true,challenge});
        }
        createSession(res,user.id,tenantId,now);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/auth/verify-email" && method === "POST") {
        const b=await readBody(req),token=String(b.token||"");
        const row=db.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='verify_email' AND expires_at>?").get(hash(token),Date.now());
        if(!row)throw new ApiError(400,"Link scaduto o già utilizzato. Richiedi una nuova email di verifica.");
        transaction(db,()=>{db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(row.user_id);db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(row.token_hash);audit({tenant_id:row.tenant_id,user_id:row.user_id},"auth.email_verified",row.user_id);});
        return json(res,200,{ok:true,message:"Email verificata. Ora puoi accedere a PRIME."});
      }
      if (url.pathname === "/api/auth/resend-verification" && method === "POST") {
        const b=await readBody(req),email=String(b.email||"").trim().toLowerCase(),user=db.prepare("SELECT u.id,u.email,u.email_verified,m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=? ORDER BY m.role='owner' DESC LIMIT 1").get(email);
        let verificationUrl;
        if(user&&!user.email_verified)try{verificationUrl=await sendAuthLink(req,{userId:user.id,tenantId:user.tenant_id,email:user.email,purpose:"verify_email",subject:"Verifica il tuo indirizzo email · PRIME",message:"Conferma il tuo indirizzo email per attivare PRIME.",label:"Verifica email",queryKey:"verify",ttl:24*60*60*1000});}catch{}
        return json(res,200,{ok:true,message:"Se l’indirizzo è registrato e non ancora verificato, riceverai un nuovo link.",...(verificationUrl?{mailbox_url:"/api/dev/mail"}:{})});
      }
      if (url.pathname === "/api/auth/recovery" && method === "POST") {
        const b=await readBody(req),email=String(b.email||"").trim().toLowerCase(),user=db.prepare("SELECT u.id,u.email,m.tenant_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=? ORDER BY m.role='owner' DESC LIMIT 1").get(email);
        if(user)try{await sendAuthLink(req,{userId:user.id,tenantId:user.tenant_id,email:user.email,purpose:"password_reset",subject:"Reimposta la password · PRIME",message:"È stata richiesta la reimpostazione della password PRIME.",label:"Scegli una nuova password",queryKey:"reset",ttl:30*60*1000});}catch{}
        return json(res,200,{ok:true,message:"Se l’indirizzo è registrato, riceverai le istruzioni per reimpostare la password.",...(!production?{mailbox_url:"/api/dev/mail"}:{})});
      }
      if (url.pathname === "/api/auth/reset-password" && method === "POST") {
        const b=await readBody(req),token=String(b.token||""),row=db.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='password_reset' AND expires_at>?").get(hash(token),Date.now());
        if(!row)throw new ApiError(400,"Link scaduto o già utilizzato. Richiedi un nuovo link.");
        if(typeof b.password!=="string"||b.password.length<12||b.password.length>128)throw new ApiError(400,"La password deve contenere da 12 a 128 caratteri.");
        const password=await passwordHash(b.password);
        transaction(db,()=>{db.prepare("UPDATE users SET password=? WHERE id=?").run(password,row.user_id);db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);db.prepare("DELETE FROM auth_tokens WHERE user_id=?").run(row.user_id);audit({tenant_id:row.tenant_id,user_id:row.user_id},"auth.password_reset",row.user_id);});
        return json(res,200,{ok:true,message:"Password aggiornata. Accedi con la nuova password."});
      }
      if (url.pathname === "/api/auth/invitations/accept" && method === "POST") {
        const b=await readBody(req),token=String(b.token||""),row=db.prepare("SELECT * FROM auth_tokens WHERE token_hash=? AND purpose='agent_invite' AND expires_at>?").get(hash(token),Date.now());
        if(!row)throw new ApiError(400,"Invito scaduto o già utilizzato. Chiedi al titolare di inviarne uno nuovo.");
        if(typeof b.password!=="string"||b.password.length<12||b.password.length>128)throw new ApiError(400,"La password deve contenere da 12 a 128 caratteri.");
        const password=await passwordHash(b.password);
        transaction(db,()=>{db.prepare("UPDATE users SET password=?,email_verified=1 WHERE id=?").run(password,row.user_id);db.prepare("DELETE FROM auth_tokens WHERE token_hash=?").run(row.token_hash);audit({tenant_id:row.tenant_id,user_id:row.user_id},"agent.invite_accepted",row.user_id);});
        return json(res,200,{ok:true,message:"Invito accettato. Ora puoi accedere a PRIME."});
      }
      if (url.pathname === "/api/auth/2fa/verify" && method === "POST") {
        const b=await readBody(req),challenge=String(b.challenge||""),row=db.prepare("SELECT * FROM auth_challenges WHERE token_hash=? AND expires_at>? AND attempts<5").get(hash(challenge),Date.now());
        if(!row)throw new ApiError(401,"Verifica scaduta. Accedi di nuovo.");
        const user=db.prepare("SELECT totp_secret_cipher FROM users WHERE id=?").get(row.user_id),secret=authVault.open(user.totp_secret_cipher,`auth:totp:${row.user_id}`).secret;
        if(!verifyTotp(secret,b.code)){
          db.prepare("UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=?").run(hash(challenge));
          if(row.attempts+1>=5)db.prepare("DELETE FROM auth_challenges WHERE token_hash=?").run(hash(challenge));
          throw new ApiError(401,"Codice Authenticator non valido.");
        }
        db.prepare("DELETE FROM auth_challenges WHERE token_hash=?").run(hash(challenge));
        createSession(res,row.user_id,row.tenant_id);
        return json(res,200,{ok:true});
      }
      if(url.pathname==='/backup-pc-windows.cmd'&&method==='GET'){
        const origin=new URL(process.env.PRIME_PUBLIC_URL||('http://127.0.0.1:'+server.address().port)).origin;
        if(!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(origin))throw new ApiError(503,'Indirizzo pubblico non valido');
        const setup=readFileSync(path.join(root,'scripts/backup-pc-setup.ps1'),'utf8').replace('__PRIME_SERVER__',origin);
        const command='@echo off\r\nset "PRIME_SETUP_FILE=%~f0"\r\npowershell.exe -NoProfile -STA -Command "$source=[IO.File]::ReadAllText($env:PRIME_SETUP_FILE);$payload=$source.Substring($source.LastIndexOf(\'###PRIME_SETUP###\')+17);& ([scriptblock]::Create($payload))"\r\nexit /b %errorlevel%\r\n###PRIME_SETUP###\r\n'+setup;
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="PRIME-Backup-PC.cmd"'});res.end(command);return;
      }
      if(url.pathname==='/backup-companion.mjs'&&method==='GET'){const bytes=readFileSync(path.join(root,'public/backup-companion.mjs'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="prime-backup-pc.mjs"'});res.end(bytes);return;}
      if(await backupDevices.publicRoute(req,res,url))return;
      if (url.pathname.startsWith("/api/")) {
        const s = currentSession(req);
        if (!s) throw new ApiError(401, "Accedi per continuare");
        if (mutating && req.headers["x-csrf-token"] !== s.csrf)
          throw new ApiError(
            403,
            "Sessione di sicurezza non valida: aggiorna la pagina",
          );
        if(await backupDevices.route(req,res,url,s))return;
        if(await didit.route(req,res,url,s))return;
        if(await handleBilling(req,res,url,s))return;
        if (url.pathname === "/api/me" && method === "GET")
          return json(res, 200, {
            id: s.user_id,
            email: s.email,
            tenant: s.tenant_name,
            tenant_id: s.tenant_id,
            role: s.role,
            theme: s.theme,
            csrf: s.csrf,
            environment: demo ? "demo" : "local",
            server_now: Date.now(),
          });
        if (url.pathname === "/api/account/security" && method === "GET") {
          const user = db.prepare("SELECT email_verified,totp_enabled FROM users WHERE id=?").get(s.user_id);
          return json(res,200,{email_verified:!!user.email_verified,two_factor_enabled:!!user.totp_enabled,email_provider_configured:authMailer.configured});
        }
        if (url.pathname === "/api/account/security/totp/setup" && method === "POST") {
          const b=await readBody(req),user=db.prepare("SELECT email,password FROM users WHERE id=?").get(s.user_id);
          if(!await passwordCheck(String(b.password||""),user.password))throw new ApiError(401,"Password non corretta.");
          const secret=createTotpSecret(),cipher=authVault.seal({secret},`auth:totp-pending:${s.user_id}`);
          db.prepare("UPDATE users SET totp_pending_cipher=? WHERE id=?").run(cipher,s.user_id);
          audit(s,"auth.totp_setup_started",s.user_id);
          return json(res,200,{secret,otpauth_url:totpUri(secret,user.email)});
        }
        if (url.pathname === "/api/account/security/totp/enable" && method === "POST") {
          const b=await readBody(req),row=db.prepare("SELECT totp_pending_cipher FROM users WHERE id=?").get(s.user_id);
          if(!row.totp_pending_cipher)throw new ApiError(400,"Avvia prima la configurazione Authenticator.");
          const {secret}=authVault.open(row.totp_pending_cipher,`auth:totp-pending:${s.user_id}`);
          if(!verifyTotp(secret,b.code))throw new ApiError(400,"Codice Authenticator non valido.");
          db.prepare("UPDATE users SET totp_enabled=1,totp_secret_cipher=?,totp_pending_cipher='' WHERE id=?").run(authVault.seal({secret},`auth:totp:${s.user_id}`),s.user_id);
          audit(s,"auth.totp_enabled",s.user_id);
          return json(res,200,{ok:true});
        }
        if (url.pathname === "/api/account/security/totp/disable" && method === "POST") {
          const b=await readBody(req),user=db.prepare("SELECT password,totp_secret_cipher,totp_enabled FROM users WHERE id=?").get(s.user_id);
          if(!await passwordCheck(String(b.password||""),user.password))throw new ApiError(401,"Password non corretta.");
          if(!user.totp_enabled||!verifyTotp(authVault.open(user.totp_secret_cipher,`auth:totp:${s.user_id}`).secret,b.code))throw new ApiError(400,"Codice Authenticator non valido.");
          db.prepare("UPDATE users SET totp_enabled=0,totp_secret_cipher='',totp_pending_cipher='' WHERE id=?").run(s.user_id);
          audit(s,"auth.totp_disabled",s.user_id);
          return json(res,200,{ok:true});
        }
        if (url.pathname === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(s.token);
          res.setHeader(
            "Set-Cookie",
            `prime_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? "; Secure" : ""}`,
          );
          return json(res, 200, { ok: true });
        }
        if (url.pathname === "/api/preferences" && method === "PATCH") {
          const b = await readBody(req);
          if (!["dark", "light"].includes(b.theme))
            throw new ApiError(400, "Tema non valido");
          db.prepare("UPDATE users SET theme=? WHERE id=?").run(
            b.theme,
            s.user_id,
          );
          return json(res, 200, { theme: b.theme });
        }
        authorize(s);
        if (url.pathname === "/api/agents") {
          if (s.role !== "owner") throw new ApiError(403, "Gestione agenti riservata al titolare");
          if (method === "GET") return json(res, 200, db.prepare("SELECT u.id,u.email,u.email_verified,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND m.role='agent' ORDER BY u.email").all(s.tenant_id));
          if (method === "POST") {
            const b = await readBody(req), email = String(b.email || "").trim().toLowerCase();
            if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) throw new ApiError(400, "Inserisci un’email valida");
            if (production && !authMailer.configured) throw new ApiError(503,"Inviti email non disponibili: configura il provider email PRIME.");
            if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) throw new ApiError(409, "Email già utilizzata. Scegli un altro indirizzo per il nuovo account.");
            const password = await passwordHash(randomBytes(32).toString("hex")), id = randomUUID();
            transaction(db, () => {
              db.prepare("INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,0)").run(id, email, password);
              db.prepare("INSERT INTO memberships(user_id,tenant_id,role) VALUES (?,?,?)").run(id, s.tenant_id, "agent");
              audit(s, "agent.create", id);
            });
            let inviteUrl;
            try { inviteUrl=await sendAuthLink(req,{userId:id,tenantId:s.tenant_id,email,purpose:"agent_invite",subject:"Invito a PRIME",message:`Il titolare ti ha invitato ad accedere all’area operativa PRIME di ${s.tenant_name}.`,label:"Imposta la tua password",queryKey:"invite",ttl:7*24*60*60*1000}); }
            catch(error){transaction(db,()=>{db.prepare("DELETE FROM users WHERE id=?").run(id);});throw error;}
            return json(res, 201, { id, email, role: "agent", invitation_pending:true,...(inviteUrl?{invite_url:inviteUrl}:{}) });
          }
          throw new ApiError(405, "Operazione non consentita");
        }
        if (url.pathname === "/api/map/geocode" && method === "GET") {
          const query = String(url.searchParams.get("q") || "").trim();
          if (query.length < 5 || query.length > 240)
            throw new ApiError(400, "Inserisci un indirizzo completo da cercare");
          const key = query.toLocaleLowerCase("it");
          const task = geocodeQueue.then(async () => {
            const cached = geocodeCache.get(key);
            if (cached && cached.until > Date.now()) return cached.results;
            const wait = 1000 - (Date.now() - lastGeocodeAt);
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            lastGeocodeAt = Date.now();
            const geocoder = new URL(process.env.PRIME_GEOCODER_URL || "https://nominatim.openstreetmap.org/search");
            geocoder.searchParams.set("format", "jsonv2");
            geocoder.searchParams.set("addressdetails", "1");
            geocoder.searchParams.set("limit", "5");
            geocoder.searchParams.set("countrycodes", "it");
            geocoder.searchParams.set("q", query);
            let response;
            try {
              response = await fetch(geocoder, {
                headers: {
                  "User-Agent": "PRIME Real Estate CRM/1.0 (+https://github.com/businessderuvo-cloud/PRIME)",
                  "Accept-Language": "it",
                },
                signal: AbortSignal.timeout(8000),
              });
            } catch {
              throw new ApiError(502, "Ricerca indirizzo temporaneamente non disponibile");
            }
            if (!response.ok) throw new ApiError(502, "Servizio mappa non disponibile. Riprova tra poco.");
            const results = (await response.json()).map((item) => ({
              latitude: Number(item.lat), longitude: Number(item.lon), label: String(item.display_name || "").slice(0, 300),
            })).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
            if (geocodeCache.size > 500) geocodeCache.clear();
            geocodeCache.set(key, { results, until: Date.now() + 86400000 });
            return results;
          });
          geocodeQueue = task.catch(() => []);
          const results = await task;
          return json(res, 200, results);
        }
        if (url.pathname === "/api/map/zones" && method === "GET")
          return json(
            res,
            200,
            db
              .prepare("SELECT id,title,agent_id,polygon_json,version,created_by FROM territory_zones WHERE tenant_id=? ORDER BY title")
              .all(s.tenant_id)
              .map((zone) => ({ ...zone, polygon: JSON.parse(zone.polygon_json) })),
          );
        if (url.pathname === "/api/map/position" && method === "PUT") {
          const b = await readBody(req);
          if (!["buildings", "properties"].includes(b.entity))
            throw new ApiError(400, "Scheda mappa non valida");
          const row = db
            .prepare(`SELECT * FROM ${b.entity} WHERE tenant_id=? AND id=?`)
            .get(s.tenant_id, b.id);
          if (!row) throw new ApiError(404, "Scheda non trovata");
          authorize(s, b.entity, row);
          if (b.version !== row.version)
            throw new ApiError(409, "La scheda è stata aggiornata. Riaprila prima di spostare il punto.");
          if (!Number.isFinite(b.latitude) || b.latitude < -85 || b.latitude > 85 || !Number.isFinite(b.longitude) || b.longitude < -180 || b.longitude > 180)
            throw new ApiError(400, "Posizione non valida");
          const now = new Date().toISOString();
          const updated = transaction(db, () => {
            const changed = db.prepare(`UPDATE ${b.entity} SET latitude=?,longitude=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=? AND version=?`)
              .run(b.latitude, b.longitude, s.user_id, now, s.tenant_id, row.id, row.version);
            if (!changed.changes) throw new ApiError(409, "La scheda è cambiata. Riaprila prima di spostare il punto.");
            const saved = db.prepare(`SELECT * FROM ${b.entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id, row.id);
            db.prepare("INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)")
              .run(s.tenant_id, b.entity, row.id, saved.version, JSON.stringify(saved), s.user_id, now);
            audit(s, `${b.entity}.map_position`, row.id);
            return saved;
          });
          return json(res, 200, updated);
        }
        if (url.pathname === "/api/map/zones" && method === "POST") {
          if (s.role !== "owner") throw new ApiError(403, "Solo il titolare può creare e assegnare le zone");
          const b = await readBody(req);
          if (!String(b.title || "").trim() || String(b.title).length > 120)
            throw new ApiError(400, "Dai un nome alla zona (massimo 120 caratteri)");
          if (!Array.isArray(b.polygon) || b.polygon.length < 3 || b.polygon.length > 200 || b.polygon.some((point) => !Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || point[0] < -85 || point[0] > 85 || !Number.isFinite(point[1]) || point[1] < -180 || point[1] > 180))
            throw new ApiError(400, "Disegna sulla mappa un’area chiusa con almeno tre punti");
          const member = db.prepare("SELECT role FROM memberships WHERE tenant_id=? AND user_id=?").get(s.tenant_id, b.agent_id);
          if (!member || member.role !== "agent")
            throw new ApiError(403, "Agente non disponibile per questa zona");
          const id = randomUUID(), now = new Date().toISOString();
          db.prepare("INSERT INTO territory_zones(id,tenant_id,title,agent_id,polygon_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)")
            .run(id, s.tenant_id, String(b.title).trim(), b.agent_id, JSON.stringify(b.polygon), s.user_id, s.user_id, now, now);
          audit(s, "territory_zone.create", id);
          return json(res, 201, { id, title: String(b.title).trim(), agent_id: b.agent_id, polygon: b.polygon, version: 1, created_by: s.user_id });
        }
        const zoneMatch = /^\/api\/map\/zones\/([a-f0-9-]+)$/.exec(url.pathname);
        if (zoneMatch && method === "PATCH") {
          if (s.role !== "owner") throw new ApiError(403, "Solo il titolare può assegnare le zone");
          const b = await readBody(req);
          const zone = db.prepare("SELECT * FROM territory_zones WHERE tenant_id=? AND id=?").get(s.tenant_id, zoneMatch[1]);
          if (!zone) throw new ApiError(404, "Zona non trovata");
          const member = db.prepare("SELECT role FROM memberships WHERE tenant_id=? AND user_id=?").get(s.tenant_id, b.agent_id);
          if (member?.role !== "agent") throw new ApiError(400, "Seleziona un agente della tua agenzia");
          if (b.version !== zone.version) throw new ApiError(409, "La zona è cambiata. Aggiorna la pagina prima di assegnarla.");
          db.prepare("UPDATE territory_zones SET agent_id=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?").run(b.agent_id, s.user_id, new Date().toISOString(), s.tenant_id, zone.id);
          audit(s, "territory_zone.assign", zone.id);
          return json(res, 200, { ok: true });
        }
        if (zoneMatch && method === "DELETE") {
          if (s.role !== "owner") throw new ApiError(403, "Solo il titolare può rimuovere le zone");
          const zone = db.prepare("SELECT * FROM territory_zones WHERE tenant_id=? AND id=?").get(s.tenant_id, zoneMatch[1]);
          if (!zone) throw new ApiError(404, "Zona non trovata");
          db.prepare("DELETE FROM territory_zones WHERE tenant_id=? AND id=?").run(s.tenant_id, zone.id);
          audit(s, "territory_zone.delete", zone.id);
          return json(res, 200, { ok: true });
        }
        if (await connect.route(req,res,url,s)) return;
        if (await signatures.route(req,res,url,s)) return;
        if (await contactOut.route(req,res,url,s)) return;
        if (await assistantManager.route(req,res,url,s)) return;
        if (await assistant.route(req,res,url,s)) return;
        if (await portalRoute(req,res,url,s)) return;
        if (await handleTerritory(req, res, url, s)) return;
        if (url.pathname === "/api/integrations" && method === "GET")
          return json(res, 200, integrations);
        if (url.pathname === "/api/members" && method === "GET")
          return json(
            res,
            200,
            db
              .prepare(
                `SELECT u.id,u.email title,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role<>'external'`,
              )
              .all(s.tenant_id),
          );
        if (url.pathname === "/api/audit" && method === "GET") {
          if (!["owner", "manager"].includes(s.role))
            throw new ApiError(
              403,
              "Accesso riservato a titolare e responsabile",
            );
          const from = url.searchParams.get("from") || "",
            before = url.searchParams.get("before") || "",
            agentId = url.searchParams.get("agent_id") || "";
          for (const value of [from, before])
            if (value && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))))
              throw new ApiError(400, "Intervallo data non valido");
          if (from && before && Date.parse(from) >= Date.parse(before))
            throw new ApiError(400, "La data finale deve essere successiva a quella iniziale");
          const conditions = ["a.tenant_id=?"], params = [s.tenant_id];
          if (from) { conditions.push("datetime(a.created_at)>=datetime(?)"); params.push(from); }
          if (before) { conditions.push("datetime(a.created_at)<datetime(?)"); params.push(before); }
          if (agentId) { conditions.push("a.user_id=?"); params.push(agentId); }
          return json(
            res,
            200,
            db
              .prepare(
                `SELECT a.id,a.action,a.record_id,a.created_at,a.user_id agent_id,u.email,m.role FROM audit a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN memberships m ON m.user_id=a.user_id AND m.tenant_id=a.tenant_id WHERE ${conditions.join(" AND ")} ORDER BY a.id DESC LIMIT 1000`,
              )
              .all(...params),
          );
        }
        if (url.pathname === "/api/search" && method === "GET") {
          const q = (url.searchParams.get("q") || "")
            .toLocaleLowerCase("it")
            .slice(0, 200);
          if (q.length < 2) return json(res, 200, []);
          const found = [];
          for (const entity of Object.keys(schema)) {
            for (const row of rows(entity, s)) {
              const enriched = enrich(entity, row, s);
              if (matchesQuery(enriched.search_text, q))
                found.push({
                  entity,
                  id: row.id,
                  title: row.title,
                  context: enriched.search_text,
                });
            }
          }
          return json(res, 200, found.slice(0, 60));
        }
        if (url.pathname === '/api/dashboard' && method === 'GET') return json(res,200,insights.dashboard(s));
        if (url.pathname === '/api/matching' && method === 'GET') return json(res,200,insights.matching(s));
        const matchingRoute = /^\/api\/matching\/([a-f0-9-]+)$/.exec(url.pathname);
        if (matchingRoute && method === 'GET') return json(res,200,insights.matching(s,matchingRoute[1]));
        if(url.pathname.startsWith('/api/imports')) {
          if(s.role!=='owner')throw new ApiError(403,'Importazione riservata al titolare');
          if(url.pathname==='/api/imports'&&method==='GET')return json(res,200,{entities:importEntities,fields:Object.fromEntries(importEntities.map(e=>[e,schema[e].fields]))});
          if(url.pathname==='/api/imports/file'&&method==='POST'){
            const chunks=[];let length=0;for await(const c of req){length+=c.length;if(length>5*1024*1024)throw new ApiError(413,'Massimo 5 MB');chunks.push(c);}
            try{return json(res,200,await parseImport(url.searchParams.get('name')||'',Buffer.concat(chunks)));}catch(e){if(e.status)throw e;throw new ApiError(400,'File non valido: usa CSV UTF-8 o XLSX con soli valori');}
          }
          if(url.pathname==='/api/imports/preview'&&method==='POST')return json(res,200,importer.preview(s,await readBody(req,4*1024*1024)));
          if(url.pathname==='/api/imports/commit'&&method==='POST'){const body=await readBody(req);return json(res,200,importer.commit(s,body.id));}
        }
        if(url.pathname==='/api/backups/status'&&method==='GET'){
          if(s.role!=='owner')throw new ApiError(403,'Stato backup riservato al titolare');
          return json(res,200,backups.status());
        }
        const match =
          /^\/api\/entities\/([a-z_]+)(?:\/([a-f0-9-]+))?(?:\/(history))?$/.exec(
            url.pathname,
          );
        if (match) {
          const [, entity, id, history] = match;
          if (!schema[entity])
            throw new ApiError(404, "Sezione non disponibile");
          const record = id
            ? db
                .prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`)
                .get(s.tenant_id, id)
            : null;
          if (id && !record) throw new ApiError(404, "Record non trovato");
          if (entity === "activities" && record) authorize(s, entity, record);
          if (history && method === "GET")
            return json(
              res,
              200,
              db
                .prepare(
                  "SELECT version,snapshot,actor_id,created_at FROM record_history WHERE tenant_id=? AND entity=? AND record_id=? ORDER BY id DESC",
                )
                .all(s.tenant_id, entity, id)
                .map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })),
            );
          if (method === "GET") {
            if (id) return json(res, 200, enrich(entity, record, s));
            const q = (url.searchParams.get("q") || "")
              .toLocaleLowerCase("it")
              .slice(0, 200);
            return json(
              res,
              200,
              rows(entity, s)
                .map((r) => enrich(entity, r, s))
                .filter((r) => !q || matchesQuery(r.search_text, q)),
            );
          }
          authorize(s, entity, record);
          if (
            (method === "POST" && !id) ||
            (method === "PUT" && id && !history)
          ) {
            const raw = await readBody(req);
            if (!raw || typeof raw !== "object" || !raw.data)
              throw new ApiError(400, "Dati mancanti");
            if (id && raw.version !== record.version)
              throw new ApiError(
                409,
                "Il record è stato aggiornato da un altro utente. Riaprilo prima di salvare.",
              );
            return json(res,id?200:201,saveEntity(entity,raw,s,id));
          }
          if (method === "DELETE" && id && !history) {
            const body = await readBody(req);
            deleteEntity(entity,id,body.version,s);
            return json(res, 200, { ok: true });
          }
        }
        throw new ApiError(404, "Operazione non disponibile");
      }
      if (method !== "GET") throw new ApiError(405, "Metodo non consentito");
      const files = {
"/sorelle-assistenti":"sisters.html",
"/landing.css":"landing.css",
"/landing-composition.css":"landing-composition.css",
"/landing.js":"landing.js",
"/pricing.js":"pricing.js",
"/sisters.css":"sisters.css",
"/sisters.js":"sisters.js",
"/sisters-chat.js":"sisters-chat.js",
"/assets/prime-wordmark.svg":"assets/prime-wordmark.svg",
"/assets/prime-hero-panorama.png":"assets/prime-hero-panorama.png",
"/assets/prime-professionals.png":"assets/prime-professionals.png",
"/assets/veronica-intro.mp4":"assets/veronica-intro.mp4",
"/assets/vanessa-intro.mp4":"assets/vanessa-intro.mp4",
"/assets/veronica-poster.png":"assets/veronica-poster.png",
"/assets/vanessa-poster.png":"assets/vanessa-poster.png",
"/assets/manrope-variable.ttf":"assets/manrope-variable.ttf",
        "/": "landing.html",
        "/app": "index.html",
        "/landing": "landing.html",
        "/privacy": "privacy.html",
        "/app.js": "app.js",
        "/operations.js": "operations.js",
        "/backup-settings.js": "backup-settings.js",
        "/assistant-management.js": "assistant-management.js",
        "/map.js": "map.js",
        "/mail.js": "mail.js",
        "/connect.js": "connect.js",
        "/contactout.js": "contactout.js",
        "/portals.js": "portals.js",
        "/brands/immobiliare.png": "brands/immobiliare.png",
        "/brands/idealista.png": "brands/idealista.png",
        "/brands/casa.svg": "brands/casa.svg",
        "/brands/providers/googlecalendar.svg": "brands/providers/googlecalendar.svg",
        "/brands/providers/apple.svg": "brands/providers/apple.svg",
        "/brands/providers/calendly.svg": "brands/providers/calendly.svg",
        "/brands/providers/whatsapp.svg": "brands/providers/whatsapp.svg",
        "/brands/providers/gmail.svg": "brands/providers/gmail.svg",
        "/brands/providers/yahoo.svg": "brands/providers/yahoo.svg",
        "/brands/providers/outlook.svg": "brands/providers/outlook.svg",
        "/brands/providers/datagma.svg": "brands/providers/datagma.svg",
        "/brands/providers/contactout.png": "brands/providers/contactout.png",
        "/brands/providers/telecontact.png": "brands/providers/telecontact.png",
        "/brands/providers/whuis.png": "brands/providers/whuis.png",
        "/brands/providers/namirial.svg": "brands/providers/namirial.svg",
        "/brands/providers/namirial-mark.svg": "brands/providers/namirial-mark.svg",
        "/brands/providers/letterasenzabusta.png": "brands/providers/letterasenzabusta.png",
        "/brands/providers/protonmail.svg": "brands/providers/protonmail.svg",
        "/brands/providers/virgilio.svg": "brands/providers/virgilio.svg",
        "/brands/providers/pec.svg": "brands/providers/pec.svg",
        "/brands/providers/datagma.svg": "brands/providers/datagma.svg",
        "/brands/providers/namirial.svg": "brands/providers/namirial.svg",
        "/assistant-avatar.png": "assistant-avatar.png",
        "/assistant-avatar-v2.png": "assistant-avatar-v2.png",
        "/assistant-avatar-v3.png": "assistant-avatar-v3.png",
        "/assistant-avatar-v4.png": "assistant-avatar-v4.png",
        "/assistant-avatar-v5.png": "assistant-avatar-v5.png",
        "/assistant-avatar-light.png": "assistant-avatar-light.png",
        "/assistant-avatar-dark.webp": "assistant-avatar-dark.webp",
        "/assistant-avatar-light.webp": "assistant-avatar-light.webp",
        "/assistant-avatar-dark-thumb.webp": "assistant-avatar-dark-thumb.webp",
        "/assistant-avatar-light-thumb.webp": "assistant-avatar-light-thumb.webp",
        "/connect.css": "connect.css",
        "/didit.js": "didit.js",
        "/datagma.css": "datagma.css",
        "/map.css": "map.css",
        "/schema.js": "schema.js",
        "/planner.js": "planner.js",
        "/planner-view.js": "planner-view.js",
        "/wps-clock.js": "wps-clock.js",
        "/style.css": "style.css",
        "/planner.css": "planner.css",
        "/territory.js": "territory.js",
        "/territory-floors.js": "territory-floors.js",
        "/territory-highlights.js": "territory-highlights.js",
        "/person-recaps.js": "person-recaps.js",
        "/repeatable-recaps.js": "repeatable-recaps.js",
        "/voice-input.js": "voice-input.js",
        "/custom-selects.js": "custom-selects.js",
        "/territory.css": "territory.css",
        "/assets/logo-light.png": "assets/logo-light.png",
        "/assets/logo-dark.png": "assets/logo-dark.png",
        "/vendor/leaflet/leaflet.js": "vendor/leaflet/leaflet.js",
        "/vendor/leaflet/leaflet.css": "vendor/leaflet/leaflet.css",
        "/vendor/leaflet/images/layers.png": "vendor/leaflet/images/layers.png",
        "/vendor/leaflet/images/layers-2x.png": "vendor/leaflet/images/layers-2x.png",
        "/vendor/leaflet/images/marker-icon.png": "vendor/leaflet/images/marker-icon.png",
        "/vendor/leaflet/images/marker-icon-2x.png": "vendor/leaflet/images/marker-icon-2x.png",
        "/vendor/leaflet/images/marker-shadow.png": "vendor/leaflet/images/marker-shadow.png",
      };
      const file = files[url.pathname];
      if (!file) throw new ApiError(404, "Non trovato");
      if (file.endsWith(".mp4")) {
        const videoPath = path.join(root, "public", file), size = statSync(videoPath).size;
        const headers = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
        const range = req.headers.range;
        let start = 0, end = size - 1;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) {
            res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }); res.end(); return;
          }
          if (!match[1]) start = Math.max(0, size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
            res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }); res.end(); return;
          }
          headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
        }
        headers["Content-Length"] = end - start + 1;
        res.writeHead(range ? 206 : 200, headers);
        const stream = createReadStream(videoPath, { start, end });
        stream.on("error", () => res.destroy()); res.on("close", () => stream.destroy()); stream.pipe(res); return;
      }
      const mime = file.endsWith(".ttf") ? "font/ttf" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".webp")
        ? "image/webp"
        : file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html";
      const content = readFileSync(path.join(root, "public", file));
      res.writeHead(200, {
        "Content-Type": mime + ([".png", ".webp"].some((extension) => file.endsWith(extension)) ? "" : "; charset=utf-8"),
      });
      res.end(content);
    } catch (e) {
      let status = e.status || 500,
        message = e.message;
      if (e.code?.startsWith("ERR_SQLITE")) {
        if (message.includes("UNIQUE constraint")) {
          status = 409;
          message = "Esiste già un record con questi dati identificativi";
        } else if (message.includes("FOREIGN KEY constraint")) {
          status = 409;
          message =
            "Il record è collegato ad altri elementi: rimuovi prima i collegamenti";
        }
      }
      if (status === 500) {
        console.error(e);
        message = "Operazione non riuscita. Riprova o contatta l’assistenza.";
      }
      json(res, status, { error: message });
    }
  });
  server.on("listening",backups.start);
  server.on("close",backups.close);
  server.on("close",connect.close);
  return { server, db, connect };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT || 4317), "127.0.0.1", () =>
    console.log(
      "PRIME disponibile su http://127.0.0.1:" + (process.env.PORT || 4317),
    ),
  );
}
