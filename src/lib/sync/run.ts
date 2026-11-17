import type postgres from "postgres";
import { findDuplicate } from "../dedupe/dedupe";
import { geocodeCity } from "../geo/geocode";
import { computeZone, normalizeJob } from "../normalize/job";
import {
  finishRun,
  geocodeCacheFor,
  knownSourceIds,
  loadDedupeIndex,
  loadPreferences,
  markSeen,
  recordSourceStatus,
  refreshAvailability,
  startRun,
  upsertJob,
} from "../db/repo";
import { isExcludedTitle, scoreJob } from "../scoring/score";
import { adzunaConnector } from "../sources/adzuna";
import { franceTravailConnector } from "../sources/francetravail";
import { helloworkConnector } from "../sources/hellowork";
import { PoliteHttp, SourceBlockedError } from "../sources/http";
import { type Connector, defaultQueries } from "../sources/types";
import { rescoreAll } from "./rescore";

export interface SyncOptions {
  trigger?: "manuel" | "planifie" | "cli";
  /** Fenêtre de recherche : 30 jours pour le premier passage, puis 7 jours. */
  maxAgeDays?: number;
  connectors?: Connector[];
  only?: string[];
  log?: (msg: string) => void;
  fetchImpl?: typeof fetch;
}

export interface SourceReport {
  source: string;
  status: "ok" | "partiel" | "erreur" | "indisponible";
  message?: string;
  fetched: number;
  created: number;
  updated: number;
  merged: number;
  warnings: string[];
}

export interface SyncReport {
  runId: number;
  status: "succes" | "partiel" | "echec";
  sources: SourceReport[];
  totals: { created: number; updated: number; merged: number };
}

export function defaultConnectors(): Connector[] {
  return [helloworkConnector(), franceTravailConnector(), adzunaConnector()];
}

export async function runSync(sql: postgres.Sql, opts: SyncOptions = {}): Promise<SyncReport> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const prefs = await loadPreferences(sql);
  const runId = await startRun(sql, opts.trigger ?? "cli");
  const firstRun = Number((await sql<{ n: number }[]>`select count(*)::int as n from jobs`)[0].n) === 0;
  const maxAgeDays = opts.maxAgeDays ?? (firstRun ? 30 : 7);
  const queries = defaultQueries(prefs.acceptCaen);
  const geoCache = geocodeCacheFor(sql);
  const zoneSettings = { rouenRadiusKm: prefs.rouenRadiusKm, caenRadiusKm: prefs.caenRadiusKm };
  const connectors = (opts.connectors ?? defaultConnectors()).filter((c) => !opts.only || opts.only.includes(c.id));
  const reports: SourceReport[] = [];
  log(`Synchronisation #${runId} — fenêtre ${maxAgeDays} jours, ${queries.length} recherches`);

  for (const connector of connectors) {
    const report: SourceReport = { source: connector.id, status: "ok", fetched: 0, created: 0, updated: 0, merged: 0, warnings: [] };
    reports.push(report);
    const reason = connector.unavailableReason();
    if (reason) {
      report.status = "indisponible";
      report.message = reason;
      log(`- ${connector.label} : non utilisée (${reason})`);
      continue;
    }
    const http = new PoliteHttp({
      fetchImpl: opts.fetchImpl,
      delayMs: Number(process.env.SYNC_REQUEST_DELAY_MS ?? 1500),
      maxRequests: Number(process.env.SYNC_MAX_REQUESTS_PER_SOURCE ?? 150),
    });
    try {
      const known = await knownSourceIds(sql, connector.id);
      const result = await connector.fetch({ http, queries, maxAgeDays, knownIds: known, log, skipDetail: isExcludedTitle });
      report.fetched = result.jobs.length;
      report.warnings.push(...result.warnings);
      await markSeen(sql, connector.id, result.seenIds);
      const index = await loadDedupeIndex(sql);
      for (const raw of result.jobs) {
        try {
          let job = normalizeJob(raw, zoneSettings);
          if (job.lat === null && (job.city || job.postalCode)) {
            const point = await geocodeCity(job.city, job.postalCode, geoCache, opts.fetchImpl);
            if (point) {
              const { zone, distanceKm } = computeZone(point, job.remote, zoneSettings);
              job = { ...job, lat: point.lat, lon: point.lon, zone, distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null };
            }
          }
          const score = scoreJob({ ...job, firstSeenAt: new Date() }, prefs);
          const dup = findDuplicate(job, index);
          const outcome = await upsertJob(sql, job, score, dup?.id ?? null);
          if (outcome.kind === "nouvelle") {
            report.created++;
            index.push({ id: outcome.jobId, canonicalUrl: job.canonicalUrl, canonicalUrls: [job.canonicalUrl], fingerprint: job.fingerprint, title: job.title, company: job.company, city: job.city, description: job.description });
          } else if (outcome.kind === "fusion") report.merged++;
          else report.updated++;
        } catch (err) {
          // Une offre mal formée ne bloque jamais les autres.
          report.warnings.push(`${raw.source}/${raw.sourceJobId} ignorée : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (report.warnings.length) report.status = "partiel";
      await recordSourceStatus(sql, connector.id, { ok: true, count: result.seenIds.length });
      log(`- ${connector.label} : ${report.fetched} offres détaillées, ${report.created} nouvelles, ${report.merged} fusionnées, ${report.updated} mises à jour (${http.count} requêtes)`);
      for (const w of report.warnings) log(`  ! ${w}`);
    } catch (err) {
      report.status = "erreur";
      report.message = err instanceof SourceBlockedError ? `${err.message} — collecte arrêtée, aucun contournement` : err instanceof Error ? err.message : String(err);
      await recordSourceStatus(sql, connector.id, { ok: false, error: report.message });
      log(`- ${connector.label} : ERREUR ${report.message}`);
    }
  }

  await refreshAvailability(sql);
  const rescored = await rescoreAll(sql, prefs);
  log(`Scores recalculés : ${rescored} offres`);

  const usable = reports.filter((r) => r.status !== "indisponible");
  const status: SyncReport["status"] =
    usable.length === 0 || usable.every((r) => r.status === "erreur")
      ? "echec"
      : usable.some((r) => r.status !== "ok")
        ? "partiel"
        : "succes";
  const totals = {
    created: reports.reduce((a, r) => a + r.created, 0),
    updated: reports.reduce((a, r) => a + r.updated, 0),
    merged: reports.reduce((a, r) => a + r.merged, 0),
  };
  await finishRun(
    sql,
    runId,
    status,
    { totals, sources: reports, maxAgeDays },
    reports.filter((r) => r.status === "erreur").map((r) => ({ source: r.source, message: r.message })),
  );
  log(`Terminé : ${status} — ${totals.created} nouvelles, ${totals.merged} fusionnées, ${totals.updated} mises à jour`);
  return { runId, status, sources: reports, totals };
}
