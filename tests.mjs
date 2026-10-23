import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "./server.mjs";
import { openDatabase } from "./src/database.mjs";
const temporary = mkdtempSync(path.join(tmpdir(), "prime-tests-"));
const database = path.join(temporary, "test.sqlite");
const testPassword = randomBytes(24).toString("hex");
let app, base, a, b, agent, external;
async function request(user, url, method = "GET", data, extra = {}) {
  const response = await fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(user ? { Cookie: user.cookie, "X-CSRF-Token": user.csrf } : {}),
      ...extra,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const text = await response.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  return { status: response.status, value, headers: response.headers };
}
async function register(email, agency) {
  const r = await request(null, "/api/auth", "POST", {
    mode: "register",
    email,
    agency,
    password: testPassword,
  });
  assert.equal(r.status, 200, JSON.stringify(r.value));
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const me = await request({ cookie }, "/api/me");
  return { cookie, ...me.value };
}
function testMember(role, tenant) {
  const id = randomUUID(),
    token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  app.db
    .prepare("INSERT INTO users(id,email,password) VALUES (?,?,?)")
    .run(id, role + "@tests.invalid", "test-only-disabled-password");
  app.db
    .prepare("INSERT INTO memberships VALUES (?,?,?)")
    .run(id, tenant, role);
  app.db
    .prepare(
      "INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)",
    )
    .run(
      createHash("sha256").update(token).digest("hex"),
      id,
      tenant,
      Date.now() + 60000,
      csrf,
    );
  return { id, csrf, cookie: "prime_session=" + token };
}
async function create(entity, data, user = a) {
  const r = await request(user, "/api/entities/" + entity, "POST", { data });
  assert.equal(r.status, 201, JSON.stringify(r.value));
  return r.value;
}
const dataOf = (row) =>
  Object.fromEntries(
    Object.entries(row).filter(
      ([key]) =>
        ![
          "id",
          "tenant_id",
          "created_by",
          "updated_by",
          "created_at",
          "updated_at",
          "version",
          "search_text",
        ].includes(key),
    ),
  );
