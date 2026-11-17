import type postgres from "postgres";
import { z } from "zod";
import type { ScoreResult } from "../scoring/score";
import { IGNORE_REASONS, STATUSES, type Salary, type Status } from "../types";

type Sql = postgres.Sql;

export interface JobRow {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  postal_code: string | null;
  distance_km: number | null;
  zone: string;
  contract: string;
  contract_months: number | null;
  remote: string;
  salary: Salary | null;
  description: string | null;
  description_partial: boolean;
  published_at: Date | null;
  valid_through: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
  availability: string;
  availability_checked_at: Date | null;
  score: number | null;
  score_details: ScoreResult | null;
  status: Status;
  is_read: boolean;
  is_favorite: boolean;
  ignore_reason: string | null;
  notes: string | null;
  sources: { source: string; url: string }[];
}

export const filtersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  contract: z.enum(["CDI", "CDD", "AUTRE"]).optional(),
  zone: z.enum(["rouen", "caen", "teletravail", "autre", "inconnue"]).optional(),
  remote: z.enum(["total", "hybride", "aucun", "inconnu"]).optional(),
  family: z.enum(["A", "B", "C", "D", "E", "F"]).optional(),
  source: z.string().trim().max(30).optional(),
  status: z.enum(STATUSES).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  minSalary: z.coerce.number().int().min(0).max(300000).optional(),
  skill: z.string().trim().max(60).optional(),
  only: z.enum(["nouvelles", "non_lues", "favoris", "ecartees", "toutes"]).optional(),
  sort: z.enum(["score", "date", "salaire", "decouverte"]).optional(),
});
export type JobFilters = z.infer<typeof filtersSchema>;

export function parseFilters(params: Record<string, string | string[] | undefined>): JobFilters {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") flat[k] = value;
  }
  const parsed = filtersSchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  // Paramètre invalide : on ignore uniquement les champs fautifs.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const one = filtersSchema.safeParse({ [k]: v });
    if (one.success) Object.assign(out, one.data);
  }
  return out as JobFilters;
}

const SOURCES_SUBQUERY = (sql: Sql) => sql`coalesce((select json_agg(json_build_object('source', s.source, 'url', s.url) order by s.first_seen_at)
  from job_sources s where s.job_id = j.id), '[]'::json) as sources`;

export async function listJobs(sql: Sql, f: JobFilters, limit = 200): Promise<JobRow[]> {
  const only = f.only ?? "toutes";
  const conds = [sql`true`];
  if (only !== "ecartees") conds.push(sql`(j.score_details->>'excluded') is null`);
  if (only === "ecartees") conds.push(sql`(j.score_details->>'excluded') is not null`);
  if (only === "nouvelles") conds.push(sql`j.first_seen_at > now() - interval '24 hours'`);
  if (only === "non_lues") conds.push(sql`not j.is_read`);
  if (only === "favoris") conds.push(sql`j.is_favorite`);
  if (!f.status && only !== "ecartees") conds.push(sql`j.status <> 'ignoree'`);
  if (f.status) conds.push(sql`j.status = ${f.status}`);
  if (f.minScore !== undefined) conds.push(sql`j.score >= ${f.minScore}`);
  if (f.contract === "AUTRE") conds.push(sql`j.contract not in ('CDI', 'CDD')`);
  else if (f.contract) conds.push(sql`j.contract = ${f.contract}`);
  if (f.zone) conds.push(sql`j.zone = ${f.zone}`);
  if (f.remote) conds.push(sql`j.remote = ${f.remote}`);
  if (f.family) conds.push(sql`j.score_details->>'family' = ${f.family}`);
  if (f.source) conds.push(sql`exists (select 1 from job_sources s where s.job_id = j.id and s.source = ${f.source})`);
  if (f.days) conds.push(sql`coalesce(j.published_at, j.first_seen_at) > now() - make_interval(days => ${f.days})`);
  if (f.minSalary) conds.push(sql`coalesce((j.salary->>'annualMax')::numeric, (j.salary->>'annualMin')::numeric) >= ${f.minSalary}`);
  if (f.skill) conds.push(sql`exists (select 1 from jsonb_array_elements(j.score_details->'ownedSkills') e where e->>'label' ilike ${"%" + f.skill + "%"})`);
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`(j.title ilike ${like} or j.company ilike ${like} or j.city ilike ${like} or j.description ilike ${like})`);
  }
  const where = conds.reduce((acc, c) => sql`${acc} and ${c}`);
  const order =
    f.sort === "date"
      ? sql`coalesce(j.published_at, j.first_seen_at) desc`
      : f.sort === "salaire"
        ? sql`coalesce((j.salary->>'annualMax')::numeric, (j.salary->>'annualMin')::numeric) desc nulls last, j.score desc nulls last`
        : f.sort === "decouverte"
          ? sql`j.first_seen_at desc`
          : sql`j.score desc nulls last, coalesce(j.published_at, j.first_seen_at) desc`;
  return sql<JobRow[]>`select j.*, ${SOURCES_SUBQUERY(sql)} from jobs j where ${where} order by ${order} limit ${limit}`;
}

export async function getJob(sql: Sql, id: string): Promise<JobRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const rows = await sql<JobRow[]>`select j.*, ${SOURCES_SUBQUERY(sql)} from jobs j where j.id = ${id}`;
  return rows[0] ?? null;
}

export async function getJobEvents(sql: Sql, id: string) {
  return sql<{ type: string; payload: Record<string, unknown> | null; created_at: Date }[]>`
    select type, payload, created_at from job_events where job_id = ${id} order by created_at desc limit 50`;
}

