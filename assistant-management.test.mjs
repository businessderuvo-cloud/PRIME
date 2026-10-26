import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from './server.mjs';
import { openDatabase } from './src/database.mjs';
import { schema } from './public/schema.js';
import { assistantResultMarkup } from './public/assistant-management.js';

const folder = mkdtempSync(path.join(tmpdir(), 'prime-assistant-manage-'));
let app, base, owner, agent, colleague, other, external, mario;
const graph = {};
function member(tenant, role) {
  const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(16).toString('hex');
  app.db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id, id + '@example.invalid', 'disabled');
  app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id, tenant, role);
  app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, tenant, Date.now() + 600000, csrf);
  return { id, tenant, cookie: 'prime_session=' + token, csrf };
}
async function request(user, route, method = 'GET', body, csrf = true) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: user.cookie, ...(csrf ? { 'X-CSRF-Token': user.csrf } : {}) } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const chat = async (text, user = owner) => (await request(user, '/api/assistant/chat', 'POST', { messages: [{ role: 'user', content: text }] }));
const plan = (entity, operation, data, id, user = owner) => request(user, '/api/assistant/manage/plan', 'POST', { entity, operation, data, id });
const confirm = (id, user = owner) => request(user, `/api/assistant/manage/actions/${id}/confirm`, 'POST', {});
async function create(entity, data, user = owner) {
  const draft = await plan(entity, 'create', data, undefined, user);
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  assert.ok(draft.body.proposal, JSON.stringify(draft.body));
  const saved = await confirm(draft.body.proposal.id, user);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return (await request(user, `/api/entities/${entity}/${saved.body.id}`)).body;
}
before(async () => {
  app = createApp({ database: path.join(folder, 'test.sqlite'), connectInterval: 0 });
  for (const tenant of ['assistant-a','assistant-b']) app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(tenant, tenant);
  owner = member('assistant-a','owner'); agent = member(owner.tenant,'agent'); colleague = member(owner.tenant,'manager'); other = member('assistant-b','owner'); external = member(owner.tenant,'external');
  await new Promise((resolve) => app.server.listen(0,'127.0.0.1',resolve));
  base = 'http://127.0.0.1:' + app.server.address().port;
});
after(async () => {
  await new Promise((resolve) => app.server.close(resolve)); app.db.close();
  assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep + 'prime-assistant-manage-'));
  rmSync(folder, { recursive: true, force: true });
});

test('Veronica: campi dettati in italiano e richiesta di memoria incompleta', async () => {
  const result = await chat('Crea contatto Giulia Bianchi con telefono 3331234567 e email giulia@example.invalid');
  assert.ok(result.body.proposal, JSON.stringify(result.body));
  assert.ok(JSON.stringify(result.body.proposal).includes('3331234567'));
  assert.ok(JSON.stringify(result.body.proposal).includes('giulia@example.invalid'));
  assert.equal((await chat('Ricorda che')).body.proposal, undefined);
});