before(async () => {
  app = createApp({ database });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + app.server.address().port;
  a = await register("owner-a@tests.invalid", "Agenzia A");
  b = await register("owner-b@tests.invalid", "Agenzia B");
  agent = testMember("agent", a.tenant_id);
  external = testMember("external", a.tenant_id);
});
after(async () => {
  await new Promise((resolve) => app.server.close(resolve));
  app.db.close();
  assert.ok(temporary.startsWith(path.join(tmpdir(), "prime-tests-")));
  rmSync(temporary, { recursive: true, force: true });
});
test("migrazioni idempotenti e dati persistenti su disco", () => {
  const second = openDatabase(database);
  assert.equal(second.prepare("SELECT count(*) n FROM migrations").get().n, 2);
  assert.equal(
    second.prepare("SELECT name FROM tenants WHERE id=?").get(a.tenant_id).name,
    "Agenzia A",
  );
  second.close();
});
test("migrazione del database precedente conserva utenti e record legacy", () => {
  const filename = path.join(temporary, "legacy.sqlite");
  const legacy = new DatabaseSync(filename);
  legacy.exec(
    readFileSync(
      new URL("./migrations/001_foundation.sql", import.meta.url),
      "utf8",
    ),
  );
  legacy
    .prepare("INSERT INTO tenants VALUES (?,?)")
    .run("old-tenant", "Agenzia precedente");
  legacy
    .prepare("INSERT INTO users VALUES (?,?,?)")
    .run("old-user", "legacy@tests.invalid", "hash-preesistente");
  legacy
    .prepare("INSERT INTO memberships VALUES (?,?,?)")
    .run("old-user", "old-tenant", "admin");
  legacy
    .prepare(
      "INSERT INTO records(id,tenant_id,kind,title,body) VALUES (?,?,?,?,?)",
    )
    .run("legacy-record", "old-tenant", "streets", "Dato precedente", "{}");
  legacy.close();
  const migrated = openDatabase(filename);
  assert.equal(
    migrated.prepare("SELECT role FROM memberships").get().role,
    "manager",
  );
  assert.equal(
    migrated.prepare("SELECT title FROM records").get().title,
    "Dato precedente",
  );
  assert.equal(
    migrated.prepare("SELECT password FROM users").get().password,
    "hash-preesistente",
  );
  migrated.close();
});
test("asset della schermata iniziale presenti e policy di sicurezza", async () => {
  for (const url of [
    "/",
    "/app.js",
    "/schema.js",
    "/style.css",
    "/assets/logo-dark.png",
    "/assets/logo-light.png",
  ]) {
    const r = await request(null, url);
    assert.equal(r.status, 200, url);
    assert.match(
      r.headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
  }
});
test("autenticazione, cookie, hash delle sessioni, credenziali errate", async () => {
  const no = await request(null, "/api/entities/streets");
  assert.equal(no.status, 401);
  const wrong = await request(null, "/api/auth", "POST", {
    mode: "login",
    email: a.email,
    password: "a-wrong-test-password",
  });
  assert.equal(wrong.status, 401);
  const stored = app.db
    .prepare("SELECT token FROM sessions WHERE user_id=?")
    .get(a.id);
  assert.notEqual(stored.token, a.cookie.split("=")[1]);
  const login = await request(null, "/api/auth", "POST", {
    mode: "login",
    email: a.email,
    password: testPassword,
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
});
test("CSRF, origine e assegnazione tenant non falsificabili", async () => {
  assert.equal(
    (
      await request(
        a,
        "/api/entities/streets",
        "POST",
        { data: { title: "X", city: "Roma" } },
        { "X-CSRF-Token": "" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        a,
        "/api/entities/streets",
        "POST",
        { data: { title: "X", city: "Roma" } },
        { Origin: "https://malicious.invalid" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(a, "/api/entities/streets", "POST", {
        data: { title: "X", city: "Roma", tenant_id: b.tenant_id },
      })
    ).status,
    400,
  );
});
let street, building, unit, contact, property, activity, appointment;
test("CRUD territorio con riferimenti, recapiti solo sullo stabile e stati distinti", async () => {
  street = await create("streets", {
    title: "Via della Quercia",
    city: "Milano",
    district: "Brera",
    postal_code: "20121",
  });
  building = await create("buildings", {
    title: "12",
    street_id: street.id,
    concierge_phone: "+390212345",
    administrator_phone: "+390256789",
  });
  unit = await create("units", {
    title: "7",
    building_id: building.id,
    staircase: "A",
    floor: "3",
    occupancy_status: "inquilino",
    commercial_status: "altra agenzia",
    acquisition_status: "opportunità",
  });
  assert.equal(unit.occupancy_status, "inquilino");
  assert.equal(unit.commercial_status, "altra agenzia");
  assert.equal(unit.acquisition_status, "opportunità");
  assert.equal(unit.concierge_phone, undefined);
  const update = await request(a, "/api/entities/streets/" + street.id, "PUT", {
    version: street.version,
    data: { ...dataOf(street), census_status: "parziale" },
  });
  assert.equal(update.status, 200);
  street = update.value;
});
test("isolamento tenant su lettura, modifica, delete, cronologia, ricerca e riferimenti", async () => {
  for (const suffix of ["", "/history"])
    assert.equal(
      (await request(b, "/api/entities/streets/" + street.id + suffix)).status,
      404,
    );
  assert.equal(
    (
      await request(b, "/api/entities/streets/" + street.id, "PUT", {
        version: street.version,
        data: dataOf(street),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(b, "/api/entities/streets/" + street.id, "DELETE", {
        version: street.version,
      })
    ).status,
    404,
  );
  assert.deepEqual((await request(b, "/api/search?q=Quercia")).value, []);
  assert.equal(
    (
      await request(b, "/api/entities/buildings", "POST", {
        data: { title: "99", street_id: street.id },
      })
    ).status,
    400,
  );
  assert.throws(
    () =>
      app.db
        .prepare("UPDATE buildings SET tenant_id=? WHERE id=?")
        .run(b.tenant_id, building.id),
    /FOREIGN KEY/,
  );
});
test("ricerca contestuale per civico e via, piano/interno, CAP e ricerca universale", async () => {
  assert.equal(
    (
      await request(
        a,
        "/api/entities/buildings?q=" + encodeURIComponent("Quercia"),
      )
    ).value[0].id,
    building.id,
  );
  assert.equal(
    (await request(a, "/api/entities/units?q=20121")).value[0].id,
    unit.id,
  );
  assert.equal(
    (await request(a, "/api/entities/units?q=3")).value[0].floor,
    "3",
  );
  const search = (await request(a, "/api/search?q=Quercia")).value;
  assert.ok(search.some((r) => r.entity === "streets"));
  assert.ok(search.some((r) => r.entity === "buildings"));
  assert.ok(search.some((r) => r.entity === "units"));
});
test("prevenzione duplicati e collegamento CRM/immobile/censimento", async () => {
  contact = await create("contacts", {
    title: "Persona Test",
    email: "PERSONA@TESTS.INVALID",
    phone: "+39 02 777",
    contact_type: "proprietario",
  });
  assert.equal(contact.email, "persona@tests.invalid");
  assert.equal(contact.phone, "+3902777");
  assert.equal(
    (
      await request(a, "/api/entities/contacts", "POST", {
        data: { title: "Duplicato", email: contact.email },
      })
    ).status,
    409,
  );
  property = await create("properties", {
    title: "Trilocale Brera",
    unit_id: unit.id,
    owner_id: contact.id,
    price: 450000,
  });
  assert.equal(
    (
      await request(a, "/api/entities/properties", "POST", {
        data: { title: "Duplicato", unit_id: unit.id },
      })
    ).status,
    409,
  );
});
test("WPS: assegnazione, avanzamento, esito obbligatorio e prossima azione", async () => {
  activity = await create("activities", {
    title: "Incontro proprietario",
    agent_id: agent.id,
    activity_type: "appuntamento proprietario",
    due_at: "2026-11-02T09:00:00Z",
    priority: "alta",
    goal: 2,
    progress: 1,
    contact_id: contact.id,
    property_id: property.id,
    unit_id: unit.id,
    building_id: building.id,
    street_id: street.id,
    next_action: "Concordare la valutazione",
  });
  let r = await request(
    agent,
    "/api/entities/activities/" + activity.id,
    "PUT",
    {
      version: activity.version,
      data: { ...dataOf(activity), status: "completata" },
    },
  );
  assert.equal(r.status, 400);
  r = await request(agent, "/api/entities/activities/" + activity.id, "PUT", {
    version: activity.version,
    data: {
      ...dataOf(activity),
      status: "completata",
      outcome: "Valutazione richiesta",
      progress: 2,
    },
  });
  assert.equal(r.status, 200);
  activity = r.value;
  assert.equal(activity.next_action, "Concordare la valutazione");
  assert.equal(
    (
      await request(agent, "/api/entities/activities", "POST", {
        data: { ...dataOf(activity), agent_id: a.id },
      })
    ).status,
    403,
  );
});
test("agenda condivide il collegamento WPS, previene duplicati e sovrapposizioni", async () => {
  const data = {
    title: "Incontro proprietario",
    activity_id: activity.id,
    agent_id: agent.id,
    starts_at: "2026-11-02T09:00:00Z",
    ends_at: "2026-11-02T10:00:00Z",
    contact_id: contact.id,
    property_id: property.id,
    status: "confermato",
  };
  appointment = await create("appointments", data);
  assert.equal(appointment.activity_id, activity.id);
  assert.equal(
    (
      await request(a, "/api/entities/appointments", "POST", {
        data: {
          ...data,
          title: "Sovrapposto",
          activity_id: null,
          starts_at: "2026-11-02T09:30:00Z",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(a, "/api/entities/appointments", "POST", {
        data: {
          ...data,
          starts_at: "2026-11-03T09:00:00Z",
          ends_at: "2026-11-03T10:00:00Z",
        },
      })
    ).status,
    409,
  );
  const all = (await request(a, "/api/entities/appointments")).value;
  assert.equal(all.filter((r) => r.activity_id === activity.id).length, 1);
});
test("stato appuntamento separato dall’esito e cronologia riprogrammazione", async () => {
  let r = await request(
    a,
    "/api/entities/appointments/" + appointment.id,
    "PUT",
    {
      version: appointment.version,
      data: {
        ...dataOf(appointment),
        status: "saltato",
        commercial_outcome: "negativo",
      },
    },
  );
  assert.equal(r.status, 400);
  r = await request(a, "/api/entities/appointments/" + appointment.id, "PUT", {
    version: appointment.version,
    data: {
      ...dataOf(appointment),
      status: "effettuato",
      commercial_outcome: "negativo",
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.value.status, "effettuato");
  appointment = r.value;
  r = await request(a, "/api/entities/appointments/" + appointment.id, "PUT", {
    version: appointment.version,
    data: {
      ...dataOf(appointment),
      status: "riprogrammato",
      commercial_outcome: "",
      starts_at: "2026-11-03T09:00:00Z",
      ends_at: "2026-11-03T10:00:00Z",
    },
  });
  assert.equal(r.status, 200);
  appointment = r.value;
  const history = (
    await request(a, `/api/entities/appointments/${appointment.id}/history`)
  ).value;
  assert.equal(history.length, 3);
  assert.equal(history[2].snapshot.starts_at, "2026-11-02T09:00:00.000Z");
});
test("concorrenza: versioni obsolete rifiutate senza sovrascrivere i dati", async () => {
  const result = await request(a, "/api/entities/streets/" + street.id, "PUT", {
    version: 1,
    data: { ...dataOf(street), title: "Nome obsoleto" },
  });
  assert.equal(result.status, 409);
  assert.equal(
    (await request(a, "/api/entities/streets/" + street.id)).value.title,
    "Via della Quercia",
  );
});
test("due modifiche realmente simultanee non possono entrambe sovrascrivere la stessa versione", async () => {
  const row = await create("streets", {
    title: "Via concorrenza",
    city: "Roma",
  });
  function partial(title) {
    let resolve, reject;
    const done = new Promise((a, b) => {
      resolve = a;
      reject = b;
    });
    const payload = JSON.stringify({
      version: row.version,
      data: { ...dataOf(row), title },
    });
    const req = http.request(
      base + "/api/entities/streets/" + row.id,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: a.cookie,
          "X-CSRF-Token": a.csrf,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.write(payload.slice(0, -1));
    return { done, finish: () => req.end(payload.slice(-1)) };
  }
  const first = partial("Versione A"),
    second = partial("Versione B");
  await new Promise((resolve) => setTimeout(resolve, 40));
  first.finish();
  second.finish();
  const results = await Promise.all([first.done, second.done]);
  assert.deepEqual(results.sort(), [200, 409]);
});
test("ruoli: esterni esclusi, agenti senza delete/audit e senza modifica attività altrui", async () => {
  assert.equal((await request(external, "/api/entities/contacts")).status, 403);
  assert.equal((await request(external, "/api/search?q=Persona")).status, 403);
  assert.equal((await request(agent, "/api/audit")).status, 403);
  assert.equal(
    (
      await request(agent, "/api/entities/streets/" + street.id, "DELETE", {
        version: street.version,
      })
    ).status,
    403,
  );
  const own = await create("activities", {
    title: "Lavoro titolare",
    agent_id: a.id,
    activity_type: "censimento",
    due_at: "2026-11-04T08:00:00Z",
  });
  assert.equal(
    (
      await request(agent, "/api/entities/activities/" + own.id, "PUT", {
        version: own.version,
        data: { ...dataOf(own), notes: "Modifica vietata" },
      })
    ).status,
    403,
  );
});
test("contatto da non ricontattare blocca chiamate e richiami nel WPS", async () => {
  const blocked = await create("contacts", {
    title: "Non chiamare",
    do_not_contact: 1,
  });
  assert.equal(
    (
      await request(a, "/api/entities/activities", "POST", {
        data: {
          title: "Richiamo",
          agent_id: a.id,
          activity_type: "richiamo",
          contact_id: blocked.id,
          due_at: "2026-11-04T10:00:00Z",
        },
      })
    ).status,
    409,
  );
});
test("audit tenant, tema persistente, integrazioni dichiarate non configurate", async () => {
  const audit = (await request(a, "/api/audit")).value;
  assert.ok(audit.some((x) => x.action === "activities.update"));
  assert.ok(!audit.some((x) => x.email === b.email));
  assert.equal(
    (await request(a, "/api/preferences", "PATCH", { theme: "light" })).status,
    200,
  );
  assert.equal((await request(a, "/api/me")).value.theme, "light");
  assert.equal((await request(b, "/api/me")).value.theme, "dark");
  assert.ok(
    (await request(a, "/api/integrations")).value.every(
      (x) => x.status === "Non configurata",
    ),
  );
});
test("eliminazione protetta dalle relazioni, delete reale e cronologia conservata", async () => {
  assert.equal(
    (
      await request(a, "/api/entities/streets/" + street.id, "DELETE", {
        version: street.version,
      })
    ).status,
    409,
  );
  const disposable = await create("streets", {
    title: "Via temporanea",
    city: "Roma",
  });
  assert.equal(
    (
      await request(a, "/api/entities/streets/" + disposable.id, "DELETE", {
        version: disposable.version,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(a, "/api/entities/streets/" + disposable.id)).status,
    404,
  );
  assert.equal(
    app.db
      .prepare("SELECT count(*) n FROM record_history WHERE record_id=?")
      .get(disposable.id).n,
    1,
  );
});
test("input malformati e sessione revocata", async () => {
  const malformed = await fetch(base + "/api/entities/streets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: a.cookie,
      "X-CSRF-Token": a.csrf,
    },
    body: "{broken",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await request(a, "/api/logout", "POST", {})).status, 200);
  assert.equal((await request(a, "/api/me")).status, 401);
});
