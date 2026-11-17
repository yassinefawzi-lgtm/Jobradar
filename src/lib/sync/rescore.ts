import type postgres from "postgres";
import { saveScore } from "../db/repo";
import { computeZone } from "../normalize/job";
import { normalizeSalary } from "../normalize/salary";
import type { Preferences } from "../scoring/preferences";
import { scoreJob } from "../scoring/score";
import type { Contract, RawJob, Remote, Salary, Zone } from "../types";

interface Row {
  id: string;
  title: string;
  company: string | null;
  description: string | null;
  description_partial: boolean;
  contract: Contract;
  contract_months: number | null;
  remote: Remote;
  zone: Zone;
  lat: number | null;
  lon: number | null;
  distance_km: number | null;
  salary: Salary | null;
  published_at: Date | null;
  first_seen_at: Date;
  raw_salary: { salaryRaw: string | null; salaryStructured: RawJob["salaryStructured"] } | null;
}

/** Recalcule le score de toutes les offres non expirées (après une synchro ou un changement de préférences). */
export async function rescoreAll(sql: postgres.Sql, prefs: Preferences): Promise<number> {
  const rows = await sql<Row[]>`
    select id, title, company, description, description_partial, contract, contract_months, remote, zone, lat, lon,
      distance_km, salary, published_at, first_seen_at,
      (select jsonb_build_object('salaryRaw', s.raw->'salaryRaw', 'salaryStructured', s.raw->'salaryStructured')
         from job_sources s where s.job_id = jobs.id and (s.raw->'salaryStructured' <> 'null'::jsonb or s.raw->'salaryRaw' <> 'null'::jsonb)
         order by s.first_seen_at limit 1) as raw_salary
    from jobs where availability <> 'expiree' or score is null`;
  const settings = { rouenRadiusKm: prefs.rouenRadiusKm, caenRadiusKm: prefs.caenRadiusKm };
  for (const r of rows) {
    // Salaire recalculé depuis les données brutes conservées : une correction du code profite aux offres existantes.
    if (r.raw_salary) {
      const salary = normalizeSalary({ raw: r.raw_salary.salaryRaw, structured: r.raw_salary.salaryStructured });
      if (JSON.stringify(salary) !== JSON.stringify(r.salary)) {
        r.salary = salary;
        await sql`update jobs set salary = ${salary ? sql.json(salary as unknown as postgres.JSONValue) : null} where id = ${r.id}`;
      }
    }
    let zone = r.zone;
    let distanceKm = r.distance_km;
    if (r.lat !== null && r.lon !== null) {
      const z = computeZone({ lat: r.lat, lon: r.lon }, r.remote, settings);
      zone = z.zone;
      distanceKm = z.distanceKm !== null ? Math.round(z.distanceKm * 10) / 10 : null;
      if (zone !== r.zone) await sql`update jobs set zone = ${zone}, distance_km = ${distanceKm} where id = ${r.id}`;
    }
    const score = scoreJob(
      {
        title: r.title,
        company: r.company,
        description: r.description,
        descriptionPartial: r.description_partial,
        contract: r.contract,
        contractMonths: r.contract_months,
        remote: r.remote,
        zone,
        distanceKm,
        salary: r.salary,
        publishedAt: r.published_at,
        firstSeenAt: r.first_seen_at,
      },
      prefs,
    );
    await saveScore(sql, r.id, score);
  }
  return rows.length;
}
