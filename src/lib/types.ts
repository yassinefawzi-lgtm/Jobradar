export type Contract = "CDI" | "CDD" | "INTERIM" | "STAGE" | "ALTERNANCE" | "FREELANCE" | "AUTRE" | "INCONNU";
export type Remote = "total" | "hybride" | "aucun" | "inconnu";
export type Zone = "rouen" | "caen" | "teletravail" | "autre" | "inconnue";
export type Availability = "active" | "expiree" | "inconnue";

export const STATUSES = [
  "nouvelle",
  "a_etudier",
  "a_postuler",
  "plus_tard",
  "ignoree",
  "candidature_envoyee",
  "relance_prevue",
  "entretien",
  "refus",
  "offre_recue",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  nouvelle: "Nouvelle",
  a_etudier: "À étudier",
  a_postuler: "À postuler",
  plus_tard: "Plus tard",
  ignoree: "Ignorée",
  candidature_envoyee: "Candidature envoyée",
  relance_prevue: "Relance prévue",
  entretien: "Entretien",
  refus: "Refus",
  offre_recue: "Offre reçue",
};

export const IGNORE_REASONS = [
  "pas_mon_metier",
  "trop_commercial",
  "trop_technique",
  "trop_loin",
  "salaire_insuffisant",
  "niveau_trop_eleve",
  "contrat",
  "autre",
] as const;
export type IgnoreReason = (typeof IGNORE_REASONS)[number];

export const IGNORE_LABELS: Record<IgnoreReason, string> = {
  pas_mon_metier: "Pas mon métier",
  trop_commercial: "Trop commercial",
  trop_technique: "Trop technique",
  trop_loin: "Trop loin",
  salaire_insuffisant: "Salaire insuffisant",
  niveau_trop_eleve: "Niveau trop élevé",
  contrat: "Contrat",
  autre: "Autre",
};

/** Rémunération normalisée. Les montants "annual" sont toujours en brut annuel quand le type est connu. */
export interface Salary {
  /** Texte d'origine tel que publié (ou reconstruit depuis les données structurées). */
  raw: string | null;
  /** Montants publiés, dans l'unité publiée. */
  min: number | null;
  max: number | null;
  period: "annee" | "mois" | "heure" | "jour" | null;
  kind: "brut" | "net" | "inconnu";
  /** Conversion en brut annuel (si période connue). */
  annualMin: number | null;
  annualMax: number | null;
  /** Nombre de mois payés retenu pour la conversion mensuelle → annuelle. */
  months: number | null;
  /** true si le montant vient d'une estimation de la source (jamais présenté comme publié). */
  estimated: boolean;
  /** Problèmes détectés (montants incohérents, inversion min/max…). */
  warnings: string[];
}

/** Offre collectée par un connecteur, avant normalisation. */
export interface RawJob {
  source: string;
  sourceJobId: string;
  url: string;
  title: string;
  company: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  contractRaw: string | null;
  salaryRaw: string | null;
  salaryStructured: {
    min: number | string | null;
    max: number | string | null;
    unit: string | null;
    estimated?: boolean;
  } | null;
  description: string | null;
  descriptionPartial: boolean;
  publishedAt: string | null;
  validThrough: string | null;
  remoteRaw: string | null;
  extra?: Record<string, unknown>;
}

export interface NormalizedJob {
  source: string;
  sourceJobId: string;
  url: string;
  canonicalUrl: string;
  fingerprint: string;
  title: string;
  company: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lon: number | null;
  distanceKm: number | null;
  zone: Zone;
  contract: Contract;
  contractMonths: number | null;
  remote: Remote;
  salary: Salary | null;
  description: string | null;
  descriptionPartial: boolean;
  publishedAt: Date | null;
  validThrough: Date | null;
  raw: RawJob;
}
