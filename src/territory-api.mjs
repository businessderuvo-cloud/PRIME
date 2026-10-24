import { mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { validate, ApiError } from "./validation.mjs";
import { transaction } from "./database.mjs";
import { saveContactMethods } from "./contact-methods.mjs";

export function territoryApi({ db, uploadsDirectory, audit, json, readBody }) {
  const folder = (s) =>
    path.join(
      uploadsDirectory,
      createHash("sha256").update(s.tenant_id).digest("hex"),
    );
  const filename = (s, row) =>
    path.join(folder(s), row.id + "." + row.extension);
  function insert(entity, data, s) {
    const b = validate(entity, data),
      id = randomUUID(),
      now = new Date().toISOString(),
      keys = Object.keys(b);
    if (entity === "contacts" && b.assigned_agent_id) {
      const membership = db
        .prepare("SELECT role FROM memberships WHERE tenant_id=? AND user_id=?")
        .get(s.tenant_id, b.assigned_agent_id);
      if (!membership || membership.role === "external")
        throw new ApiError(400, "Agente non disponibile per questa agenzia");
      if (s.role === "agent" && b.assigned_agent_id !== s.user_id)
        throw new ApiError(403, "Non puoi assegnare un lead ad altri agenti");
    }
    db.prepare(
      `INSERT INTO ${entity}(id,tenant_id,${keys.join(",")},created_by,updated_by,created_at,updated_at) VALUES (${Array(
        keys.length + 6,
      )
        .fill("?")
        .join(",")})`,
    ).run(id, s.tenant_id, ...Object.values(b), s.user_id, s.user_id, now, now);
    const row = db
      .prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`)
      .get(s.tenant_id, id);
    db.prepare(
      "INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      s.tenant_id,
      entity,
      id,
      row.version,
      JSON.stringify(row),
      s.user_id,
      now,
    );
    audit(s, entity + ".create", id);
    return row;
  }
  return async function handle(req, res, url, s) {
    if (url.pathname === "/api/territory/people" && req.method === "POST") {
      const b = await readBody(req);
      if (
        !db
          .prepare("SELECT id FROM units WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, b.unit_id || "")
      )
        throw new ApiError(404, "Appartamento non trovato");
      const result = transaction(db, () => {
        let person;
        if (b.contact_id) {
          person = db
            .prepare("SELECT * FROM contacts WHERE tenant_id=? AND id=?")
            .get(s.tenant_id, b.contact_id);
          if (!person)
            throw new ApiError(
              400,
              "Persona non disponibile per questa agenzia",
            );
        } else person = insert("contacts", b.contact, s);
        saveContactMethods(db, s, person.id, b.contact_methods, audit);
        const link = insert(
          "unit_contacts",
          {
            unit_id: b.unit_id,
            contact_id: person.id,
            relationship: b.relationship || "proprietario",
            notes: b.notes || "",
          },
          s,
        );
        return { person, link };
      });
      json(res, 201, result);
      return true;
    }
    if (
      url.pathname === "/api/territory/interactions" &&
      req.method === "POST"
    ) {
      const body = await readBody(req),
        data = validate("contact_interactions", body.data);
      for (const [field, table] of [
        ["street_id", "streets"],
        ["building_id", "buildings"],
        ["unit_id", "units"],
        ["contact_id", "contacts"],
      ])
        if (
          data[field] &&
          !db
            .prepare(`SELECT id FROM ${table} WHERE tenant_id=? AND id=?`)
            .get(s.tenant_id, data[field])
        )
          throw new ApiError(
            400,
            "Collegamento non disponibile per questa agenzia",
          );
      const unit =
        data.unit_id &&
        db
          .prepare("SELECT * FROM units WHERE tenant_id=? AND id=?")
          .get(s.tenant_id, data.unit_id);
      if (unit && data.building_id && unit.building_id !== data.building_id)
        throw new ApiError(400, "Appartamento e civico non corrispondono");
      const buildingId = data.building_id || unit?.building_id,
        building =
          buildingId &&
          db
            .prepare(
              "SELECT street_id FROM buildings WHERE tenant_id=? AND id=?",
            )
            .get(s.tenant_id, buildingId);
      if (building && data.street_id && building.street_id !== data.street_id)
        throw new ApiError(400, "Civico e via non corrispondono");
      const map = {
        "in vendita": "in vendita",
        "non in vendita": "non in vendita",
        "in affitto": "in affitto",
      };
      if (
        body.update_unit_status &&
        (!unit || !map[data.outcome] || body.unit_version !== unit.version)
      )
        throw new ApiError(
          409,
          "Riapri la scheda e verifica lo stato dell’appartamento prima di aggiornarlo",
        );
      const row = transaction(db, () => {
        const saved = insert("contact_interactions", data, s);
        if (body.update_unit_status) {
          const now = new Date().toISOString();
          db.prepare(
            "UPDATE units SET commercial_status=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?",
          ).run(map[data.outcome], s.user_id, now, s.tenant_id, unit.id);
          const updated = db
            .prepare("SELECT * FROM units WHERE tenant_id=? AND id=?")
            .get(s.tenant_id, unit.id);
          db.prepare(
            "INSERT INTO record_history(tenant_id,entity,record_id,version,snapshot,actor_id,created_at) VALUES (?,?,?,?,?,?,?)",
          ).run(
            s.tenant_id,
            "units",
            unit.id,
            updated.version,
            JSON.stringify(updated),
            s.user_id,
            now,
          );
          audit(s, "units.status_from_contact", unit.id);
        }
        return saved;
      });
      json(res, 201, row);
      return true;
    }
    if (url.pathname === "/api/media" && req.method === "GET") {
      const rows = db
        .prepare(
          "SELECT id,building_id,unit_id,photo_type,mime_type,size_bytes,created_by,created_at FROM media WHERE tenant_id=? ORDER BY created_at DESC",
        )
        .all(s.tenant_id);
      json(
        res,
        200,
        rows.map((r) => ({ ...r, url: "/api/media/" + r.id + "/content" })),
      );
      return true;
    }
    if (url.pathname === "/api/media" && req.method === "POST") {
      const building = url.searchParams.get("building_id") || null,
        unit = url.searchParams.get("unit_id") || null;
      if (Boolean(building) === Boolean(unit))
        throw new ApiError(400, "Indica un solo civico o appartamento");
      if (
        !db
          .prepare(
            `SELECT id FROM ${building ? "buildings" : "units"} WHERE tenant_id=? AND id=?`,
          )
          .get(s.tenant_id, building || unit)
      )
        throw new ApiError(404, "Scheda non trovata");
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024)
          throw new ApiError(413, "La foto supera 8 MB");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const mime = (req.headers["content-type"] || "").split(";")[0];
      let extension;
      if (
        mime === "image/png" &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        bytes.length >= 33
      )
        extension = "png";
      if (
        mime === "image/jpeg" &&
        bytes.length >= 12 &&
        bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255
      )
        extension = "jpg";
      if (
        mime === "image/webp" &&
        bytes.length >= 20 &&
        bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP"
      )
        extension = "webp";
      if (!extension)
        throw new ApiError(400, "Carica una foto JPEG, PNG o WebP valida");
      const id = randomUUID(),
        row = { id, extension };
      mkdirSync(folder(s), { recursive: true });
      writeFileSync(filename(s, row), bytes, { flag: "wx" });
      try {
        transaction(db, () => {
          db.prepare(
            "INSERT INTO media(id,tenant_id,building_id,unit_id,photo_type,mime_type,extension,size_bytes,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          ).run(
            id,
            s.tenant_id,
            building,
            unit,
            building ? "citofono" : "appartamento",
            mime,
            extension,
            size,
            s.user_id,
            new Date().toISOString(),
          );
          audit(s, "media.upload", id);
        });
      } catch (e) {
        unlinkSync(filename(s, row));
        throw e;
      }
      json(res, 201, { id, url: "/api/media/" + id + "/content" });
      return true;
    }
    const match = /^\/api\/media\/([a-f0-9-]+)(\/content)?$/.exec(url.pathname);
    if (match) {
      const row = db
        .prepare("SELECT * FROM media WHERE tenant_id=? AND id=?")
        .get(s.tenant_id, match[1]);
      if (!row) throw new ApiError(404, "Foto non trovata");
      if (req.method === "GET" && match[2]) {
        let bytes;
        try {
          bytes = readFileSync(filename(s, row));
        } catch {
          throw new ApiError(404, "Il file della foto non è disponibile");
        }
        res.writeHead(200, {
          "Content-Type": row.mime_type,
          "Content-Length": bytes.length,
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
        });
        res.end(bytes);
        return true;
      }
      if (req.method === "DELETE" && !match[2]) {
        if (
          !["owner", "manager"].includes(s.role) &&
          row.created_by !== s.user_id
        )
          throw new ApiError(
            403,
            "Puoi eliminare solo le foto che hai caricato",
          );
        transaction(db, () => {
          db.prepare("DELETE FROM media WHERE tenant_id=? AND id=?").run(
            s.tenant_id,
            row.id,
          );
          audit(s, "media.delete", row.id);
        });
        try {
          unlinkSync(filename(s, row));
        } catch (e) {
          if (e.code !== "ENOENT")
            console.error("Pulizia file media non riuscita");
        }
        json(res, 200, { ok: true });
        return true;
      }
    }
    return false;
  };
}
