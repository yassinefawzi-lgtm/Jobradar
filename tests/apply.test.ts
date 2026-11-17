import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aiToPack, buildUserPrompt, type AiPack } from "../src/lib/apply/ai";
import { chooseVariant, generatePack, type OfferInput, offerText, preferencesText } from "../src/lib/apply/generate";
import { letterText, packSchema, type Pack } from "../src/lib/apply/pack";
import { pdfFileName, renderCv, renderLetter } from "../src/lib/apply/pdf";
import { numbersIn, validatePack, validateSentence } from "../src/lib/apply/validate";
import { costEur } from "../src/lib/ai/claude";
import { factIndex, flattenFacts, parseFactsYaml } from "../src/lib/profile/facts";
import { DEFAULT_PREFERENCES } from "../src/lib/scoring/preferences";

const source = readFileSync(new URL("../profile/facts.yaml", import.meta.url), "utf8");
const parsed = parseFactsYaml(source);
if (!parsed.facts) throw new Error(parsed.errors.join("\n"));
const facts = parsed.facts;
const flat = flattenFacts(facts);
const index = factIndex(flat);

// Offre fictive (fixture de test, jamais affichée en production)
const offer: OfferInput = {
  title: "Chargé de projet CRM",
  company: "Entreprise Fictive",
  description: "Vous pilotez le CRM HubSpot, automatisez les workflows (Make, Zapier) et analysez les besoins des équipes. Maîtrise de Salesforce appréciée.",
  family: "B",
};
const ctx = { facts: index, offerText: offerText(offer), preferencesText: preferencesText(DEFAULT_PREFERENCES) };

describe("profil (facts.yaml)", () => {
  it("le fichier réel est valide et ses identifiants uniques", () => {
    assert.ok(flat.length > 20);
    assert.equal(new Set(flat.map((f) => f.id)).size, flat.length);
    assert.ok(index.get("real.base-10k")?.valid);
  });
  it("rejette un YAML invalide ou une preuve inconnue", () => {
    assert.equal(parseFactsYaml("identite: [").facts, null);
    const broken = source.replace("preuves: [real.base-10k]", "preuves: [real.inexistant]");
    const r = parseFactsYaml(broken);
    assert.equal(r.facts, null);
    assert.ok(r.errors!.some((e) => e.includes("real.inexistant")));
  });
});

describe("contrôle anti-invention", () => {
  it("une phrase sans source est bloquée", () => {
    assert.deepEqual(validateSentence({ text: "J'ai dirigé une équipe de 12 personnes.", sources: [], kind: "fait", userValidated: false }, ctx).includes("phrase sans source"), true);
  });
  it("un chiffre absent des faits cités est bloqué", () => {
    const p = validateSentence({ text: "J'ai constitué une base de 50 000 contacts.", sources: ["real.base-10k"], kind: "fait", userValidated: false }, ctx);
    assert.ok(p.some((x) => x.includes("50000")));
    assert.deepEqual(validateSentence({ text: "J'ai constitué une base de 10 000 contacts.", sources: ["real.base-10k"], kind: "fait", userValidated: false }, ctx), []);
  });
  it("un outil absent des sources est bloqué (Salesforce n'est pas dans le profil)", () => {
    const p = validateSentence({ text: "J'ai administré Salesforce pour une PME.", sources: ["exp.freelance"], kind: "fait", userValidated: false }, ctx);
    assert.ok(p.some((x) => x.includes("Salesforce")));
  });
  it("un outil cité depuis l'annonce est admis", () => {
    assert.deepEqual(validateSentence({ text: "Votre annonce met en avant HubSpot et Salesforce.", sources: ["annonce"], kind: "annonce", userValidated: false }, ctx), []);
  });
  it("source inconnue et formule interdite", () => {
    assert.ok(validateSentence({ text: "Texte", sources: ["real.invente"], kind: "fait", userValidated: false }, ctx)[0].includes("inconnue"));
    assert.ok(validateSentence({ text: "Je suis passionné par le CRM.", sources: ["comp.crm"], kind: "fait", userValidated: false }, ctx).some((x) => x.includes("interdite")));
  });
  it("une phrase de liaison ne peut pas contenir de chiffre", () => {
    assert.ok(validateSentence({ text: "J'ai 5 ans d'expérience.", sources: [], kind: "liaison", userValidated: false }, ctx).length > 0);
  });
  it("normalise les nombres", () => {
    assert.deepEqual(numbersIn("10 000 contacts, 400 à 500 €, 2,5 jours"), ["10000", "400", "500", "2.5"]);
  });
});

