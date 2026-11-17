import "./env";
import { closeDb, db } from "../src/lib/db/client";
import { runSync } from "../src/lib/sync/run";

// Usage : pnpm sync [--only hellowork,adzuna] [--days 30] [--trigger planifie]
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const report = await runSync(db(), {
    trigger: (arg("trigger") as "planifie" | "manuel" | "cli" | undefined) ?? "cli",
    only: arg("only")?.split(","),
    maxAgeDays: arg("days") ? Number(arg("days")) : undefined,
  });
  if (report.status === "echec") process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Échec de la synchronisation :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
