import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "./server.mjs";
import { openDatabase } from "./src/database.mjs";
import { clockState, countdown, daysFor, layoutDay } from "./public/planner.js";
import { groupUnitsByFloor } from "./public/territory-floors.js";
import { unitHighlights, unitAgentIds } from "./public/territory-highlights.js";
const temporary = mkdtempSync(path.join(tmpdir(), "prime-tests-"));
const database = path.join(temporary, "test.sqlite");
const testPassword = randomBytes(24).toString("hex");
let app, base, a, b, agent, external;
const assistantRequestBodies = [];
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
  assert.equal(r.status, 201, JSON.stringify(r.value));
  const token = new URL(r.value.verification_url).searchParams.get("verify");
  const verified = await request(null,"/api/auth/verify-email","POST",{token});
  assert.equal(verified.status,200,JSON.stringify(verified.value));
  const login=await request(null,"/api/auth","POST",{mode:"login",email,password:testPassword});
  assert.equal(login.status,200,JSON.stringify(login.value));
  const cookie = login.headers.get("set-cookie").split(";")[0];
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
  if (entity === "activities" && !data.starts_at)
    data = {
      ...data,
      starts_at: new Date(Date.parse(data.due_at) - 3600000).toISOString(),
    };
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
          "latitude",
          "longitude",
        ].includes(key),
    ),
  );
