import { fold } from "../normalize/text";
import type { Fact, Facts } from "../profile/facts";
import { OTHER_SKILLS, OWNED_SKILLS } from "../scoring/keywords";
import type { Family, Preferences } from "../scoring/preferences";
import type { Pack, Sentence, Variant } from "./pack";

/** Données de l'offre utilisées pour la génération (traitées comme non fiables). */
export interface OfferInput {
  title: string;
  company: string | null;
  description: string | null;
  family: Family | null;
}

export function offerText(o: OfferInput): string {
  return [o.title, o.company, o.description].filter(Boolean).join("\n");
}

export const VARIANT_FOR_FAMILY: Record<Family, Variant> = { A: "growth", B: "crm", C: "transfo", D: "transfo", E: "ops", F: "transfo" };

const VARIANT_FAMILIES: Record<Variant, string[]> = { growth: ["A"], crm: ["B"], transfo: ["C", "D", "F"], ops: ["E"] };

/** Ordre des compétences par variante (identifiants de profile/facts.yaml). */
export const VARIANT_SKILLS: Record<Variant, string[]> = {
  growth: ["comp.ads", "comp.seo", "comp.data", "comp.automatisation", "comp.crm", "comp.prospection", "comp.hubspot", "comp.n8n", "comp.analyse-besoins"],
  crm: ["comp.crm", "comp.hubspot", "comp.automatisation", "comp.n8n", "comp.data", "comp.analyse-besoins", "comp.ads", "comp.seo"],
  transfo: ["comp.analyse-besoins", "comp.automatisation", "comp.crm", "comp.n8n", "comp.hubspot", "comp.data", "comp.ads"],
  ops: ["comp.data", "comp.automatisation", "comp.analyse-besoins", "comp.crm", "comp.n8n", "comp.hubspot", "comp.ads"],
};

/** Intitulé visé (pas un poste occupé) : repris de l'offre, sinon un intitulé générique de la variante. */
const VARIANT_TITLES: Record<Variant, string> = {
  growth: "Marketing digital et acquisition",
  crm: "CRM et automatisation",
  transfo: "Projets digitaux et outils métiers",
  ops: "Data et opérations",
};

/** Accroche : phrases fixes par variante, construites uniquement à partir des faits cités. */
const SUMMARY: Record<Variant, Sentence[]> = {
  growth: [
    s("Consultant en marketing digital en freelance depuis 2023, formé à la Rocket School.", ["exp.freelance", "form.rocket"]),
    s("J'ai lancé et optimisé des campagnes Google Ads et Meta Ads pour un avocat, des restaurants et une école de réflexologie.", ["real.gads-avocat", "real.meta-ads"]),
  ],
  crm: [
    s("Consultant en marketing digital en freelance depuis 2023, formé à la Rocket School.", ["exp.freelance", "form.rocket"]),
    s("Je conçois des outils et des automatisations qui suppriment les tâches répétitives, comme l'outil métier qui prépare en environ deux fois moins de temps les offres de reprise d'un cabinet d'avocat.", ["real.outil-restructuring", "comp.automatisation"]),
  ],
  transfo: [
    s("Consultant en marketing digital en freelance depuis 2023, après un premier parcours de chargé d'études.", ["exp.freelance", "exp.fiber"]),
    s("J'analyse des besoins métiers et je construis les outils qui y répondent, de l'étude de faisabilité pour ENEDIS à l'outil métier d'un cabinet d'avocat.", ["real.enedis", "real.outil-restructuring"]),
  ],
  ops: [
    s("Consultant en marketing digital en freelance depuis 2023, après un premier parcours de chargé d'études.", ["exp.freelance", "exp.fiber"]),
    s("Je structure et fiabilise des données : base de 10 000 contacts constituée et enrichie, automatisations sur mesure.", ["real.base-10k", "comp.automatisation"]),
  ],
};

function s(text: string, sources: string[], kind: Sentence["kind"] = "fait"): Sentence {
  return { text, sources, kind, userValidated: false };
}

