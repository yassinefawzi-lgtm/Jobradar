import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeSalary } from "../src/lib/normalize/salary";
import { DEFAULT_PREFERENCES } from "../src/lib/scoring/preferences";
import { categoryFor, requiredYears, scoreJob, type ScoreInput } from "../src/lib/scoring/score";

const NOW = new Date("2026-11-17T08:00:00Z");
const base: ScoreInput = {
  title: "Chargé de marketing digital",
  company: "Exemple SAS",
  description:
    "Rattaché(e) au responsable marketing, vous pilotez l'acquisition : campagnes Google Ads et Meta Ads, SEO, landing pages. Vous mettez en place des automatisations (Make, Zapier) et suivez les KPI dans le CRM HubSpot. Poste ouvert aux profils juniors. ".repeat(4),
  descriptionPartial: false,
  contract: "CDI",
  contractMonths: null,
  remote: "hybride",
  zone: "rouen",
  distanceKm: 6,
  salary: normalizeSalary({ raw: "De 34 000 € à 38 000 € par an" }),
  publishedAt: new Date("2026-11-16T08:00:00Z"),
  firstSeenAt: new Date("2026-11-16T09:00:00Z"),
};

describe("scoring", () => {
  it("offre idéale : score élevé, recommandation Postuler, explications", () => {
    const r = scoreJob(base, DEFAULT_PREFERENCES, NOW);
    assert.ok(r.score >= 85, `score ${r.score}`);
    assert.equal(r.recommendation, "Postuler");
    assert.equal(r.family, "A");
    assert.equal(r.subscores.length, 5);
    assert.ok(r.ownedSkills.some((s) => s.label === "HubSpot"));
    assert.ok(r.pros.length > 0);
    assert.equal(r.confidence, "élevée");
  });

  it("est déterministe", () => {
    assert.deepEqual(scoreJob(base, DEFAULT_PREFERENCES, NOW), scoreJob(base, DEFAULT_PREFERENCES, NOW));
  });

  it("la somme des sous-scores correspond au score", () => {
    const r = scoreJob(base, DEFAULT_PREFERENCES, NOW);
    const sum = r.subscores.reduce((a, s) => a + s.points, 0);
    assert.equal(r.score, Math.round(sum));
  });

  it("salaire non communiqué : contribution neutre signalée, pas zéro", () => {
    const r = scoreJob({ ...base, salary: null }, DEFAULT_PREFERENCES, NOW);
    const sal = r.subscores.find((s) => s.key === "salary")!;
    assert.equal(sal.neutral, true);
    assert.ok(sal.points > 0 && sal.points < sal.max);
  });

  it("salaire sous le minimum : obstacle", () => {
    const r = scoreJob({ ...base, salary: normalizeSalary({ raw: "24 000 € par an" }) }, DEFAULT_PREFERENCES, NOW);
    assert.ok(r.obstacles.some((o) => /minimum/.test(o)));
  });

  it("exclusions dures : stage, alternance, commercial, hors zone", () => {
    assert.match(scoreJob({ ...base, contract: "STAGE" }, DEFAULT_PREFERENCES, NOW).excluded!, /stage/);
    assert.match(scoreJob({ ...base, contract: "ALTERNANCE" }, DEFAULT_PREFERENCES, NOW).excluded!, /alternance/);
    assert.equal(scoreJob({ ...base, title: "Commercial B to B" }, DEFAULT_PREFERENCES, NOW).excluded, "Trop commercial");
    assert.equal(scoreJob({ ...base, title: "Chef des ventes" }, DEFAULT_PREFERENCES, NOW).excluded, "Trop commercial");
    assert.equal(scoreJob({ ...base, title: "Développeur full stack" }, DEFAULT_PREFERENCES, NOW).excluded, "Trop technique");
    assert.equal(scoreJob({ ...base, title: "Administrateur Endpoints & Workplace" }, DEFAULT_PREFERENCES, NOW).excluded, "Trop technique");
    assert.equal(scoreJob({ ...base, title: "Automaticien" }, DEFAULT_PREFERENCES, NOW).excluded, "Trop technique");
    assert.equal(scoreJob({ ...base, title: "Responsable d'équipe logistique junior" }, DEFAULT_PREFERENCES, NOW).excluded, "Métier hors cible");
    assert.equal(scoreJob({ ...base, title: "Administrateur CRM" }, DEFAULT_PREFERENCES, NOW).excluded, null);
    const far = scoreJob({ ...base, zone: "autre", distanceKm: 80, remote: "aucun" }, DEFAULT_PREFERENCES, NOW);
    assert.equal(far.excluded, "Hors zone");
    assert.ok(far.score <= 25);
    assert.equal(far.recommendation, "Ignorer");
  });

  it("salaire publié sous le minimum : jamais « Postuler »", () => {
    const r = scoreJob({ ...base, salary: normalizeSalary({ raw: "26 400 € par an" }) }, DEFAULT_PREFERENCES, NOW);
    assert.notEqual(r.recommendation, "Postuler");
  });

  it("intitulé d'ingénieur : obstacle signalé", () => {
    const r = scoreJob({ ...base, title: "Ingénieur chef de projet" }, DEFAULT_PREFERENCES, NOW);
    assert.ok(r.obstacles.some((o) => /ingénieur/.test(o)));
  });

  it("entreprise exclue", () => {
    const r = scoreJob(base, { ...DEFAULT_PREFERENCES, excludedCompanies: ["Exemple"] }, NOW);
    assert.equal(r.excluded, "Entreprise exclue");
  });

  it("plus de 4 ans d'expérience exigés : pénalité importante", () => {
    const senior = scoreJob({ ...base, description: `${base.description} Vous justifiez de 6 ans d'expérience minimum.`.replace(/Poste ouvert aux profils juniors\. /g, "") }, DEFAULT_PREFERENCES, NOW);
    const exp = senior.subscores.find((s) => s.key === "experience")!;
    assert.ok(exp.points <= 5);
    assert.ok(senior.obstacles.some((o) => /6 ans/.test(o)));
  });

  it("Bac+5 demandé : pénalité sans exclusion", () => {
    const r = scoreJob({ ...base, description: `${base.description} Diplômé(e) d'un Bac+5 en école de commerce.` }, DEFAULT_PREFERENCES, NOW);
    assert.equal(r.excluded, null);
    assert.ok(r.obstacles.some((o) => /Bac\+5/.test(o)));
  });

  it("forte part commerciale : pénalité sur les missions", () => {
    const sales = scoreJob(
      { ...base, title: "Chargé de marketing", description: "Prospection, développement du portefeuille clients, négociation, closing, atteinte des objectifs commerciaux, vente, rendez-vous clients. ".repeat(2) },
      DEFAULT_PREFERENCES,
      NOW,
    );
    assert.ok(sales.cons.some((c) => /commerciale/.test(c)));
  });

  it("reconversion : un titre différent mais des missions d'outillage reste pertinent (famille hors marketing)", () => {
    const r = scoreJob(
      { ...base, title: "Chargé de mission", description: "Vous accompagnez le déploiement des outils métiers, l'automatisation des processus internes et l'amélioration des process. Analyse des besoins, cahier des charges, gestion de projet." },
      DEFAULT_PREFERENCES,
      NOW,
    );
    assert.ok(r.family !== null && r.family !== "A", `famille ${r.family}`);
    assert.ok(r.transferable.length > 0);
  });

  it("fraîcheur : une offre ancienne perd des points", () => {
    const old = scoreJob({ ...base, publishedAt: new Date("2026-09-01T00:00:00Z") }, DEFAULT_PREFERENCES, NOW);
    assert.ok(old.subscores.find((s) => s.key === "freshness")!.points < 2);
  });

  it("pondération configurable", () => {
    const prefs = { ...DEFAULT_PREFERENCES, weights: { missions: 50, experience: 20, location: 20, salary: 0, freshness: 10 } };
    const r = scoreJob(base, prefs, NOW);
    assert.equal(r.subscores.find((s) => s.key === "salary")!.max, 0);
  });

  it("années d'expérience extraites", () => {
    assert.equal(requiredYears("vous avez 3 ans d experience minimum"), 3);
    assert.equal(requiredYears("experience de 5 ans sur un poste similaire"), 5);
    assert.equal(requiredYears("2 a 4 ans d experience"), 2);
    assert.equal(requiredYears("aucune mention"), null);
  });

  it("catégories", () => {
    assert.equal(categoryFor(90), "Excellent match");
    assert.equal(categoryFor(72), "Bonne opportunité");
    assert.equal(categoryFor(60), "Ambitieuse ou à vérifier");
    assert.equal(categoryFor(30), "Peu pertinent");
  });
});
