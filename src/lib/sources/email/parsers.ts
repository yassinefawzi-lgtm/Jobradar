import { createHash } from "node:crypto";
import { decodeEntities, htmlToText } from "../../normalize/text";
import type { RawJob } from "../../types";

/**
 * Lecture des e-mails d'alerte emploi. Le contenu des e-mails est une donnée non fiable :
 * on n'en extrait que des champs (titre, entreprise, lieu, salaire, lien), jamais d'instructions.
 */

export interface AlertEmail {
  from: string;
  subject: string;
  html: string | null;
  text: string | null;
  date: Date;
}

export interface ParsedAlert {
  parser: string;
  jobs: RawJob[];
}

/** Expéditeurs pris en charge (et seuls e-mails que JobRadar lit et met à la corbeille). */
export const ALERT_SENDERS = [
  "jobalert.indeed.com",
  "jobalerts-noreply@linkedin.com",
  "jobs-noreply@linkedin.com",
  "welcometothejungle.com",
  "francetravail.fr",
  "apec.fr",
  "emails.hellowork.com",
];

export function isAlertSender(from: string): boolean {
  const f = from.toLowerCase();
  return ALERT_SENDERS.some((s) => f.includes(s));
}

const strip = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function baseJob(source: string, id: string, url: string, title: string): RawJob {
  return {
    source,
    sourceJobId: id,
    url,
    title,
    company: null,
    city: null,
    postalCode: null,
    lat: null,
    lon: null,
    contractRaw: null,
    salaryRaw: null,
    salaryStructured: null,
    description: null,
    descriptionPartial: true,
    publishedAt: null,
    validThrough: null,
    remoteRaw: null,
    extra: { fromEmail: true },
  };
}

