import type { RawJob } from "../types";
import type { PoliteHttp } from "./http";

export interface SearchQuery {
  keywords: string;
  /** Zone de recherche. */
  area: "rouen" | "caen";
}

export interface ConnectorContext {
  http: PoliteHttp;
  queries: SearchQuery[];
  /** Fenêtre de recherche en jours (rattrapage initial plus long). */
  maxAgeDays: number;
  /** Identifiants déjà connus pour cette source : le détail n'est pas re-téléchargé. */
  knownIds: Set<string>;
  log: (msg: string) => void;
  /** Vrai si l'intitulé suffit à écarter l'offre : la source peut alors éviter de télécharger le détail. */
  skipDetail?: (title: string) => boolean;
}

export interface ConnectorResult {
  jobs: RawJob[];
  /** Identifiants vus dans les résultats (y compris déjà connus) : sert au suivi de disponibilité. */
  seenIds: string[];
  warnings: string[];
  /**
   * Appelé après l'enregistrement, avec les offres dont l'enregistrement a échoué (clés "source:id").
   * Sert aux e-mails : corbeille seulement pour les e-mails entièrement enregistrés.
   */
  commit?: (failed: Set<string>) => Promise<number>;
}

export interface Connector {
  id: string;
  label: string;
  /** Raison pour laquelle la source n'est pas utilisable (clé manquante, désactivée…), ou null. */
  unavailableReason(): string | null;
  fetch(ctx: ConnectorContext): Promise<ConnectorResult>;
}

/** Mots-clés de recherche : variantes des six familles (docs/SPEC.md §2). */
export const DEFAULT_KEYWORDS = [
  "marketing digital",
  "growth marketing",
  "acquisition",
  "SEO SEA",
  "CRM",
  "marketing automation",
  "automatisation",
  "transformation digitale",
  "chef de projet digital",
  "AMOA",
  "consultant fonctionnel",
  "business analyst",
  "data operations",
  "amélioration des processus",
];

export function defaultQueries(includeCaen: boolean): SearchQuery[] {
  const q: SearchQuery[] = DEFAULT_KEYWORDS.map((keywords) => ({ keywords, area: "rouen" as const }));
  if (includeCaen) q.push(...DEFAULT_KEYWORDS.slice(0, 8).map((keywords) => ({ keywords, area: "caen" as const })));
  return q;
}

/** Variables d'environnement lues par les connecteurs (injectables dans les tests). */
export type Env = Record<string, string | undefined>;