describe("génération sans IA", () => {
  const pack = generatePack(offer, facts, index, DEFAULT_PREFERENCES);

  it("choisit la variante selon la famille de métier", () => {
    assert.equal(pack.variant, "crm");
    assert.equal(chooseVariant("A"), "growth");
    assert.equal(chooseVariant("D"), "transfo");
    assert.equal(chooseVariant(null), "growth");
  });
  it("produit un pack conforme au schéma et qui passe le contrôle", () => {
    packSchema.parse(pack);
    const v = validatePack(pack, ctx);
    assert.equal(v.ok, true, JSON.stringify(v.issues));
  });
  it("met en avant les réalisations pertinentes et ne dépasse pas 5 points par expérience", () => {
    const freelance = pack.cv.experiences.find((e) => e.factId === "exp.freelance")!;
    assert.ok(freelance.bullets.length <= 5);
    assert.ok(freelance.bullets[0].sources.includes("real.outil-restructuring") || freelance.bullets[0].sources.includes("real.wedding-app"));
    assert.equal(pack.cv.skills[0], "CRM");
  });
  it("tableau de couverture honnête : Salesforce non couvert", () => {
    assert.equal(pack.coverage.find((c) => c.requirement === "Salesforce")?.status, "non_couvert");
    assert.ok(pack.coverage.some((c) => c.requirement === "HubSpot"));
  });
  it("lettre sans formule interdite", () => {
    assert.ok(!/passionn|dynamique|je me permets/i.test(letterText(pack)));
  });
});

describe("export bloqué si une phrase n'est pas sourcée", () => {
  it("une phrase inventée ajoutée à la lettre rend le pack non exportable, sauf validation explicite", () => {
    const pack: Pack = structuredClone(generatePack(offer, facts, index, DEFAULT_PREFERENCES));
    pack.letter.paragraphs[1].push({ text: "J'ai déployé Salesforce pour 30 commerciaux.", sources: [], kind: "fait", userValidated: false });
    const v = validatePack(pack, ctx);
    assert.equal(v.ok, false);
    assert.ok(Object.keys(v.byPath).some((p) => p.startsWith("letter.paragraphs.1")));
    pack.letter.paragraphs[1].at(-1)!.userValidated = true;
    assert.equal(validatePack(pack, ctx).ok, true);
  });
});

describe("réponse de l'IA", () => {
  const draft = generatePack(offer, facts, index, DEFAULT_PREFERENCES);
  const ai: AiPack = {
    variant: "crm",
    cv_title: "Chargé de projet CRM",
    summary: [{ text: "Consultant en marketing digital en freelance depuis 2023.", sources: ["exp.freelance"] }],
    skills: ["CRM", "HubSpot", "Automatisation"],
    experiences: [{ fact_id: "exp.freelance", bullets: [{ text: "Outil métier pour un avocat en restructuring.", sources: ["real.outil-restructuring"] }] }],
    letter_paragraphs: [
      [{ text: "Votre annonce met en avant le CRM HubSpot.", sources: ["annonce"] }],
      [{ text: "J'ai multiplié par 10 le chiffre d'affaires de mes clients.", sources: ["exp.freelance"] }],
    ],
    email_subject: "Candidature",
    email_body: [{ text: "Bonjour,", sources: [] }],
    why: { text: "Ce poste prolonge mon travail sur les outils métiers.", sources: ["real.outil-restructuring"] },
  };
  it("est convertie en pack, et une invention de l'IA est détectée", () => {
    const pack = aiToPack(ai, draft);
    packSchema.parse(pack);
    assert.equal(pack.letter.paragraphs[0][0].kind, "annonce");
    assert.equal(pack.email.body[0].kind, "liaison");
    const v = validatePack(pack, ctx);
    assert.equal(v.ok, false);
    assert.ok(v.byPath["letter.paragraphs.1.0"]?.some((m) => m.includes("10")));
  });
  it("le prompt isole l'annonce comme donnée et liste les faits validés", () => {
    const p = buildUserPrompt(offer, flat, draft);
    assert.ok(p.includes("<annonce>") && p.includes("</annonce>"));
    assert.ok(p.includes("real.base-10k"));
  });
  it("coût estimé", () => {
    assert.equal(costEur({ input_tokens: 1_000_000, output_tokens: 0 }), 3.68);
  });
});

describe("PDF", () => {
  const pack = generatePack(offer, facts, index, DEFAULT_PREFERENCES);
  it("génère un CV et une lettre PDF", async () => {
    const cv = await renderCv(pack, facts);
    const letter = await renderLetter(pack, facts, offer.company, offer.title, new Date("2026-11-17T10:00:00Z"));
    assert.equal(cv.subarray(0, 4).toString(), "%PDF");
    assert.equal(letter.subarray(0, 4).toString(), "%PDF");
    assert.ok(cv.length > 2000);
    // Le CV tient sur une seule page A4
    const pages = cv.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
    assert.equal(pages.length, 1);
  });
  it("nom de fichier propre", () => {
    assert.equal(pdfFileName("CV", "Société Générale & Cie"), "CV_Yassine_Fawzi_Societe_Generale_Cie.pdf");
  });
});
