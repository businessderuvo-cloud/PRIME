import { DatabaseSync } from "node:sqlite";
import { cpSync, existsSync, chownSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "../src/database.mjs";

if (process.env.PRIME_DEMO !== "1")
  throw Error("Importazione consentita solo nel demo.");
const source = path.resolve(process.argv[2] || "");
const destination = path.resolve(process.env.PRIME_DB || "/data/prime.sqlite");
if (source === destination || !existsSync(source))
  throw Error("Snapshot non valido.");
const db = openDatabase(destination);
try {
  if (
    db.prepare("SELECT count(*) n FROM tenants").get().n ||
    db.prepare("SELECT count(*) n FROM users").get().n
  )
    throw Error("Il database contiene già dati: importazione annullata.");
  const snapshot = new DatabaseSync(source, { readOnly: true });
  const expected = db
    .prepare("SELECT name FROM migrations ORDER BY name")
    .all();
  try {
    if (
      JSON.stringify(expected) !==
      JSON.stringify(
        snapshot.prepare("SELECT name FROM migrations ORDER BY name").all(),
      )
    )
      throw Error("Migrazioni differenti.");
  } finally {
    snapshot.close();
  }
  const photos = path.join(path.dirname(source), "uploads");
  const targetPhotos = path.join(path.dirname(destination), "uploads");
  if (existsSync(photos))
    cpSync(photos, targetPhotos, {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  if (process.getuid?.() === 0 && existsSync(targetPhotos)) {
    function own(file) {
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw Error("Link non consentiti");
      chownSync(file, 1000, 1000);
      if (stat.isDirectory())
        for (const name of readdirSync(file)) own(path.join(file, name));
    }
    own(targetPhotos);
  }
  db.prepare("ATTACH DATABASE ? AS seed").run(source);
  db.exec("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys=ON");
  try {
    const tables = db
      .prepare(
        "SELECT name FROM main.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('migrations','sessions')",
      )
      .all();
    for (const { name } of tables) {
      const table = '"' + name.replaceAll('"', '""') + '"';
      const columns = db
        .prepare("PRAGMA main.table_info(" + table + ")")
        .all()
        .map((c) => '"' + c.name.replaceAll('"', '""') + '"')
        .join(",");
      db.exec(
        `INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM seed.${table}`,
      );
    }
    if (db.prepare("PRAGMA foreign_key_check").get())
      throw Error("Relazioni non valide nello snapshot.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(
    "Demo importata: " +
      db.prepare("SELECT count(*) n FROM units").get().n +
      " appartamenti, " +
      db.prepare("SELECT count(*) n FROM media").get().n +
      " foto. Sessioni locali escluse.",
  );
} finally {
  db.close();
}
