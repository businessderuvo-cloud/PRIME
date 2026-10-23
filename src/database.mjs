import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function openDatabase(filename = path.join(root, "data/prime.sqlite")) {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)",
  );
  for (const name of readdirSync(path.join(root, "migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (db.prepare("SELECT 1 FROM migrations WHERE name=?").get(name)) continue;
    // Table rebuilds preserve dependent foreign keys by retaining table names.
    // Enforcement is restored after each migration; integrity is checked before commit.
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
      db.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
      if (db.prepare("PRAGMA foreign_key_check").get())
        throw new Error(`Relazioni non valide nella migrazione ${name}`);
      db.prepare("INSERT INTO migrations VALUES (?,?)").run(
        name,
        new Date().toISOString(),
      );
      db.exec("COMMIT; PRAGMA foreign_keys=ON");
    } catch (e) {
      db.exec("ROLLBACK");
      db.close();
      throw e;
    }
  }
  return db;
}
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
