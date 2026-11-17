import type { Contract, NormalizedJob, RawJob, Remote, Zone } from "../types";
import { distanceKm, type GeoPoint } from "../geo/distance";
import { normalizeSalary } from "./salary";
import { cleanTitle, fold, htmlToText } from "./text";

export function normalizeContract(raw: string | null, title = "", description = ""): { contract: Contract; months: number | null } {
  const f = fold(`${raw ?? ""}`);
  const all = fold(`${raw ?? ""} ${title}`);
  const months = (() => {
    const m = fold(`${raw ?? ""} ${title} ${description.slice(0, 800)}`).match(/\b(?:cdd|contrat|duree|mission)\D{0,20}(\d{1,2}) mois\b/);
    return m ? Number(m[1]) : null;
  })();
  if (/\b(alternance|apprentissage|apprenti|contrat pro|professionnalisation)\b/.test(all)) return { contract: "ALTERNANCE", months };
  if (/\b(stage|stagiaire|internship)\b/.test(all)) return { contract: "STAGE", months };
  if (/\b(interim|travail temp|mis|mission interim|temporaire)\b/.test(f)) return { contract: "INTERIM", months };
  if (/\b(cdi|permanent|indetermine)\b/.test(f)) return { contract: "CDI", months: null };
  if (/\b(cdd|contract|determine|saisonnier)\b/.test(f)) return { contract: "CDD", months };
  if (/\b(freelance|independant|liberal|franchise|portage|mandataire)\b/.test(all)) return { contract: "FREELANCE", months };
  if (/\b(cdi)\b/.test(all)) return { contract: "CDI", months: null };
  if (/\b(cdd)\b/.test(all)) return { contract: "CDD", months };
  if (f) return { contract: "AUTRE", months };
  return { contract: "INCONNU", months };
}

export function detectRemote(...texts: (string | null | undefined)[]): Remote {
  const f = fold(texts.filter(Boolean).join(" "));
  if (!f) return "inconnu";
  if (/\b(100 ?%? ?(en )?teletravail|full ?remote|teletravail (total|complet|integral)|entierement a distance|remote first)\b/.test(f)) return "total";
  if (/\b(teletravail (partiel|possible|occasionnel|frequent|regulier|hybride)|hybride|\d (jours?|j) (de )?teletravail|teletravail \d|remote partiel)\b/.test(f)) return "hybride";
  if (/\b(pas de teletravail|teletravail non|sans teletravail|100 ?%? ?sur site|presentiel)\b/.test(f)) return "aucun";
  if (/\bteletravail\b/.test(f)) return "hybride";
  return "inconnu";
}

const TRACKING_PARAMS = /^(utm_|gclid|fbclid|msclkid|mc_|ref$|refid$|from$|source$|trk|tracking|campaign|xtor|origin$|cid$)/i;

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    const s = u.toString();
    return s.endsWith("/") && u.pathname !== "/" ? s.slice(0, -1) : s;
  } catch {
    return url.trim();
  }
}

const COMPANY_NOISE = /\b(sas|sasu|sarl|sa|eurl|groupe|group|france|h f)\b/g;

export function normalizeCompany(company: string | null): string {
  return fold(company).replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function fingerprint(title: string, company: string | null, city: string | null): string {
  return [normalizeCompany(company) || "?", fold(cleanTitle(title)), fold(city) || "?"].join("|");
}

export const CENTERS: Record<"rouen" | "caen", GeoPoint> = {
  rouen: { lat: 49.4431, lon: 1.0993 },
  caen: { lat: 49.1829, lon: -0.3707 },
};

export interface ZoneSettings {
  rouenRadiusKm: number;
  caenRadiusKm: number;
}

export function computeZone(
  point: GeoPoint | null,
  remote: Remote,
  settings: ZoneSettings,
): { zone: Zone; distanceKm: number | null } {
  if (point) {
    const dRouen = distanceKm(point, CENTERS.rouen);
    const dCaen = distanceKm(point, CENTERS.caen);
    if (dRouen <= settings.rouenRadiusKm) return { zone: "rouen", distanceKm: dRouen };
    if (dCaen <= settings.caenRadiusKm) return { zone: "caen", distanceKm: dCaen };
    if (remote === "total") return { zone: "teletravail", distanceKm: dRouen };
    return { zone: "autre", distanceKm: dRouen };
  }
  if (remote === "total") return { zone: "teletravail", distanceKm: null };
  return { zone: "inconnue", distanceKm: null };
}

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeJob(raw: RawJob, settings: ZoneSettings): NormalizedJob {
  const title = cleanTitle(raw.title);
  const description = htmlToText(raw.description);
  const { contract, months } = normalizeContract(raw.contractRaw, raw.title, description ?? "");
  const remote = detectRemote(raw.remoteRaw, raw.title, description);
  const point = raw.lat !== null && raw.lon !== null ? { lat: raw.lat, lon: raw.lon } : null;
  const { zone, distanceKm: dist } = computeZone(point, remote, settings);
  return {
    source: raw.source,
    sourceJobId: raw.sourceJobId,
    url: raw.url,
    canonicalUrl: canonicalUrl(raw.url),
    fingerprint: fingerprint(title, raw.company, raw.city),
    title,
    company: raw.company?.trim() || null,
    city: raw.city?.trim() || null,
    postalCode: raw.postalCode,
    lat: raw.lat,
    lon: raw.lon,
    distanceKm: dist !== null ? Math.round(dist * 10) / 10 : null,
    zone,
    contract,
    contractMonths: months,
    remote,
    salary: normalizeSalary({ raw: raw.salaryRaw, structured: raw.salaryStructured }),
    description,
    descriptionPartial: raw.descriptionPartial,
    publishedAt: toDate(raw.publishedAt),
    validThrough: toDate(raw.validThrough),
    raw,
  };
}
