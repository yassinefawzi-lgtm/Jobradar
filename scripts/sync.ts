import "./env";
import { closeDb, db } from "../src/lib/db/client";
import { gmailSender, sendDigest, sendFailureAlert } from "../src/lib/notify/digest";
import { runSync } from "../src/lib/sync/run";

// Usage : pnpm sync [--only hellowork,email] [--days 30] [--trigger planifie] [--notify]
const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const sql = db();
  const report = await runSync(sql, {
    trigger: (arg("trigger") as "planifie" | "manuel" | "cli" | undefined) ?? "cli",
    only: arg("only")?.split(","),
    maxAgeDays: arg("days") ? Number(arg("days")) : undefined,
  });
  if (args.includes("--notify")) {
    const sender = gmailSender();
    const to = process.env.NOTIFY_TO || process.env.GMAIL_USER;
    if (report.status === "echec") {
      const details = report.sources.map((s) => `${s.source} : ${s.status}${s.message ? ` — ${s.message}` : ""}`).join("\n");
      console.log((await sendFailureAlert(sender, to, details)) ? "Alerte d'échec envoyée" : "Alerte d'échec non envoyée (notification non configurée)");
    }
    try {
      const r = await sendDigest(sql, {
        sender,
        to,
        minScore: Number(process.env.NOTIFY_MIN_SCORE ?? 85),
        max: Number(process.env.NOTIFY_MAX ?? 15),
        appUrl: process.env.APP_URL ?? null,
      });
      console.log(r.sent ? `Résumé envoyé : ${r.sent} offre(s)` : `Pas de résumé (${r.reason})`);
    } catch (err) {
      // L'e-mail ne doit jamais faire échouer la collecte.
      console.error("Résumé non envoyé :", err instanceof Error ? err.message : err);
    }
  }
  if (report.status === "echec") process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("Échec de la synchronisation :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
