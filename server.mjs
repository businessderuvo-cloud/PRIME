import { validVanessaNameDay } from './src/vanessa-greetings.mjs';
import {rewardFulfillment} from './src/reward-fulfillment.mjs';
import {authenticatorQr} from './src/authenticator-qr.mjs';
import {multiFactor,authSmsVerify,factorMethods} from './src/multi-factor.mjs';
import {createMapLocator,sharedGeocode} from './src/map-geocoding.mjs';
import {stripePlanCheckout} from './src/stripe-plan-checkout.mjs';
import {localizePublicPage,publicLocalizedPages} from './src/public-locale.mjs';
import {customerDemoService,customerDemoApi,customerDemoEdition} from './src/customer-demo.mjs';
import { cpayService } from './src/cpay.mjs';
import { stripeAgencyAllowed, stripeAgencyService } from './src/stripe-agency.mjs';
import { eliteService } from './src/elite.mjs';
import { demoCallbackService } from './src/demo-callback.mjs';
import { planUpgradeService } from './src/plan-upgrades.mjs';
import { billingService, publicOverage } from './src/billing.mjs';
import { deviceBackupService } from './src/device-backups.mjs';
import { diditService, diditConfig } from './src/didit.mjs';
import { insightsService } from './src/insights.mjs';
import { importService, parseImport, importEntities } from './src/imports.mjs';
import { backupService } from './src/backups.mjs';
import { portalService } from './src/portals.mjs';
import http from "node:http";
import { connectService } from "./src/connect/service.mjs";
import { telephonyService } from "./src/connect/telephony.mjs";
import { privateDemoAccess } from "./src/private-demo-access.mjs";
import { assistantService } from "./src/assistant.mjs";
import { readFileSync, createReadStream, statSync, existsSync } from "node:fs";
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
import { trustpilotMailer } from "./src/trustpilot-mail.mjs";
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
import { baseApiAllowed, baseExcludedEntities } from './public/edition.js';
export function createApp({
  edition = process.env.PRIME_EDITION || 'full',
  baseExtraSeats = Number(process.env.PRIME_BASE_EXTRA_SEATS || 0),
  database = process.env.PRIME_DB,
  production = process.env.NODE_ENV === "production",
  demo = process.env.PRIME_DEMO === "1",
  connectFetch = fetch,
  connectProviderApi,
  connectInterval = 60000,
  assistantFetch = fetch,
  assistantApiKey = process.env.PRIME_OPENAI_API_KEY || "",
  assistantModel = process.env.PRIME_AI_MODEL || "gpt-6-astra",
  authSmsSender,
  authEmailFetch = fetch,
  authEmailApiKey = process.env.PRIME_RESEND_API_KEY || "",
  authEmailFrom = process.env.PRIME_EMAIL_FROM || "",
  authEmailWebhookUrl = process.env.PRIME_ZAPIER_EMAIL_HOOK_URL || "",
  diditOptions,
  publicDemo = null,
  geocode = sharedGeocode,
} = {}) {
  if (!['full','base','vip','elite'].includes(edition)) throw new Error('Edizione PRIME non valida');
  if (!Number.isSafeInteger(baseExtraSeats) || baseExtraSeats < 0) throw new Error('Posti aggiuntivi Base non validi');
  const isBase = edition === 'base';
  function sessionEdition(s) {
    if(publicDemo)return customerDemoEdition(publicDemo.plan);
    if (edition === 'base' || edition === 'vip' || edition === 'elite') return edition;
    if (production) {
      const paid = db.prepare("SELECT plan FROM plan_subscriptions WHERE tenant_id=? AND state='active' AND period_end>? ORDER BY revision DESC LIMIT 1").get(s.tenant_id, new Date().toISOString());
      if (paid?.plan === 'standard') return 'base';
      if (paid?.plan === 'pro') return 'full';
      if (paid?.plan === 'secret') return 'secret';
      if (['vip','elite'].includes(paid?.plan)) {
        const verification = db.prepare("SELECT kyb_status FROM agency_billing WHERE tenant_id=?").get(s.tenant_id);
        if (verification?.kyb_status !== 'approved') return 'full';
        const ai = db.prepare("SELECT 1 FROM ai_subscriptions WHERE tenant_id=? AND state='active' AND plan=?").get(s.tenant_id,paid.plan);
        return ai ? paid.plan : 'full';
      }
      if (paid) return 'full';
      const legacyAI = db.prepare("SELECT plan FROM ai_subscriptions WHERE tenant_id=? AND state='active' AND plan IN ('vip','elite')").get(s.tenant_id);
      if (legacyAI) return legacyAI.plan;
    }
    return edition;
  }
  const db = openDatabase(database),
    attempts = new Map(),
    adminSessions = {
      get(key){return db.prepare("SELECT email,csrf,expires FROM admin_sessions WHERE token_hash=?").get(key);},
      set(key,value){db.prepare("DELETE FROM admin_sessions WHERE expires<=?").run(Date.now());db.prepare("INSERT OR REPLACE INTO admin_sessions(token_hash,email,csrf,expires) VALUES (?,?,?,?)").run(key,value.email,value.csrf,value.expires);},
      delete(key){db.prepare("DELETE FROM admin_sessions WHERE token_hash=?").run(key);}
    },
    adminAttempts = new Map(),
    adminHandoffs = new Map(),
    dataDirectory = database && database !== ":memory:"
      ? path.dirname(path.resolve(database))
      : database === ":memory:" ? null : path.join(root,"data"),
    authVault = createVault({ directory: dataDirectory || undefined }),
    authMailer = createAuthMailer({ fetcher: authEmailFetch, apiKey: authEmailApiKey, from: authEmailFrom, webhookUrl: authEmailWebhookUrl, production });
  const handleDemoCallback = demoCallbackService({db,json,readBody,production});
  const cpay = cpayService({db,json,readBody});
  const handleBilling = billingService({db,json,readBody});
  const stripePlans=stripePlanCheckout({db,json,readBody});
  const rewards=rewardFulfillment({db});
  const handlePlanUpgrade = planUpgradeService({db,json,readBody});
  const mapLocator = createMapLocator({db,authorize,audit,geocode});
  const didit = diditService({db,json,readBody,audit,fetcher:connectFetch,config:diditOptions || diditConfig({production})});
  const signatures = namirialService({ db, vault: authVault, directory: dataDirectory || path.join(root, "data"), fetcher: connectFetch, json, readBody, audit });
  const contactOut = contactOutService({ db, vault: authVault, fetcher: publicDemo ? fetch : connectFetch, json, readBody, audit, demo: !!publicDemo, demoPlan: () => publicDemo?.plan });

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
        `SELECT s.*,m.role,t.name tenant_name,u.email,u.theme FROM sessions s JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id WHERE token=? AND expires>? AND t.account_status='active'`,
      )
      .get(hash(token), Date.now());
  }
  function currentAdmin(req) {
    const token = /(?:^|;\s*)prime_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || "")?.[1];
    if (!token) return null;
    const row = adminSessions.get(hash(token));
    if (!row || row.expires < Date.now()) { adminSessions.delete(hash(token)); return null; }
    return row;
  }
  function adminAudit(admin, action, tenantId, details = {}) {
    db.prepare("INSERT INTO admin_audit(admin_email,action,tenant_id,details,created_at) VALUES (?,?,?,?,?)")
      .run(admin.email, action, tenantId || null, JSON.stringify(details), new Date().toISOString());
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
    const lifetime=privateAccess.lifetime(userId);
    db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
    db.prepare("INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)").run(hash(token),userId,tenantId,now+lifetime*1000,csrf);
    res.setHeader("Set-Cookie",`prime_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${lifetime}${production ? "; Secure" : ""}`);
  }
  const privateAccess=privateDemoAccess({db,directory:dataDirectory,root,enabled:edition==='elite'&&!publicDemo,json,readBody,createSession});
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
    if (isBase && baseExcludedEntities.includes(entity)) return [];
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
  function resetPropertyMapPositions(s,where,args,now){
    for(const property of db.prepare('SELECT * FROM properties WHERE tenant_id=? AND '+where).all(s.tenant_id,...args)){
      if(property.latitude===null&&property.longitude===null)continue;
      db.prepare('UPDATE properties SET latitude=NULL,longitude=NULL,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?').run(s.user_id,now,s.tenant_id,property.id);
      const saved=db.prepare('SELECT * FROM properties WHERE tenant_id=? AND id=?').get(s.tenant_id,property.id);
      db.prepare('INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)').run(s.tenant_id,'properties',property.id,saved.version,JSON.stringify(saved),s.user_id,now);
      audit(s,'properties.address_position_reset',property.id);
    }
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
                // An edited address must never retain the coordinates of the old house.
                if(entity==='buildings'&&(live.title!==b.title||live.street_id!==b.street_id)){
                  db.prepare('UPDATE buildings SET latitude=NULL,longitude=NULL WHERE tenant_id=? AND id=?').run(s.tenant_id,id);
                  resetPropertyMapPositions(s,'unit_id IN (SELECT id FROM units WHERE tenant_id=? AND building_id=?)',[s.tenant_id,id],now);
                }
                if(entity==='properties'&&live.unit_id!==b.unit_id)
                  db.prepare('UPDATE properties SET latitude=NULL,longitude=NULL WHERE tenant_id=? AND id=?').run(s.tenant_id,id);
                if(entity==='units'&&live.building_id!==b.building_id)resetPropertyMapPositions(s,'unit_id=?',[id],now);
                if(entity==='streets'&&(live.title!==b.title||live.city!==b.city)){
                  for(const building of db.prepare('SELECT * FROM buildings WHERE tenant_id=? AND street_id=?').all(s.tenant_id,id)){
                    db.prepare('UPDATE buildings SET latitude=NULL,longitude=NULL,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?').run(s.user_id,now,s.tenant_id,building.id);
                    const cleared=db.prepare('SELECT * FROM buildings WHERE tenant_id=? AND id=?').get(s.tenant_id,building.id);
                    db.prepare('INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)').run(s.tenant_id,'buildings',building.id,cleared.version,JSON.stringify(cleared),s.user_id,now);
                    audit(s,'buildings.address_position_reset',building.id);
                    resetPropertyMapPositions(s,'unit_id IN (SELECT id FROM units WHERE tenant_id=? AND building_id=?)',[s.tenant_id,building.id],now);
                  }
                }
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
  const backupDevices = deviceBackupService({db,database:database||path.join(root,'data/prime.sqlite'),readBody,json,audit,...(publicDemo?{directory:path.join(dataDirectory,'backups')}: {})});
  const backups = backupService({db,database:database||path.join(root,'data/prime.sqlite'),...(publicDemo?{directory:path.join(dataDirectory,'backups'),key:randomBytes(32).toString('base64'),defaultEnabled:false}:{})});
  const connect = connectService({db,directory:database===':memory:'?null:path.dirname(path.resolve(database||path.join(root,'data/prime.sqlite'))),fetcher:connectFetch,providerApi:connectProviderApi,json,readBody,audit,editionFor:sessionEdition,interval:isBase?0:connectInterval,saveAppointment:(session,record,delta)=>saveEntity('appointments',{data:{...Object.fromEntries(Object.keys(schema.appointments.fields).map(key=>[key,record?.[key]])),...delta},version:record?.version},session,record?.id),demo:!!publicDemo});
  const trustpilot = trustpilotMailer({db,connect,json,readBody,audit});
  const stripeAgency = stripeAgencyService({db,vault:authVault,json,readBody,audit,editionFor:sessionEdition,demo:!!publicDemo,publicUrl:()=>new URL((publicDemo&&process.env.PRIME_DEMO_PUBLIC_URL)||process.env.PRIME_PUBLIC_URL||('http://127.0.0.1:'+server.address().port)).origin});
  const portalRoute = portalService({db,readBody,json});
  const assistantManager = assistantManagement({db,readBody,json,audit,previewSave:previewEntity,saveEntity,deleteEntity,authorize,rows});
  const telephony=telephonyService({db,vault:authVault,json,readBody,audit,editionFor:sessionEdition,fetcher:connectFetch,demo:!!publicDemo});
  const elite = eliteService({db,json,readBody,audit,management:assistantManager,rows,authorize,edition:publicDemo?customerDemoEdition(publicDemo.plan):edition,production,fetcher:publicDemo?fetch:connectFetch,directory:dataDirectory,demoChatOnly:publicDemo||false,telephonyCredentials:telephony.credentials});
  const assistant = assistantService({db,fetcher:assistantFetch,apiKey:assistantApiKey,model:assistantModel,readBody,json,audit,management:publicDemo?undefined:assistantManager});
  const customerDemos=publicDemo?null:customerDemoService({createApp,root,production,json,readBody,geocode});
  const mfa=multiFactor({db,vault:authVault,mailer:authMailer,passwordCheck,json,readBody,createSession,audit,smsSender:authSmsSender||authSmsVerify()});
  const qrAuth=authenticatorQr({db,json,readBody,createSession,audit,mfa});
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
      if(url.pathname==='/checkout'&&(url.searchParams.has('test')||url.searchParams.get('live')==='1'||url.searchParams.get('choose')==='live'))res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self'; img-src 'self' data: https://*.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com; connect-src 'self' https://api.stripe.com https://*.stripe.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      if(url.pathname==='/.well-known/assetlinks.json'&&method==='GET'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=3600'});res.end(JSON.stringify([{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:'it.primegestionale.authenticator',sha256_cert_fingerprints:['34:B0:A0:DB:F3:BE:CB:28:16:11:42:4F:F1:CF:F4:81:AD:03:17:3B:93:A6:D6:AE:B5:02:15:66:A5:17:4E:19']}}]));return;}
      if(url.pathname==='/authenticator'){res.writeHead(308,{Location:'/authenticator/'});res.end();return;}
      if(url.pathname.startsWith('/authenticator/')){res.setHeader('Permissions-Policy','camera=(self), microphone=()');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");}
      if(customerDemos&&await customerDemos.route(req,res,url))return;
      if(await privateAccess.route(req,res,url))return;
      const signedForElite=['/','/app'].includes(url.pathname)&&(()=>{const active=currentSession(req);return !!active&&['vip','elite'].includes(sessionEdition(active));})();
      if(url.pathname==='/sorelle-assistenti'||signedForElite){
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; connect-src 'self' wss://api.elevenlabs.io https://api.elevenlabs.io; media-src 'self' blob:; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        res.setHeader('Permissions-Policy','microphone=(self), camera=()');
      }
      if (production)
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      if (url.pathname === '/' && method === 'GET' && ['verify','reset','invite','connect','mail'].some(key=>url.searchParams.has(key))) { res.writeHead(302,{Location:'/app'+url.search,'Cache-Control':'no-store'});res.end();return; }
      if(await stripePlans.publicRoute(req,res,url))return;
      if(await stripeAgency.publicRoute(req,res,url))return;
      if (isBase && (/^\/api\/(?:public|connect|stripe|assistant|portals|signatures|contactout|webhooks)(?:\/|$)/.test(url.pathname))) throw new ApiError(403,'Funzione non disponibile in PRIME Base.');
      if(await elite.publicRoute(req,res,url))return;
      if(!isBase && await handleDemoCallback(req,res,url))return;
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
            db.prepare("INSERT INTO tenants(id,name) VALUES (?,?)").run(tid, agency);
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
          const accountStatus=db.prepare("SELECT account_status FROM tenants WHERE id=?").get(tenantId)?.account_status;
          if(accountStatus==='suspended')throw new ApiError(403,"Account sospeso. Contatta l’assistenza PRIME.");
          if(accountStatus==='closed')throw new ApiError(403,"Account chiuso. Contatta l’assistenza PRIME.");
        }
        if(factorMethods(user).length)return json(res,200,{ok:true,...mfa.challenge(user,tenantId)});
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
      if(await qrAuth.publicRoute(req,res,url))return;
      if(await mfa.publicRoute(req,res,url))return;
      if(url.pathname==='/backup-pc-windows.cmd'&&method==='GET'){
        const origin=new URL(process.env.PRIME_PUBLIC_URL||('http://127.0.0.1:'+server.address().port)).origin;
        if(!/^https?:\/\/[a-zA-Z0-9.:-]+$/.test(origin))throw new ApiError(503,'Indirizzo pubblico non valido');
        const setup=readFileSync(path.join(root,'scripts/backup-pc-setup.ps1'),'utf8').replace('__PRIME_SERVER__',origin);
        const command='@echo off\r\nset "PRIME_SETUP_FILE=%~f0"\r\npowershell.exe -NoProfile -STA -Command "$source=[IO.File]::ReadAllText($env:PRIME_SETUP_FILE);$payload=$source.Substring($source.LastIndexOf(\'###PRIME_SETUP###\')+17);& ([scriptblock]::Create($payload))"\r\nexit /b %errorlevel%\r\n###PRIME_SETUP###\r\n'+setup;
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="PRIME-Backup-PC.cmd"'});res.end(command);return;
      }
      if(url.pathname==='/backup-companion.mjs'&&method==='GET'){const bytes=readFileSync(path.join(root,'public/backup-companion.mjs'));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="prime-backup-pc.mjs"'});res.end(bytes);return;}
      if(await backupDevices.publicRoute(req,res,url))return;
      if(url.pathname==="/admin/access"&&method==="GET"){
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"});
        res.end(readFileSync(path.join(root,"public/admin-handoff.html")));return;
      }
      if(url.pathname==="/api/admin/handoff/redeem"&&method==="POST"){
        res.setHeader("Cache-Control","no-store");
        if(currentAdmin(req))return json(res,200,{ok:true});
        const body=await readBody(req),ticket=String(body.ticket||""),key=hash(ticket),grant=adminHandoffs.get(key);
        if(!grant||grant.expires<=Date.now())throw new ApiError(401,"Link scaduto o già utilizzato. Accedi dalla console.");
        adminHandoffs.delete(key);
        const token=randomBytes(32).toString("hex"),csrf=randomBytes(32).toString("hex");
        adminSessions.set(hash(token),{email:grant.email,csrf,expires:Date.now()+24*60*60*1000});
        res.setHeader("Set-Cookie",`prime_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${production?"; Secure":""}`);
        return json(res,200,{ok:true});
      }
      if (url.pathname.startsWith("/api/")) {
        if (url.pathname.startsWith("/api/admin/")) {
          const configuredEmail=String(process.env.PRIME_SUPER_ADMIN_EMAIL||"").trim().toLowerCase();
          const configuredPassword=String(process.env.PRIME_SUPER_ADMIN_PASSWORD_HASH||"");
          if(url.pathname==="/api/admin/login"&&method==="POST"){
            if(!configuredEmail||!configuredPassword||(production&&!process.env.PRIME_SUPER_ADMIN_TOTP_SECRET))throw new ApiError(503,"Console non configurata: imposta email, password hash e TOTP Super Admin nei secrets del server.");
            const key=`${req.socket.remoteAddress}:super-admin`,now=Date.now(),limit=adminAttempts.get(key);
            if(!limit||limit.until<now)adminAttempts.set(key,{count:1,until:now+600000});else if(++limit.count>8)throw new ApiError(429,"Troppi tentativi. Riprova tra dieci minuti.");
            const b=await readBody(req),email=String(b.email||"").trim().toLowerCase();
            const goodEmail=timingSafeEqual(Buffer.from(createHash("sha256").update(email).digest()),Buffer.from(createHash("sha256").update(configuredEmail).digest()));
            const goodPassword=await passwordCheck(String(b.password||""),configuredPassword);
            const goodTotp=!production||verifyTotp(process.env.PRIME_SUPER_ADMIN_TOTP_SECRET,String(b.code||""));
            if(!goodEmail||!goodPassword||!goodTotp)throw new ApiError(401,"Credenziali admin non valide.");
            const token=randomBytes(32).toString("hex"),csrf=randomBytes(32).toString("hex"),expires=now+24*60*60*1000;
            adminSessions.set(hash(token),{email:configuredEmail,csrf,expires});
            res.setHeader("Set-Cookie",`prime_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${production?"; Secure":""}`);
            return json(res,200,{ok:true,email:configuredEmail,csrf,expires});
          }
          const admin=currentAdmin(req);
          if(!admin)throw new ApiError(401,"Accedi alla console amministrativa.");
          if(mutating&&req.headers["x-csrf-token"]!==admin.csrf)throw new ApiError(403,"Token CSRF non valido.");
          if(url.pathname==="/api/admin/handoff"&&method==="POST"){
            const ticket=randomBytes(32).toString("hex"),now=Date.now();
            for(const [key,value] of adminHandoffs)if(value.expires<=now)adminHandoffs.delete(key);
            adminHandoffs.set(hash(ticket),{email:admin.email,expires:now+15*60*1000});
            res.setHeader("Cache-Control","no-store");
            return json(res,200,{url:authOrigin(req)+"/admin/access#ticket="+ticket});
          }
          if(url.pathname==="/api/admin/me"&&method==="GET")return json(res,200,{email:admin.email,csrf:admin.csrf});
          if(url.pathname==="/api/admin/logout"&&method==="POST"){
            const token=/(?:^|;\s*)prime_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||"")?.[1];if(token)adminSessions.delete(hash(token));
            res.setHeader("Set-Cookie",`prime_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?"; Secure":""}`);return json(res,200,{ok:true});
          }
          if(url.pathname==="/api/admin/overview"&&method==="GET"){
            const agencies=db.prepare(`SELECT t.id tenant_id,t.name,t.account_status,
              (SELECT email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=t.id AND m.role='owner' ORDER BY u.email LIMIT 1) owner_email,
              COALESCE((SELECT kyb_status FROM agency_billing WHERE tenant_id=t.id),'unverified') kyb_status,
              (SELECT status FROM didit_kyb_sessions WHERE tenant_id=t.id ORDER BY created_at DESC,rowid DESC LIMIT 1) didit_status,
              ps.plan,ps.cycle,ps.period_end,ps.paid_plan_cents,ps.payment_reference,ps.state subscription_state,
              (SELECT state FROM cpay_orders WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1) latest_payment_state,
              (SELECT cents FROM cpay_orders WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1) latest_payment_cents
              FROM tenants t LEFT JOIN plan_subscriptions ps ON ps.tenant_id=t.id ORDER BY t.name COLLATE NOCASE`).all();
            const now=new Date().toISOString();
            const needsKybReview=x=>x.account_status==='active'&&!['approved','rejected'].includes(x.kyb_status)&&(['vip','elite'].includes(x.plan)||['pending'].includes(x.kyb_status)||['not_started','in_progress','in_review','approved','resubmitted'].includes(x.didit_status));
            const summary={agencies:agencies.length,active:agencies.filter(x=>x.account_status==='active'&&x.subscription_state==='active'&&x.period_end>now).length,
              awaitingApproval:agencies.filter(needsKybReview).length,
              awaitingPayment:agencies.filter(x=>['pending','creating'].includes(x.latest_payment_state)).length,
              expired:agencies.filter(x=>x.subscription_state==='active'&&x.period_end<=now).length,
              suspended:agencies.filter(x=>x.account_status==='suspended'||x.subscription_state==='suspended').length};
            const pending=agencies.filter(needsKybReview);
            return json(res,200,{summary,agencies,pending,recentAudit:db.prepare('SELECT admin_email,action,tenant_id,details,created_at FROM admin_audit ORDER BY id DESC LIMIT 30').all()});
          }
          const actionRoute=/^\/api\/admin\/tenants\/([a-f0-9-]+)\/action$/.exec(url.pathname);
          if(actionRoute&&method==="POST"){
            const tenantId=actionRoute[1],tenant=db.prepare('SELECT id,account_status FROM tenants WHERE id=?').get(tenantId);if(!tenant)throw new ApiError(404,"Agenzia non trovata.");
            const b=await readBody(req),action=String(b.action||""),now=new Date().toISOString();
            if(action==="approve_vip_elite"){
              const sub=db.prepare("SELECT plan,state,period_end FROM plan_subscriptions WHERE tenant_id=?").get(tenantId);
              const diditRequest=db.prepare("SELECT 1 FROM didit_kyb_sessions WHERE tenant_id=? LIMIT 1").get(tenantId);
              if((sub&&!['vip','elite'].includes(sub.plan))||(!sub&&!diditRequest))throw new ApiError(409,"La verifica può essere approvata per una richiesta KYB registrata o per un account VIP/Elite.");
              db.prepare("INSERT INTO agency_billing(tenant_id,kyb_status,kyb_reference,approved_at) VALUES (?,'approved','admin-reviewed',?) ON CONFLICT(tenant_id) DO UPDATE SET kyb_status='approved',kyb_reference='admin-reviewed',approved_at=excluded.approved_at").run(tenantId,now);
              db.prepare("UPDATE tenants SET account_status='active' WHERE id=?").run(tenantId);adminAudit(admin,action,tenantId);return json(res,200,{ok:true});
            }
            if(action==="reject_vip_elite"){
              const sub=db.prepare("SELECT plan FROM plan_subscriptions WHERE tenant_id=?").get(tenantId),diditRequest=db.prepare("SELECT 1 FROM didit_kyb_sessions WHERE tenant_id=? LIMIT 1").get(tenantId);
              if((sub&&!['vip','elite'].includes(sub.plan))||(!sub&&!diditRequest))throw new ApiError(409,"Questa azione è riservata alle richieste KYB e ai piani VIP/Elite.");
              db.prepare("INSERT INTO agency_billing(tenant_id,kyb_status,kyb_reference,approved_at) VALUES (?,'rejected','admin-reviewed',NULL) ON CONFLICT(tenant_id) DO UPDATE SET kyb_status='rejected',kyb_reference='admin-reviewed',approved_at=NULL").run(tenantId);adminAudit(admin,action,tenantId);return json(res,200,{ok:true});
            }
            if(action==="suspend"||action==="close"){
              const status=action==='close'?'closed':'suspended';transaction(db,()=>{db.prepare('UPDATE tenants SET account_status=? WHERE id=?').run(status,tenantId);db.prepare('UPDATE plan_subscriptions SET state=? WHERE tenant_id=?').run(action==='close'?'cancelled':'suspended',tenantId);db.prepare('DELETE FROM sessions WHERE tenant_id=?').run(tenantId);db.prepare('DELETE FROM auth_challenges WHERE tenant_id=?').run(tenantId);db.prepare('DELETE FROM auth_tokens WHERE tenant_id=?').run(tenantId);adminAudit(admin,action,tenantId);});return json(res,200,{ok:true,status});
            }
            if(action==="reactivate"){
              if(tenant.account_status==='closed')throw new ApiError(409,"Un account chiuso non può essere riattivato da questa schermata.");
              db.prepare("UPDATE tenants SET account_status='active' WHERE id=?").run(tenantId);db.prepare("UPDATE plan_subscriptions SET state='active' WHERE tenant_id=? AND period_end>? AND state='suspended'").run(tenantId,now);adminAudit(admin,action,tenantId);return json(res,200,{ok:true});
            }
            if(action==="revoke_sessions"){
              db.prepare('DELETE FROM sessions WHERE tenant_id=?').run(tenantId);db.prepare('DELETE FROM auth_challenges WHERE tenant_id=?').run(tenantId);adminAudit(admin,action,tenantId);return json(res,200,{ok:true});
            }
            if(action==="reset_owner_password"){
              const owner=db.prepare("SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role='owner' ORDER BY u.email LIMIT 1").get(tenantId);if(!owner)throw new ApiError(404,"Titolare non trovato.");
              const resetUrl=await sendAuthLink(req,{userId:owner.id,tenantId,email:owner.email,purpose:"password_reset",subject:"Reimposta la password PRIME",message:"È stata richiesta la reimpostazione della password del tuo account PRIME.",label:"Reimposta password",queryKey:"reset",ttl:30*60*1000});
              db.prepare('DELETE FROM sessions WHERE tenant_id=?').run(tenantId);adminAudit(admin,action,tenantId,{owner_email:owner.email});return json(res,200,{ok:true,...(resetUrl?{resetUrl}:{})});
            }
            throw new ApiError(400,"Azione amministrativa non valida.");
          }
          throw new ApiError(404,"Endpoint amministrativo non trovato.");
        }
        const s = currentSession(req);
        if (!s) throw new ApiError(401, "Accedi per continuare");
        if (mutating && req.headers["x-csrf-token"] !== s.csrf)
          throw new ApiError(
            403,
            "Sessione di sicurezza non valida: aggiorna la pagina",
          );
        const demoElitePath=publicDemo&&url.pathname.replace(/^\/demo(?=\/)/,'');
        if(publicDemo&&demoElitePath?.startsWith('/api/elite/')){if(await elite.route(req,res,new URL(demoElitePath+url.search,url.origin),s))return;}
        if(publicDemo&&await customerDemoApi({req,res,url,s,db,config:publicDemo,json,readBody}))return;
        const accountEdition=sessionEdition(s);
        if(accountEdition==='base' && !baseApiAllowed(url.pathname)) throw new ApiError(403,'Questa funzione è inclusa da PRIME Pro in su.');
        if(await backupDevices.route(req,res,url,s))return;
        if(await didit.route(req,res,url,s))return;
        if(await handlePlanUpgrade(req,res,url,s))return;
        if(await stripePlans.route(req,res,url,s))return;
        if(await cpay.route(req,res,url,s))return;
        if(await handleBilling(req,res,url,s))return;
        if (url.pathname === "/api/me" && method === "GET")
          return json(res, 200, {
            id: s.user_id,
            email: s.email,
            tenant: s.tenant_name,
            hide_search_shortcut: production && !demo && !publicDemo && db.prepare("SELECT kyb_status FROM agency_billing WHERE tenant_id=?").get(s.tenant_id)?.kyb_status === 'approved',
            name_day: db.prepare("SELECT month_day FROM vanessa_name_days WHERE user_id=?").get(s.user_id)?.month_day || "",
            profile_photo: db.prepare("SELECT photo FROM user_profiles WHERE user_id=?").get(s.user_id)?.photo || "",
            tenant_id: s.tenant_id,
            role: s.role,
            theme: s.theme,
            csrf: s.csrf,
            edition: accountEdition,
            stripe_enabled: stripeAgencyAllowed(db,s,accountEdition),
            ...(publicDemo?{customer_demo:true,demo_plan:publicDemo.plan,theme_variant:publicDemo.theme_variant||'',vanessa_chat_only:true}:{}),
            human_seat_limit: publicDemo&&publicDemo.plan==='pro'?10:accountEdition==='base' ? 2 + baseExtraSeats : null,
            environment: demo ? "demo" : "local",
            server_now: Date.now(),
          });
        if(await qrAuth.route(req,res,url,s))return;
        if(await mfa.route(req,res,url,s))return;
        if (url.pathname === "/api/account/security/totp/setup" && method === "POST") {
          const b=await readBody(req);await mfa.authorize(s,b);const user=db.prepare("SELECT email,password FROM users WHERE id=?").get(s.user_id);
          if(!await passwordCheck(String(b.password||""),user.password))throw new ApiError(401,"Password non corretta.");
          const secret=createTotpSecret(),cipher=authVault.seal({secret},`auth:totp-pending:${s.user_id}`);
          db.prepare("UPDATE users SET totp_pending_cipher=? WHERE id=?").run(cipher,s.user_id);
          audit(s,"auth.totp_setup_started",s.user_id);
          return json(res,200,{secret,otpauth_url:totpUri(secret,user.email)});
        }
        if (url.pathname === "/api/account/security/totp/enable" && method === "POST") {
          const b=await readBody(req);await mfa.authorize(s,b);const row=db.prepare("SELECT totp_pending_cipher FROM users WHERE id=?").get(s.user_id);
          if(!row.totp_pending_cipher)throw new ApiError(400,"Avvia prima la configurazione Authenticator.");
          const {secret}=authVault.open(row.totp_pending_cipher,`auth:totp-pending:${s.user_id}`);
          if(!verifyTotp(secret,b.code))throw new ApiError(400,"Codice Authenticator non valido.");
          db.prepare("UPDATE users SET totp_enabled=1,totp_secret_cipher=?,totp_pending_cipher='' WHERE id=?").run(authVault.seal({secret},`auth:totp:${s.user_id}`),s.user_id);
          mfa.changed(s,"totp");audit(s,"auth.totp_enabled",s.user_id);
          return json(res,200,{ok:true});
        }
        if (url.pathname === "/api/account/security/totp/disable" && method === "POST") {
          const b=await readBody(req);await mfa.authorize(s,b);const user=db.prepare("SELECT password,totp_secret_cipher,totp_enabled FROM users WHERE id=?").get(s.user_id);
          if(!await passwordCheck(String(b.password||""),user.password))throw new ApiError(401,"Password non corretta.");
          if(!user.totp_enabled||!verifyTotp(authVault.open(user.totp_secret_cipher,`auth:totp:${s.user_id}`).secret,b.code))throw new ApiError(400,"Codice Authenticator non valido.");
          db.prepare("UPDATE users SET totp_enabled=0,totp_secret_cipher='',totp_pending_cipher='' WHERE id=?").run(s.user_id);
          mfa.changed(s,"totp");audit(s,"auth.totp_disabled",s.user_id);
          return json(res,200,{ok:true});
        }
        if (url.pathname === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(s.token);
          res.setHeader(
            "Set-Cookie",
            `prime_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${production ? "; Secure" : ""}`,
          );
          return json(res, 200, { ok: true });
        }
        if (edition === "base" && !baseApiAllowed(url.pathname) && url.pathname.startsWith("/api/")) throw new ApiError(403, "Funzione non inclusa nel piano Standard.");
        if (url.pathname === "/api/preferences/profile" && method === "PATCH") {
          const b = await readBody(req, 300000);
          if (!Object.keys(b).length || Object.keys(b).some(key => !['agency_name','photo','name_day'].includes(key))) throw new ApiError(400, "Campi profilo non validi.");
          if (b.name_day !== undefined && !validVanessaNameDay(b.name_day)) throw new ApiError(400, "Scegli un giorno e un mese validi per l’onomastico.");
          if (b.agency_name !== undefined && s.role !== 'owner') throw new ApiError(403, "Solo il titolare può modificare il nome dell’agenzia.");
          const name = typeof b.agency_name === 'string' ? b.agency_name.trim() : '';
          if (b.agency_name !== undefined && (!name || name.length > 120 || /[\x00-\x1f]/.test(name))) throw new ApiError(400, "Inserisci un nome agenzia da 1 a 120 caratteri.");
          if (b.photo !== undefined && (typeof b.photo !== 'string' || (b.photo !== '' && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.photo) || b.photo.length > 260000 || !Buffer.from(b.photo.split(',')[1], 'base64').subarray(0,3).equals(Buffer.from([255,216,255])))))) throw new ApiError(400, "Foto profilo non valida.");
          transaction(db, () => {
            if (b.agency_name !== undefined) db.prepare("UPDATE tenants SET name=? WHERE id=?").run(name, s.tenant_id);
            if (b.photo !== undefined) db.prepare("INSERT INTO user_profiles(user_id,photo) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET photo=excluded.photo").run(s.user_id, b.photo);
            if (b.name_day === '') db.prepare("DELETE FROM vanessa_name_days WHERE user_id=?").run(s.user_id);
            else if (b.name_day !== undefined) db.prepare("INSERT INTO vanessa_name_days(user_id,month_day) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET month_day=excluded.month_day").run(s.user_id, b.name_day);
          });
          audit(s, 'profile.updated', s.user_id);
          return json(res, 200, {ok:true});
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
              if (accountEdition==='base' && db.prepare('SELECT COUNT(*) count FROM memberships WHERE tenant_id=?').get(s.tenant_id).count >= 2 + baseExtraSeats) throw new ApiError(403,'PRIME Standard include 2 agenti umani, titolare compreso. I posti aggiuntivi richiedono attivazione e costano 50 €/mese ciascuno.');
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
          return json(res,200,await geocode(String(url.searchParams.get('q')||'').trim()));
        }
        if (url.pathname === "/api/map/autolocate" && method === "POST") {
          const body=await readBody(req);
          if(typeof body.building_id!=='string'||body.building_id.length>100)throw new ApiError(400,'Civico non valido');
          return json(res,200,await mapLocator.locate(s,body.building_id));
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
        if (await telephony.route(req,res,url,s)) return;
        if (await stripeAgency.route(req,res,url,s)) return;
        if (await trustpilot.route(req,res,url,s)) return;
        if (await connect.route(req,res,url,s)) return;
        if (await signatures.route(req,res,url,s)) return;
        if (await contactOut.route(req,res,url,s)) return;
        if (await assistantManager.route(req,res,url,s)) return;
        if (await elite.route(req,res,url,s)) return;
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
            let saved=saveEntity(entity,raw,s,id),location=null;
            try{location=await mapLocator.afterSave(s,entity,saved);}catch{location={status:'unavailable'};}
            if(entity==='buildings'&&location?.building)saved=location.building;
            return json(res,id?200:201,{...saved,...(location?{map_location:location.status}:{})});
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
        "/admin-handoff.js":"admin-handoff.js",
        "/admin":"admin.html",
        "/admin/":"admin.html",
        "/admin.css":"admin.css",
        "/admin.js":"admin.js",
        "/cookies.css":"cookies.css",
        "/cookies.js":"cookies.js",
        "/cookies":"cookies.html",
        "/cookies/":"cookies.html",
        "/customer-demo-runtime.js":"customer-demo-runtime.js",
        "/partner-mail.js":"partner-mail.js",
        "/demo-pre5-style.css":"demo-pre5-style.css",
        "/demo-pre5-connect.css":"demo-pre5-connect.css",
        "/demo-pre5-connect.js":"demo-pre5-connect.js",
        "/secret-storage.js":"secret-storage.js",
        "/mail-demo-pre5min.js":"mail-demo-pre5min.js",
        "/partner-mail-demo-pre5min.js":"partner-mail-demo-pre5min.js",
        "/customer-demo-ui.js":"customer-demo-ui.js",
        "/elite-view.js":"elite-view.js",
        "/zoho-pec.js":"zoho-pec.js",
        "/assets/zoho-mail-logo.svg":"assets/zoho-mail-logo.svg",
        "/customer-demo.css":"customer-demo.css",
        "/edition.js":"edition.js",
        "/upgrade.js":"upgrade.js",
        "/elite-ui.js":"elite-ui.js",
        "/elite.css":"elite.css",
        "/elite-audio.js":"elite-audio.js",
"/vendor/elevenlabs/client.js":"vendor/elevenlabs/client.js",
"/vendor/elevenlabs/client.js.LEGAL.txt":"vendor/elevenlabs/client.js.LEGAL.txt",
"/vendor/elevenlabs/rawAudioProcessor.js":"vendor/elevenlabs/rawAudioProcessor.js",
"/vendor/elevenlabs/audioConcatProcessor.js":"vendor/elevenlabs/audioConcatProcessor.js",
"/vendor/elevenlabs/libsamplerate.worklet.js":"vendor/elevenlabs/libsamplerate.worklet.js",
"/vanessa-browser.js":"vanessa-browser.js",
        "/browser-assistant.js":"browser-assistant.js",
        "/downloads/vanessa-browser-chromium.zip":"downloads/vanessa-browser-chromium.zip",
        "/downloads/vanessa-browser-firefox.zip":"downloads/vanessa-browser-firefox.zip",
        "/downloads/vanessa-browser-edge.zip":"downloads/vanessa-browser-edge.zip",
        "/downloads/vanessa-browser-edge.crx":"downloads/vanessa-browser-edge.crx",
"/sorelle-assistenti":"sisters.html",
"/phoenix":"phoenix.html",
"/phoenix/":"phoenix.html",
"/phoenix.css":"phoenix.css",
"/assets/tempocasa-logo.svg":"assets/tempocasa-logo.svg",
"/assets/phoenix-portrait.png":"assets/phoenix-portrait.png",
"/landing.css":"landing.css",
        "/landing-professionista-video.js":"landing-professionista-video.js",
        "/assets/prime-professionista-kling4.mp4":"assets/prime-professionista-kling4.mp4",
        "/assets/prime-professionista-kling4-rewind.mp4":"assets/prime-professionista-kling4-rewind.mp4",
        "/assets/prime-professionista-top-kling4.mp4":"assets/prime-professionista-top-kling4.mp4",
        "/money-cursor.css":"money-cursor.css",
        "/money-cursor.js":"money-cursor.js",
        "/assets/charging-bull-silver-sheet.png":"assets/charging-bull-silver-sheet.png",
        "/assets/charging-bull-original-silver.png":"assets/charging-bull-original-silver.png",
        "/assets/charging-bull-natural-gait.png":"assets/charging-bull-natural-gait.png",
        "/assets/charging-bull-preparation.png":"assets/charging-bull-preparation.png",
        "/partners.css":"partners.css",
        "/partners-orbit.js":"partners-orbit.js",
        "/assets/google-workspace-dark.svg":"assets/google-workspace-dark.svg",
        "/assets/finom-wordmark.png":"assets/finom-wordmark.png",
        "/assets/finom-wordmark-crop.svg":"assets/finom-wordmark-crop.svg",
        "/assets/proton-mail-logo.svg":"assets/proton-mail-logo.svg",
        "/assets/yahoo-mail-dark.svg":"assets/yahoo-mail-dark.svg",
        "/assets/whuis-dark.png":"assets/whuis-dark.png",
        "/partners-test.css":"partners-test.css",
        "/partners-test.js":"partners-test.js",
        "/assets/contactout-logo.png":"assets/contactout-logo.png",
        "/assets/contactout-official.svg":"assets/contactout-official.svg",
        "/brands/providers/letterasenzabusta-official.svg":"brands/providers/letterasenzabusta-official.svg",
"/cloudtalk-feature.css":"cloudtalk-feature.css",
"/assets/cloudtalk-logo.svg":"assets/cloudtalk-logo.svg",
"/assets/zadarma-logo.svg":"assets/zadarma-logo.svg",
"/assets/google-workspace-official.svg":"assets/google-workspace-official.svg",
        "/apps": "apps.html",
        "/apps/": "apps.html",
        "/apps.css": "apps.css",
        "/apps-theme.js": "apps-theme.js",
        ...Object.fromEntries(["apps-prime-house.png", "prime-house-favicon.png", "apps-authenticator.png", "apps-apple.svg", "apps-qr-apple.svg", "apps-qr-play.svg", "apps-qr-apk.svg"].map(file => ["/assets/" + file, "assets/" + file])),
        "/downloads/prime-authenticator-android-v1.0.2.apk": "downloads/prime-authenticator-android-v1.0.2.apk",
        "/partners": "partners.html",
        "/partners/": "partners.html",
        "/partners/test": "partners-test.html",
        "/partners/test/": "partners-test.html",
"/telephony-connect.js":"telephony-connect.js",
"/assets/teamviewer-official.png":"assets/teamviewer-official.png",
"/landing-composition.css":"landing-composition.css",
"/landing.js":"landing.js",
"/i18n.js":"i18n.js","/i18n.css":"i18n.css","/en.json":"en.json","/app-en.json":"app-en.json","/app-locale.js":"app-locale.js","/checkout-test.js":"checkout-test.js","/checkout-live-choice.js":"checkout-live-choice.js",
"/pricing.js":"pricing.js",
"/sisters.css":"sisters.css",
"/sisters.js":"sisters.js",
"/film-controls.js":"film-controls.js",
"/sisters-chat.js":"sisters-chat.js","/sisters-chat-en.js":"sisters-chat-en.js",
"/assets/prime-bonus-chrome.png":"assets/prime-bonus-chrome.png",
"/assets/prime-checkout-logo.svg":"assets/prime-checkout-logo.svg",
"/assets/prime-wordmark.svg":"assets/prime-wordmark.svg",
"/assets/prime-hero-panorama.png":"assets/prime-hero-panorama.png",
"/assets/prime-professionals.png":"assets/prime-professionals.png",
"/assets/veronica-intro.mp4":"assets/veronica-intro.mp4",
"/assets/vanessa-intro.mp4":"assets/vanessa-intro.mp4",
"/assets/veronica-intro-en.mp4":"assets/veronica-intro-en.mp4",
"/assets/vanessa-intro-en.mp4":"assets/vanessa-intro-en.mp4",
"/assets/veronica-poster.png":"assets/veronica-poster.png",
"/assets/vanessa-poster.png":"assets/vanessa-poster.png",
"/assets/vanessa-icon-v2.png":"assets/vanessa-icon-v2.png",
"/assets/vanessa-face-icon.png":"assets/vanessa-face-icon.png",
"/assistant-avatar-v5-chat-crop-v3.png":"assistant-avatar-v5-chat-crop-v3.png",
"/assistant-avatar-light-chat-crop-v3.png":"assistant-avatar-light-chat-crop-v3.png",

"/assets/manrope-variable.ttf":"assets/manrope-variable.ttf",
        "/": isBase ? "base.html" : "landing.html",
        "/app": isBase?"app-base-live.html":"app-live.html",
        "/landing": "landing.html",
        "/checkout":url.searchParams.has("order")&&(url.searchParams.has("test")||url.searchParams.get("live")==="1")?"stripe-checkout.html":"checkout.html",
        "/stripe-checkout.js":"stripe-checkout.js",
        "/stripe-checkout.css":"stripe-checkout.css",
        "/assets/checkout-lake.png":"assets/checkout-lake.png",
        "/checkout.css":"checkout.css",
        "/checkout.js":"checkout.js",
        "/privacy": "privacy.html",
        "/legal.css": "legal.css",
        "/legal.js": "legal.js",
        "/termini": "privacy.html",
        "/app.js": "app.js",
        "/seasonal-themes.js": "seasonal-themes.js",
        "/seasonal-effects.js": "seasonal-effects.js",
        "/seasonal-fireworks.js": "seasonal-fireworks.js",
        "/seasonal-themes.css": "seasonal-themes.css",
        "/assets/seasonal-buon-natale.wav": "assets/seasonal-buon-natale.wav",
        "/assets/seasonal-santa-original.mp3": "assets/seasonal-santa-original.mp3",
        "/app-live.js": "app-live.js",
        "/development-status.js": "development-status.js",
        "/stripe-connect.js": "stripe-connect.js",
        "/integration-guides.js": "integration-guides.js",
        "/qr-login.js":"qr-login.js",
        "/qr-login.css":"qr-login.css",
        "/security.js": "security.js",
        "/authenticator/":"authenticator/index.html",
        ...Object.fromEntries(['index.html','main.js','crypto.js','prime-qr.js','biometric.js','qr-decoder.js','style.css','icon.svg','icon-192.png','icon-512.png','manifest.webmanifest','sw.js'].map(file=>['/authenticator/'+file,'authenticator/'+file])),
        "/wallester-dashboard.js": "wallester-dashboard.js",
        "/finance-test-controls.js": "finance-test-controls.js",
        "/finance-icons.js": "finance-icons.js",
        "/wallester-operations.js": "wallester-operations.js",
        "/wallester-cards.js": "wallester-cards.js",
        "/operations.js": "operations.js",
        "/backup-settings.js": "backup-settings.js",
        "/assistant-management.js": "assistant-management.js",
        "/map.js": "map.js",
        "/map-locations.js": "map-locations.js",
        "/mail.js": "mail.js",
        "/connect.js": "connect.js",
        "/datagma-tools.js": "datagma-tools.js",
        "/stripe-agency.js": "stripe-agency.js",
        "/stripe-chart.js": "stripe-chart.js",
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
        "/brands/providers/outlook.svg": "brands/providers/outlook.svg",
        "/brands/providers/datagma.svg": "brands/providers/datagma.svg",
        "/brands/providers/datagma-official.svg": "brands/providers/datagma-official.svg",
        "/brands/providers/contactout.png": "brands/providers/contactout.png",
        "/brands/providers/telecontact.png": "brands/providers/telecontact.png",
        "/brands/providers/whuis.png": "brands/providers/whuis.png",
        "/brands/providers/namirial.svg": "brands/providers/namirial.svg",
        "/brands/providers/namirial-mark.svg": "brands/providers/namirial-mark.svg",
        "/brands/providers/letterasenzabusta.png": "brands/providers/letterasenzabusta.png",
        "/brands/providers/virgilio.svg": "brands/providers/virgilio.svg",
        "/brands/providers/pec.svg": "brands/providers/pec.svg",
        "/brands/providers/infomaniak-wordmark.svg": "brands/providers/infomaniak-wordmark.svg",
        "/brands/providers/legalmail.svg": "brands/providers/legalmail.svg",
        "/brands/providers/datagma.svg": "brands/providers/datagma.svg",
        "/brands/providers/namirial.svg": "brands/providers/namirial.svg",
         "/brands/providers/zoom.svg": "brands/providers/zoom.svg",
         "/brands/providers/microsoftteams.svg": "brands/providers/microsoftteams.svg",
         "/brands/providers/microsoftonedrive.svg": "brands/providers/microsoftonedrive.svg",
         "/brands/providers/googledrive.svg": "brands/providers/googledrive.svg",
         "/brands/providers/dropbox.svg": "brands/providers/dropbox.svg",
        "/assistant-avatar.png": "assistant-avatar.png",
        "/assistant-avatar-v2.png": "assistant-avatar-v2.png",
        "/assistant-avatar-v3.png": "assistant-avatar-v3.png",
        "/assistant-avatar-v4.png": "assistant-avatar-v4.png",
        "/assistant-avatar-v5.png": "assistant-avatar-v5.png",
        "/assistant-avatar-v5-thumb-v2.png": "assistant-avatar-v5-thumb-v2.png",
        "/assistant-avatar-light.png": "assistant-avatar-light.png",
        "/assistant-avatar-light-thumb-v2.png": "assistant-avatar-light-thumb-v2.png",
        "/assistant-avatar-dark.webp": "assistant-avatar-dark.webp",
        "/assistant-avatar-light.webp": "assistant-avatar-light.webp",
        "/assistant-avatar-dark-thumb.webp": "assistant-avatar-dark-thumb.webp",
        "/assistant-avatar-light-thumb.webp": "assistant-avatar-light-thumb.webp",


        "/connect.css": "connect.css",
        "/stripe.css": "stripe.css",
        "/brands/stripe-wordmark-slate.svg": "brands/stripe-wordmark-slate.svg",
        "/brands/stripe-wordmark-white.svg": "brands/stripe-wordmark-white.svg",
        "/brands/klarna-badge.svg": "brands/klarna-badge.svg",
        "/didit.js": "didit.js",
        "/datagma.css": "datagma.css",
        "/map.css": "map.css",
        "/schema.js": "schema.js",
        "/planner.js": "planner.js",
        "/planner-view.js": "planner-view.js",
        "/wps-clock.js": "wps-clock.js",
        "/style.css": "style.css",
        "/style-live.css": "style-live.css",
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
      let file = files[url.pathname];
      if (url.pathname === "/app" && !existsSync(path.join(root, "public", file))) {
        file = isBase ? "base.html" : "index.html";
      }
      if(url.pathname==='/checkout-live-choice.css')file='checkout-live-choice.css';
      if (!file && /^\/brands\/(?:checkout\/(?:methods\/)?)?[a-z0-9_-]+\.(?:svg|png)$/i.test(url.pathname)) {
        const candidate=url.pathname.slice(1);
        try { if(statSync(path.join(root,'public',candidate)).isFile())file=candidate; } catch {}
      }
      if (!file && /^\/assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:svg|png|webp|jpe?g|gif|avif|bmp|ico|ttf|woff2?|txt|webm)$/i.test(url.pathname)) {
        const candidate = url.pathname.slice(1);
        try { if (statSync(path.join(root, "public", candidate)).isFile()) file = candidate; } catch {}
      }
      if (!file) throw new ApiError(404, "Non trovato");
      if (/\.(?:mp4|webm)$/.test(file)) {
        const videoPath = path.join(root, "public", file), size = statSync(videoPath).size;
        const headers = { "Content-Type": file.endsWith(".webm") ? "video/webm" : "video/mp4", "Accept-Ranges": "bytes" };
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
      const extension = path.extname(file).toLowerCase();
      const mime = extension === ".mp3" ? "audio/mpeg" : extension === ".wav" ? "audio/wav" : extension === ".webmanifest" ? "application/manifest+json" : extension === ".ttf" ? "font/ttf" : extension === ".woff" ? "font/woff" : extension === ".woff2" ? "font/woff2" : extension === ".svg" ? "image/svg+xml" : extension === ".txt" ? "text/plain" : extension === ".avif" ? "image/avif" : extension === ".bmp" ? "image/bmp" : extension === ".ico" ? "image/x-icon" : extension === ".gif" ? "image/gif" : /\.jpe?g$/i.test(file) ? "image/jpeg" : file.endsWith(".webp")
        ? "image/webp"
        : file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".apk") ? "application/vnd.android.package-archive" : file.endsWith(".zip") ? "application/zip" : file.endsWith(".crx") ? "application/x-chrome-extension"
        : file.endsWith(".json") ? "application/json" : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html";
      const rawContent=readFileSync(path.join(root,"public",file));
      let content=publicLocalizedPages.has(file)?localizePublicPage(rawContent.toString('utf8'),url.searchParams.get('lang')):rawContent;
      if (mime === "text/html" && file !== "cookies.html" && file !== "admin.html" && !file.startsWith("authenticator/")) {
        let html = content.toString("utf8");
        html = html.replace("</head>", '<link rel="stylesheet" href="/cookies.css?v=20261031-preferences"></head>');
        html = html.replace("</body>", '<script defer src="/cookies.js?v=20261031-preferences"></script></body>');
        content = Buffer.from(html);
      }
      const headers={"Content-Type":mime.startsWith("text/")||mime==="application/json"?mime+"; charset=utf-8":mime};
      if(file.startsWith("downloads/"))headers["Content-Disposition"]='attachment; filename="'+path.basename(file)+'"';
      res.writeHead(200,headers);
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
  server.on("listening",elite.start);
  server.on("close",elite.close);
  server.on("close",backups.close);
  server.on("close",connect.close);
  const cpayTimer=publicDemo?null:setInterval(()=>{cpay.poll().catch(()=>{});rewards.poll().catch(()=>{});trustpilot.poll().catch(()=>{});},30000);cpayTimer?.unref();
  server.on('close',()=>clearInterval(cpayTimer));
  server.on('close',()=>customerDemos?.close());
  return { server, db, connect, trustpilot, ...(publicDemo?{demoSave:(entity,data,session)=>saveEntity(entity,{data},session)}:{}) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT || 4317), "127.0.0.1", () =>
    console.log(
      "PRIME disponibile su http://127.0.0.1:" + (process.env.PORT || 4317),
    ),
  );
}
