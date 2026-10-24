import { mkdirSync, chownSync, lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { createApp } from "../server.mjs";

const directory = path.dirname(
  path.resolve(process.env.PRIME_DB || "/data/prime.sqlite"),
);
mkdirSync(directory, { recursive: true });
// Fly mounts a new volume as root-owned. Hand it to the unprivileged Node user.
if (process.getuid?.() === 0) {
  function own(filename) {
    const stat = lstatSync(filename);
    if (stat.isSymbolicLink()) return;
    chownSync(filename, 1000, 1000);
    if (stat.isDirectory())
      for (const entry of readdirSync(filename))
        own(path.join(filename, entry));
  }
  own(directory);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
const { server, db } = createApp();
const port = Number(process.env.PORT || 8080),
  host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () =>
  console.log("PRIME hosted: " + host + ":" + server.address().port),
);
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 25000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
