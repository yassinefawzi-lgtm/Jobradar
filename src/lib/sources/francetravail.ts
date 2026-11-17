import type { RawJob } from "../types";
import { BudgetExceededError } from "./http";
import type { Env } from "./types";
import type { Connector, ConnectorContext, ConnectorResult, SearchQuery } from "./types";

/**
 * France Travail — API Offres d'emploi v2 (https://francetravail.io).
 * OAuth2 client credentials : FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET.
 */

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
const SCOPE = "api_offresdemploiv2 o2dsoffre";
/** Codes INSEE des communes de référence. */
const COMMUNES: Record<SearchQuery["area"], { commune: string; distance: number }> = {
  rouen: { commune: "76540", distance: 30 },
  caen: { commune: "14118", distance: 25 },
};
const PAGE_SIZE = 150;

interface FtOffre {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  lieuTravail?: { libelle?: string; latitude?: number; longitude?: number; codePostal?: string; commune?: string };
  entreprise?: { nom?: string };
  typeContrat?: string;
  typeContratLibelle?: string;
  dureeTravailLibelle?: string;
  salaire?: { libelle?: string; commentaire?: string; complement1?: string; complement2?: string };
  experienceLibelle?: string;
  origineOffre?: { urlOrigine?: string };
  competences?: { libelle?: string }[];
  formations?: { niveauLibelle?: string; domaineLibelle?: string }[];
}

export function ftToRaw(o: FtOffre): RawJob {
  const city = o.lieuTravail?.libelle?.replace(/^\d{2,3}\s*-\s*/, "").trim() ?? null;
  const extras = [
    o.experienceLibelle ? `Expérience : ${o.experienceLibelle}` : null,
    o.formations?.length ? `Formation : ${o.formations.map((f) => [f.niveauLibelle, f.domaineLibelle].filter(Boolean).join(" ")).join(" ; ")}` : null,
    o.competences?.length ? `Compétences : ${o.competences.map((c) => c.libelle).filter(Boolean).join(", ")}` : null,
  ].filter(Boolean);
  return {
    source: "francetravail",
    sourceJobId: o.id,
    url: `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(o.id)}`,
    title: o.intitule,
    company: o.entreprise?.nom ?? null,
    city,
    postalCode: o.lieuTravail?.codePostal ?? null,
    lat: typeof o.lieuTravail?.latitude === "number" ? o.lieuTravail.latitude : null,
    lon: typeof o.lieuTravail?.longitude === "number" ? o.lieuTravail.longitude : null,
    contractRaw: [o.typeContrat, o.typeContratLibelle].filter(Boolean).join(" ") || null,
    salaryRaw: [o.salaire?.libelle, o.salaire?.commentaire, o.salaire?.complement1, o.salaire?.complement2].filter(Boolean).join(" ; ") || null,
    salaryStructured: null,
    description: [o.description, ...extras].filter(Boolean).join("\n\n") || null,
    descriptionPartial: false,
    publishedAt: o.dateCreation ?? null,
    validThrough: null,
    remoteRaw: null,
    extra: { origine: o.origineOffre?.urlOrigine ?? null, actualisation: o.dateActualisation ?? null },
  };
}

function isoNoMs(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function franceTravailConnector(env: Env = process.env): Connector {
  const clientId = env.FRANCE_TRAVAIL_CLIENT_ID?.trim();
  const clientSecret = env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim();
  return {
    id: "francetravail",
    label: "France Travail",
    unavailableReason: () => (!clientId || !clientSecret ? "Identifiants FRANCE_TRAVAIL_CLIENT_ID / _SECRET non configurés" : null),
    async fetch(ctx: ConnectorContext): Promise<ConnectorResult> {
      const tokenRes = await ctx.http.json<{ access_token?: string }>(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId!, client_secret: clientSecret!, scope: SCOPE }).toString(),
      });
      if (!tokenRes.access_token) throw new Error("France Travail : jeton d'accès non obtenu");
      const auth = { Authorization: `Bearer ${tokenRes.access_token}`, Accept: "application/json" };
      const jobs = new Map<string, RawJob>();
      const warnings: string[] = [];
      const now = new Date();
      const since = new Date(now.getTime() - Math.max(1, ctx.maxAgeDays) * 86_400_000);
      try {
        for (const q of ctx.queries) {
          const p = new URLSearchParams({
            motsCles: q.keywords,
            commune: COMMUNES[q.area].commune,
            distance: String(COMMUNES[q.area].distance),
            minCreationDate: isoNoMs(since),
            maxCreationDate: isoNoMs(now),
            range: `0-${PAGE_SIZE - 1}`,
          });
          const res = await ctx.http.request(`${SEARCH_URL}?${p}`, { headers: auth });
          if (res.status === 204) continue; // aucun résultat
          if (!res.ok && res.status !== 206) throw new Error(`France Travail : HTTP ${res.status}`);
          const data = (await res.json()) as { resultats?: FtOffre[] };
          for (const o of data.resultats ?? []) jobs.set(o.id, ftToRaw(o));
        }
      } catch (err) {
        if (err instanceof BudgetExceededError) warnings.push(`${err.message} : collecte partielle`);
        else throw err;
      }
      return { jobs: [...jobs.values()], seenIds: [...jobs.keys()], warnings };
    },
  };
}
