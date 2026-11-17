import { referenceAnnual } from "../normalize/salary";
import { normalizeCompany } from "../normalize/job";
import { fold } from "../normalize/text";
import type { Contract, Remote, Salary, Zone } from "../types";
import {
  BAC5_SIGNALS,
  ENGINEER_TITLE,
  EXCLUDED_TITLES,
  FAMILY_DEFS,
  JUNIOR_SIGNALS,
  MANAGER_TITLE,
  OTHER_SKILLS,
  OWNED_SKILLS,
  REGULATED_SIGNALS,
  SALES_WORDS,
  SENIOR_TITLE,
  TECH_WORDS,
  TRANSVERSAL_BODY,
} from "./keywords";
import { FAMILIES, type Family, type Preferences } from "./preferences";

export interface ScoreInput {
  title: string;
  company: string | null;
  description: string | null;
  descriptionPartial: boolean;
  contract: Contract;
  contractMonths: number | null;
  remote: Remote;
  zone: Zone;
  distanceKm: number | null;
  salary: Salary | null;
  publishedAt: Date | null;
  firstSeenAt: Date;
}

export interface SubScore {
  key: "missions" | "experience" | "location" | "salary" | "freshness";
  label: string;
  points: number;
  max: number;
  /** Explications lisibles : règles appliquées et éléments trouvés dans l'annonce. */
  notes: string[];
  neutral?: boolean;
}

export type Recommendation = "Postuler" | "À tenter" | "À vérifier" | "Ignorer";
export type Confidence = "élevée" | "moyenne" | "faible";

export interface ScoreResult {
  version: number;
  score: number;
  category: string;
  family: Family | null;
  familyLabel: string | null;
  subscores: SubScore[];
  ownedSkills: { label: string; factId?: string }[];
  missingSkills: string[];
  transferable: string[];
  obstacles: string[];
  pros: string[];
  cons: string[];
  excluded: string | null;
  confidence: Confidence;
  recommendation: Recommendation;
  summary: string;
}

export const SCORING_VERSION = 1;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function categoryFor(score: number): string {
  if (score >= 85) return "Excellent match";
  if (score >= 70) return "Bonne opportunité";
  if (score >= 55) return "Ambitieuse ou à vérifier";
  return "Peu pertinent";
}

function countMatches(re: RegExp, text: string): number {
  return (text.match(new RegExp(re.source, "g")) ?? []).length;
}

function detectFamily(titleF: string, bodyF: string): { family: Family | null; titleHit: boolean; strength: number } {
  let best: { family: Family; score: number; titleHit: boolean } | null = null;
  for (const def of FAMILY_DEFS) {
    const titleHits = def.title.filter((r) => r.test(titleF)).length;
    const bodyHits = def.body.filter((r) => r.test(bodyF)).length;
    const s = titleHits * 3 + bodyHits;
    if (s > 0 && (!best || s > best.score)) best = { family: def.family, score: s, titleHit: titleHits > 0 };
  }
  const transversal = TRANSVERSAL_BODY.filter((r) => r.test(bodyF)).length;
  if (!best && transversal > 0) return { family: "F", titleHit: false, strength: transversal };
  if (!best) return { family: null, titleHit: false, strength: 0 };
  return { family: best.family, titleHit: best.titleHit, strength: best.score + transversal };
}

/** Années d'expérience minimales exigées, si l'annonce les précise. */
export function requiredYears(textF: string): number | null {
  const patterns = [
    /(\d{1,2}) ?(?:a|-) ?\d{1,2} ans? (?:minimum )?(?:d )?(?:experience|d experience)/,
    /(\d{1,2}) ?\+? ?ans? (?:minimum |au moins )?(?:d )?(?:experience|d experience)/,
    /experience (?:professionnelle )?(?:significative |reussie |confirmee )?(?:d au moins |de |minimum |d )?(\d{1,2}) ?(?:a \d{1,2} )?ans/,
    /minimum (\d{1,2}) ans/,
  ];
  for (const re of patterns) {
    const m = textF.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 25) return n;
    }
  }
  return null;
}

/** Vrai si l'intitulé correspond à un métier hors cible (exclusion dure). */
export function isExcludedTitle(title: string): boolean {
  const f = fold(title);
  return EXCLUDED_TITLES.some((e) => e.pattern.test(f));
}

