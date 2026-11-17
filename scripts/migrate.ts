import "./env";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closeDb, db } from "../src/lib/db/client";

const dir = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  const sql = db();
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table schema_migrations enable row level security`;
  const done = new Set((await sql<{ version: string }[]>`select version from schema_migrations`).map((r) => r.version));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const content = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into schema_migrations (version) values (${file})`;
    });
    console.log(`Migration appliquée : ${file}`);
  }
  console.log("Base à jour.");
}

main()
  .catch((err) => {
    console.error("Échec de la migration :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
