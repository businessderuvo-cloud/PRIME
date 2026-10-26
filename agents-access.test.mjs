import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createApp } from "./server.mjs";

test("owner creates agent accounts; zone management is owner-only and tenant-scoped", async () => {
  const app = createApp({ database: ":memory:", connectInterval: 0 });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const password = randomBytes(20).toString("hex");
  async function request(session, route, method = "GET", body) {
    const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(session ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function auth(email, mode = "register") {
    if(mode==="register"){
      const result=await request(null,"/api/auth","POST",{mode,email,password,agency:"Test agency"});
      assert.equal(result.status,201);
      const token=new URL(result.body.verification_url).searchParams.get("verify");
      assert.equal((await request(null,"/api/auth/verify-email","POST",{token})).status,200);
    }
    const result = await request(null, "/api/auth", "POST", { mode:"login", email, password });
    assert.equal(result.status, 200,JSON.stringify(result.body));
    const me = await request({ cookie: result.cookie }, "/api/me");
    return { ...me.body, cookie: result.cookie };
  }
  try {
    const owner = await auth("owner@example.test"), otherOwner = await auth("other@example.test");
    const created = await request(owner, "/api/agents", "POST", { email: "agent@example.test" });
    assert.equal(created.status, 201);
    assert.equal(created.body.role, "agent");
    assert.equal("password" in created.body, false);
    const inviteToken=new URL(created.body.invite_url).searchParams.get("invite");
    assert.equal((await request(null,"/api/auth/invitations/accept","POST",{token:inviteToken,password})).status,200);
    const agent = await auth("agent@example.test", "login");
    assert.equal(agent.tenant_id, owner.tenant_id);
    assert.equal(agent.role, "agent");
    const privateTask = await request(agent, "/api/entities/activities", "POST", { data: { title: "Private WPS task", agent_id: agent.id, activity_type: "chiamata", starts_at: "2027-01-04T08:00:00Z", due_at: "2027-01-04T09:00:00Z" } });
    assert.equal(privateTask.status, 201, JSON.stringify(privateTask.body));
    assert.equal((await request(agent, "/api/entities/activities")).body.length, 1);
    assert.equal((await request(owner, "/api/entities/activities")).body.length, 0);
    assert.equal((await request(owner, `/api/entities/activities/${privateTask.body.id}`)).status, 403);
    assert.equal((await request(owner, `/api/entities/activities/${privateTask.body.id}/history`)).status, 403);
    assert.equal((await request(owner, "/api/search?q=Private%20WPS")).body.length, 0);
    assert.equal((await request(owner, "/api/entities/activities", "POST", { data: { title: "Cannot plan colleague WPS", agent_id: agent.id, activity_type: "chiamata", starts_at: "2027-01-04T10:00:00Z", due_at: "2027-01-04T11:00:00Z" } })).status, 403);
    const meetingData = { title: "Shared appointment", agent_id: agent.id, starts_at: "2027-01-05T10:00:00Z", ends_at: "2027-01-05T11:00:00Z", appointment_type: "appuntamento con proprietario" };
    assert.equal((await request(agent, "/api/entities/appointments", "POST", { data: meetingData })).status, 201);
    assert.equal((await request(owner, "/api/entities/appointments", "POST", { data: { ...meetingData, title: "Owner appointment", agent_id: owner.id } })).status, 201);
    const sharedAppointments = (await request(agent, "/api/entities/appointments")).body;
    assert.equal(sharedAppointments.length, 2);
    assert.deepEqual(new Set(sharedAppointments.map(row => row.agent_id)), new Set([owner.id, agent.id]));
    assert.equal((await request(otherOwner, "/api/entities/appointments")).body.length, 0);
    assert.equal((await request(agent, "/api/agents")).status, 403);
    assert.equal((await request(agent, "/api/agents", "POST", { email: "blocked@example.test" })).status, 403);
    assert.equal((await request(owner, "/api/agents", "POST", { email: "agent@example.test" })).status, 409);
    assert.equal((await request(owner, "/api/agents", "POST", { email: "not-an-email" })).status, 400);
    assert.deepEqual((await request(otherOwner, "/api/agents")).body, []);
    const zoneBody = { title: "Central zone", agent_id: agent.id, polygon: [[45,9],[45.1,9],[45,9.1],[45,9]] };
    assert.equal((await request(agent, "/api/map/zones", "POST", zoneBody)).status, 403);
    const zone = await request(owner, "/api/map/zones", "POST", zoneBody);
    assert.equal(zone.status, 201);
    assert.equal((await request(agent, "/api/map/zones")).body.length, 1);
    assert.equal((await request(agent, `/api/map/zones/${zone.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(agent, `/api/map/zones/${zone.body.id}`, "PATCH", { agent_id: agent.id, version: 1 })).status, 403);
    assert.equal((await request(otherOwner, `/api/map/zones/${zone.body.id}`, "PATCH", { agent_id: agent.id, version: 1 })).status, 404);
    assert.equal((await request(otherOwner, "/api/map/zones", "POST", zoneBody)).status, 403);
    const second = await request(owner, "/api/agents", "POST", { email: "second@example.test" });
    assert.equal((await request(owner, `/api/map/zones/${zone.body.id}`, "PATCH", { agent_id: second.body.id, version: 1 })).status, 200);
    assert.equal((await request(owner, `/api/map/zones/${zone.body.id}`, "PATCH", { agent_id: agent.id, version: 1 })).status, 409);
    assert.equal((await request(owner, "/api/map/zones")).body[0].agent_id, second.body.id);
    app.db.prepare("UPDATE memberships SET role='manager' WHERE user_id=? AND tenant_id=?").run(agent.id, owner.tenant_id);
    assert.equal((await request(agent, "/api/agents")).status, 403);
    assert.equal((await request(agent, "/api/map/zones", "POST", zoneBody)).status, 403);
    assert.equal((await request(agent, `/api/map/zones/${zone.body.id}`, "DELETE")).status, 403);
    assert.equal((await request(owner, `/api/map/zones/${zone.body.id}`, "DELETE")).status, 200);
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    app.db.close();
  }
});
