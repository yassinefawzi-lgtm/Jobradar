import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { geocodeCity } from "../src/lib/geo/geocode";
import { normalizeJob } from "../src/lib/normalize/job";
import { emailConnector } from "../src/lib/sources/email/connector";
import type { Mailbox } from "../src/lib/sources/email/mailbox";
import { isAlertSender, parseAlertEmail, parseByLinks, parseIndeed, relativeToDate, unwrapTracking } from "../src/lib/sources/email/parsers";
import { PoliteHttp } from "../src/lib/sources/http";
import { dispatchConfigured, dispatchSync } from "../src/lib/sync/dispatch";
import { renderDigest } from "../src/lib/notify/digest";

const REF = new Date("2026-11-17T10:30:00Z");
const indeedHtml = readFileSync(new URL("./fixtures/indeed-alert.html", import.meta.url), "utf8");
const mail = (over: Partial<Parameters<typeof parseAlertEmail>[0]> & { uid?: number }) => ({
  uid: 1,
  from: "donotreply@jobalert.indeed.com",
  subject: "Alerte",
  html: indeedHtml,
  text: null,
  date: REF,
  ...over,
});

describe("e-mails d'alerte : Indeed (e-mail réel anonymisé)", () => {
  const jobs = parseIndeed(mail({}));
  it("lit les 10 offres avec entreprise, lieu, salaire et extrait", () => {
    assert.equal(jobs.length, 10);
    const vt = jobs.find((j) => j.company === "VERT-TIGES")!;
    assert.equal(vt.title, "Développeur(se) Web & Projets Digitaux (H/F)");
    assert.equal(vt.city, "Épreville");
    assert.equal(vt.postalCode, "76");
    assert.equal(vt.salaryRaw, "De 25 000 € à 30 000 € par an");
    assert.ok(vt.description!.startsWith("VERT-TIGES* est une PME"));
    assert.equal(vt.publishedAt, new Date(REF.getTime() - 2 * 86_400_000).toISOString());
    assert.equal(vt.descriptionPartial, true);
    assert.match(vt.url, /^https:\/\/engage\.indeed\.com/);
  });
  it("identifiant stable (même offre dans deux e-mails = même identifiant)", () => {
    assert.deepEqual(parseIndeed(mail({})).map((j) => j.sourceJobId), jobs.map((j) => j.sourceJobId));
    assert.equal(new Set(jobs.map((j) => j.sourceJobId)).size, jobs.length);
  });
  it("les offres passent la normalisation (salaire, contrat écarté par le score)", () => {
    const n = normalizeJob(jobs.find((j) => j.company === "VERT-TIGES")!, { rouenRadiusKm: 30, caenRadiusKm: 25 });
    assert.equal(n.salary?.annualMin, 25000);
  });
});

describe("e-mails d'alerte : utilitaires", () => {
  it("dates relatives", () => {
    assert.equal(relativeToDate("Publié à l'instant", REF), REF.toISOString());
    assert.equal(relativeToDate("il y a 3 heures", REF), new Date(REF.getTime() - 3 * 3_600_000).toISOString());
    assert.equal(relativeToDate("bientôt", REF), null);
  });
  it("retrouve l'URL réelle cachée dans un lien de suivi (base64)", () => {
    const target = "moi@exemple.fr🪢https://www.hellowork.com/fr-fr/emplois/12345678.html?utm_source=alerte";
    const b64 = Buffer.from(target).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    assert.equal(unwrapTracking(`https://emails.hellowork.com/clic/abc/1/def/${b64}`), "https://www.hellowork.com/fr-fr/emplois/12345678.html?utm_source=alerte");
    assert.equal(unwrapTracking("https://exemple.fr/r?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F42"), "https://www.linkedin.com/jobs/view/42");
  });
  it("expéditeurs autorisés uniquement", () => {
    assert.ok(isAlertSender("Indeed <donotreply@jobalert.indeed.com>"));
    assert.ok(isAlertSender("jobalerts-noreply@linkedin.com"));
    assert.ok(!isAlertSender("newsletter@aliexpress.com"));
    assert.equal(parseAlertEmail(mail({ from: "promo@temu.com" })), null);
  });
  it("lecture par liens (e-mail fictif LinkedIn / WTTJ / France Travail)", () => {
    const html = `
      <a href="https://www.linkedin.com/comm/jobs/view/4012345678?trk=eml"><img alt=""></a>
      <a href="https://www.linkedin.com/comm/jobs/view/4012345678?trk=eml">Chargé de projet CRM (fictif)</a>
      <a href="https://www.linkedin.com/comm/jobs/view/4012345678?trk=eml">Voir l'offre</a>
      <a href="https://www.welcometothejungle.com/fr/companies/exemple/jobs/growth-marketer_rouen?utm=x">Growth Marketer (fictif)</a>
      <a href="https://candidat.francetravail.fr/offres/recherche/detail/201ABCD">Chef de projet digital (fictif)</a>
      <a href="https://www.linkedin.com/jobs/">Toutes les offres</a>`;
    const jobs = parseByLinks({ from: "jobalerts-noreply@linkedin.com", subject: "", html, text: null, date: REF });
    assert.deepEqual(
      jobs.map((j) => [j.source, j.sourceJobId, j.title]),
      [
        ["linkedin", "4012345678", "Chargé de projet CRM (fictif)"],
        ["wttj", "exemple/growth-marketer_rouen", "Growth Marketer (fictif)"],
        ["francetravail", "201ABCD", "Chef de projet digital (fictif)"],
      ],
    );
    assert.equal(jobs[0].url, "https://www.linkedin.com/jobs/view/4012345678");
  });
});

