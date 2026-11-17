import { z } from "zod";

/**
 * Une phrase du CV, de la lettre ou de l'e-mail, avec ses sources.
 * - sources : identifiants de faits (profile/facts.yaml), "annonce" (tiré de l'offre) ou "preferences".
 * - kind "liaison" : phrase de transition sans fait (formule de politesse, intitulé visé…), sans chiffre ni outil.
 */
export const sentenceSchema = z.object({
  text: z.string().min(1).max(1200),
  sources: z.array(z.string()).default([]),
  kind: z.enum(["fait", "annonce", "liaison"]).default("fait"),
  /** Validée explicitement par l'utilisateur malgré une alerte (tracé). */
  userValidated: z.boolean().default(false),
});
export type Sentence = z.infer<typeof sentenceSchema>;

export const VARIANTS = ["growth", "crm", "transfo", "ops"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_LABELS: Record<Variant, string> = {
  growth: "Growth / Acquisition",
  crm: "CRM & automatisation",
  transfo: "Transformation digitale / fonctionnel / AMOA",
  ops: "Data & opérations",
};

export const packSchema = z.object({
  variant: z.enum(VARIANTS),
  cv: z.object({
    title: sentenceSchema,
    summary: z.array(sentenceSchema).max(4),
    skills: z.array(z.string()).max(12),
    experiences: z.array(z.object({ factId: z.string(), bullets: z.array(sentenceSchema).max(5) })),
    projects: z.array(sentenceSchema).max(3).default([]),
  }),
  letter: z.object({ paragraphs: z.array(z.array(sentenceSchema)).min(2).max(5) }),
  email: z.object({ subject: z.string().max(200), body: z.array(sentenceSchema) }),
  answers: z.object({ salary: sentenceSchema, availability: sentenceSchema, why: sentenceSchema }),
  coverage: z.array(
    z.object({ requirement: z.string(), status: z.enum(["couvert", "partiel", "non_couvert"]), factIds: z.array(z.string()) }),
  ),
});
export type Pack = z.infer<typeof packSchema>;

export interface PackIssue {
  path: string;
  level: "erreur" | "alerte";
  message: string;
}

/** Parcourt toutes les phrases d'un pack avec leur chemin (pour l'édition et le contrôle). */
export function* sentences(pack: Pack): Generator<{ path: string; s: Sentence; zone: "cv" | "lettre" | "email" | "reponses" }> {
  yield { path: "cv.title", s: pack.cv.title, zone: "cv" };
  for (const [i, s] of pack.cv.summary.entries()) yield { path: `cv.summary.${i}`, s, zone: "cv" };
  for (const [i, e] of pack.cv.experiences.entries())
    for (const [j, s] of e.bullets.entries()) yield { path: `cv.experiences.${i}.bullets.${j}`, s, zone: "cv" };
  for (const [i, s] of pack.cv.projects.entries()) yield { path: `cv.projects.${i}`, s, zone: "cv" };
  for (const [i, p] of pack.letter.paragraphs.entries())
    for (const [j, s] of p.entries()) yield { path: `letter.paragraphs.${i}.${j}`, s, zone: "lettre" };
  for (const [i, s] of pack.email.body.entries()) yield { path: `email.body.${i}`, s, zone: "email" };
  yield { path: "answers.salary", s: pack.answers.salary, zone: "reponses" };
  yield { path: "answers.availability", s: pack.answers.availability, zone: "reponses" };
  yield { path: "answers.why", s: pack.answers.why, zone: "reponses" };
}

/** Lit ou remplace une phrase par son chemin (ex. "letter.paragraphs.1.0"). */
export function getAt(pack: Pack, p: string): Sentence | undefined {
  let cur: unknown = pack;
  for (const k of p.split(".")) cur = cur == null ? undefined : (cur as Record<string, unknown>)[k];
  return cur as Sentence | undefined;
}

export function letterText(pack: Pack): string {
  return pack.letter.paragraphs.map((p) => p.map((s) => s.text).join(" ")).join("\n\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /\p{L}|\d/u.test(w)).length;
}
