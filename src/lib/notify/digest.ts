import nodemailer from "nodemailer";
import type postgres from "postgres";
import { contractLabel, locationLabel, salaryLabel } from "../format";
import type { Salary } from "../types";

/**
 * Résumé quotidien par e-mail : les meilleures nouvelles offres (score ≥ seuil), jamais envoyées deux fois.
 * Optionnel : sans GMAIL_USER / GMAIL_APP_PASSWORD, rien n'est envoyé et l'application fonctionne normalement.
 */

export interface DigestJob {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  zone: string;
  distance_km: number | null;
  contract: string;
  contract_months: number | null;
  salary: Salary | null;
  score: number;
  summary: string | null;
  url: string | null;
}

export interface Sender {
  send(msg: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

export function gmailSender(env: Record<string, string | undefined> = process.env): Sender | null {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) return null;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
  });
  return {
    async send(msg) {
      await transport.sendMail({ from: `JobRadar <${env.GMAIL_USER}>`, ...msg });
    },
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderDigest(jobs: DigestJob[], appUrl: string | null): { subject: string; text: string; html: string } {
  const subject = `JobRadar : ${jobs.length} nouvelle${jobs.length > 1 ? "s" : ""} offre${jobs.length > 1 ? "s" : ""} à regarder`;
  const lines = jobs.map((j) => {
    const meta = [locationLabel(j.city, j.zone, j.distance_km), contractLabel(j.contract, j.contract_months), salaryLabel(j.salary)].join(" · ");
    return { j, meta, app: appUrl ? `${appUrl.replace(/\/$/, "")}/offres/${j.id}` : null };
  });
  const text = lines
    .map(({ j, meta, app }) => `${j.score}/100 — ${j.title} — ${j.company ?? "entreprise non précisée"}\n${meta}\n${j.summary ?? ""}\n${app ?? j.url ?? ""}`)
    .join("\n\n");
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px">${lines
    .map(
      ({ j, meta, app }) =>
        `<div style="border:1px solid #e3e3dd;border-radius:10px;padding:12px;margin:0 0 10px"><b>${j.score}/100 · ${esc(j.title)}</b><br>${esc(j.company ?? "Entreprise non précisée")}<br><span style="color:#52525b">${esc(meta)}</span><br>${esc(j.summary ?? "")}<br>${app ? `<a href="${esc(app)}">Ouvrir dans JobRadar</a> · ` : ""}${j.url ? `<a href="${esc(j.url)}">Annonce</a>` : ""}</div>`,
    )
    .join("")}</div>`;
  return { subject, text, html };
}

/** Envoie le résumé si des offres le justifient ; marque les offres envoyées (anti-doublon). */
export async function sendDigest(
  sql: postgres.Sql,
  opts: { sender: Sender | null; to?: string; minScore?: number; max?: number; appUrl?: string | null },
): Promise<{ sent: number; reason?: string }> {
  if (!opts.sender || !opts.to) return { sent: 0, reason: "notification non configurée" };
  const jobs = await sql<DigestJob[]>`
    select j.id, j.title, j.company, j.city, j.zone, j.distance_km, j.contract, j.contract_months, j.salary, j.score,
      j.score_details->>'summary' as summary,
      (select s.url from job_sources s where s.job_id = j.id order by s.first_seen_at limit 1) as url
    from jobs j
    where j.notified_at is null and j.score >= ${opts.minScore ?? 85} and (j.score_details->>'excluded') is null
      and j.status in ('nouvelle', 'a_etudier') and j.availability <> 'expiree' and j.first_seen_at > now() - interval '7 days'
    order by j.score desc limit ${opts.max ?? 15}`;
  if (!jobs.length) return { sent: 0, reason: "aucune nouvelle offre au-dessus du seuil" };
  const msg = renderDigest(jobs, opts.appUrl ?? null);
  await opts.sender.send({ to: opts.to, ...msg });
  await sql`update jobs set notified_at = now() where id in ${sql(jobs.map((j) => j.id))}`;
  return { sent: jobs.length };
}

export async function sendFailureAlert(sender: Sender | null, to: string | undefined, details: string): Promise<boolean> {
  if (!sender || !to) return false;
  await sender.send({ to, subject: "JobRadar : la collecte du jour a échoué", text: details, html: `<pre>${esc(details)}</pre>` });
  return true;
}