/** « Publié à l'instant », « il y a 2 jours », « il y a 3 heures » → date approximative. */
export function relativeToDate(label: string, ref: Date): string | null {
  const l = label.toLowerCase();
  if (/instant|aujourd/.test(l)) return ref.toISOString();
  const m = l.match(/il y a (\d+)\s*(minute|heure|jour|semaine|mois)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { minute: 60_000, heure: 3_600_000, jour: 86_400_000, semaine: 7 * 86_400_000, mois: 30 * 86_400_000 }[m[2] as "jour"];
  return new Date(ref.getTime() - n * unit).toISOString();
}

/** "Épreville (76)" → { city: "Épreville", dept: "76" } */
function splitPlace(place: string): { city: string | null; dept: string | null } {
  const m = place.replace(/^-\s*/, "").match(/^(.*?)\s*\((\d{2,3}|2A|2B)\)\s*$/);
  if (m) return { city: m[1].trim() || null, dept: m[2] };
  const p = place.replace(/^-\s*/, "").trim();
  return { city: p || null, dept: null };
}

/**
 * Liens de suivi : beaucoup d'e-mails encapsulent l'URL réelle en base64 dans le chemin
 * (ex. HelloWork). On tente de la retrouver sans jamais ouvrir le lien.
 */
export function unwrapTracking(url: string): string {
  try {
    const u = new URL(url);
    for (const seg of u.pathname.split("/").reverse()) {
      if (seg.length < 16) continue;
      try {
        const decoded = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
        const m = decoded.match(/https?:\/\/[^\s"'<>]+/);
        if (m) return m[0];
      } catch {
        // pas du base64
      }
    }
    for (const key of ["url", "u", "redirect", "target", "dest"]) {
      const v = u.searchParams.get(key);
      if (v && /^https?:\/\//.test(v)) return v;
    }
  } catch {
    // URL invalide : on garde la valeur d'origine
  }
  return url;
}

// --- Indeed ------------------------------------------------------------------------

export function parseIndeed(mail: AlertEmail): RawJob[] {
  const html = mail.html ?? "";
  const jobs: RawJob[] = [];
  const cards = html.split(/<td[^>]*class="r-l"[^>]*>/).slice(1);
  for (const card of cards) {
    const a = card.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = strip(a[2]);
    const field = (cls: string) => {
      const m = card.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</(?:span|td)>`));
      return m ? strip(m[1]) : null;
    };
    const company = field("r-p");
    const place = splitPlace(field("r-q") ?? "");
    const salary = field("r-u");
    const snippet = field("r-n");
    const age = field("r-s");
    if (!title) continue;
    const job = baseJob("indeed", `mail-${hash(`${title}|${company}|${place.city}`)}`, decodeEntities(a[1]), title);
    job.company = company;
    job.city = place.city;
    job.postalCode = place.dept; // département seul : le géocodage s'en sert pour lever les homonymies
    job.salaryRaw = salary && /€/.test(salary) ? salary : null;
    job.description = snippet;
    job.publishedAt = age ? relativeToDate(age, mail.date) : null;
    job.extra = { fromEmail: true, departement: place.dept };
    jobs.push(job);
  }
  return jobs;
}

// --- Parseur générique par motif d'URL (LinkedIn, WTTJ, France Travail, Apec, HelloWork) ---

interface LinkPattern {
  source: string;
  re: RegExp;
  canonical: (m: RegExpMatchArray) => string;
}

export const LINK_PATTERNS: LinkPattern[] = [
  { source: "linkedin", re: /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/, canonical: (m) => `https://www.linkedin.com/jobs/view/${m[1]}` },
  { source: "wttj", re: /welcometothejungle\.com\/fr\/companies\/([^/?#"]+)\/jobs\/([^/?#"]+)/, canonical: (m) => `https://www.welcometothejungle.com/fr/companies/${m[1]}/jobs/${m[2]}` },
  { source: "francetravail", re: /candidat\.francetravail\.fr\/offres\/recherche\/detail\/([0-9A-Z]+)/, canonical: (m) => `https://candidat.francetravail.fr/offres/recherche/detail/${m[1]}` },
  { source: "apec", re: /apec\.fr\/candidat\/recherche-emploi\.html\/emploi\/detail-offre\/([0-9A-Z]+)/, canonical: (m) => `https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/${m[1]}` },
  { source: "hellowork", re: /hellowork\.com\/fr-fr\/emplois\/(\d+)\.html/, canonical: (m) => `https://www.hellowork.com/fr-fr/emplois/${m[1]}.html` },
];

/** Lit les liens d'offres d'un e-mail : un lien = une offre ; titre = texte du lien. */
export function parseByLinks(mail: AlertEmail): RawJob[] {
  const html = mail.html ?? "";
  const seen = new Map<string, RawJob>();
  for (const m of html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = unwrapTracking(decodeEntities(m[1]));
    const label = strip(m[2]);
    for (const p of LINK_PATTERNS) {
      const hit = href.match(p.re);
      if (!hit) continue;
      const url = p.canonical(hit);
      const id = hit.slice(1).join("/");
      const existing = seen.get(`${p.source}:${id}`);
      // Plusieurs liens par offre (logo, bouton, titre) : on garde le libellé le plus informatif.
      if (existing) {
        if (label.length > existing.title.length && label.length < 150 && !/^(voir|postuler|candidater)/i.test(label)) existing.title = label;
        continue;
      }
      if (!label || label.length > 150) continue;
      seen.set(`${p.source}:${id}`, baseJob(p.source, id, url, label));
    }
  }
  return [...seen.values()].filter((j) => j.title.length >= 4 && !/^(voir|postuler|candidater|découvrir)/i.test(j.title));
}

/** Choisit le lecteur selon l'expéditeur. Retourne null si l'e-mail n'est pas une alerte reconnue. */
export function parseAlertEmail(mail: AlertEmail): ParsedAlert | null {
  if (!isAlertSender(mail.from)) return null;
  if (/jobalert\.indeed\.com/i.test(mail.from)) return { parser: "indeed", jobs: parseIndeed(mail) };
  return { parser: "liens", jobs: parseByLinks(mail) };
}

export function mailText(mail: AlertEmail): string {
  return mail.text ?? htmlToText(mail.html) ?? "";
}
