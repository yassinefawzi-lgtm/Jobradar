import type { RawJob } from "../types";
import { decodeEntities, fold } from "../normalize/text";
import { BudgetExceededError } from "./http";
import type { Env } from "./types";
import type { Connector, ConnectorContext, ConnectorResult, SearchQuery } from "./types";

/**
 * HelloWork — collecte autorisée (voir docs/SOURCES.md).
 * 1. Page de résultats (tri par date) → identifiants d'offres.
 * 2. Page de chaque nouvelle offre → données structurées schema.org JobPosting + étiquettes d'en-tête.
 */

const BASE = "https://www.hellowork.com";
const LOCATIONS: Record<SearchQuery["area"], { l: string; ray: number }> = {
  rouen: { l: "Rouen 76000", ray: 30 },
  caen: { l: "Caen 14000", ray: 25 },
};
const MAX_PAGES = 3;

export function searchUrl(q: SearchQuery, page: number, maxAgeDays: number): string {
  const loc = LOCATIONS[q.area];
  const p = new URLSearchParams();
  p.set("k", q.keywords);
  p.set("l", loc.l);
  p.set("ray", String(loc.ray));
  p.append("c", "CDI");
  p.append("c", "CDD");
  p.set("st", "date");
  p.set("d", maxAgeDays <= 1 ? "d" : maxAgeDays <= 7 ? "w" : "m");
  if (page > 1) p.set("p", String(page));
  return `${BASE}/fr-fr/emploi/recherche.html?${p}`;
}

export function jobUrl(id: string): string {
  return `${BASE}/fr-fr/emplois/${id}.html`;
}

/** Identifiants d'offres présents dans une page de résultats, dans l'ordre. */
export function parseSearchIds(html: string): string[] {
  const ids = [...html.matchAll(/data-id-storage-item-id="(\d+)"/g)].map((m) => m[1]);
  return [...new Set(ids)];
}

export interface SearchCard {
  id: string;
  title: string | null;
  company: string | null;
}

/** Cartes de résultats : identifiant, intitulé et entreprise (champs cachés du formulaire "masquer l'offre"). */
export function parseSearchCards(html: string): SearchCard[] {
  const cards = new Map<string, SearchCard>();
  const parts = html.split(/<li[^>]*data-id-storage-item-id="/).slice(1);
  for (const part of parts) {
    const id = part.match(/^(\d+)"/)?.[1];
    if (!id || cards.has(id)) continue;
    const title = part.match(/name="title" value="([^"]*)"/)?.[1];
    const company = part.match(/name="company" value="([^"]*)"/)?.[1];
    cards.set(id, { id, title: title ? decodeEntities(title) : null, company: company ? decodeEntities(company) : null });
  }
  return [...cards.values()];
}

/** Offre minimale issue d'une carte de résultats (sans téléchargement du détail). */
export function cardToRawJob(card: SearchCard): RawJob | null {
  if (!card.title) return null;
  return {
    source: "hellowork",
    sourceJobId: card.id,
    url: jobUrl(card.id),
    title: card.title,
    company: card.company,
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
    extra: { fromSearchCard: true },
  };
}

interface JobPostingLd {
  "@type"?: string;
  title?: string;
  description?: string;
  qualifications?: string;
  skills?: string[] | string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: { name?: string };
  jobLocation?: { address?: { addressLocality?: string; postalCode?: string } } | { address?: { addressLocality?: string; postalCode?: string } }[];
  baseSalary?: { value?: { minValue?: number | string; maxValue?: number | string; value?: number | string; unitText?: string } };
  jobLocationType?: string;
  url?: string;
}

export function parseJobPosting(html: string): JobPostingLd | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld(?:\+|&#x2B;)json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim()) as JobPostingLd | JobPostingLd[];
      const items = Array.isArray(data) ? data : [data];
      const job = items.find((i) => i && i["@type"] === "JobPosting");
      if (job) return job;
    } catch {
      // bloc JSON-LD invalide : on ignore
    }
  }
  return null;
}

/** Texte des étiquettes d'en-tête (lieu, contrat, salaire, télétravail…), juste après le titre. */
export function parseHeaderTags(html: string): string {
  const i = html.indexOf("<h1");
  if (i < 0) return "";
  const end = html.indexOf("Lire dans l", i);
  const seg = html.slice(i, end > i ? end : i + 4000);
  return decodeEntities(seg.replace(/<[^>]+>/g, " | ")).replace(/(\s*\|\s*)+/g, " | ").trim();
}