// --- Mutations (toutes validées, toutes historisées) -------------------------

export const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.uuid(), status: z.enum(STATUSES) }),
  z.object({ action: z.literal("read"), id: z.uuid(), value: z.boolean() }),
  z.object({ action: z.literal("favorite"), id: z.uuid(), value: z.boolean() }),
  z.object({ action: z.literal("ignore"), id: z.uuid(), reason: z.enum(IGNORE_REASONS) }),
  z.object({ action: z.literal("later"), id: z.uuid() }),
  z.object({ action: z.literal("notes"), id: z.uuid(), notes: z.string().max(5000) }),
  z.object({ action: z.literal("report"), id: z.uuid(), message: z.string().trim().min(3).max(1000) }),
]);
export type Mutation = z.infer<typeof mutationSchema>;

export async function applyMutation(sql: Sql, input: unknown): Promise<void> {
  const m = mutationSchema.parse(input);
  await sql.begin(async (tx) => {
    switch (m.action) {
      case "status":
        await tx`update jobs set status = ${m.status}, is_read = true, ignore_reason = case when ${m.status} = 'ignoree' then ignore_reason else null end, updated_at = now() where id = ${m.id}`;
        await tx`insert into job_events (job_id, type, payload) values (${m.id}, 'statut', ${tx.json({ status: m.status })})`;
        break;
      case "read":
        await tx`update jobs set is_read = ${m.value}, updated_at = now() where id = ${m.id}`;
        break;
      case "favorite":
        await tx`update jobs set is_favorite = ${m.value}, updated_at = now() where id = ${m.id}`;
        await tx`insert into job_events (job_id, type, payload) values (${m.id}, 'favori', ${tx.json({ value: m.value })})`;
        break;
      case "ignore":
        await tx`update jobs set status = 'ignoree', ignore_reason = ${m.reason}, is_read = true, updated_at = now() where id = ${m.id}`;
        await tx`insert into job_events (job_id, type, payload) values (${m.id}, 'ignoree', ${tx.json({ reason: m.reason })})`;
        break;
      case "later":
        await tx`update jobs set status = 'plus_tard', is_read = true, updated_at = now() where id = ${m.id}`;
        await tx`insert into job_events (job_id, type, payload) values (${m.id}, 'statut', ${tx.json({ status: "plus_tard" })})`;
        break;
      case "notes":
        await tx`update jobs set notes = ${m.notes || null}, updated_at = now() where id = ${m.id}`;
        break;
      case "report":
        await tx`insert into job_events (job_id, type, payload) values (${m.id}, 'erreur_signalee', ${tx.json({ message: m.message })})`;
        break;
    }
  });
}

// --- Tableau de bord -----------------------------------------------------------

export async function dashboard(sql: Sql) {
  const [counts] = await sql<{ new_today: number; relevant_today: number; relevant_total: number; to_sort: number }[]>`
    select
      count(*) filter (where first_seen_at > now() - interval '24 hours' and (score_details->>'excluded') is null)::int as new_today,
      count(*) filter (where first_seen_at > now() - interval '24 hours' and score >= 70 and (score_details->>'excluded') is null)::int as relevant_today,
      count(*) filter (where score >= 70 and (score_details->>'excluded') is null and status not in ('ignoree') and availability <> 'expiree')::int as relevant_total,
      count(*) filter (where status = 'nouvelle' and (score_details->>'excluded') is null and availability <> 'expiree' and score >= 40)::int as to_sort
    from jobs`;
  const top = await sql<JobRow[]>`select j.*, ${SOURCES_SUBQUERY(sql)} from jobs j
    where (j.score_details->>'excluded') is null and j.status in ('nouvelle', 'a_etudier', 'a_postuler', 'plus_tard') and j.availability <> 'expiree'
    order by j.score desc nulls last, coalesce(j.published_at, j.first_seen_at) desc limit 3`;
  const queue = await sql<JobRow[]>`select j.*, ${SOURCES_SUBQUERY(sql)} from jobs j
    where (j.score_details->>'excluded') is null and j.status = 'nouvelle' and j.availability <> 'expiree' and j.score >= 40
    order by j.score desc nulls last limit 1`;
  const urgent = await sql<JobRow[]>`select j.*, ${SOURCES_SUBQUERY(sql)} from jobs j
    where (j.score_details->>'excluded') is null and j.score >= 65 and j.status in ('nouvelle', 'a_etudier', 'a_postuler', 'plus_tard')
      and j.valid_through is not null and j.valid_through between now() and now() + interval '5 days'
    order by j.valid_through asc limit 5`;
  const [lastRun] = await sql<{ id: number; started_at: Date; finished_at: Date | null; status: string; stats: unknown }[]>`
    select id, started_at, finished_at, status, stats from sync_runs order by started_at desc limit 1`;
  const sources = await sql<{ source: string; last_success_at: Date | null; last_error_at: Date | null; last_error: string | null; last_count: number | null }[]>`
    select source, last_success_at, last_error_at, last_error, last_count from source_status order by source`;
  return { counts, top, next: queue[0] ?? null, urgent, lastRun: lastRun ?? null, sources };
}

export async function syncHistory(sql: Sql, limit = 30) {
  return sql<{ id: number; started_at: Date; finished_at: Date | null; status: string; trigger: string; stats: { totals?: { created: number; updated: number; merged: number }; sources?: { source: string; status: string; message?: string; fetched: number; created: number; warnings: string[] }[] } | null; errors: unknown }[]>`
    select id, started_at, finished_at, status, trigger, stats, errors from sync_runs order by started_at desc limit ${limit}`;
}
