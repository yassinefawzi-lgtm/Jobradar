import type postgres from "postgres";
import type { ExistingJob } from "../dedupe/dedupe";
import type { GeocodeCache } from "../geo/geocode";
import { mergePreferences, type Preferences } from "../scoring/preferences";
import type { ScoreResult } from "../scoring/score";
import type { NormalizedJob } from "../types";

type Sql = postgres.Sql;
// postgres.js attend des valeurs JSON ; on passe par un cast explicite.
const asJson = (v: unknown) => v as postgres.JSONValue;

export async function loadPreferences(sql: Sql): Promise<Preferences> {
  const rows = await sql<{ value: unknown }[]>`select value from settings where key = 'preferences'`;
  return mergePreferences(rows[0]?.value);
}

export async function savePreferences(sql: Sql, prefs: Preferences): Promise<void> {
  await sql`insert into settings (key, value) values ('preferences', ${sql.json(asJson(prefs))})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
}

export function geocodeCacheFor(sql: Sql): GeocodeCache {
  return {
    async get(key) {
      const rows = await sql<{ lat: number | null; lon: number | null }[]>`select lat, lon from geocache where key = ${key}`;
      if (!rows.length) return undefined;
      const r = rows[0];
      return { point: r.lat !== null && r.lon !== null ? { lat: r.lat, lon: r.lon } : null };
    },
    async set(key, point, label) {
      await sql`insert into geocache (key, lat, lon, label) values (${key}, ${point?.lat ?? null}, ${point?.lon ?? null}, ${label})
        on conflict (key) do nothing`;
    },
  };
}

export async function knownSourceIds(sql: Sql, source: string): Promise<Set<string>> {
  const rows = await sql<{ source_job_id: string }[]>`select source_job_id from job_sources where source = ${source}`;
  return new Set(rows.map((r) => r.source_job_id));
}

export async function loadDedupeIndex(sql: Sql): Promise<ExistingJob[]> {
  const rows = await sql<
    { id: string; fingerprint: string; title: string; company: string | null; city: string | null; description: string | null; urls: string[] }[]
  >`select j.id, j.fingerprint, j.title, j.company, j.city, left(j.description, 4000) as description,
        coalesce(array_agg(s.canonical_url) filter (where s.canonical_url is not null), '{}') as urls
      from jobs j left join job_sources s on s.job_id = j.id
      where j.last_seen_at > now() - interval '120 days'
      group by j.id`;
  return rows.map((r) => ({ ...r, canonicalUrl: r.urls[0] ?? "", canonicalUrls: r.urls }));
}

export interface UpsertOutcome {
  jobId: string;
  kind: "nouvelle" | "mise_a_jour" | "fusion";
}

/**
 * Enregistre une offre normalisée. N'écrase jamais les champs choisis par l'utilisateur
 * (statut, favori, notes, lu). En cas de doublon, ajoute la source à l'offre existante
 * et complète les champs manquants.
 */
export async function upsertJob(
  sql: Sql,
  job: NormalizedJob,
  score: ScoreResult,
  duplicateOf: string | null,
): Promise<UpsertOutcome> {
  return sql.begin(async (tx) => {
    const existingSource = await tx<{ job_id: string }[]>`
      select job_id from job_sources where source = ${job.source} and source_job_id = ${job.sourceJobId}`;
    const targetId = existingSource[0]?.job_id ?? duplicateOf;
    if (targetId) {
      await tx`update jobs set
          title = case when ${existingSource.length > 0} then ${job.title} else title end,
          description = case when description is null or (description_partial and ${!job.descriptionPartial}) then ${job.description} else description end,
          description_partial = case when description is null or (description_partial and ${!job.descriptionPartial}) then ${job.descriptionPartial} else description_partial end,
          salary = coalesce(salary, ${job.salary ? sql.json(asJson(job.salary)) : null}),
          lat = coalesce(lat, ${job.lat}), lon = coalesce(lon, ${job.lon}),
          distance_km = coalesce(distance_km, ${job.distanceKm}),
          zone = case when zone = 'inconnue' then ${job.zone} else zone end,
          published_at = coalesce(published_at, ${job.publishedAt}),
          valid_through = coalesce(${job.validThrough}, valid_through),
          last_seen_at = now(), availability = 'active', availability_checked_at = now(),
          updated_at = now()
        where id = ${targetId}`;
      if (existingSource.length) {
        await tx`update job_sources set last_seen_at = now(), url = ${job.url}, canonical_url = ${job.canonicalUrl}, raw = ${sql.json(asJson(job.raw))}
          where source = ${job.source} and source_job_id = ${job.sourceJobId}`;
      } else {
        await tx`insert into job_sources (job_id, source, source_job_id, url, canonical_url, raw)
          values (${targetId}, ${job.source}, ${job.sourceJobId}, ${job.url}, ${job.canonicalUrl}, ${sql.json(asJson(job.raw))})`;
        await tx`insert into job_events (job_id, type, payload) values (${targetId}, 'fusion', ${sql.json({ source: job.source, url: job.url })})`;
      }
      return { jobId: targetId, kind: existingSource.length ? "mise_a_jour" : "fusion" };
    }
    const [row] = await tx<{ id: string }[]>`
      insert into jobs (fingerprint, title, company, city, postal_code, lat, lon, distance_km, zone, contract, contract_months, remote,
        salary, description, description_partial, published_at, valid_through, availability, availability_checked_at,
        score, score_details, scored_at)
      values (${job.fingerprint}, ${job.title}, ${job.company}, ${job.city}, ${job.postalCode}, ${job.lat}, ${job.lon}, ${job.distanceKm},
        ${job.zone}, ${job.contract}, ${job.contractMonths}, ${job.remote}, ${job.salary ? sql.json(asJson(job.salary)) : null},
        ${job.description}, ${job.descriptionPartial}, ${job.publishedAt}, ${job.validThrough}, 'active', now(),
        ${score.score}, ${sql.json(asJson(score))}, now())
      returning id`;
    await tx`insert into job_sources (job_id, source, source_job_id, url, canonical_url, raw)
      values (${row.id}, ${job.source}, ${job.sourceJobId}, ${job.url}, ${job.canonicalUrl}, ${sql.json(asJson(job.raw))})`;
    return { jobId: row.id, kind: "nouvelle" };
  });
}

export async function markSeen(sql: Sql, source: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await sql`update job_sources set last_seen_at = now() where source = ${source} and source_job_id in ${sql(ids)}`;
  await sql`update jobs set last_seen_at = now(), availability = 'active', availability_checked_at = now()
    where id in (select job_id from job_sources where source = ${source} and source_job_id in ${sql(ids)})`;
}

/** Disponibilité : expirée si la date limite est dépassée ; inconnue si plus vue depuis 21 jours. */
export async function refreshAvailability(sql: Sql): Promise<void> {
  await sql`update jobs set availability = 'expiree', availability_checked_at = now()
    where availability <> 'expiree' and valid_through is not null and valid_through < now()`;
  await sql`update jobs set availability = 'inconnue'
    where availability = 'active' and last_seen_at < now() - interval '21 days' and (valid_through is null or valid_through >= now())`;
}

export async function saveScore(sql: Sql, jobId: string, score: ScoreResult): Promise<void> {
  await sql`update jobs set score = ${score.score}, score_details = ${sql.json(asJson(score))}, scored_at = now() where id = ${jobId}`;
}

export async function startRun(sql: Sql, trigger: string): Promise<number> {
  const [r] = await sql<{ id: number }[]>`insert into sync_runs (trigger) values (${trigger}) returning id`;
  return r.id;
}

export async function finishRun(sql: Sql, id: number, status: string, stats: unknown, errors: unknown): Promise<void> {
  await sql`update sync_runs set finished_at = now(), status = ${status}, stats = ${sql.json(asJson(stats))}, errors = ${sql.json(asJson(errors))} where id = ${id}`;
}

export async function recordSourceStatus(
  sql: Sql,
  source: string,
  result: { ok: boolean; count?: number; error?: string },
): Promise<void> {
  if (result.ok) {
    await sql`insert into source_status (source, last_run_at, last_success_at, last_count, last_error)
      values (${source}, now(), now(), ${result.count ?? 0}, null)
      on conflict (source) do update set last_run_at = now(), last_success_at = now(), last_count = excluded.last_count, last_error = null`;
  } else {
    await sql`insert into source_status (source, last_run_at, last_error_at, last_error)
      values (${source}, now(), now(), ${result.error ?? "Erreur inconnue"})
      on conflict (source) do update set last_run_at = now(), last_error_at = now(), last_error = excluded.last_error`;
  }
}
