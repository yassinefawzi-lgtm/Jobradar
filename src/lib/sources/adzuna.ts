import type { RawJob } from "../types";
import { BudgetExceededError } from "./http";
import type { Env } from "./types";
import type { Connector, ConnectorContext, ConnectorResult, SearchQuery } from "./types";

/** Adzuna Jobs API (France) — https://developer.adzuna.com. Clés : ADZUNA_APP_ID, ADZUNA_APP_KEY. */

const WHERE: Record<SearchQuery["area"], { where: string; distanceKm: number }> = {
  rouen: { where: "Rouen", distanceKm: 30 },
  caen: { where: "Caen", distanceKm: 25 },
};
const MAX_PAGES = 2;
const PER_PAGE = 50;

interface AdzunaJob {
  id: string;
  title: string;
  description?: string;
  redirect_url: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  latitude?: number;
  longitude?: number;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_type?: string;
  contract_time?: string;
}

export function adzunaUrl(appId: string, appKey: string, q: SearchQuery, page: number, maxAgeDays: number): string {
  const p = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: q.keywords,
    where: WHERE[q.area].where,
    distance: String(WHERE[q.area].distanceKm),
    max_days_old: String(Math.max(1, maxAgeDays)),
    results_per_page: String(PER_PAGE),
    sort_by: "date",
    "content-type": "application/json",
  });
  return `https://api.adzuna.com/v1/api/jobs/fr/search/${page}?${p}`;
}

export function adzunaToRaw(j: AdzunaJob): RawJob {
  const area = j.location?.area ?? [];
  const predicted = String(j.salary_is_predicted ?? "0") === "1";
  return {
    source: "adzuna",
    sourceJobId: String(j.id),
    url: j.redirect_url,
    title: j.title,
    company: j.company?.display_name ?? null,
    city: area.length ? area[area.length - 1] : (j.location?.display_name ?? null),
    postalCode: null,
    lat: typeof j.latitude === "number" ? j.latitude : null,
    lon: typeof j.longitude === "number" ? j.longitude : null,
    contractRaw: j.contract_type ?? null,
    salaryRaw: null,
    salaryStructured:
      j.salary_min || j.salary_max
        ? { min: j.salary_min ?? null, max: j.salary_max ?? null, unit: "YEAR", estimated: predicted }
        : null,
    description: j.description ?? null,
    // L'API Adzuna ne renvoie qu'un extrait de la description.
    descriptionPartial: true,
    publishedAt: j.created ?? null,
    validThrough: null,
    remoteRaw: null,
    extra: { contract_time: j.contract_time },
  };
}

export function adzunaConnector(env: Env = process.env): Connector {
  const appId = env.ADZUNA_APP_ID?.trim();
  const appKey = env.ADZUNA_APP_KEY?.trim();
  return {
    id: "adzuna",
    label: "Adzuna",
    unavailableReason: () => (!appId || !appKey ? "Clés ADZUNA_APP_ID / ADZUNA_APP_KEY non configurées" : null),
    async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
      const jobs = new Map<string, RawJob>();
      const warnings: string[] = [];
      try {
        for (const q of ctx.queries) {
          for (let page = 1; page <= MAX_PAGES; page++) {
            const data = await ctx.http.json<{ results?: AdzunaJob[] }>(adzunaUrl(appId!, appKey!, q, page, ctx.maxAgeDays));
            const results = data.results ?? [];
            for (const r of results) jobs.set(String(r.id), adzunaToRaw(r));
            if (results.length < PER_PAGE) break;
          }
        }
      } catch (err) {
        if (err instanceof BudgetExceededError) warnings.push(`${err.message} : collecte partielle`);
        else throw err;
      }
      return { jobs: [...jobs.values()], seenIds: [...jobs.keys()], warnings };
    },
  };
}
