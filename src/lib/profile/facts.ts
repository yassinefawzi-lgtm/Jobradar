import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";

/** Schéma de profile/facts.yaml (source de vérité du CV et des lettres). */
const statut = z.enum(["valide", "a_confirmer"]);
const familles = z.array(z.enum(["A", "B", "C", "D", "E", "F"])).default([]);
const id = z.string().regex(/^[a-z]+\.[a-z0-9-]+$/, "identifiant attendu du type « real.mon-fait »");

const realisation = z.object({ id, texte: z.string().min(5), lettre: z.string().optional(), familles, statut });
export const factsSchema = z.object({
  identite: z.object({
    nom: z.string(),
    titre_cv: z.string(),
    localisation: z.string(),
    mobilite: z.string().optional(),
    email_candidature: z.string(),
    telephone: z.string().optional(),
    site: z.string().optional(),
    linkedin: z.string().optional(),
    langues: z.array(z.object({ langue: z.string(), niveau: z.string(), statut })).default([]),
  }),
  formation: z.array(z.object({ id, intitule: z.string(), ecole: z.string(), periode: z.string(), detail: z.string().optional(), niveau: z.string().optional(), statut })),
  experiences: z.array(
    z.object({
      id,
      poste: z.string(),
      entreprise: z.string().optional(),
      clients: z.string().optional(),
      periode: z.string(),
      statut: statut.default("valide"),
      realisations: z.array(realisation).default([]),
    }),
  ),
  projets_personnels: z.array(realisation).default([]),
  competences: z.array(
    z.object({ id, nom: z.string(), outils: z.array(z.string()).default([]), preuves: z.array(z.string()).default([]), source: z.string().optional(), statut }),
  ),
});
export type Facts = z.infer<typeof factsSchema>;

export type FactKind = "identite" | "formation" | "experience" | "realisation" | "projet" | "competence" | "langue";

/** Un fait citable : identifiant + tout le texte qui fait foi pour le contrôle anti-invention. */
export interface Fact {
  id: string;
  kind: FactKind;
  label: string;
  text: string;
  letter?: string;
  families: string[];
  parent?: string;
  valid: boolean;
}

export function parseFactsYaml(source: string): { facts: Facts; errors: null } | { facts: null; errors: string[] } {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (err) {
    return { facts: null, errors: [`YAML invalide : ${err instanceof Error ? err.message : String(err)}`] };
  }
  const parsed = factsSchema.safeParse(raw);
  if (!parsed.success) {
    return { facts: null, errors: parsed.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`) };
  }
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const f of flattenFacts(parsed.data)) {
    if (ids.has(f.id)) errors.push(`Identifiant en double : ${f.id}`);
    ids.add(f.id);
  }
  for (const c of parsed.data.competences) {
    for (const p of c.preuves) if (!ids.has(p)) errors.push(`${c.id} : preuve inconnue « ${p} »`);
  }
  return errors.length ? { facts: null, errors } : { facts: parsed.data, errors: null };
}

export function flattenFacts(f: Facts): Fact[] {
  const out: Fact[] = [];
  const idn = f.identite;
  out.push({
    id: "identite",
    kind: "identite",
    label: idn.nom,
    text: [idn.nom, idn.titre_cv, idn.localisation, idn.mobilite, idn.email_candidature, idn.telephone, idn.site, idn.linkedin].filter(Boolean).join(" · "),
    families: [],
    valid: true,
  });
  for (const l of idn.langues) {
    out.push({ id: `langue.${slug(l.langue)}`, kind: "langue", label: l.langue, text: `${l.langue} : ${l.niveau}`, families: [], valid: l.statut === "valide" });
  }
  for (const fo of f.formation) {
    out.push({ id: fo.id, kind: "formation", label: fo.intitule, text: [fo.intitule, fo.ecole, fo.periode, fo.detail, fo.niveau].filter(Boolean).join(" · "), families: [], valid: fo.statut === "valide" });
  }
  for (const e of f.experiences) {
    out.push({ id: e.id, kind: "experience", label: e.poste, text: [e.poste, e.entreprise, e.clients, e.periode].filter(Boolean).join(" · "), families: [], valid: e.statut === "valide" });
    for (const r of e.realisations) {
      out.push({ id: r.id, kind: "realisation", label: r.texte.slice(0, 60), text: r.texte, letter: r.lettre, families: r.familles, parent: e.id, valid: r.statut === "valide" && e.statut === "valide" });
    }
  }
  for (const p of f.projets_personnels) {
    out.push({ id: p.id, kind: "projet", label: p.texte.slice(0, 60), text: p.texte, letter: p.lettre, families: p.familles, valid: p.statut === "valide" });
  }
  for (const c of f.competences) {
    out.push({ id: c.id, kind: "competence", label: c.nom, text: [c.nom, ...c.outils].join(" · "), families: [], valid: c.statut === "valide" });
  }
  return out;
}

function slug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function factsHash(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

/** Lit profile/facts.yaml depuis le dépôt (inclus dans le déploiement via outputFileTracingIncludes). */
export function readFactsFile(): string {
  return readFileSync(path.join(process.cwd(), "profile", "facts.yaml"), "utf8");
}

export function factIndex(facts: Fact[]): Map<string, Fact> {
  return new Map(facts.map((f) => [f.id, f]));
}
