import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { adzunaConnector, adzunaToRaw } from "../src/lib/sources/adzuna";
import { franceTravailConnector, ftToRaw } from "../src/lib/sources/francetravail";
import { helloworkConnector, parseSearchCards, parseSearchIds, searchUrl, toRawJob } from "../src/lib/sources/hellowork";
import { BudgetExceededError, PoliteHttp, SourceBlockedError } from "../src/lib/sources/http";
import type { ConnectorContext } from "../src/lib/sources/types";
import { normalizeJob } from "../src/lib/normalize/job";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const noSleep = async () => {};

function fakeFetch(routes: (url: string) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL | Request) => routes(String(input))) as typeof fetch;
}

function ctx(http: PoliteHttp, extra: Partial<ConnectorContext> = {}): ConnectorContext {
  return { http, queries: [{ keywords: "marketing digital", area: "rouen" }], maxAgeDays: 30, knownIds: new Set(), log: () => {}, ...extra };
}

describe("HelloWork", () => {
  it("lit les identifiants et cartes d'une page de résultats réelle", () => {
    const html = fixture("hellowork-search.html");
    const ids = parseSearchIds(html);
    assert.equal(ids.length, 7);
    const cards = parseSearchCards(html);
    assert.ok(cards.some((c) => c.title === "Chargé de Campagnes CRM - Marketing Direct H/F" && c.company === "Matmut"));
  });

  it("lit les données structurées d'une page d'offre réelle", () => {
    const raw = toRawJob("84618265", fixture("hellowork-job.html"))!;
    assert.equal(raw.title, "Conseiller Numérique H/F");
    assert.equal(raw.company, "Cerfrance Seine Normandie");
    assert.equal(raw.city, "Bois-Guillaume");
    assert.equal(raw.postalCode, "76230");
    assert.equal(raw.contractRaw, "CDI");
    assert.deepEqual(raw.salaryStructured, { min: 28000, max: 32000, unit: "YEAR" });
    assert.equal(raw.publishedAt, "2026-10-20T13:27:29Z");
    // Le profil recherché figure une seule fois (pas de doublon description + qualifications).
    assert.equal(raw.description!.split("De formation Bac +2").length - 1, 1);
    const n = normalizeJob(raw, { rouenRadiusKm: 30, caenRadiusKm: 25 });
    assert.equal(n.contract, "CDI");
    assert.equal(n.salary?.annualMin, 28000);
    assert.equal(n.url, "https://www.hellowork.com/fr-fr/emplois/84618265.html");
  });

  it("construit l'URL de recherche (CDI + CDD, tri par date, rayon)", () => {
    const u = new URL(searchUrl({ keywords: "CRM", area: "rouen" }, 2, 7));
    assert.equal(u.searchParams.get("k"), "CRM");
    assert.deepEqual(u.searchParams.getAll("c"), ["CDI", "CDD"]);
    assert.equal(u.searchParams.get("ray"), "30");
    assert.equal(u.searchParams.get("d"), "w");
    assert.equal(u.searchParams.get("p"), "2");
  });

  it("collecte de bout en bout avec un faux serveur, sans re-télécharger les offres connues", async () => {
    const calls: string[] = [];
    const http = new PoliteHttp({
      sleep: noSleep,
      delayMs: 0,
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        if (url.includes("recherche.html")) return new Response(fixture("hellowork-search.html"));
        return new Response(fixture("hellowork-job.html"));
      }),
    });
    const all = parseSearchIds(fixture("hellowork-search.html"));
    const known = new Set(all.slice(0, 5));
    const res = await helloworkConnector({}).fetch(ctx(http, { knownIds: known }));
    assert.equal(res.seenIds.length, 7);
    assert.equal(calls.filter((c) => c.includes("/emplois/")).length, 2);
    assert.equal(res.jobs.length, 2);
  });

  it("n'utilise pas le détail pour les intitulés écartés", async () => {
    const http = new PoliteHttp({
      sleep: noSleep,
      delayMs: 0,
      fetchImpl: fakeFetch((url) => (url.includes("recherche.html") ? new Response(fixture("hellowork-search.html")) : new Response("", { status: 500 }))),
    });
    const res = await helloworkConnector({}).fetch(ctx(http, { skipDetail: () => true }));
    assert.equal(res.jobs.length, 7);
    assert.ok(res.jobs.every((j) => j.descriptionPartial));
  });

  it("peut être désactivée", () => {
    assert.match(helloworkConnector({ SOURCE_HELLOWORK_ENABLED: "0" }).unavailableReason()!, /Désactivée/);
  });
});

