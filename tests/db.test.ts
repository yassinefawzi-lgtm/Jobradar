import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
import { applyMutation, dashboard, getJob, listJobs } from "../src/lib/db/jobs";
import { loadDedupeIndex, refreshAvailability, upsertJob } from "../src/lib/db/repo";
import { findDuplicate } from "../src/lib/dedupe/dedupe";
import { normalizeJob } from "../src/lib/normalize/job";
import { DEFAULT_PREFERENCES } from "../src/lib/scoring/preferences";
import { scoreJob } from "../src/lib/scoring/score";
import type { RawJob } from "../src/lib/types";

/**
 * Tests d'intégration sur une vraie base PostgreSQL.
 * Lancés seulement si TEST_DATABASE_URL est défini (base dédiée : elle est vidée !).
 */
const url = process.env.TEST_DATABASE_URL;
const ZONES = { rouenRadiusKm: 30, caenRadiusKm: 25 };

function raw(over: Partial<RawJob>): RawJob {
  return {
    source: "hellowork",
    sourceJobId: "1",
    url: "https://www.hellowork.com/fr-fr/emplois/1.html",
    title: "Chargé de projet CRM H/F",
    company: "Fictive SAS",
    city: "Rouen",
    postalCode: "76000",
    lat: 49.4431,
    lon: 1.0993,
    contractRaw: "CDI",
    salaryRaw: null,
    salaryStructured: { min: 34000, max: 38000, unit: "YEAR" },
    description: "<p>Pilotage du CRM HubSpot, automatisation des workflows avec Make et Zapier, analyse des besoins métiers. Offre fictive de test.</p>",
    descriptionPartial: false,
    publishedAt: new Date().toISOString(),
    validThrough: null,
    remoteRaw: null,
    ...over,
  };
}

async function save(sql: postgres.Sql, r: RawJob) {
  const job = normalizeJob(r, ZONES);
  const score = scoreJob({ ...job, firstSeenAt: new Date() }, DEFAULT_PREFERENCES);
  const dup = findDuplicate(job, await loadDedupeIndex(sql));
  return upsertJob(sql, job, score, dup?.id ?? null);
}

describe("base de données", { skip: !url && "TEST_DATABASE_URL non défini" }, () => {
  let sql: postgres.Sql;

  before(async () => {
    sql = postgres(url!, { onnotice: () => {}, max: 2 });
    await sql`drop schema public cascade`;
    await sql`create schema public`;
    for (const f of (await readdir("supabase/migrations")).sort()) await sql.unsafe(await readFile(`supabase/migrations/${f}`, "utf8"));
  });
  after(async () => sql?.end());

  it("insère une offre puis la met à jour sans doublon", async () => {
    const a = await save(sql, raw({}));
    assert.equal(a.kind, "nouvelle");
    const b = await save(sql, raw({ title: "Chargé de projet CRM (H/F)" }));
    assert.equal(b.kind, "mise_a_jour");
    assert.equal(b.jobId, a.jobId);
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from jobs`;
    assert.equal(n, 1);
  });

  it("fusionne la même offre venue d'une autre source et conserve les deux URL", async () => {
    const c = await save(sql, raw({ source: "adzuna", sourceJobId: "az-9", url: "https://www.adzuna.fr/details/9?utm_source=x", company: "FICTIVE", descriptionPartial: true }));
    assert.equal(c.kind, "fusion");
    const job = await getJob(sql, c.jobId);
    assert.deepEqual(job!.sources.map((s) => s.source).sort(), ["adzuna", "hellowork"]);
  });

  it("les statuts, favoris et notes persistent et ne sont jamais écrasés par une synchro", async () => {
    const [{ id }] = await sql<{ id: string }[]>`select id from jobs limit 1`;
    await applyMutation(sql, { action: "favorite", id, value: true });
    await applyMutation(sql, { action: "status", id, status: "a_postuler" });
    await applyMutation(sql, { action: "notes", id, notes: "Relancer lundi" });
    await save(sql, raw({}));
    const job = await getJob(sql, id);
    assert.equal(job!.is_favorite, true);
    assert.equal(job!.status, "a_postuler");
    assert.equal(job!.notes, "Relancer lundi");
    assert.equal(job!.is_read, true);
    const events = await sql`select type from job_events where job_id = ${id}`;
    assert.ok(events.length >= 2);
  });

  it("ignorer avec une raison ; l'offre sort de la liste par défaut", async () => {
    const r = await save(sql, raw({ sourceJobId: "2", url: "https://www.hellowork.com/fr-fr/emplois/2.html", title: "Chargé d'automatisation", company: "Autre fictive" }));
    await applyMutation(sql, { action: "ignore", id: r.jobId, reason: "trop_technique" });
    const list = await listJobs(sql, {});
    assert.ok(!list.some((j) => j.id === r.jobId));
    const ignored = await listJobs(sql, { status: "ignoree" });
    assert.equal(ignored[0].ignore_reason, "trop_technique");
  });

  it("rejette les entrées invalides", async () => {
    await assert.rejects(applyMutation(sql, { action: "status", id: "pas-un-uuid", status: "a_postuler" }));
    await assert.rejects(applyMutation(sql, { action: "status", id: "00000000-0000-4000-8000-000000000000", status: "pirate" }));
  });

  it("filtres : score minimum, contrat, recherche texte, écartées", async () => {
    await save(sql, raw({ sourceJobId: "3", url: "https://www.hellowork.com/fr-fr/emplois/3.html", title: "Commercial terrain", company: "Vente fictive" }));
    assert.ok((await listJobs(sql, { only: "ecartees" })).some((j) => j.title === "Commercial terrain"));
    assert.ok(!(await listJobs(sql, {})).some((j) => j.title === "Commercial terrain"));
    assert.ok((await listJobs(sql, { q: "crm" })).length >= 1);
    assert.equal((await listJobs(sql, { contract: "CDD" })).length, 0);
    assert.ok((await listJobs(sql, { minScore: 101 as never })).length === 0);
  });

  it("disponibilité : expirée si la date limite est passée", async () => {
    const r = await save(sql, raw({ sourceJobId: "4", url: "https://www.hellowork.com/fr-fr/emplois/4.html", title: "Chef de projet digital", company: "Expirée fictive", validThrough: "2020-01-01T00:00:00Z" }));
    await refreshAvailability(sql);
    assert.equal((await getJob(sql, r.jobId))!.availability, "expiree");
  });

  it("tableau de bord", async () => {
    const d = await dashboard(sql);
    assert.ok(d.counts.new_today >= 1);
    assert.ok(d.top.length >= 1);
  });
});