describe("connecteur e-mail : corbeille seulement après enregistrement", () => {
  function fakeBox(mails: ReturnType<typeof mail>[]) {
    const state = { trashed: [] as number[], closed: false };
    const box: Mailbox = {
      fetchAlerts: async () => mails,
      trash: async (uids) => {
        state.trashed.push(...uids);
        return uids.length;
      },
      close: async () => {
        state.closed = true;
      },
    };
    return { box, state };
  }
  const env = { GMAIL_USER: "x", GMAIL_APP_PASSWORD: "y" };
  const ctx = { http: new PoliteHttp(), queries: [], maxAgeDays: 7, knownIds: new Set<string>(), log: () => {} };

  it("non configuré : indisponible", () => {
    assert.match(emailConnector({}).unavailableReason()!, /GMAIL_USER/);
  });
  it("met à la corbeille les e-mails entièrement enregistrés, garde les autres", async () => {
    const empty = mail({ uid: 3, from: "jobalerts-noreply@linkedin.com", html: "<p>Rien</p>", subject: "Vide" });
    const { box, state } = fakeBox([mail({ uid: 1 }), mail({ uid: 2, html: indeedHtml.replace("VERT-TIGES", "AUTRE") }), empty]);
    const res = await emailConnector(env, async () => box).fetch(ctx);
    assert.equal(res.jobs.length, 20);
    assert.equal(res.warnings.length, 1); // e-mail sans offre conservé et signalé
    const failedKey = `indeed:${res.jobs.find((j) => j.company === "AUTRE")!.sourceJobId}`;
    const n = await res.commit!(new Set([failedKey]));
    assert.equal(n, 1);
    assert.deepEqual(state.trashed, [1]);
    assert.equal(state.closed, true);
  });
});

describe("géocodage avec département (« Eu (76) »)", () => {
  it("ajoute le département à la requête et garde la bonne commune", async () => {
    let asked = "";
    const fakeFetch = (async (url: string) => {
      asked = url;
      return Response.json({
        features: [
          { geometry: { coordinates: [1.0, 45.0] }, properties: { label: "Eu ailleurs", postcode: "33000" } },
          { geometry: { coordinates: [1.42, 50.04] }, properties: { label: "Eu", postcode: "76260" } },
        ],
      });
    }) as unknown as typeof fetch;
    const mem = new Map();
    const p = await geocodeCity("Eu", "76", { get: async (k) => mem.get(k), set: async (k, point) => void mem.set(k, { point }) }, fakeFetch);
    assert.deepEqual(p, { lat: 50.04, lon: 1.42 });
    assert.match(decodeURIComponent(asked), /q=Eu\+76|q=Eu 76/);
  });
});

describe("déclenchement manuel et résumé", () => {
  it("lancement GitHub : non configuré puis appel correct", async () => {
    assert.equal(dispatchConfigured({}), false);
    let call: { url: string; init: RequestInit } | null = null;
    const r = await dispatchSync({ GITHUB_DISPATCH_TOKEN: "t", GITHUB_REPOSITORY: "moi/jobradar" }, (async (url: string, init: RequestInit) => {
      call = { url, init };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch);
    assert.equal(r.ok, true);
    assert.equal(call!.url, "https://api.github.com/repos/moi/jobradar/actions/workflows/sync.yml/dispatches");
    assert.equal((call!.init.headers as Record<string, string>).Authorization, "Bearer t");
  });
  it("résumé : contenu et échappement HTML", () => {
    const d = renderDigest(
      [{ id: "1", title: "Chargé <CRM>", company: "Fictive", city: "Rouen", zone: "rouen", distance_km: 2, contract: "CDI", contract_months: null, salary: null, score: 88, summary: "Missions alignées", url: "https://ex.fr/1" }],
      "https://jobradar.example",
    );
    assert.match(d.subject, /1 nouvelle offre/);
    assert.ok(d.html.includes("Chargé &lt;CRM&gt;"));
    assert.ok(d.text.includes("https://jobradar.example/offres/1"));
  });
});