export function scoreJob(input: ScoreInput, prefs: Preferences, now = new Date()): ScoreResult {
  const titleF = fold(input.title);
  const bodyF = fold(input.description);
  const allF = `${titleF} ${bodyF}`;
  const w = prefs.weights;
  const obstacles: string[] = [];
  const pros: string[] = [];
  const cons: string[] = [];
  let excluded: string | null = null;

  // --- Exclusions dures (sans IA) -------------------------------------------
  const companyNorm = normalizeCompany(input.company);
  if (companyNorm && prefs.excludedCompanies.some((c) => normalizeCompany(c) === companyNorm)) excluded = "Entreprise exclue";
  if (!excluded) {
    const accepted = prefs.contracts[input.contract as keyof Preferences["contracts"]];
    if (accepted === false) excluded = `Contrat ${input.contract.toLowerCase()} exclu`;
  }
  if (!excluded) {
    const hit = EXCLUDED_TITLES.find((e) => e.pattern.test(titleF));
    if (hit) excluded = hit.reason;
  }
  if (!excluded) {
    if (input.zone === "autre" && !(input.remote === "hybride" && prefs.acceptHybridElsewhere)) excluded = "Hors zone";
    if (input.zone === "caen" && !prefs.acceptCaen) excluded = "Hors zone (Caen désactivé)";
    if (input.zone === "teletravail" && !prefs.acceptFullRemote) excluded = "Télétravail complet désactivé";
  }

  // --- Missions et compétences ---------------------------------------------
  const fam = detectFamily(titleF, bodyF);
  const owned = OWNED_SKILLS.filter((s) => s.patterns.some((p) => p.test(allF)));
  const ownedUnique = [...new Map(owned.map((s) => [s.label, { label: s.label, factId: s.factId }])).values()];
  const missing = OTHER_SKILLS.filter((s) => s.patterns.some((p) => p.test(allF))).map((s) => s.label);
  const salesCount = countMatches(SALES_WORDS, allF);
  const techCount = countMatches(TECH_WORDS, allF);

  let missionRatio = 0;
  const missionNotes: string[] = [];
  if (fam.family) {
    missionRatio += fam.titleHit ? 0.45 : 0.25;
    missionNotes.push(`Famille ${fam.family} — ${FAMILIES[fam.family]}${fam.titleHit ? " (intitulé)" : " (missions)"}`);
  } else {
    missionNotes.push("Aucune famille cible reconnue dans l'intitulé ni les missions");
  }
  missionRatio += Math.min(0.55, ownedUnique.length * 0.09);
  if (ownedUnique.length) missionNotes.push(`Compétences possédées citées : ${ownedUnique.map((s) => s.label).join(", ")}`);
  if (missing.length) {
    missionRatio -= Math.min(0.2, missing.length * 0.05);
    missionNotes.push(`Compétences demandées non revendiquées : ${missing.join(", ")}`);
  }
  if (salesCount >= 4) {
    missionRatio -= salesCount >= 7 ? 0.35 : 0.2;
    missionNotes.push(`Part commerciale importante (${salesCount} mentions : prospection, vente, objectifs…)`);
    cons.push("Missions avec une forte part commerciale");
  }
  if (techCount >= 3) {
    missionRatio -= 0.25;
    missionNotes.push(`Compétences de développement demandées (${techCount} mentions)`);
    obstacles.push("Profil technique (développement) attendu");
  }
  if (!input.description) missionNotes.push("Description indisponible : analyse limitée à l'intitulé");
  const missions = round1(clamp(missionRatio, 0, 1) * w.missions);
  if (fam.family && ownedUnique.length >= 2) pros.push(`Missions alignées (${ownedUnique.slice(0, 3).map((s) => s.label).join(", ")})`);

  // --- Expérience et prérequis ---------------------------------------------
  const expNotes: string[] = [];
  let expRatio = 0.75;
  const years = requiredYears(allF);
  if (years !== null) {
    expNotes.push(`${years} an(s) d'expérience demandé(s)`);
    if (years <= 2) expRatio = 1;
    else if (years <= 3) expRatio = 0.8;
    else if (years <= prefs.maxYearsRequired) expRatio = 0.55;
    else {
      expRatio = 0.2;
      obstacles.push(`${years} ans d'expérience exigés`);
    }
  } else {
    expNotes.push("Expérience requise non précisée");
  }
  if (JUNIOR_SIGNALS.test(allF)) {
    expRatio = Math.max(expRatio, 0.95);
    expNotes.push("Ouvert aux profils juniors ou en reconversion");
    pros.push("Ouvert aux juniors ou reconversions");
  }
  if (SENIOR_TITLE.test(titleF)) {
    expRatio -= 0.35;
    expNotes.push("Intitulé de niveau senior ou direction");
    obstacles.push("Poste de niveau senior / direction");
  } else if (MANAGER_TITLE.test(titleF) && !/\b(charge|chargee|assistant|junior)\b/.test(titleF)) {
    expRatio -= 0.1;
    expNotes.push("Intitulé de manager / responsable");
  }
  if (ENGINEER_TITLE.test(titleF)) {
    expRatio -= 0.25;
    expNotes.push("Intitulé d'ingénieur");
    obstacles.push("Poste d'ingénieur : diplôme d'ingénieur souvent attendu");
  }
  if (BAC5_SIGNALS.test(allF)) {
    expRatio -= 0.2;
    expNotes.push("Bac+5 ou équivalent mentionné");
    obstacles.push("Bac+5 demandé (pénalité, pas d'exclusion)");
  }
  if (REGULATED_SIGNALS.test(allF)) {
    expRatio -= 0.4;
    obstacles.push("Certification ou diplôme réglementé demandé");
  }
  const experience = round1(clamp(expRatio, 0, 1) * w.experience);

  // --- Localisation et télétravail -----------------------------------------
  const locNotes: string[] = [];
  let locRatio = 0.4;
  let locNeutral = false;
  const d = input.distanceKm;
  switch (input.zone) {
    case "rouen":
      locRatio = d !== null && d <= 10 ? 1 : d !== null && d <= 20 ? 0.9 : 0.75;
      locNotes.push(`Zone Rouen, ${d !== null ? `${Math.round(d)} km à vol d'oiseau` : "distance inconnue"}`);
      pros.push(d !== null ? `À ${Math.round(d)} km de Rouen` : "Zone de Rouen");
      break;
    case "caen":
      locRatio = 0.65;
      locNotes.push(`Zone Caen${d !== null ? ` (${Math.round(d)} km de Rouen)` : ""}`);
      break;
    case "teletravail":
      locRatio = 0.8;
      locNotes.push("100 % télétravail");
      pros.push("100 % télétravail");
      break;
    case "autre":
      locRatio = input.remote === "hybride" && prefs.acceptHybridElsewhere ? 0.3 : 0;
      locNotes.push(`Hors zone${d !== null ? ` (${Math.round(d)} km de Rouen)` : ""}`);
      break;
    default:
      locNeutral = true;
      locNotes.push("Localisation inconnue : contribution neutre");
  }
  if (input.remote === "hybride" && input.zone !== "autre") {
    locRatio = Math.min(1, locRatio + 0.1);
    locNotes.push("Télétravail partiel mentionné");
  }
  const location = round1(clamp(locRatio, 0, 1) * w.location);

  // --- Rémunération ---------------------------------------------------------
  const salNotes: string[] = [];
  const ref = referenceAnnual(input.salary);
  let salRatio = 0.6;
  let salNeutral = false;
  if (ref === null) {
    salNeutral = true;
    salNotes.push(
      input.salary?.estimated
        ? "Seule une estimation de la source est disponible : contribution neutre"
        : input.salary?.warnings.includes("montant_incoherent")
          ? "Montant publié incohérent : contribution neutre"
          : "Salaire non communiqué : contribution neutre",
    );
  } else {
    salNotes.push(`Référence : ${ref.toLocaleString("fr-FR")} € brut/an (milieu de fourchette)`);
    if (ref >= prefs.preferredAnnualGross) {
      salRatio = 1;
      pros.push(`Salaire publié ≥ ${Math.round(prefs.preferredAnnualGross / 1000)} k€ brut/an`);
    } else if (ref >= prefs.minAnnualGross) salRatio = 0.75;
    else if (ref >= prefs.minAnnualGross - 3000) {
      salRatio = 0.4;
      cons.push("Salaire légèrement sous ton minimum");
    } else {
      salRatio = 0.1;
      obstacles.push("Salaire publié sous ton minimum");
    }
    if (input.salary?.warnings.includes("brut_estime_depuis_net")) salNotes.push("Montant publié en net, converti en brut (estimation)");
    if (input.salary?.warnings.includes("treizieme_mois")) salNotes.push("13e mois inclus dans la conversion annuelle");
  }
  const salary = round1(clamp(salRatio, 0, 1) * w.salary);

  // --- Fraîcheur ------------------------------------------------------------
  const freshNotes: string[] = [];
  const date = input.publishedAt ?? input.firstSeenAt;
  const days = Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
  const freshRatio = days <= 3 ? 1 : days <= 7 ? 0.8 : days <= 14 ? 0.6 : days <= 30 ? 0.3 : 0.1;
  freshNotes.push(
    `${input.publishedAt ? "Publiée" : "Découverte (date de publication inconnue)"} il y a ${Math.floor(days)} jour(s)`,
  );
  const freshness = round1(freshRatio * w.freshness);

  // --- Contrat --------------------------------------------------------------
  let contractPenalty = 0;
  if (input.contract === "CDI") pros.push("CDI");
  if (input.contract === "CDD") {
    if (input.contractMonths !== null && input.contractMonths < prefs.minCddMonths) {
      contractPenalty = 5;
      cons.push(`CDD de ${input.contractMonths} mois (< ${prefs.minCddMonths})`);
    } else if (input.contractMonths === null) cons.push("CDD de durée non précisée");
  }
  if (input.contract === "INCONNU" || input.contract === "AUTRE") cons.push("Type de contrat à vérifier");

  const subscores: SubScore[] = [
    { key: "missions", label: "Missions et compétences", points: missions, max: w.missions, notes: missionNotes },
    { key: "experience", label: "Expérience et prérequis", points: experience, max: w.experience, notes: expNotes },
    { key: "location", label: "Localisation et télétravail", points: location, max: w.location, notes: locNotes, neutral: locNeutral },
    { key: "salary", label: "Rémunération", points: salary, max: w.salary, notes: salNotes, neutral: salNeutral },
    { key: "freshness", label: "Fraîcheur", points: freshness, max: w.freshness, notes: freshNotes },
  ];
  const totalMax = Object.values(w).reduce((a, b) => a + b, 0) || 100;
  const raw = (subscores.reduce((a, s) => a + s.points, 0) / totalMax) * 100 - contractPenalty;
  let score = Math.round(clamp(raw, 0, 100));
  if (excluded) score = Math.min(score, 25);
  if (companyNorm && prefs.favoriteCompanies.some((c) => normalizeCompany(c) === companyNorm)) pros.push("Entreprise favorite");

  // --- Compétences transférables (faits réels du profil) --------------------
  const transferable: string[] = [];
  if (fam.family === "D" || fam.family === "C" || /\b(besoins|cahier des charges|specifications)\b/.test(bodyF))
    transferable.push("Analyse des besoins d'ENEDIS et études de faisabilité (Fiber Academy)");
  if (fam.family === "B" || fam.family === "C" || fam.family === "F" || /\boutils?\b/.test(bodyF))
    transferable.push("Outil métier pour un avocat en restructuring (API Pappers, ~2× moins de temps par offre)");
  if (fam.family === "E" || /\b(donnees|data|base de)\b/.test(bodyF)) transferable.push("Base de 10 000 contacts constituée et enrichie (GR.APP&CO)");
  if (/\b(projet|coordination|pilotage)\b/.test(bodyF)) transferable.push("Gestion de projet, recrutement et formation d'alternants (Fiber Academy)");

  // --- Confiance et recommandation ------------------------------------------
  const descLen = input.description?.length ?? 0;
  const confidence: Confidence =
    descLen >= 800 && !input.descriptionPartial && input.zone !== "inconnue"
      ? "élevée"
      : descLen >= 250 && input.zone !== "inconnue"
        ? "moyenne"
        : "faible";
  let recommendation: Recommendation = excluded
    ? "Ignorer"
    : score >= 80
      ? "Postuler"
      : score >= 65
        ? "À tenter"
        : score >= 55
          ? "À vérifier"
          : "Ignorer";
  if (!excluded && confidence === "faible" && recommendation !== "Ignorer") recommendation = "À vérifier";
  if (!excluded && obstacles.length >= 2 && recommendation === "Postuler") recommendation = "À tenter";
  // Salaire publié sous le minimum : jamais "Postuler" d'emblée.
  if (!excluded && ref !== null && ref < prefs.minAnnualGross && recommendation === "Postuler") recommendation = "À tenter";

  const summary = excluded
    ? `Écartée : ${excluded}`
    : [pros[0], pros[1]].filter(Boolean).join(" · ") || (cons[0] ?? obstacles[0] ?? "À examiner");

  return {
    version: SCORING_VERSION,
    score,
    category: categoryFor(score),
    family: fam.family,
    familyLabel: fam.family ? FAMILIES[fam.family] : null,
    subscores,
    ownedSkills: ownedUnique,
    missingSkills: missing,
    transferable,
    obstacles,
    pros,
    cons,
    excluded,
    confidence,
    recommendation,
    summary,
  };
}
