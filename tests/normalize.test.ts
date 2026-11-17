import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDuplicate, type ExistingJob } from "../src/lib/dedupe/dedupe";
import { canonicalUrl, computeZone, detectRemote, fingerprint, normalizeContract } from "../src/lib/normalize/job";
import { cleanTitle, htmlToText } from "../src/lib/normalize/text";

const ZONES = { rouenRadiusKm: 30, caenRadiusKm: 25 };

describe("géographie", () => {
  it("Mont-Saint-Aignan est dans la zone de Rouen", () => {
    const r = computeZone({ lat: 49.4631, lon: 1.0886 }, "inconnu", ZONES);
    assert.equal(r.zone, "rouen");
    assert.ok(r.distanceKm! < 5);
  });
  it("Le Havre est hors zone (≈ 75 km)", () => {
    const r = computeZone({ lat: 49.4944, lon: 0.1079 }, "aucun", ZONES);
    assert.equal(r.zone, "autre");
    assert.ok(r.distanceKm! > 60);
  });
  it("Hérouville-Saint-Clair est dans la zone de Caen", () => {
    assert.equal(computeZone({ lat: 49.2042, lon: -0.3264 }, "inconnu", ZONES).zone, "caen");
  });
  it("Paris en 100 % télétravail → zone télétravail", () => {
    assert.equal(computeZone({ lat: 48.8566, lon: 2.3522 }, "total", ZONES).zone, "teletravail");
  });
  it("le rayon est paramétrable", () => {
    const evreux = { lat: 49.0241, lon: 1.1508 };
    assert.equal(computeZone(evreux, "inconnu", ZONES).zone, "autre");
    assert.equal(computeZone(evreux, "inconnu", { ...ZONES, rouenRadiusKm: 50 }).zone, "rouen");
  });
  it("localisation inconnue → zone inconnue", () => {
    assert.equal(computeZone(null, "inconnu", ZONES).zone, "inconnue");
  });
});

describe("contrats et télétravail", () => {
  it("détecte les contrats", () => {
    assert.equal(normalizeContract("CDI").contract, "CDI");
    assert.equal(normalizeContract("CDD - 6 mois").contract, "CDD");
    assert.equal(normalizeContract("CDD - 6 mois").months, 6);
    assert.equal(normalizeContract("MIS Mission intérimaire").contract, "INTERIM");
    assert.equal(normalizeContract("CDI", "Chargé marketing en alternance").contract, "ALTERNANCE");
    assert.equal(normalizeContract("permanent").contract, "CDI");
    assert.equal(normalizeContract(null).contract, "INCONNU");
  });
  it("détecte le télétravail", () => {
    assert.equal(detectRemote("Télétravail partiel"), "hybride");
    assert.equal(detectRemote("Poste en 100% télétravail"), "total");
    assert.equal(detectRemote("Pas de télétravail"), "aucun");
    assert.equal(detectRemote(null), "inconnu");
  });
});

describe("texte", () => {
  it("retire H/F des intitulés", () => {
    assert.equal(cleanTitle("Chargé de Campagnes CRM - Marketing Direct H/F"), "Chargé de Campagnes CRM - Marketing Direct");
    assert.equal(cleanTitle("Growth Marketer (F/H)"), "Growth Marketer");
  });
  it("convertit le HTML en texte sans balises", () => {
    const t = htmlToText("<h2>Missions</h2><p>Piloter le <b>CRM</b>&nbsp;:</p><ul><li>HubSpot</li></ul><script>alert(1)</script>");
    assert.ok(t!.includes("Piloter le CRM"));
    assert.ok(t!.includes("• HubSpot"));
    assert.ok(!t!.includes("<") && !t!.includes("alert"));
  });
});

describe("déduplication", () => {
  it("supprime les paramètres de tracking des URL", () => {
    assert.equal(
      canonicalUrl("https://www.hellowork.com/fr-fr/emplois/123.html?utm_source=alerte&utm_medium=email#top"),
      "https://hellowork.com/fr-fr/emplois/123.html",
    );
    assert.equal(canonicalUrl("https://ex.com/job?id=4&gclid=abc"), "https://ex.com/job?id=4");
  });

  const existing: ExistingJob[] = [
    {
      id: "a",
      canonicalUrl: "https://hellowork.com/fr-fr/emplois/1.html",
      canonicalUrls: ["https://hellowork.com/fr-fr/emplois/1.html"],
      fingerprint: fingerprint("Chargé de Campagnes CRM H/F", "Matmut", "Rouen"),
      title: "Chargé de Campagnes CRM",
      company: "Matmut",
      city: "Rouen",
      description: "Vous pilotez les campagnes CRM multicanales et l'automatisation des parcours clients avec HubSpot pour l'ensemble des marques du groupe",
    },
  ];

  it("même URL canonique", () => {
    const m = findDuplicate({ canonicalUrl: "https://hellowork.com/fr-fr/emplois/1.html", fingerprint: "x", title: "x", company: null, city: null, description: null }, existing);
    assert.equal(m?.reason, "url");
  });
  it("même entreprise + titre + ville sur une autre plateforme", () => {
    const m = findDuplicate(
      { canonicalUrl: "https://adzuna.fr/details/9", fingerprint: fingerprint("Chargé de campagnes CRM (F/H)", "MATMUT SA", "Rouen"), title: "Chargé de campagnes CRM", company: "MATMUT SA", city: "Rouen", description: null },
      existing,
    );
    assert.equal(m?.id, "a");
  });
  it("titre proche et contenu similaire", () => {
    const m = findDuplicate(
      {
        canonicalUrl: "https://ft.fr/2",
        fingerprint: "autre",
        title: "Chargé de campagnes CRM et marketing direct",
        company: "Matmut",
        city: "Rouen",
        description: "Vous pilotez les campagnes CRM multicanales et l'automatisation des parcours clients avec HubSpot pour l'ensemble des marques du groupe Matmut",
      },
      existing,
    );
    assert.equal(m?.id, "a");
  });
  it("même entreprise mais autre poste → pas de doublon", () => {
    const m = findDuplicate(
      { canonicalUrl: "https://ft.fr/3", fingerprint: "autre", title: "Expert Tracking", company: "Matmut", city: "Rouen", description: "Mise en place du plan de marquage" },
      existing,
    );
    assert.equal(m, null);
  });
});
