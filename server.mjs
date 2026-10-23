import http from "node:http";
import { readFileSync } from "node:fs";
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
async function readBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new ApiError(415, "Formato JSON richiesto");
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (Buffer.byteLength(raw) > 65536)
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
} = {}) {
  const db = openDatabase(database),
    attempts = new Map();
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
  function authorize(s, entity, record) {
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
    if (entity === "appointments") {
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
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost"),
        method = req.method;
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      if (production)
        res.setHeader("Strict-Transport-Security", "max-age=31536000");
      const mutating = !["GET", "HEAD"].includes(method);
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
        let user = db.prepare("SELECT * FROM users WHERE email=?").get(email),
          tenantId;
        if (b.mode === "register") {
          if (user) throw new ApiError(409, "Indirizzo già registrato");
          const agency = String(b.agency || "").trim();
          if (!agency || agency.length > 120)
            throw new ApiError(
              400,
              "Nome agenzia richiesto, massimo 120 caratteri",
            );
          const password = await passwordHash(b.password),
            uid = randomUUID(),
            tid = randomUUID();
          transaction(db, () => {
            db.prepare("INSERT INTO tenants VALUES (?,?)").run(tid, agency);
            db.prepare(
              "INSERT INTO users(id,email,password) VALUES (?,?,?)",
            ).run(uid, email, password);
            db.prepare("INSERT INTO memberships VALUES (?,?,?)").run(
              uid,
              tid,
              "owner",
            );
            audit({ tenant_id: tid, user_id: uid }, "agency.register", tid);
          });
          user = { id: uid };
          tenantId = tid;
        } else {
          const ok = await passwordCheck(b.password, user?.password);
          if (!user || !ok) throw new ApiError(401, "Credenziali non valide");
          tenantId = db
            .prepare(
              "SELECT tenant_id FROM memberships WHERE user_id=? ORDER BY tenant_id",
            )
            .get(user.id)?.tenant_id;
          if (!tenantId) throw new ApiError(403, "Nessuna agenzia associata");
        }
        const token = randomBytes(32).toString("hex"),
          csrf = randomBytes(32).toString("hex");
        db.prepare("DELETE FROM sessions WHERE expires<?").run(now);
        db.prepare(
          "INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)",
        ).run(hash(token), user.id, tenantId, now + 86400000, csrf);
        res.setHeader(
          "Set-Cookie",
          `prime_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${production ? "; Secure" : ""}`,
        );
        return json(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/api/")) {
        const s = currentSession(req);
        if (!s) throw new ApiError(401, "Accedi per continuare");
        if (mutating && req.headers["x-csrf-token"] !== s.csrf)
          throw new ApiError(
            403,
            "Sessione di sicurezza non valida: aggiorna la pagina",
          );
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
          return json(
            res,
            200,
            db
              .prepare(
                "SELECT a.id,a.action,a.record_id,a.created_at,u.email FROM audit a LEFT JOIN users u ON u.id=a.user_id WHERE a.tenant_id=? ORDER BY a.id DESC LIMIT 200",
              )
              .all(s.tenant_id),
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
        const match =
          /^\/api\/entities\/([a-z]+)(?:\/([a-f0-9-]+))?(?:\/(history))?$/.exec(
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
            const b = validate(entity, raw.data);
            validateLinks(entity, b, s, id);
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
            });
            return json(
              res,
              id ? 200 : 201,
              db
                .prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`)
                .get(s.tenant_id, rid),
            );
          }
          if (method === "DELETE" && id && !history) {
            if (!["owner", "manager"].includes(s.role))
              throw new ApiError(
                403,
                "Eliminazione riservata a titolare e responsabile",
              );
            const b = await readBody(req);
            if (b.version !== record.version)
              throw new ApiError(409, "Record modificato: aggiorna la pagina");
            transaction(db, () => {
              const live = db
                .prepare(
                  "SELECT version FROM " +
                    entity +
                    " WHERE tenant_id=? AND id=?",
                )
                .get(s.tenant_id, id);
              if (!live || live.version !== b.version)
                throw new ApiError(
                  409,
                  "Record modificato: aggiorna la pagina",
                );
              db.prepare(
                `DELETE FROM ${entity} WHERE tenant_id=? AND id=?`,
              ).run(s.tenant_id, id);
              audit(s, `${entity}.delete`, id);
            });
            return json(res, 200, { ok: true });
          }
        }
        throw new ApiError(404, "Operazione non disponibile");
      }
      if (method !== "GET") throw new ApiError(405, "Metodo non consentito");
      const files = {
        "/": "index.html",
        "/app.js": "app.js",
        "/schema.js": "schema.js",
        "/planner.js": "planner.js",
        "/planner-view.js": "planner-view.js",
        "/wps-clock.js": "wps-clock.js",
        "/style.css": "style.css",
        "/planner.css": "planner.css",
        "/assets/logo-light.png": "assets/logo-light.png",
        "/assets/logo-dark.png": "assets/logo-dark.png",
      };
      const file = files[url.pathname];
      if (!file) throw new ApiError(404, "Non trovato");
      const mime = file.endsWith(".png")
        ? "image/png"
        : file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html";
      const content = readFileSync(path.join(root, "public", file));
      res.writeHead(200, {
        "Content-Type": mime + (file.endsWith(".png") ? "" : "; charset=utf-8"),
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
  return { server, db };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server } = createApp();
  server.listen(Number(process.env.PORT || 4317), "127.0.0.1", () =>
    console.log(
      "PRIME disponibile su http://127.0.0.1:" + (process.env.PORT || 4317),
    ),
  );
}