test('Veronica: nuova scheda da chat, anteprima senza scritture, conferma unica e cronologia', async () => {
  const response = await chat('Crea un nuovo contatto Mario Rossi; telefono: +393331234567; email: mario@example.invalid');
  assert.equal(response.status,200); assert.ok(response.body.proposal, JSON.stringify(response.body));
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM contacts').get().n,0);
  const id = response.body.proposal.id;
  const results = await Promise.all([confirm(id), confirm(id)]);
  assert.deepEqual(results.map((result) => result.status).sort(),[200,409]);
  const savedId = results.find((result) => result.status === 200).body.id;
  mario = (await request(owner, '/api/entities/contacts/' + savedId)).body;
  assert.equal(mario.title,'Mario Rossi'); assert.equal(mario.phone,'+393331234567');
  assert.equal((await request(owner, `/api/entities/contacts/${mario.id}/history`)).body.length,1);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM audit WHERE action='assistant.action_applied'").get().n,1);
});
test('Veronica: creazione e aggiornamento in tutte le sezioni dati, con riferimenti e automazioni esistenti', async () => {
  graph.contacts = mario;
  graph.streets = await create('streets',{title:'Via Assistente',city:'Milano'});
  graph.buildings = await create('buildings',{title:'12',street_id:graph.streets.id});
  graph.units = await create('units',{title:'Interno 3',building_id:graph.buildings.id,floor:'2',area:90});
  graph.properties = await create('properties',{title:'Trilocale Assistente',unit_id:graph.units.id,owner_id:mario.id,price:'250.000 €'});
  graph.activities = await create('activities',{title:'Preparazione visita',starts_at:'2027-04-10T08:00:00Z',due_at:'2027-04-10T09:00:00Z',contact_id:mario.id,property_id:graph.properties.id});
  graph.appointments = await create('appointments',{title:'Visita assistente',appointment_type:'1ª visita immobile',starts_at:'2027-04-10T08:00:00Z',ends_at:'2027-04-10T09:00:00Z',activity_id:graph.activities.id,contact_id:mario.id,property_id:graph.properties.id,status:'effettuato'});
  const automatic = app.db.prepare('SELECT * FROM viewing_feedback WHERE appointment_id=?').get(graph.appointments.id);
  assert.ok(automatic);
  const removal = await plan('viewing_feedback','delete',undefined,automatic.id);
  assert.equal((await confirm(removal.body.proposal.id)).status,200);
  graph.viewing_feedback = await create('viewing_feedback',{appointment_id:graph.appointments.id,contact_id:mario.id,property_id:graph.properties.id,agent_id:owner.id,visited_at:'2027-04-10T08:00:00Z',outcome:'positivo'});
  graph.unit_contacts = await create('unit_contacts',{title:'Proprietario',unit_id:graph.units.id,contact_id:mario.id,relationship:'proprietario'});
  graph.contact_methods = await create('contact_methods',{title:'Cellulare aggiuntivo',contact_id:mario.id,method_type:'telefono',phone_kind:'Cell personale',value:'+393339876543'});
  graph.contact_interactions = await create('contact_interactions',{title:'Chiamata assistente',contact_id:mario.id,occurred_at:'2027-04-10T10:00:00Z'});
  graph.buyer_profiles = await create('buyer_profiles',{title:'Ricerca assistente',contact_id:mario.id,budget_max:300000});
  graph.deals = await create('deals',{title:'Trattativa assistente',property_id:graph.properties.id,contact_id:mario.id});
  graph.offers = await create('offers',{title:'Proposta assistente',deal_id:graph.deals.id,contact_id:mario.id,amount:240000});
  graph.valuations = await create('valuations',{title:'Stima assistente',property_id:graph.properties.id,assessed_on:'10/04/2027',low_value:230000,high_value:270000});
  graph.leases = await create('leases',{title:'Locazione assistente',property_id:graph.properties.id,owner_contact_id:mario.id,rent_monthly:1200});
  graph.commissions = await create('commissions',{title:'Provvigione assistente',deal_id:graph.deals.id,agent_id:owner.id,expected_amount:5000});
  graph.documents = await create('documents',{title:'Documento assistente',property_id:graph.properties.id});
  graph.signature_requests = await create('signature_requests',{title:'Firma assistente',document_id:graph.documents.id,signer_contact_id:mario.id,provider:'Namirial'});
  assert.deepEqual(Object.keys(graph).sort(),Object.keys(schema).sort());
  for (const entity of Object.keys(schema)) {
    const draft = await plan(entity,'note',{notes:'Nota registrata da Veronica'},graph[entity].id);
    assert.equal(draft.status,200,JSON.stringify(draft.body));
    assert.equal((await confirm(draft.body.proposal.id)).status,200,entity);
    const saved = (await request(owner,`/api/entities/${entity}/${graph[entity].id}`)).body;
    assert.match(saved.notes,/Nota registrata da Veronica/);
  }
});
test('Veronica: linguaggio naturale per campi, note, lead e apertura schede', async () => {
  for (const text of ['Modifica il telefono del contatto Mario Rossi in +393331112222','Aggiungi nota al contatto Mario Rossi: preferisce il pomeriggio','Segna Mario Rossi come lead caldo','Modifica il prezzo dell’immobile Trilocale Assistente a 275.000 €']) {
    const response = await chat(text);
    assert.ok(response.body.proposal,JSON.stringify(response.body));
    assert.equal((await confirm(response.body.proposal.id)).status,200);
  }
  const updated = (await request(owner,'/api/entities/contacts/'+mario.id)).body;
  assert.equal(updated.phone,'+393331112222'); assert.equal(updated.is_hot_lead,1); assert.match(updated.notes,/preferisce il pomeriggio/);
  assert.equal((await request(owner,'/api/entities/properties/'+graph.properties.id)).body.price,275000);
  assert.equal((await chat('Apri contatto Mario Rossi')).body.editor.id,mario.id);
  const incomplete = await chat('Crea un appuntamento');
  assert.equal(incomplete.body.editor.entity,'appointments'); assert.equal(incomplete.body.editor.id,null);
});
test('Veronica: isolamento per agenzia, CSRF, ruolo e WPS privato anche per il titolare', async () => {
  assert.equal((await request(null,'/api/assistant/manage/memories')).status,401);
  assert.equal((await request(external,'/api/assistant/manage/memories')).status,403);
  assert.equal((await request(owner,'/api/assistant/manage/plan','POST',{entity:'contacts',operation:'update',id:mario.id,data:{notes:'iniezione'}},false)).status,403);
  assert.equal((await plan('contacts','update',{notes:'cross tenant'},mario.id,other)).status,404);
  assert.equal((await plan('contacts','delete',undefined,mario.id,agent)).status,403);
  const task = await create('activities',{title:'WPS agente privato',starts_at:'2027-04-11T08:00:00Z',due_at:'2027-04-11T09:00:00Z'},agent);
  assert.equal(task.agent_id,agent.id);
  assert.equal((await plan('activities','note',{notes:'intrusione'},task.id,owner)).status,403);
  const reference = await plan('properties','create',{title:'Riferimento esterno',owner_id:mario.id},undefined,other);
  assert.equal(reference.status,409);
  const draft = await plan('contacts','update',{profession:'Consulente'},mario.id);
  assert.equal((await confirm(draft.body.proposal.id,agent)).status,404);
});
test('Veronica: versioni obsolete, annullamento e scadenza non sovrascrivono dati', async () => {
  const draft = await plan('contacts','update',{profession:'Primo valore'},mario.id);
  const newer = await plan('contacts','update',{profession:'Valore aggiornato'},mario.id);
  assert.equal((await confirm(newer.body.proposal.id)).status,200);
  assert.equal((await confirm(draft.body.proposal.id)).status,409);
  assert.equal((await request(owner,'/api/entities/contacts/'+mario.id)).body.profession,'Valore aggiornato');
  const cancel = await plan('contacts','update',{profession:'Da annullare'},mario.id);
  assert.equal((await request(owner,`/api/assistant/manage/actions/${cancel.body.proposal.id}/cancel`,'POST',{})).status,200);
  assert.equal((await confirm(cancel.body.proposal.id)).status,409);
  const expired = await plan('contacts','update',{profession:'Scaduto'},mario.id);
  app.db.prepare('UPDATE assistant_actions SET expires_at=0 WHERE id=?').run(expired.body.proposal.id);
  assert.equal((await confirm(expired.body.proposal.id)).status,409);
});
test('Veronica: memoria persistente e privata, con anteprima e rimozione confermata', async () => {
  const draft = await chat('Ricorda che il mio nome è Claudio e preferisco risposte sintetiche');
  assert.ok(draft.body.proposal);
  assert.equal((await request(owner,'/api/assistant/manage/memories')).body.length,0);
  assert.equal((await confirm(draft.body.proposal.id)).status,200);
  const rows = (await request(owner,'/api/assistant/manage/memories')).body;
  assert.equal(rows.length,1); assert.match((await chat('Come mi chiamo?')).body.message,/Claudio/);
  assert.equal((await request(colleague,'/api/assistant/manage/memories')).body.length,0);
  assert.equal((await request(other,'/api/assistant/manage/memories')).body.length,0);
  const reopened = openDatabase(path.join(folder,'test.sqlite'));
  assert.equal(reopened.prepare('SELECT content FROM assistant_memories WHERE id=?').get(rows[0].id).content,rows[0].content); reopened.close();
  const removed = await request(owner,'/api/assistant/manage/plan','POST',{operation:'forget',id:rows[0].id});
  assert.equal((await request(owner,'/api/assistant/manage/memories')).body.length,1);
  assert.equal((await confirm(removed.body.proposal.id)).status,200);
  assert.equal((await request(owner,'/api/assistant/manage/memories')).body.length,0);
  assert.equal((await chat('Ricorda che la password è non-salvare')).body.proposal,undefined);
});
test('Veronica: eliminazioni con relazioni protette e creazioni annullabili', async () => {
  const linked = await plan('contacts','delete',undefined,mario.id);
  assert.equal((await confirm(linked.body.proposal.id)).status,409);
  assert.equal((await request(owner,'/api/entities/contacts/'+mario.id)).status,200);
  const contact = await create('contacts',{title:'Da eliminare'});
  const removal = await plan('contacts','delete',undefined,contact.id);
  assert.equal((await confirm(removal.body.proposal.id)).status,200);
  assert.equal((await request(owner,'/api/entities/contacts/'+contact.id)).status,404);
});
test('Veronica: creazione atomica con aggiornamento della proposta e input non consentiti', async () => {
  const draft = await plan('contacts','create',{title:'Non deve restare'});
  app.db.exec("CREATE TRIGGER assistant_fail BEFORE UPDATE OF status ON assistant_actions WHEN NEW.status='applied' BEGIN SELECT RAISE(ABORT,'UNIQUE constraint forced test'); END;");
  assert.equal((await confirm(draft.body.proposal.id)).status,409);
  assert.equal(app.db.prepare("SELECT count(*) AS n FROM contacts WHERE title='Non deve restare'").get().n,0);
  assert.equal(app.db.prepare('SELECT status FROM assistant_actions WHERE id=?').get(draft.body.proposal.id).status,'pending');
  app.db.exec('DROP TRIGGER assistant_fail');
  assert.equal((await confirm(draft.body.proposal.id)).status,200);
  assert.equal((await plan('__proto__','create',{title:'x'})).status,400);
  assert.equal((await plan('contacts','update',{tenant_id:'assistant-b'},mario.id)).status,400);
  assert.equal((await plan('signature_requests','update',{signed_at:'2027-04-10T10:00:00Z'},graph.signature_requests.id)).status,400);
});
test('Veronica: catalogo schede e anteprima HTML non eseguono il contenuto dei dati', async () => {
  const escape = (value) => String(value).replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const html = assistantResultMarkup({proposal:{title:'<script>bad</script>',status:'pending',changes:[{label:'Note',before:'',after:'<img src=x onerror=bad>'}]}},0,escape);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('data-assistant-confirm="0"'));
  assert.equal((await fetch(base+'/assistant-management.js')).status,200);
});
