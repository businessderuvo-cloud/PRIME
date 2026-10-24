import { randomUUID } from "node:crypto";
import { validate, ApiError } from "./validation.mjs";

// Called inside the person transaction: a failed recap rolls back the person too.
export function saveContactMethods(db, session, contactId, drafts, audit) {
  if (drafts === undefined) return;
  if (!Array.isArray(drafts) || drafts.length > 50)
    throw new ApiError(400, "Recapiti non validi (massimo 50).");
  const seen = new Set();
  for (const draft of drafts) {
    if (!draft || typeof draft !== "object")
      throw new ApiError(400, "Recapito non valido.");
    const id = draft.id || randomUUID();
    if (seen.has(id)) throw new ApiError(400, "Recapito ripetuto.");
    seen.add(id);
    let live;
    if (draft.id) {
      live = db
        .prepare(
          "SELECT * FROM contact_methods WHERE tenant_id=? AND id=? AND contact_id=?",
        )
        .get(session.tenant_id, id, contactId);
      if (!live)
        throw new ApiError(404, "Recapito non disponibile per questa persona.");
      if (live.version !== draft.version)
        throw new ApiError(
          409,
          "Un recapito è stato modificato: riapri la scheda.",
        );
    }
    const data = validate("contact_methods", {
      ...draft.data,
      contact_id: contactId,
    });
    const keys = Object.keys(data),
      now = new Date().toISOString();
    if (live && keys.every((key) => live[key] === data[key])) continue;
    if (live)
      db.prepare(
        `UPDATE contact_methods SET ${keys.map((key) => key + "=?").join(",")},version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?`,
      ).run(
        ...Object.values(data),
        session.user_id,
        now,
        session.tenant_id,
        id,
      );
    else
      db.prepare(
        `INSERT INTO contact_methods(id,tenant_id,${keys.join(",")},created_by,updated_by,created_at,updated_at) VALUES (${Array(
          keys.length + 6,
        )
          .fill("?")
          .join(",")})`,
      ).run(
        id,
        session.tenant_id,
        ...Object.values(data),
        session.user_id,
        session.user_id,
        now,
        now,
      );
    const saved = db
      .prepare("SELECT * FROM contact_methods WHERE tenant_id=? AND id=?")
      .get(session.tenant_id, id);
    db.prepare(
      "INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      session.tenant_id,
      "contact_methods",
      id,
      saved.version,
      JSON.stringify(saved),
      session.user_id,
      now,
    );
    audit(session, "contact_methods." + (live ? "update" : "create"), id);
  }
}