export function chooseVariant(family: Family | null): Variant {
  return family ? VARIANT_FOR_FAMILY[family] : "growth";
}

/** Pertinence d'un fait pour une offre : famille de la variante + outils et compétences communs. */
export function relevance(f: Fact, variant: Variant, offerF: string): number {
  let score = f.families.some((x) => VARIANT_FAMILIES[variant].includes(x)) ? 3 : 0;
  const factF = fold(`${f.text} ${f.letter ?? ""}`);
  for (const skill of OWNED_SKILLS) {
    if (skill.patterns.some((p) => p.test(factF)) && skill.patterns.some((p) => p.test(offerF))) score += 2;
  }
  return score;
}

/** Exigences repérées dans l'offre, rapprochées des compétences du profil. */
export function coverage(offerF: string, facts: Map<string, Fact>): Pack["coverage"] {
  const rows: Pack["coverage"] = [];
  for (const skill of OWNED_SKILLS) {
    if (!skill.patterns.some((p) => p.test(offerF))) continue;
    const proof = [...facts.values()].filter((f) => f.valid && (f.kind === "realisation" || f.kind === "projet") && skill.patterns.some((p) => p.test(fold(`${f.text} ${f.letter ?? ""}`)))).map((f) => f.id);
    const declared = skill.factId && facts.get(skill.factId)?.valid ? [skill.factId] : [];
    rows.push({
      requirement: skill.label,
      status: proof.length ? "couvert" : declared.length ? "partiel" : "non_couvert",
      factIds: [...declared, ...proof].slice(0, 4),
    });
  }
  for (const skill of OTHER_SKILLS) {
    if (skill.patterns.some((p) => p.test(offerF))) rows.push({ requirement: skill.label, status: "non_couvert", factIds: [] });
  }
  return rows;
}

