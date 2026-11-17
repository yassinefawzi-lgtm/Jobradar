import type { RawJob } from "../../types";
import type { Connector, ConnectorContext, ConnectorResult, Env } from "../types";
import { type Mailbox, openGmail } from "./mailbox";
import { parseAlertEmail } from "./parsers";

/**
 * Connecteur « e-mails d'alerte » : lit les alertes (Indeed, LinkedIn, WTTJ, France Travail, Apec, HelloWork),
 * en extrait les offres, puis — seulement si toutes ses offres ont été enregistrées — met l'e-mail à la corbeille.
 * Un e-mail non reconnu ou mal lu est conservé et signalé.
 */
export function emailConnector(env: Env = process.env, open: (env: Env) => Promise<Mailbox> = openGmail): Connector {
  return {
    id: "email",
    label: "E-mails d'alerte (Gmail)",
    unavailableReason: () => (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD ? "GMAIL_USER / GMAIL_APP_PASSWORD non configurés" : null),
    async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
      const box = await open(env);
      const jobs: RawJob[] = [];
      const warnings: string[] = [];
      const jobsByUid = new Map<number, string[]>();
      try {
        const mails = await box.fetchAlerts(Math.max(2, Math.min(ctx.maxAgeDays, 14)));
        for (const mail of mails) {
          const parsed = parseAlertEmail(mail);
          if (!parsed) continue;
          if (!parsed.jobs.length) {
            warnings.push(`E-mail conservé (aucune offre lue) : « ${mail.subject.slice(0, 80)} » de ${mail.from}`);
            continue;
          }
          jobs.push(...parsed.jobs);
          jobsByUid.set(mail.uid, parsed.jobs.map((j) => `${j.source}:${j.sourceJobId}`));
        }
        ctx.log(`E-mails : ${mails.length} alertes lues, ${jobs.length} offres extraites`);
      } catch (err) {
        await box.close().catch(() => {});
        throw err;
      }
      return {
        jobs,
        seenIds: [],
        warnings,
        async commit(failed) {
          try {
            const ok = [...jobsByUid].filter(([, keys]) => keys.every((k) => !failed.has(k))).map(([uid]) => uid);
            const n = await box.trash(ok);
            ctx.log(`E-mails : ${n} mis à la corbeille après enregistrement`);
            return n;
          } finally {
            await box.close().catch(() => {});
          }
        },
      };
    },
  };
}