before(async () => {
  app = createApp({
    database,
    assistantApiKey: "test-only-key",
    assistantFetch: async (_url, options) => {
      assistantRequestBodies.push(JSON.parse(options.body));
      return new Response(
        JSON.stringify({ output_text: "Ho trovato un immobile di prova." }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });
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
test("appartamenti per piano: ordine numerico, piani equivalenti e scala/interno", () => {
  const rows = [
    { title: "10", floor: "1", staircase: "A" },
    { title: "2", floor: "primo", staircase: "A" },
    { title: "1", floor: "Piano 1", staircase: "B" },
    { title: "20", floor: "10" },
    { title: "0", floor: "PT" },
    { title: "3", floor: "2" },
    { title: "4", floor: "-1" },
    { title: "5", floor: "" },
    { title: "6", floor: "terra" },
    { title: "7", floor: "rialzato" },
  ];
  const before = structuredClone(rows);
  const groups = groupUnitsByFloor(rows);
  assert.deepEqual(
    groups.map((g) => g.label),
    [
      "Piano -1",
      "Piano terra",
      "Piano rialzato",
      "Piano 1",
      "Piano 2",
      "Piano 10",
      "Piano da indicare",
    ],
  );
  assert.deepEqual(
    groups.find((g) => g.label === "Piano 1").units.map((u) => u.title),
    ["2", "10", "1"],
  );
  assert.equal(groups.find((g) => g.label === "Piano terra").units.length, 2);
  assert.deepEqual(rows, before);
  assert.deepEqual(groupUnitsByFloor([]), []);
});

test("evidenza commerciale e lead caldi restano distinti e possono coesistere", () => {
  assert.deepEqual(
    unitHighlights({
      commercial_status: "in vendita",
      is_hot_lead: 1,
    }),
    { sale: true, agency: false, hot: true },
  );
  assert.deepEqual(
    unitHighlights({ commercial_status: "altra agenzia" }, [
      { is_hot_lead: 1 },
    ]),
    { sale: false, agency: true, hot: true },
  );
  assert.deepEqual(
    unitHighlights(
      {
        commercial_status: "non in vendita",
        acquisition_status: "opportunità",
      },
      [{ is_hot_lead: 0 }],
    ),
    { sale: false, agency: false, hot: false },
  );
  assert.equal(unitHighlights({ commercial_status: "in vendita" }).hot, false);
});

test("spunta lead caldo persistente, validata e isolata per agenzia", async () => {
  const person = await create("contacts", {
    title: "Lead test caldo",
    is_hot_lead: 1,
  });
  assert.equal(person.is_hot_lead, 1);
  assert.equal(
    (
      await request(b, "/api/entities/contacts/" + person.id, "PUT", {
        version: person.version,
        data: { ...dataOf(person), is_hot_lead: 0 },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(a, "/api/entities/contacts", "POST", {
        data: { title: "Lead non valido", is_hot_lead: "caldo" },
      })
    ).status,
    400,
  );
  const s = await create("streets", { title: "Via Test Lead", city: "Roma" });
  const building = await create("buildings", { title: "1", street_id: s.id });
  const unit = await create("units", {
    title: "1",
    building_id: building.id,
    is_hot_lead: 1,
    commercial_status: "altra agenzia",
  });
  assert.equal(unit.is_hot_lead, 1);
  const updated = await request(a, "/api/entities/units/" + unit.id, "PUT", {
    version: unit.version,
    data: { ...dataOf(unit), is_hot_lead: 0 },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.value.is_hot_lead, 0);
  assert.equal(updated.value.commercial_status, "altra agenzia");
  assert.equal(
    (await create("contacts", { title: "Lead ancora da qualificare" }))
      .is_hot_lead,
    0,
  );
});

test("migrazione della temperatura conserva i lead caldi come spunta", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const name of [
      "001_foundation.sql",
      "002_relational_workspace.sql",
      "003_hourly_wps.sql",
      "004_territory_workspace.sql",
      "005_lead_temperature.sql",
    ])
      db.exec(
        readFileSync(new URL("./migrations/" + name, import.meta.url), "utf8"),
      );
    db.prepare("INSERT INTO tenants VALUES (?,?)").run(
      "checkbox-tenant",
      "Test",
    );
    db.prepare("INSERT INTO users(id,email,password) VALUES (?,?,?)").run(
      "checkbox-user",
      "checkbox@tests.invalid",
      "disabled",
    );
    const base = [
      "checkbox-tenant",
      "checkbox-user",
      "checkbox-user",
      "2026-10-24T10:00:00Z",
      "2026-10-24T10:00:00Z",
    ];
    db.prepare(
      "INSERT INTO streets(id,title,city,tenant_id,created_by,updated_by,created_at,updated_at) VALUES ('checkbox-street','Test','Roma',?,?,?,?,?)",
    ).run(...base);
    db.prepare(
      "INSERT INTO buildings(id,title,street_id,tenant_id,created_by,updated_by,created_at,updated_at) VALUES ('checkbox-building','1','checkbox-street',?,?,?,?,?)",
    ).run(...base);
    for (const [index, temperature] of [
      "non indicata",
      "freddo",
      "tiepido",
      "caldo",
    ].entries()) {
      db.prepare(
        "INSERT INTO contacts(id,title,lead_temperature,tenant_id,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        "checkbox-person-" + index,
        "Persona " + index,
        temperature,
        ...base,
      );
      db.prepare(
        "INSERT INTO units(id,title,building_id,lead_temperature,tenant_id,created_by,updated_by,created_at,updated_at) VALUES (?,?,'checkbox-building',?,?,?,?,?,?)",
      ).run("checkbox-unit-" + index, String(index), temperature, ...base);
    }
    db.exec(
      readFileSync(
        new URL("./migrations/006_hot_lead_checkbox.sql", import.meta.url),
        "utf8",
      ),
    );
    for (const table of ["contacts", "units"]) {
      assert.deepEqual(
        db
          .prepare(`SELECT is_hot_lead FROM ${table} ORDER BY title`)
          .all()
          .map((r) => r.is_hot_lead),
        [0, 0, 0, 1],
      );
      assert.equal(
        db
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((c) => c.name === "lead_temperature"),
        false,
      );
    }
  } finally {
    db.close();
  }
});

test("tipi telefono: quattro categorie distinte dal canale", async () => {
  for (const [i, kind] of [
    "Ufficio",
    "Casa",
    "Cell personale",
    "Cell di lavoro",
  ].entries()) {
    const p = await create("contacts", {
      title: "Persona numero tipo " + i,
      phone: "+3901111111" + i,
      phone_kind: kind,
    });
    assert.equal(p.phone_kind, kind);
    const m = await create("contact_methods", {
      contact_id: p.id,
      method_type: "telefono",
      value: "+3902222222" + i,
      phone_kind: kind,
    });
    assert.equal(m.phone_kind, kind);
  }
  assert.equal(
    (
      await request(a, "/api/entities/contacts", "POST", {
        data: { title: "Tipo non valido", phone_kind: "WhatsApp" },
      })
    ).status,
    400,
  );
});

test("assegnazioni agenti validate per agenzia e ruolo", async () => {
  const person = await create("contacts", {
    title: "Lead assegnato",
    is_hot_lead: 1,
    assigned_agent_id: agent.id,
  });
  assert.equal(person.assigned_agent_id, agent.id);
  for (const id of [b.id, external.id])
    assert.equal(
      (
        await request(a, "/api/entities/contacts", "POST", {
          data: { title: "Assegnazione non valida", assigned_agent_id: id },
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(agent, "/api/entities/contacts", "POST", {
        data: { title: "Non assegnabile da agente", assigned_agent_id: a.id },
      })
    ).status,
    403,
  );
  const assignedElsewhere = await create("contacts", {
    title: "Lead titolare",
    assigned_agent_id: a.id,
  });
  assert.equal(
    (
      await request(
        agent,
        "/api/entities/contacts/" + assignedElsewhere.id,
        "PUT",
        {
          version: assignedElsewhere.version,
          data: { ...dataOf(assignedElsewhere), assigned_agent_id: agent.id },
        },
      )
    ).status,
    403,
  );
  const s = await create("streets", {
    title: "Via assegnazione",
    city: "Roma",
  });
  const bld = await create("buildings", { title: "1", street_id: s.id });
  const u = await create("units", {
    title: "1",
    building_id: bld.id,
    commercial_status: "in vendita",
    assigned_agent_id: agent.id,
  });
  const p = await create("properties", {
    title: "Casa assegnata",
    unit_id: u.id,
    assigned_agent_id: agent.id,
  });
  assert.equal(p.assigned_agent_id, agent.id);
  assert.equal(
    (
      await request(agent, "/api/territory/people", "POST", {
        unit_id: u.id,
        contact: { title: "Lead non riassegnabile", assigned_agent_id: b.id },
      })
    ).status,
    400,
  );
});

test("filtro per agente usa assegnazione esplicita, immobile o persone collegate", () => {
  const person = [{ assigned_agent_id: "person-agent" }];
  const properties = [{ unit_id: "u", assigned_agent_id: "property-agent" }];
  assert.deepEqual(
    unitAgentIds(
      { id: "u", assigned_agent_id: "unit-agent" },
      properties,
      person,
    ),
    ["unit-agent"],
  );
  assert.deepEqual(unitAgentIds({ id: "u" }, properties, person), [
    "property-agent",
  ]);
  assert.deepEqual(unitAgentIds({ id: "u" }, [], [...person, ...person]), [
    "person-agent",
  ]);
  assert.deepEqual(unitAgentIds({ id: "u" }), []);
});

test("migrazioni idempotenti e dati persistenti su disco", () => {
  const second = openDatabase(database);
  assert.equal(second.prepare("SELECT count(*) n FROM migrations").get().n, readdirSync(new URL('./migrations/', import.meta.url)).filter((name) => name.endsWith('.sql')).length);
  assert.equal(
    second.prepare("SELECT name FROM tenants WHERE id=?").get(a.tenant_id).name,
    "Agenzia A",
  );
  second.close();
});
test("migrazione WPS conserva appuntamenti collegati e adotta l’orario dell’incontro", () => {
  const filename = path.join(temporary, "v2.sqlite"),
    legacy = new DatabaseSync(filename),
    now = new Date().toISOString();
  for (const name of ["001_foundation.sql", "002_relational_workspace.sql"])
    legacy.exec(
      readFileSync(new URL("./migrations/" + name, import.meta.url), "utf8"),
    );
  legacy.prepare("INSERT INTO tenants VALUES (?,?)").run("t", "Agenzia");
  legacy
    .prepare("INSERT INTO users(id,email,password) VALUES (?,?,?)")
    .run("u", "u@tests.invalid", "disabled");
  legacy
    .prepare("INSERT INTO memberships VALUES (?,?,?)")
    .run("u", "t", "owner");
  legacy
    .prepare(
      "INSERT INTO activities(id,tenant_id,title,agent_id,activity_type,due_at,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "a",
      "t",
      "Incontro",
      "u",
      "appuntamento proprietario",
      "2026-11-02T09:00:00.000Z",
      "u",
      "u",
      now,
      now,
    );
  legacy
    .prepare(
      "INSERT INTO appointments(id,tenant_id,title,agent_id,activity_id,starts_at,ends_at,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "p",
      "t",
      "Incontro",
      "u",
      "a",
      "2026-11-02T10:00:00.000Z",
      "2026-11-02T11:00:00.000Z",
      "u",
      "u",
      now,
      now,
    );
  legacy.close();
  const marker = new DatabaseSync(filename);
  marker.exec(
    "CREATE TABLE migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const name of ["001_foundation.sql", "002_relational_workspace.sql"])
    marker.prepare("INSERT INTO migrations VALUES (?,?)").run(name, now);
  marker.close();
  const migrated = openDatabase(filename);
  assert.equal(
    migrated.prepare("SELECT activity_id FROM appointments").get().activity_id,
    "a",
  );
  assert.equal(
    migrated.prepare("SELECT starts_at,due_at FROM activities").get().starts_at,
    "2026-11-02T10:00:00.000Z",
  );
  assert.equal(migrated.prepare("PRAGMA foreign_key_check").get(), undefined);
  assert.equal(migrated.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  migrated.close();
});
test("timer WPS: attesa, blocco in corso, scadenza, riapertura e conferme terminali", () => {
  const task = {
    id: "a",
    agent_id: "u",
    starts_at: "2026-11-02T09:00:00Z",
    due_at: "2026-11-02T10:00:00Z",
    status: "pianificata",
  };
  assert.equal(
    clockState([task], "u", Date.parse("2026-11-02T08:59:30Z")).phase,
    "waiting",
  );
  assert.equal(
    clockState([task], "u", Date.parse("2026-11-02T08:59:30Z")).seconds,
    30,
  );
  assert.equal(
    clockState([task], "u", Date.parse(task.starts_at)).phase,
    "running",
  );
  assert.equal(
    clockState([task], "u", Date.parse(task.due_at)).phase,
    "review",
  );
  assert.equal(
    clockState([task], "u", Date.parse("2026-11-05T08:00:00Z")).phase,
    "review",
  );
  for (const status of ["completata", "non completata", "annullata"])
    assert.equal(
      clockState([{ ...task, status }], "u", Date.parse("2026-11-05T08:00:00Z"))
        .phase,
      "free",
    );
  assert.equal(
    clockState([task], "another", Date.parse(task.due_at)).phase,
    "free",
  );
  assert.equal(countdown(3661), "01:01:01");
  assert.equal(countdown(-2), "00:00:00");
});
test("timer usa l’ora assoluta e mette in coda le attività scadute prima della prossima", () => {
  const tasks = [
    {
      id: "new",
      agent_id: "u",
      starts_at: "2026-11-02T11:00:00Z",
      due_at: "2026-11-02T12:00:00Z",
      status: "pianificata",
    },
    {
      id: "old",
      agent_id: "u",
      starts_at: "2026-11-02T09:00:00Z",
      due_at: "2026-11-02T10:00:00Z",
      status: "in corso",
    },
  ];
  assert.equal(
    clockState(tasks, "u", Date.parse("2026-11-02T10:30:00Z")).activity.id,
    "old",
  );
  assert.equal(
    clockState(
      tasks.map((r) =>
        r.id === "old" ? { ...r, status: "non completata" } : r,
      ),
      "u",
      Date.parse("2026-11-02T10:30:00Z"),
    ).seconds,
    1800,
  );
});
test("griglia calendario: settimana da lunedì, durata, sovrapposizioni e passaggio a mezzanotte", () => {
  assert.deepEqual(daysFor("2026-11-04", "week"), [
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ]);
  assert.deepEqual(daysFor("2026-11-04", "day"), ["2026-11-04"]);
  const event = (id, start, end) => ({
    id,
    starts_at: "2026-11-04T" + start,
    ends_at: "2026-11-04T" + end,
  });
  const items = layoutDay(
    [
      event("a", "09:00:00", "10:00:00"),
      event("b", "09:30:00", "10:30:00"),
      event("c", "11:00:00", "12:00:00"),
    ],
    "2026-11-04",
  );
  assert.equal(items[0].top, 540);
  assert.equal(items[0].minutes, 60);
  assert.equal(items[0].lanes, 2);
  assert.notEqual(items[0].lane, items[1].lane);
  assert.equal(items[2].lanes, 1);
  const overnight = {
    id: "night",
    starts_at: "2026-11-04T23:30:00",
    ends_at: "2026-11-05T00:30:00",
  };
  assert.equal(layoutDay([overnight], "2026-11-04")[0].minutes, 30);
  assert.equal(layoutDay([overnight], "2026-11-05")[0].top, 0);
  assert.equal(layoutDay([overnight], "2026-11-05")[0].minutes, 30);
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
test("health check pubblico per Fly senza dati di agenzia", async () => {
  const response = await request(null, "/healthz");
  assert.equal(response.status, 200);
  assert.deepEqual(response.value, { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("asset della schermata iniziale presenti e policy di sicurezza", async () => {
  for (const url of [
    "/",
    "/app.js",
    "/schema.js",
    "/style.css",
    "/planner.js",
    "/planner-view.js",
    "/wps-clock.js",
    "/planner.css",
    "/territory.js",
    "/territory-floors.js",
    "/territory-highlights.js",
    "/person-recaps.js",
    "/repeatable-recaps.js",
    "/voice-input.js",
    "/territory.css",
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
let street, building, unit, contact, property, activity, appointment, buyerProfile;
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
test("moduli commerciali collegati, isolati per tenant e firme mai dichiarate senza provider", async () => {
  buyerProfile = await create("buyer_profiles", { title: "Ricerca Brera", contact_id: contact.id, assigned_agent_id: agent.id, budget_min: 200000, budget_max: 500000, preferred_areas: "Brera", min_rooms: 3 });
  assert.equal(buyerProfile.status, "attiva");
  const updatedUnit = await request(a, "/api/entities/units/" + unit.id, "PUT", { version: unit.version, data: { ...dataOf(unit), area: 90, rooms: 3, has_garage: 1 } });
  assert.equal(updatedUnit.status, 200); unit = updatedUnit.value;
  const updatedProperty = await request(a, "/api/entities/properties/" + property.id, "PUT", { version: property.version, data: { ...dataOf(property), marketing_status: "in vendita" } });
  assert.equal(updatedProperty.status, 200, JSON.stringify(updatedProperty.value)); property = updatedProperty.value;
  const matches = await request(a, "/api/matching/" + buyerProfile.id);
  assert.equal(matches.status, 200); assert.equal(matches.value[0].id, property.id);
  const deal = await create("deals", { title: "Vendita Trilocale Brera", property_id: property.id, contact_id: contact.id, assigned_agent_id: agent.id, stage: "incarico", expected_value: 450000 });
  const offer = await create("offers", { title: "Prima proposta", deal_id: deal.id, contact_id: contact.id, amount: 430000, deposit: 20000, status: "presentata" });
  const valuation = await create("valuations", { title: "Stima Brera", property_id: property.id, contact_id: contact.id, agent_id: agent.id, assessed_on: "2026-10-24", low_value: 400000, high_value: 470000 });
  const lease = await create("leases", { title: "Locazione test", property_id: property.id, tenant_contact_id: contact.id, rent_monthly: 1500, starts_on: "2027-01-01", ends_on: "2028-01-01", status: "attiva" });
  const commission = await create("commissions", { title: "Provvigione trattativa", deal_id: deal.id, agent_id: agent.id, expected_amount: 9000, collected_amount: 1000 });
  assert.equal((await request(a, '/api/entities/commissions', 'POST', {data:{title:'Senza assegnazione',deal_id:deal.id,expected_amount:1000}})).status,400);
  assert.equal((await request(a, '/api/entities/commissions', 'POST', {data:{title:'Titolare',deal_id:deal.id,agent_id:a.id,expected_amount:1000}})).status,201);
  assert.equal(offer.deal_id, deal.id); assert.equal(valuation.property_id, property.id); assert.equal(lease.tenant_contact_id, contact.id); assert.equal(commission.collected_amount, 1000);
  assert.equal((await request(b, "/api/entities/deals/" + deal.id)).status, 404);
  const foreignRef = await request(b, "/api/entities/deals", "POST", { data: { title: "Cross tenant", property_id: property.id } });
  assert.equal(foreignRef.status, 400);
  const document = await create("documents", { title: "Incarico vendita", property_id: property.id, contact_id: contact.id, deal_id: deal.id, document_type: "incarico" });
  const signature = await create("signature_requests", { title: "Firma incarico", document_id: document.id, signer_contact_id: contact.id, provider: "InfoCert", signature_level: "qualificata (QES)" });
  assert.equal(signature.status, "da configurare");
  const forged = await request(a, "/api/entities/signature_requests/" + signature.id, "PUT", { version: signature.version, data: { ...dataOf(signature), status: "firmata" } });
  assert.equal(forged.status, 400);
  const pdf = Buffer.from("%PDF-1.4\nPRIME test document\n%%EOF");
  const uploaded = await fetch(`${base}/api/documents/${document.id}/content`, { method: "POST", headers: { Cookie: a.cookie, "X-CSRF-Token": a.csrf, "Content-Type": "application/pdf" }, body: pdf });
  assert.equal(uploaded.status, 200);
  const downloaded = await fetch(`${base}/api/documents/${document.id}/content`, { headers: { Cookie: a.cookie } });
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), pdf);
  const otherTenant = await fetch(`${base}/api/documents/${document.id}/content`, { headers: { Cookie: b.cookie } });
  assert.equal(otherTenant.status, 404);
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
  }, agent);
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
  const feedbackList = (await request(a, "/api/entities/viewing_feedback")).value;
  let feedback = feedbackList.find((item) => item.appointment_id === appointment.id);
  assert.ok(feedback, "la chiusura di una visita deve predisporre il feedback");
  const negativeFeedback = await request(a, "/api/entities/viewing_feedback/" + feedback.id, "PUT", { version: feedback.version, data: { ...dataOf(feedback), outcome: "negativo", rejection_reason: "Non adatto" } });
  assert.equal(negativeFeedback.status, 200);
  assert.deepEqual((await request(a, "/api/matching/" + buyerProfile.id)).value, []);
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
          starts_at: "2026-11-04T09:00:00Z",
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
test("WPS orario: fine valida, assenza di sovrapposizioni e fasce adiacenti", async () => {
  const block = {
    title: "Blocco orario",
    agent_id: a.id,
    activity_type: "censimento",
    starts_at: "2026-11-06T09:00:00Z",
    due_at: "2026-11-06T10:00:00Z",
  };
  assert.equal(
    (
      await request(a, "/api/entities/activities", "POST", {
        data: { ...block, due_at: block.starts_at },
      })
    ).status,
    400,
  );
  await create("activities", block);
  assert.equal(
    (
      await request(a, "/api/entities/activities", "POST", {
        data: {
          ...block,
          title: "Sovrapposto",
          starts_at: "2026-11-06T09:30:00Z",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(a, "/api/entities/activities", "POST", {
        data: {
          ...block,
          title: "Adiacente",
          starts_at: "2026-11-06T10:00:00Z",
          due_at: "2026-11-06T11:00:00Z",
        },
      })
    ).status,
    201,
  );
});
test("scadenza non completa automaticamente il lavoro e non completata richiede un esito persistente", async () => {
  const task = await create("activities", {
    title: "Attività scaduta",
    agent_id: a.id,
    activity_type: "porta a porta",
    starts_at: "2020-01-02T09:00:00Z",
    due_at: "2020-01-02T10:00:00Z",
  });
  let row = (await request(a, "/api/entities/activities/" + task.id)).value;
  assert.equal(row.status, "pianificata");
  assert.equal(clockState([row], a.id).phase, "review");
  assert.equal(
    (
      await request(a, "/api/entities/activities/" + task.id, "PUT", {
        version: row.version,
        data: { ...dataOf(row), status: "non completata" },
      })
    ).status,
    400,
  );
  const saved = await request(a, "/api/entities/activities/" + task.id, "PUT", {
    version: row.version,
    data: {
      ...dataOf(row),
      status: "non completata",
      outcome: "Interlocutore assente",
      next_action: "Pianificare un nuovo blocco",
    },
  });
  assert.equal(saved.status, 200);
  row = (await request(a, "/api/entities/activities/" + task.id)).value;
  assert.equal(row.status, "non completata");
  assert.equal(row.outcome, "Interlocutore assente");
  assert.equal(clockState([row], a.id).phase, "free");
  assert.equal(
    (await request(a, `/api/entities/activities/${task.id}/history`)).value
      .length,
    2,
  );
});
test("riprogrammare l’appuntamento sposta atomicamente il blocco WPS senza creare eventi duplicati", async () => {
  const task = await create("activities", {
    title: "Incontro condiviso",
    agent_id: a.id,
    activity_type: "appuntamento proprietario",
    starts_at: "2026-11-07T09:00:00Z",
    due_at: "2026-11-07T10:00:00Z",
  });
  let meeting = await create("appointments", {
    title: task.title,
    agent_id: a.id,
    activity_id: task.id,
    starts_at: task.starts_at,
    ends_at: task.due_at,
  });
  const moved = await request(
    a,
    "/api/entities/appointments/" + meeting.id,
    "PUT",
    {
      version: meeting.version,
      data: {
        ...dataOf(meeting),
        starts_at: "2026-11-07T11:00:00Z",
        ends_at: "2026-11-07T12:00:00Z",
      },
    },
  );
  assert.equal(moved.status, 200);
  meeting = moved.value;
  const synced = (await request(a, "/api/entities/activities/" + task.id))
    .value;
  assert.equal(synced.starts_at, meeting.starts_at);
  assert.equal(synced.due_at, meeting.ends_at);
  assert.equal(synced.version, 2);
  assert.equal(
    (
      await request(a, "/api/entities/activities/" + task.id, "PUT", {
        version: synced.version,
        data: {
          ...dataOf(synced),
          starts_at: "2026-11-07T12:00:00Z",
          due_at: "2026-11-07T13:00:00Z",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(a, "/api/entities/appointments")).value.filter(
      (x) => x.activity_id === task.id,
    ).length,
    1,
  );
  const other = await create("activities", {
    title: "Blocco protetto",
    agent_id: a.id,
    activity_type: "censimento",
    starts_at: "2026-11-07T13:00:00Z",
    due_at: "2026-11-07T14:00:00Z",
  });
  assert.equal(
    (
      await request(a, "/api/entities/appointments/" + meeting.id, "PUT", {
        version: meeting.version,
        data: {
          ...dataOf(meeting),
          starts_at: other.starts_at,
          ends_at: other.due_at,
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(a, "/api/entities/activities/" + task.id)).value.starts_at,
    synced.starts_at,
  );
});
test("tipi rapidi appuntamento: titolo facoltativo e valori validati", async () => {
  for (const [i, type] of [
    "1ª visita immobile",
    "2ª visita immobile",
    "servizio fotografico immobile",
    "appuntamento con proprietario",
  ].entries()) {
    const row = await create("appointments", {
      appointment_type: type,
      agent_id: a.id,
      starts_at: `2026-12-${String(i + 1).padStart(2, "0")}T09:00:00Z`,
      ends_at: `2026-12-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    });
    assert.equal(row.title, type);
    assert.equal(row.appointment_type, type);
  }
  assert.equal(
    (
      await request(a, "/api/entities/appointments", "POST", {
        data: {
          appointment_type: "tipo inventato",
          agent_id: a.id,
          starts_at: "2026-12-07T09:00:00Z",
          ends_at: "2026-12-07T10:00:00Z",
        },
      })
    ).status,
    400,
  );
});
test("persona e appartamento: inserimento atomico, riuso CRM, più relazioni senza duplicati", async () => {
  const created = await request(a, "/api/territory/people", "POST", {
    unit_id: unit.id,
    relationship: "comproprietario",
    contact: {
      title: "Comproprietario test",
      phone: "+39 333 555 111",
      marital_status: "coniugato/a",
      has_children: "sì",
      preferred_channel: "WhatsApp",
      preferred_days: "lunedì e giovedì",
      preferred_time_from: "18:00",
      preferred_time_to: "20:00",
    },
  });
  assert.equal(created.status, 201);
  const person = created.value.person;
  assert.equal(person.phone, "+39333555111");
  assert.equal(person.has_children, "sì");
  const other = await create("units", {
    title: "8",
    building_id: building.id,
    floor: "3",
  });
  const linked = await request(a, "/api/territory/people", "POST", {
    unit_id: other.id,
    contact_id: person.id,
    relationship: "proprietario",
  });
  assert.equal(linked.status, 201);
  assert.equal(linked.value.person.id, person.id);
  assert.equal(
    app.db
      .prepare("SELECT count(*) n FROM contacts WHERE tenant_id=? AND phone=?")
      .get(a.tenant_id, person.phone).n,
    1,
  );
  assert.equal(
    (
      await request(a, "/api/territory/people", "POST", {
        unit_id: other.id,
        contact_id: person.id,
        relationship: "proprietario",
      })
    ).status,
    409,
  );
  const before = app.db
    .prepare("SELECT count(*) n FROM contacts WHERE tenant_id=?")
    .get(a.tenant_id).n;
  assert.equal(
    (
      await request(a, "/api/territory/people", "POST", {
        unit_id: unit.id,
        relationship: "non valida",
        contact: { title: "Persona da non salvare" },
      })
    ).status,
    400,
  );
  assert.equal(
    app.db
      .prepare("SELECT count(*) n FROM contacts WHERE tenant_id=?")
      .get(a.tenant_id).n,
    before,
  );
  assert.equal(
    (
      await request(b, "/api/territory/people", "POST", {
        unit_id: unit.id,
        contact_id: person.id,
      })
    ).status,
    404,
  );
});
test("campi multipli: persona, numeri e social salvati insieme o annullati insieme", async () => {
  const draft = (type, value, title = "") => ({
    data: { method_type: type, value, title },
  });
  const created = await request(a, "/api/entities/contacts", "POST", {
    data: { title: "Persona con più campi", phone: "+390000000001" },
    contact_methods: [
      draft("telefono", "+390000000002"),
      draft("WhatsApp", "+390000000003"),
      draft("Instagram", "https://example.invalid/instagram"),
      draft("LinkedIn", "https://example.invalid/linkedin"),
    ],
  });
  assert.equal(created.status, 201);
  const person = created.value;
  const methods = (
    await request(a, "/api/entities/contact_methods")
  ).value.filter((m) => m.contact_id === person.id);
  assert.equal(methods.length, 4);
  const updated = await request(
    a,
    "/api/entities/contacts/" + person.id,
    "PUT",
    {
      version: person.version,
      data: { ...dataOf(person), phone: "+390000000004" },
      contact_methods: methods.map((m, i) => ({
        id: m.id,
        version: m.version,
        data: {
          title: m.title,
          method_type: m.method_type,
          value: i === 0 ? "+390000000005" : m.value,
          notes: m.notes,
        },
      })),
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.value.phone, "+390000000004");
  const before = (await request(a, "/api/entities/contacts")).value.length;
  const failed = await request(a, "/api/entities/contacts", "POST", {
    data: { title: "Rollback persona e campi" },
    contact_methods: [
      draft("telefono", "+390000000099"),
      draft("Instagram", "javascript:alert(1)"),
    ],
  });
  assert.equal(failed.status, 400);
  assert.equal(
    (await request(a, "/api/entities/contacts")).value.length,
    before,
  );
  assert.equal(
    (await request(a, "/api/entities/contact_methods")).value.some(
      (m) => m.value === "+390000000099",
    ),
    false,
  );
  const outsider = await create(
    "contacts",
    { title: "Persona altra agenzia" },
    b,
  );
  const denied = await request(
    b,
    "/api/entities/contacts/" + outsider.id,
    "PUT",
    {
      version: outsider.version,
      data: { ...dataOf(outsider), title: "Non deve essere salvato" },
      contact_methods: [
        {
          id: methods[0].id,
          version: methods[0].version,
          data: { method_type: "telefono", value: "+390000000088" },
        },
      ],
    },
  );
  assert.equal(denied.status, 404);
  assert.equal(
    (await request(b, "/api/entities/contacts")).value.find(
      (p) => p.id === outsider.id,
    ).title,
    outsider.title,
  );
});

test("campi multipli nel censimento: creazione e collegamento con recapiti atomici", async () => {
  const response = await request(a, "/api/territory/people", "POST", {
    unit_id: unit.id,
    relationship: "comproprietario",
    contact: { title: "Comproprietario con campi multipli" },
    contact_methods: [
      { data: { method_type: "telefono", value: "+390000000077" } },
      {
        data: {
          method_type: "Facebook",
          value: "https://example.invalid/facebook",
        },
      },
    ],
  });
  assert.equal(response.status, 201);
  assert.equal(
    (await request(a, "/api/entities/contact_methods")).value.filter(
      (m) => m.contact_id === response.value.person.id,
    ).length,
    2,
  );
  const before = (await request(a, "/api/entities/contacts")).value.length;
  const invalid = await request(a, "/api/territory/people", "POST", {
    unit_id: unit.id,
    contact: { title: "Persona annullata con recapiti" },
    contact_methods: [{ data: { method_type: "telefono", value: "" } }],
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    (await request(a, "/api/entities/contacts")).value.length,
    before,
  );
});

test("recapiti aggiuntivi e social: isolamento e URL attivi non consentiti", async () => {
  const method = await create("contact_methods", {
    contact_id: contact.id,
    method_type: "Instagram",
    value: "https://www.instagram.com/esempio_test/",
  });
  assert.equal(method.title, "Instagram");
  assert.equal(
    (
      await request(b, "/api/entities/contact_methods", "POST", {
        data: { contact_id: contact.id, method_type: "telefono", value: "333" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(a, "/api/entities/contact_methods", "POST", {
        data: {
          contact_id: contact.id,
          method_type: "altro social",
          value: "javascript:alert(1)",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(a, "/api/entities/contacts", "POST", {
        data: {
          title: "Orari errati",
          preferred_time_from: "20:00",
          preferred_time_to: "18:00",
        },
      })
    ).status,
    400,
  );
});
test("storico telemarketing: registrazione e aggiornamento commerciale esplicito in transazione", async () => {
  const current = (await request(a, "/api/entities/units/" + unit.id)).value;
  const data = {
    street_id: street.id,
    building_id: building.id,
    unit_id: unit.id,
    contact_id: contact.id,
    channel: "telemarketing",
    occurred_at: "2026-11-08T09:00:00Z",
    outcome: "in vendita",
    notes: "Proprietario disponibile a valutare",
    next_action: "Organizzare valutazione",
    follow_up_at: "2026-11-09T09:00:00Z",
  };
  let result = await request(a, "/api/territory/interactions", "POST", {
    data,
    update_unit_status: true,
    unit_version: current.version,
  });
  assert.equal(result.status, 201);
  assert.equal(result.value.title, "telemarketing · in vendita");
  const changed = (await request(a, "/api/entities/units/" + unit.id)).value;
  assert.equal(changed.commercial_status, "in vendita");
  assert.equal(changed.occupancy_status, current.occupancy_status);
  assert.equal(changed.version, current.version + 1);
  const count = app.db
    .prepare("SELECT count(*) n FROM contact_interactions WHERE tenant_id=?")
    .get(a.tenant_id).n;
  result = await request(a, "/api/territory/interactions", "POST", {
    data,
    update_unit_status: true,
    unit_version: current.version,
  });
  assert.equal(result.status, 409);
  assert.equal(
    app.db
      .prepare("SELECT count(*) n FROM contact_interactions WHERE tenant_id=?")
      .get(a.tenant_id).n,
    count,
  );
  assert.equal(
    (await request(b, "/api/territory/interactions", "POST", { data })).status,
    400,
  );
  assert.equal(
    (await request(b, "/api/entities/contact_interactions")).value.length,
    0,
  );
  const another = await create("streets", {
    title: "Via diversa",
    city: "Milano",
  });
  assert.equal(
    (
      await request(a, "/api/territory/interactions", "POST", {
        data: { ...data, street_id: another.id },
      })
    ).status,
    400,
  );
});
test("foto citofono e appartamento: file privati, tipi validati, permessi e rimozione", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX9sAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = async (user, target, mime, bytes) => {
    const r = await fetch(base + "/api/media?" + target, {
      method: "POST",
      headers: {
        Cookie: user.cookie,
        "X-CSRF-Token": user.csrf,
        "Content-Type": mime,
      },
      body: bytes,
    });
    return { status: r.status, value: await r.json() };
  };
  const buildingPhoto = await upload(
    a,
    "building_id=" + building.id,
    "image/png",
    png,
  );
  assert.equal(buildingPhoto.status, 201);
  const unitPhoto = await upload(a, "unit_id=" + unit.id, "image/png", png);
  assert.equal(unitPhoto.status, 201);
  let response = await fetch(base + buildingPhoto.value.url, {
    headers: { Cookie: a.cookie },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(
    (
      await fetch(base + buildingPhoto.value.url, {
        headers: { Cookie: b.cookie },
      })
    ).status,
    404,
  );
  assert.equal((await fetch(base + buildingPhoto.value.url)).status, 401);
  assert.equal((await request(external, "/api/media")).status, 403);
  assert.equal(
    (await upload(b, "building_id=" + building.id, "image/png", png)).status,
    404,
  );
  assert.equal(
    (
      await upload(
        a,
        "unit_id=" + unit.id,
        "image/jpeg",
        Buffer.from("<html>not a photo</html>"),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await upload(
        a,
        "unit_id=" + unit.id,
        "image/svg+xml",
        Buffer.from("<svg/>"),
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(agent, "/api/media/" + buildingPhoto.value.id, "DELETE", {}))
      .status,
    403,
  );
  assert.equal(
    (await request(a, "/api/media/" + buildingPhoto.value.id, "DELETE", {}))
      .status,
    200,
  );
  assert.equal(
    (
      await fetch(base + buildingPhoto.value.url, {
        headers: { Cookie: a.cookie },
      })
    ).status,
    404,
  );
  assert.equal((await request(b, "/api/media")).value.length, 0);
});
test("AI Assistant: contesto minimizzato, ruoli e tenant isolati", async () => {
  const aiStreet = await create("streets", {
    title: "Via Assistant di prova",
    city: "Bari",
    district: "Centro",
    postal_code: "70100",
  });
  const aiBuilding = await create("buildings", {
    title: "31",
    street_id: aiStreet.id,
  });
  const aiUnit = await create("units", {
    title: "5",
    building_id: aiBuilding.id,
    area: 88,
    rooms: 4,
    property_type: "appartamento",
  });
  await create("properties", {
    title: "Annuncio riservato CRM",
    unit_id: aiUnit.id,
    assigned_agent_id: agent.id,
    price: 245000,
    marketing_status: "in vendita",
  });
  await create("contacts", {
    title: "Contatto segreto AI",
    assigned_agent_id: agent.id,
    email: "private-assistant@test.invalid",
    phone: "+390001112233",
    notes: "Nota riservata da non trasmettere",
  });

  const reply = await request(agent, "/api/assistant/chat", "POST", {
    messages: [{ role: "user", content: "Cerca immobili a Bari" }],
  });
  assert.equal(reply.status, 200, JSON.stringify(reply.value));
  assert.match(reply.value.message,/Bari/);
  assert.match(reply.value.message,/245.000/);
  assert.equal(reply.value.mode,'internal');
  assert.equal(assistantRequestBodies.length,0,'no external AI request, even with an API key');
  assert.doesNotMatch(reply.value.message,/Contatto segreto AI|private-assistant|Nota riservata/);

  const otherTenant = await request(b, "/api/assistant/chat", "POST", {
    messages: [{ role: "user", content: "Riepiloga immobili" }],
  });
  assert.equal(otherTenant.status, 200);
  assert.doesNotMatch(otherTenant.value.message, /Bari|245.000/);
  assert.equal(
    (await request(external, "/api/assistant/status")).status,
    403,
  );
  assert.equal(
    (
      await request(external, "/api/assistant/chat", "POST", {
        messages: [{ role: "user", content: "Riepiloga" }],
      })
    ).status,
    403,
  );
});

test('Portali: predisposizione e bozze locali isolate per agenzia',async()=>{
 const listing=await create('properties',{title:'Annuncio portali',price:150000,marketing_status:'in vendita'});
 let result=await request(a,'/api/portals');assert.equal(result.status,200);assert.equal(result.value.portals.length,3);
 assert.equal((await request(agent,'/api/portals')).status,403);
 assert.equal((await request(a,'/api/portals/idealista','PUT',{account_reference:'AGENZIA-42',channel:'feed'})).status,200);
 assert.equal((await request(a,'/api/portals/idealista','PUT',{account_reference:'x',channel:'invalid'})).status,400);
 assert.equal((await request(a,'/api/portals/drafts','POST',{property_id:listing.id,portals:['immobiliare','idealista','casa'],operation:'publish'})).status,200);
 result=await request(a,'/api/portals');assert.equal(result.value.drafts.length,3);assert.equal(result.value.portals.find(p=>p.id==='idealista').account_reference,'AGENZIA-42');
 assert.equal((await request(b,'/api/portals')).value.drafts.length,0);
 assert.equal((await request(b,'/api/portals/drafts','POST',{property_id:listing.id,portals:['casa'],operation:'withdraw'})).status,404);
 assert.equal((await request(a,'/api/portals/drafts','POST',{property_id:listing.id,portals:['immobiliare'],operation:'update'})).status,200);
 assert.equal((await request(a,'/api/portals')).value.drafts.length,3,'operations replace the local draft rather than duplicate');
 assert.equal((await request(a,'/api/connect/whatsapp/embedded-signup','POST',{})).status,409);
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