export function toRawJob(id: string, html: string): RawJob | null {
  const ld = parseJobPosting(html);
  if (!ld?.title) return null;
  const header = parseHeaderTags(html);
  const loc = Array.isArray(ld.jobLocation) ? ld.jobLocation[0] : ld.jobLocation;
  const contract = header.match(/\|\s*(CDI|CDD|Intérim|Travail temporaire|Alternance|Stage|Freelance|Indépendant|Franchise)\b[^|]*/i)?.[0] ?? null;
  const remote = header.match(/Télétravail[^|]*/i)?.[0] ?? (ld.jobLocationType === "TELECOMMUTE" ? "100% télétravail" : null);
  const v = ld.baseSalary?.value;
  // Les sites ne respectent pas toujours le format schema.org : liste ou texte selon les offres.
  const skills = Array.isArray(ld.skills) ? ld.skills.filter((s) => typeof s === "string").join(", ") : typeof ld.skills === "string" ? ld.skills : "";
  // Le profil recherché est parfois déjà inclus dans la description : on évite le doublon.
  const quals = ld.qualifications && !fold(ld.description).includes(fold(ld.qualifications).slice(0, 80)) ? ld.qualifications : null;
  const description = [ld.description, quals ? `<h2>Profil recherché</h2>${quals}` : null, skills ? `<p>Compétences : ${skills}</p>` : null]
    .filter(Boolean)
    .join("\n");
  return {
    source: "hellowork",
    sourceJobId: id,
    url: jobUrl(id),
    title: decodeEntities(ld.title),
    company: ld.hiringOrganization?.name ? decodeEntities(ld.hiringOrganization.name) : null,
    city: loc?.address?.addressLocality ?? null,
    postalCode: loc?.address?.postalCode ?? null,
    lat: null,
    lon: null,
    contractRaw: contract ? contract.replace(/^\|\s*/, "").trim() : null,
    salaryRaw: header.match(/\d[\d\s\u00a0\u202f.,]*(?:-\s*\d[\d\s\u00a0\u202f.,]*)?€[^|]*/)?.[0]?.replace(/[\u00a0\u202f]/g, " ").trim() ?? null,
    salaryStructured: v
      ? { min: v.minValue ?? v.value ?? null, max: v.maxValue ?? null, unit: v.unitText ?? null }
      : null,
    description: description || null,
    descriptionPartial: false,
    publishedAt: ld.datePosted ?? null,
    validThrough: ld.validThrough ?? null,
    remoteRaw: remote,
    extra: { header },
  };
}

export function helloworkConnector(env: Env = process.env): Connector {
  return {
    id: "hellowork",
    label: "HelloWork",
    unavailableReason: () => (env.SOURCE_HELLOWORK_ENABLED === "0" ? "Désactivée (SOURCE_HELLOWORK_ENABLED=0)" : null),
    async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
      const seen = new Set<string>();
      const toFetch: string[] = [];
      const cardsById = new Map<string, SearchCard>();
      const warnings: string[] = [];
      const jobs: RawJob[] = [];
      try {
        for (const q of ctx.queries) {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const html = await ctx.http.text(searchUrl(q, page, ctx.maxAgeDays));
            const ids = parseSearchIds(html);
            for (const card of parseSearchCards(html)) cardsById.set(card.id, card);
            const fresh = ids.filter((id) => !seen.has(id));
            fresh.forEach((id) => seen.add(id));
            for (const id of fresh) if (!ctx.knownIds.has(id)) toFetch.push(id);
            // Résultats triés par date : on s'arrête quand la page est courte ou ne contient que du déjà connu.
            if (ids.length < 15 || fresh.every((id) => ctx.knownIds.has(id))) break;
          }
        }
        // Les offres écartées dès l'intitulé (commercial, magasin…) ne sont pas détaillées : économie de requêtes.
        const detailIds: string[] = [];
        for (const id of toFetch) {
          const card = cardsById.get(id);
          const raw = card && ctx.skipDetail?.(card.title ?? "") ? cardToRawJob(card) : null;
          if (raw) jobs.push(raw);
          else detailIds.push(id);
        }
        ctx.log(`HelloWork : ${seen.size} offres dans les résultats, ${toFetch.length} nouvelles dont ${toFetch.length - detailIds.length} écartées sur l'intitulé, ${detailIds.length} à détailler`);
        for (const id of detailIds) {
          const res = await ctx.http.request(jobUrl(id));
          if (res.status === 404 || res.status === 410) continue;
          if (!res.ok) {
            warnings.push(`Offre ${id} : HTTP ${res.status}`);
            continue;
          }
          try {
            const raw = toRawJob(id, await res.text());
            if (raw) jobs.push(raw);
            else warnings.push(`Offre ${id} : données structurées introuvables`);
          } catch (err) {
            warnings.push(`Offre ${id} : lecture impossible (${err instanceof Error ? err.message : String(err)})`);
          }
        }
      } catch (err) {
        if (err instanceof BudgetExceededError) warnings.push(`${err.message} : collecte partielle, la suite au prochain passage`);
        else throw err;
      }
      return { jobs, seenIds: [...seen], warnings };
    },
  };
}
