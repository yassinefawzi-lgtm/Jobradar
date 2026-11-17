import type { Salary } from "../types";
import { fold } from "./text";

type Period = NonNullable<Salary["period"]>;

/** Heures mensuelles légales (35 h) et jours travaillés annuels utilisés pour les conversions. */
export const HOURS_PER_MONTH = 151.67;
export const DAYS_PER_YEAR = 218;
/** Ratio brut → net indicatif pour un salarié non cadre du privé (estimation, jamais présentée comme publiée). */
export const NET_RATIO = 0.78;

const MIN_PLAUSIBLE_ANNUAL = 10_000;
const MAX_PLAUSIBLE_ANNUAL = 250_000;

function toNumber(s: string): number | null {
  const cleaned = s.replace(/[\s  ]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function periodFromUnit(unit: string | null | undefined): Period | null {
  switch ((unit ?? "").toUpperCase()) {
    case "YEAR":
    case "ANNEE":
    case "ANNUEL":
      return "annee";
    case "MONTH":
    case "MOIS":
    case "MENSUEL":
      return "mois";
    case "HOUR":
    case "HEURE":
    case "HORAIRE":
      return "heure";
    case "DAY":
    case "JOUR":
      return "jour";
    default:
      return null;
  }
}

function detectPeriod(f: string): Period | null {
  // f est déjà "replié" (minuscules, sans accents ni ponctuation) : "€/an" devient " an".
  if (/\b(par an|annuel|annuelle|an)\b/.test(f)) return "annee";
  if (/\b(horaire|heure|de l heure|par heure)\b/.test(f)) return "heure";
  if (/\b(par jour|journalier|jour|tjm)\b/.test(f)) return "jour";
  if (/\b(par mois|mensuel|mensuelle|mois)\b/.test(f)) return "mois";
  return null;
}

function detectMonths(f: string): number | null {
  const m = f.match(/sur (\d{2})(?: 0)? mois/);
  if (m) return Number(m[1]);
  if (/\b13 ?(e|eme|ieme)? mois\b/.test(f)) return 13;
  return null;
}

/** Extrait les montants d'un texte libre ("De 30 000 € à 40 000 € par an", "35-40k€", "12 € de l'heure"). */
export function extractAmounts(raw: string): number[] {
  const text = raw.replace(/ | /g, " ");
  const out: number[] = [];
  const re = /(\d{1,3}(?:[ .]\d{3})+|\d+(?:[.,]\d+)?)\s*(k)?(?![\d])/gi;
  for (const m of text.matchAll(re)) {
    const numStr = m[1].includes(" ") || /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/[ .]/g, "") : m[1];
    let n = toNumber(numStr);
    if (n === null) continue;
    if (m[2]) n *= 1000;
    out.push(n);
  }
  // "35-40k€" : le premier montant hérite du "k"
  if (out.length === 2 && /\d\s*[-–à]\s*\d+(?:[.,]\d+)?\s*k/i.test(text) && out[0] < 1000 && out[1] >= 1000) {
    out[0] *= 1000;
  }
  return out;
}

function annualize(amount: number | null, period: Period | null, months: number): number | null {
  if (amount === null || period === null) return null;
  switch (period) {
    case "annee":
      return amount;
    case "mois":
      return amount * months;
    case "heure":
      return amount * HOURS_PER_MONTH * 12;
    case "jour":
      return amount * DAYS_PER_YEAR;
  }
}

interface Input {
  raw?: string | null;
  structured?: { min: number | string | null; max: number | string | null; unit: string | null; estimated?: boolean } | null;
}

/** Les données structurées des sites contiennent parfois des nombres en texte ("34 000,00"). */
function coerce(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return toNumber(v.replace(/[^\d,.\s\u00a0\u202f]/g, ""));
}

export function normalizeSalary({ raw, structured }: Input): Salary | null {
  const f = fold(raw);
  const warnings: string[] = [];
  let min: number | null = null;
  let max: number | null = null;
  let period: Period | null = null;

  const sMin = coerce(structured?.min);
  const sMax = coerce(structured?.max);
  if (structured && (sMin !== null || sMax !== null)) {
    min = sMin;
    max = sMax;
    period = periodFromUnit(structured.unit);
  }
  if (min === null && max === null && raw) {
    if (/selon (profil|experience)|a negocier|non (communique|precise)|competitif/.test(f) && !/\d/.test(f)) return null;
    const amounts = extractAmounts(raw).filter((n) => n > 0 && !(n >= 12 && n <= 13 && /mois/.test(f)));
    if (amounts.length === 0) return null;
    min = amounts[0];
    max = amounts.length > 1 ? amounts[1] : null;
  }
  if (min === null && max === null) return null;
  if (period === null) period = detectPeriod(f);
  if (period === null) {
    // Déduction prudente par ordre de grandeur, signalée.
    const ref = (max ?? min) as number;
    if (ref >= 15_000) period = "annee";
    else if (ref >= 1_000) period = "mois";
    else if (ref >= 9 && ref <= 80) period = "heure";
    if (period) warnings.push("periode_deduite");
  }

  if (min !== null && max !== null && min > max) {
    [min, max] = [max, min];
    warnings.push("min_max_inverses");
  }
  if (min !== null && max !== null && min === max) max = null;

  let kind: Salary["kind"] = /\bnet\b/.test(f) ? "net" : /\bbrut\b/.test(f) ? "brut" : "inconnu";
  if (kind === "inconnu" && structured) {
    // Les données structurées des sites d'emploi français sont en brut ; on le signale comme hypothèse.
    kind = "brut";
    warnings.push("brut_suppose");
  }
  const months = period === "mois" ? (detectMonths(f) ?? 12) : detectMonths(f);
  if (months === 13) warnings.push("treizieme_mois");

  let annualMin = annualize(min, period, months ?? 12);
  let annualMax = annualize(max, period, months ?? 12);
  if (kind === "net") {
    annualMin = annualMin !== null ? Math.round(annualMin / NET_RATIO) : null;
    annualMax = annualMax !== null ? Math.round(annualMax / NET_RATIO) : null;
    warnings.push("brut_estime_depuis_net");
  }
  const refAnnual = annualMax ?? annualMin;
  if (refAnnual !== null && (refAnnual < MIN_PLAUSIBLE_ANNUAL || refAnnual > MAX_PLAUSIBLE_ANNUAL)) {
    warnings.push("montant_incoherent");
    annualMin = null;
    annualMax = null;
  }

  return {
    raw: raw ?? null,
    min,
    max,
    period,
    kind,
    annualMin: annualMin !== null ? Math.round(annualMin) : null,
    annualMax: annualMax !== null ? Math.round(annualMax) : null,
    months,
    estimated: Boolean(structured?.estimated),
    warnings,
  };
}

/** Brut annuel de référence pour le scoring : milieu de fourchette, sinon la seule borne connue. */
export function referenceAnnual(s: Salary | null): number | null {
  if (!s || s.estimated) return null;
  if (s.annualMin !== null && s.annualMax !== null) return Math.round((s.annualMin + s.annualMax) / 2);
  return s.annualMax ?? s.annualMin;
}

/** Net mensuel estimé (avant impôt) à partir d'un brut annuel, sur 12 mois. */
export function estimatedNetMonthly(annualGross: number): number {
  return Math.round((annualGross * NET_RATIO) / 12);
}

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export function formatSalary(s: Salary | null): string {
  if (!s || (s.min === null && s.max === null)) return "Non communiqué";
  if (s.warnings.includes("montant_incoherent")) return `Montant publié incohérent (${eur((s.min ?? s.max) as number)}) — à vérifier`;
  const unit = { annee: "/an", mois: "/mois", heure: "/h", jour: "/jour" }[s.period ?? "annee"] ?? "";
  const kind = s.kind === "inconnu" ? "" : ` ${s.kind}`;
  const range = s.min !== null && s.max !== null ? `${eur(s.min)} – ${eur(s.max)}` : eur((s.min ?? s.max) as number);
  return `${range}${kind}${s.period ? unit : ""}${s.estimated ? " (estimation de la source)" : ""}`;
}