describe("client HTTP poli", () => {
  it("réessaie sur 429 puis réussit (backoff)", async () => {
    let n = 0;
    const waits: number[] = [];
    const http = new PoliteHttp({
      delayMs: 0,
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetchImpl: fakeFetch(() => (++n < 3 ? new Response("", { status: 429 }) : new Response("ok"))),
    });
    assert.equal(await http.text("https://ex.com"), "ok");
    assert.equal(n, 3);
    assert.deepEqual(waits.slice(-2), [1000, 2000]);
  });

  it("s'arrête net sur 403 (aucun contournement)", async () => {
    const http = new PoliteHttp({ delayMs: 0, sleep: noSleep, fetchImpl: fakeFetch(() => new Response("", { status: 403 })) });
    await assert.rejects(http.text("https://ex.com"), SourceBlockedError);
  });

  it("respecte le budget de requêtes", async () => {
    const http = new PoliteHttp({ delayMs: 0, sleep: noSleep, maxRequests: 2, fetchImpl: fakeFetch(() => new Response("ok")) });
    await http.text("https://ex.com/1");
    await http.text("https://ex.com/2");
    await assert.rejects(http.text("https://ex.com/3"), BudgetExceededError);
  });

  it("réessaie après une erreur réseau puis abandonne", async () => {
    let n = 0;
    const http = new PoliteHttp({
      delayMs: 0,
      sleep: noSleep,
      retries: 2,
      fetchImpl: (async () => {
        n++;
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    await assert.rejects(http.text("https://ex.com"), /fetch failed/);
    assert.equal(n, 3);
  });
});

describe("Adzuna", () => {
  it("sans clés : indisponible, signalé", () => {
    assert.match(adzunaConnector({}).unavailableReason()!, /ADZUNA/);
  });
  it("convertit une offre ; salaire prédit marqué comme estimation ; description partielle", () => {
    const raw = adzunaToRaw({
      id: "42",
      title: "Growth Marketer H/F",
      redirect_url: "https://www.adzuna.fr/details/42?utm_medium=api",
      created: "2026-11-15T10:00:00Z",
      company: { display_name: "Startup" },
      location: { display_name: "Rouen, Seine-Maritime", area: ["France", "Normandie", "Seine-Maritime", "Rouen"] },
      latitude: 49.44,
      longitude: 1.1,
      salary_min: 36000,
      salary_max: 36000,
      salary_is_predicted: "1",
      contract_type: "permanent",
    });
    assert.equal(raw.city, "Rouen");
    assert.equal(raw.salaryStructured?.estimated, true);
    assert.equal(raw.descriptionPartial, true);
    const n = normalizeJob(raw, { rouenRadiusKm: 30, caenRadiusKm: 25 });
    assert.equal(n.contract, "CDI");
    assert.equal(n.canonicalUrl, "https://adzuna.fr/details/42");
  });
  it("collecte paginée avec un faux serveur", async () => {
    const http = new PoliteHttp({
      delayMs: 0,
      sleep: noSleep,
      fetchImpl: fakeFetch(() => Response.json({ results: [{ id: "1", title: "CRM", redirect_url: "https://a.fr/1" }] })),
    });
    const res = await adzunaConnector({ ADZUNA_APP_ID: "x", ADZUNA_APP_KEY: "y" }).fetch(ctx(http));
    assert.equal(res.jobs.length, 1);
  });
});

describe("France Travail", () => {
  it("sans identifiants : indisponible, signalé", () => {
    assert.match(franceTravailConnector({}).unavailableReason()!, /FRANCE_TRAVAIL/);
  });
  it("convertit une offre", () => {
    const raw = ftToRaw({
      id: "201ABCD",
      intitule: "Chargé de projet CRM (H/F)",
      description: "Missions…",
      dateCreation: "2026-11-14T09:00:00.000Z",
      lieuTravail: { libelle: "76 - ROUEN", latitude: 49.44, longitude: 1.09, codePostal: "76000" },
      entreprise: { nom: "ACME" },
      typeContrat: "CDD",
      typeContratLibelle: "Contrat à durée déterminée - 12 Mois",
      salaire: { libelle: "Annuel de 32000.0 Euros à 36000.0 Euros sur 12 mois" },
      experienceLibelle: "2 ans",
    });
    assert.equal(raw.city, "ROUEN");
    const n = normalizeJob(raw, { rouenRadiusKm: 30, caenRadiusKm: 25 });
    assert.equal(n.contract, "CDD");
    assert.equal(n.contractMonths, 12);
    assert.equal(n.salary?.annualMax, 36000);
  });
  it("obtient un jeton puis cherche ; 204 = aucun résultat", async () => {
    const http = new PoliteHttp({
      delayMs: 0,
      sleep: noSleep,
      fetchImpl: fakeFetch((url) => (url.includes("access_token") ? Response.json({ access_token: "t" }) : new Response(null, { status: 204 }))),
    });
    const res = await franceTravailConnector({ FRANCE_TRAVAIL_CLIENT_ID: "a", FRANCE_TRAVAIL_CLIENT_SECRET: "b" }).fetch(ctx(http));
    assert.equal(res.jobs.length, 0);
  });
  it("identifiants refusés : erreur explicite", async () => {
    const http = new PoliteHttp({ delayMs: 0, sleep: noSleep, fetchImpl: fakeFetch(() => new Response("", { status: 401 })) });
    await assert.rejects(franceTravailConnector({ FRANCE_TRAVAIL_CLIENT_ID: "a", FRANCE_TRAVAIL_CLIENT_SECRET: "b" }).fetch(ctx(http)), SourceBlockedError);
  });
});

describe("HelloWork — robustesse", () => {
  it("accepte un champ compétences au format texte", () => {
    const html = fixture("hellowork-job.html").replace(/"skills":\s*\[[^\]]*\]/, '"skills": "CRM, Relation client"');
    const raw = toRawJob("1", html)!;
    assert.ok(raw.description!.includes("Compétences : CRM, Relation client"));
  });
  it("une page d'offre illisible devient un avertissement, pas une panne", async () => {
    let n = 0;
    const http = new PoliteHttp({
      sleep: noSleep,
      delayMs: 0,
      fetchImpl: fakeFetch((url) => {
        if (url.includes("recherche.html")) return new Response(fixture("hellowork-search.html"));
        n++;
        return new Response(n === 1 ? "<html>pas de données</html>" : fixture("hellowork-job.html"));
      }),
    });
    const res = await helloworkConnector({}).fetch(ctx(http));
    assert.equal(res.jobs.length, 6);
    assert.equal(res.warnings.length, 1);
  });
});

describe("HelloWork — salaire affiché", () => {
  it("capture le texte du salaire avec espaces insécables", () => {
    const raw = toRawJob("84618265", fixture("hellowork-job.html"))!;
    assert.equal(raw.salaryRaw, "28 000 - 32 000 € / an");
  });
});
