import { z } from "zod";

/** Familles de métiers (docs/SPEC.md §2). */
export const FAMILIES = {
  A: "Marketing digital",
  B: "CRM et automatisation",
  C: "Transformation digitale",
  D: "Conseil fonctionnel et AMOA",
  E: "Data et opérations",
  F: "Transversal",
} as const;
export type Family = keyof typeof FAMILIES;

export const preferencesSchema = z.object({
  rouenRadiusKm: z.number().min(5).max(150),
  caenRadiusKm: z.number().min(0).max(150),
  acceptCaen: z.boolean(),
  acceptFullRemote: z.boolean(),
  acceptHybridElsewhere: z.boolean(),
  contracts: z.object({ CDI: z.boolean(), CDD: z.boolean(), INTERIM: z.boolean(), STAGE: z.boolean(), ALTERNANCE: z.boolean(), FREELANCE: z.boolean() }),
  minCddMonths: z.number().min(0).max(36),
  minAnnualGross: z.number().min(0),
  preferredAnnualGross: z.number().min(0),
  maxYearsRequired: z.number().min(0).max(20),
  weights: z.object({
    missions: z.number().min(0),
    experience: z.number().min(0),
    location: z.number().min(0),
    salary: z.number().min(0),
    freshness: z.number().min(0),
  }),
  excludedCompanies: z.array(z.string()),
  favoriteCompanies: z.array(z.string()),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const DEFAULT_PREFERENCES: Preferences = {
  rouenRadiusKm: 30,
  caenRadiusKm: 25,
  acceptCaen: true,
  acceptFullRemote: true,
  acceptHybridElsewhere: false,
  contracts: { CDI: true, CDD: true, INTERIM: false, STAGE: false, ALTERNANCE: false, FREELANCE: false },
  minCddMonths: 6,
  minAnnualGross: 31_000,
  preferredAnnualGross: 35_000,
  maxYearsRequired: 4,
  weights: { missions: 35, experience: 20, location: 20, salary: 15, freshness: 10 },
  excludedCompanies: [],
  favoriteCompanies: [],
};

/** Fusionne des préférences enregistrées (partielles, validées) avec les valeurs par défaut. */
export function mergePreferences(stored: unknown): Preferences {
  if (!stored || typeof stored !== "object") return DEFAULT_PREFERENCES;
  const s = stored as Partial<Preferences>;
  const merged = {
    ...DEFAULT_PREFERENCES,
    ...s,
    contracts: { ...DEFAULT_PREFERENCES.contracts, ...(s.contracts ?? {}) },
    weights: { ...DEFAULT_PREFERENCES.weights, ...(s.weights ?? {}) },
  };
  const parsed = preferencesSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
}