function formatEuros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} €`;
}

/**
 * Génère un pack candidature sans IA, à partir des faits uniquement.
 * Sert de version de secours (pas de clé, budget atteint, IA indisponible) et de point de départ.
 */
export function generatePack(offer: OfferInput, facts: Facts, flat: Map<string, Fact>, prefs: Preferences, opts: { variant?: Variant } = {}): Pack {
  const variant = opts.variant ?? chooseVariant(offer.family);
  const offerF = fold(offerText(offer));
  const valid = (id: string) => flat.get(id)?.valid === true;

  // CV : expériences avec 3 à 5 points, triés par pertinence
  const experiences = facts.experiences
    .filter((e) => valid(e.id))
    .map((e) => {
      const ranked = e.realisations
        .map((r) => flat.get(r.id))
        .filter((f): f is Fact => !!f?.valid)
        .sort((a, b) => relevance(b, variant, offerF) - relevance(a, variant, offerF));
      return { factId: e.id, bullets: ranked.slice(0, 5).map((f) => s(f.text, [f.id])) };
    });
  const projects = facts.projets_personnels
    .map((p) => flat.get(p.id))
    .filter((f): f is Fact => !!f?.valid)
    .sort((a, b) => relevance(b, variant, offerF) - relevance(a, variant, offerF))
    .slice(0, 2)
    .map((f) => s(f.text, [f.id]));
  const skills = VARIANT_SKILLS[variant].filter(valid).map((id) => flat.get(id)!.label);

  // Lettre : besoin (tiré de l'annonce) → preuves (faits) → transition → conclusion
  // Sujets de l'annonce que le profil couvre (preuve ou compétence déclarée), formulés naturellement.
  const covered = coverage(offerF, flat).filter((c) => c.status !== "non_couvert" && TOPIC_PHRASES[c.requirement]);
  const uniqueTerms = [...new Set(covered.map((c) => TOPIC_PHRASES[c.requirement]))].slice(0, 3);
  const where = offer.company ? ` chez ${offer.company}` : "";
  const need: Sentence[] = [
    s(`Votre annonce pour le poste de ${offer.title}${where} a retenu mon attention.`, ["annonce"], "annonce"),
    uniqueTerms.length
      ? s(`Elle met en avant ${joinFr(uniqueTerms)}, ${uniqueTerms.length > 1 ? "des sujets sur lesquels" : "un sujet sur lequel"} j'ai déjà des réalisations concrètes.`, ["annonce"], "annonce")
      : s("Les missions décrites rejoignent ce que je pratique au quotidien en freelance.", ["exp.freelance"]),
  ];
  const proofFacts = [...flat.values()]
    .filter((f) => f.valid && f.letter && (f.kind === "realisation" || f.kind === "projet"))
    .sort((a, b) => relevance(b, variant, offerF) - relevance(a, variant, offerF))
    .slice(0, 3);
  const proofs = proofFacts.map((f) => s(f.letter!, [f.id]));
  const bridge: Sentence[] = [
    s("Mon parcours, d'abord technique avec un DUT Mesures physiques puis orienté marketing digital avec la Rocket School, m'a habitué à faire le lien entre les besoins des équipes et les outils.", ["form.dut", "form.rocket"]),
  ];
  const closing: Sentence[] = [s("Je serais heureux d'échanger avec vous sur vos projets et sur la manière dont je peux y contribuer.", [], "liaison")];

  const salaryText = `Mes prétentions se situent autour de ${formatEuros(prefs.preferredAnnualGross)} brut annuel, à ajuster selon le périmètre du poste.`;
  return {
    variant,
    cv: {
      title: offer.title.length <= 70 ? s(offer.title, ["annonce"], "annonce") : s(VARIANT_TITLES[variant], [], "liaison"),
      summary: SUMMARY[variant].filter((x) => x.sources.every(valid)),
      skills,
      experiences,
      projects,
    },
    letter: { paragraphs: [need, proofs.length ? proofs : [s("Mes réalisations détaillées figurent dans mon CV.", [], "liaison")], bridge, closing] },
    email: {
      subject: `Candidature : ${offer.title}`,
      body: [
        s("Bonjour,", [], "liaison"),
        s(`Je vous adresse ma candidature pour le poste de ${offer.title}.`, ["annonce"], "annonce"),
        s("Vous trouverez ci-joint mon CV et ma lettre de motivation.", [], "liaison"),
        s("Je reste à votre disposition pour en parler.", [], "liaison"),
      ],
    },
    answers: {
      salary: s(salaryText, ["preferences"]),
      availability: s("Disponibilité : à préciser.", [], "liaison"),
      why: s(proofs[0] ? `Ce poste correspond à ce que je fais déjà : ${lowerFirst(proofs[0].text)}`.slice(0, 300) : "Ce poste correspond à mon expérience en freelance.", proofs[0]?.sources ?? ["exp.freelance"]),
    },
    coverage: coverage(offerF, flat),
  };
}

/** Formulation naturelle des sujets de l'annonce (par libellé de compétence). */
const TOPIC_PHRASES: Record<string, string> = {
  "Google Ads / SEA": "Google Ads",
  "Meta Ads / social ads": "les campagnes Meta Ads",
  Acquisition: "l'acquisition",
  SEO: "le SEO",
  "Contenu / landing pages": "les landing pages",
  CRM: "le CRM",
  HubSpot: "HubSpot",
  n8n: "n8n",
  "Make / Zapier": "les outils no-code",
  Automatisation: "l'automatisation",
  "Intégration d'outils / API": "l'intégration d'outils",
  "Scraping / enrichissement de données": "l'enrichissement de données",
  "Analyse de besoins": "l'analyse des besoins",
  "Gestion de projet": "la gestion de projet",
  Emailing: "l'emailing",
};

function joinFr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function lowerFirst(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** Texte admis pour la source "preferences" (contrôle anti-invention). */
export function preferencesText(prefs: Preferences): string {
  return `prétentions ${formatEuros(prefs.preferredAnnualGross)} minimum ${formatEuros(prefs.minAnnualGross)}`;
}
