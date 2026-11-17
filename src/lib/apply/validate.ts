import { fold } from "../normalize/text";
import type { Fact } from "../profile/facts";
import { OTHER_SKILLS, OWNED_SKILLS } from "../scoring/keywords";
import { type Pack, type PackIssue, letterText, sentences, wordCount, type Sentence } from "./pack";

/**
 * Contrôle anti-invention (CLAUDE.md) : chaque phrase doit être rattachée à des faits valides,
 * et ne contenir aucun chiffre ni outil absent de ses sources. Toute erreur bloque l'export,
 * sauf si l'utilisateur a explicitement validé la phrase.
 */

export const FORBIDDEN_PHRASES = [
  "passionne",
  "dynamique",
  "je me permets",
  "fort de",
  "forte de",
  "n hesitez pas",
  "vif interet",
  "veritable atout",
];

const LEXICON = [...OWNED_SKILLS, ...OTHER_SKILLS].flatMap((s) => s.patterns.map((p) => ({ label: s.label, p })));

/** Nombres présents dans un texte, normalisés ("10 000" → "10000", "2,5" → "2.5"). Les années comptent aussi. */
export function numbersIn(text: string): string[] {
  const t = text.replace(/[  ]/g, " ");
  const out: string[] = [];
  for (const m of t.matchAll(/\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) {
    out.push(m[0].replace(/[ .](?=\d{3}\b)/g, "").replace(",", "."));
  }
  return out;
}

function termsIn(textF: string): string[] {
  return [...new Set(LEXICON.filter((l) => l.p.test(textF)).map((l) => l.label))];
}

export interface ValidationContext {
  facts: Map<string, Fact>;
  /** Texte complet de l'offre (titre + entreprise + description) : seule source admise pour "annonce". */
  offerText: string;
  /** Textes admis pour la source "preferences" (fourchette de salaire, etc.). */
  preferencesText?: string;
}

export function validateSentence(s: Sentence, ctx: ValidationContext): string[] {
  const problems: string[] = [];
  const textF = fold(s.text);
  const sourceTexts: string[] = [];
  for (const src of s.sources) {
    if (src === "annonce") sourceTexts.push(ctx.offerText);
    else if (src === "preferences") sourceTexts.push(ctx.preferencesText ?? "");
    else {
      const f = ctx.facts.get(src);
      if (!f) problems.push(`source inconnue « ${src} »`);
      else if (!f.valid) problems.push(`fait non validé « ${src} »`);
      else sourceTexts.push(`${f.text} ${f.letter ?? ""}`);
    }
  }
  const sourceF = fold(sourceTexts.join(" "));

  if (s.kind !== "liaison" && s.sources.length === 0) problems.push("phrase sans source");

  const sourceNumbers = new Set(numbersIn(sourceTexts.join(" ")));
  const missingNumbers = numbersIn(s.text).filter((n) => !sourceNumbers.has(n));
  if (missingNumbers.length) problems.push(`chiffre absent des sources : ${missingNumbers.join(", ")}`);

  const missingTerms = termsIn(textF).filter((label) => !LEXICON.some((l) => l.label === label && l.p.test(sourceF)));
  if (missingTerms.length) problems.push(`compétence ou outil absent des sources : ${missingTerms.join(", ")}`);

  const forbidden = FORBIDDEN_PHRASES.filter((p) => new RegExp(`\\b${p}\\b`).test(textF));
  if (forbidden.length) problems.push(`formule interdite : ${forbidden.join(", ")}`);
  return problems;
}

export interface ValidationResult {
  ok: boolean;
  issues: PackIssue[];
  /** Phrases fautives par chemin (pour le surlignage). */
  byPath: Record<string, string[]>;
}

export function validatePack(pack: Pack, ctx: ValidationContext): ValidationResult {
  const issues: PackIssue[] = [];
  const byPath: Record<string, string[]> = {};
  for (const { path, s } of sentences(pack)) {
    const problems = validateSentence(s, ctx);
    if (!problems.length) continue;
    byPath[path] = problems;
    for (const message of problems) {
      issues.push({ path, level: s.userValidated ? "alerte" : "erreur", message: s.userValidated ? `${message} (validé par toi)` : message });
    }
  }
  for (const e of pack.cv.experiences) {
    if (!ctx.facts.get(e.factId)?.valid) issues.push({ path: "cv.experiences", level: "erreur", message: `expérience inconnue ou non validée : ${e.factId}` });
  }
  const words = wordCount(letterText(pack));
  if (words < 150 || words > 280) issues.push({ path: "letter", level: "alerte", message: `lettre de ${words} mots (objectif 180 à 250)` });
  if (/a preciser/.test(fold(pack.answers.availability.text))) issues.push({ path: "answers.availability", level: "alerte", message: "disponibilité à préciser" });
  return { ok: !issues.some((i) => i.level === "erreur"), issues, byPath };
}
