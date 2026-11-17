import { normalizeCompany } from "../normalize/job";
import { fold, tokens } from "../normalize/text";

export interface DedupeCandidate {
  canonicalUrl: string;
  fingerprint: string;
  title: string;
  company: string | null;
  city: string | null;
  description: string | null;
}

export interface ExistingJob extends DedupeCandidate {
  id: string;
  canonicalUrls: string[];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function shingles(text: string | null, size = 3): Set<string> {
  const t = tokens(text ?? "").slice(0, 400);
  const out = new Set<string>();
  for (let i = 0; i + size <= t.length; i++) out.add(t.slice(i, i + size).join(" "));
  return out;
}

export interface DuplicateMatch {
  id: string;
  reason: "url" | "empreinte" | "similarite";
  similarity?: number;
}

/**
 * Cherche si une offre existe déjà (même URL canonique, même empreinte entreprise+titre+ville,
 * ou même entreprise et ville avec titre et contenu très proches).
 * La fusion ne supprime jamais de données : l'offre reçoit une source supplémentaire.
 */
export function findDuplicate(candidate: DedupeCandidate, existing: ExistingJob[]): DuplicateMatch | null {
  for (const e of existing) {
    if (e.canonicalUrls.includes(candidate.canonicalUrl)) return { id: e.id, reason: "url" };
  }
  for (const e of existing) {
    if (e.fingerprint === candidate.fingerprint && !candidate.fingerprint.startsWith("?|")) return { id: e.id, reason: "empreinte" };
  }
  const company = normalizeCompany(candidate.company);
  if (!company) return null;
  const titleTokens = new Set(tokens(candidate.title));
  const descShingles = shingles(candidate.description);
  for (const e of existing) {
    if (normalizeCompany(e.company) !== company) continue;
    if (fold(e.city) && fold(candidate.city) && fold(e.city) !== fold(candidate.city)) continue;
    const titleSim = jaccard(titleTokens, new Set(tokens(e.title)));
    if (titleSim < 0.6) continue;
    const descSim = descShingles.size && e.description ? jaccard(descShingles, shingles(e.description)) : null;
    if (titleSim >= 0.85 && (descSim === null || descSim >= 0.3)) return { id: e.id, reason: "similarite", similarity: titleSim };
    if (descSim !== null && descSim >= 0.5) return { id: e.id, reason: "similarite", similarity: descSim };
  }
  return null;
}
