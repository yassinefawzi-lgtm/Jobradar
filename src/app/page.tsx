import Link from "next/link";
import { TriageCard } from "@/components/triage";
import { EmptyState, JobCard } from "@/components/ui";
import { db } from "@/lib/db/client";
import { dashboard } from "@/lib/db/jobs";
import { dateShort, dateTime, relativeDays, SOURCE_LABELS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const d = await dashboard(db());
  const okSources = d.sources.filter((s) => s.last_success_at && (!s.last_error_at || s.last_success_at > s.last_error_at));
  const errSources = d.sources.filter((s) => s.last_error_at && (!s.last_success_at || s.last_error_at >= s.last_success_at));

  return (
    <main className="space-y-8">
      <header>
        <p className="text-sm text-muted">{dateShort(new Date())}</p>
        <h1 className="text-2xl font-semibold">Aujourd&apos;hui</h1>
      </header>

      <section className="grid grid-cols-3 gap-2" aria-label="Chiffres du jour">
        <Stat label="Nouvelles (24 h)" value={d.counts.new_today} />
        <Stat label="Pertinentes (≥ 70)" value={d.counts.relevant_total} hint={`${d.counts.relevant_today} aujourd'hui`} />
        <Stat label="À trier" value={d.counts.to_sort} />
      </section>

      <section aria-labelledby="top-titre" className="space-y-3">
        <h2 id="top-titre" className="text-lg font-semibold">
          Les 3 offres à regarder en premier
        </h2>
        {d.top.length ? (
          d.top.map((job) => <JobCard key={job.id} job={job} />)
        ) : (
          <EmptyState title="Aucune offre à proposer pour l'instant">
            Lance une synchronisation (<code>pnpm sync</code>) ou élargis tes critères.
          </EmptyState>
        )}
      </section>

      {d.urgent.length > 0 && (
        <section aria-labelledby="urgent-titre" className="space-y-3">
          <h2 id="urgent-titre" className="text-lg font-semibold">
            À traiter vite (clôture sous 5 jours)
          </h2>
          {d.urgent.map((job) => (
            <JobCard key={job.id} job={job} showReason={false} />
          ))}
        </section>
      )}

      {d.next && <TriageCard job={d.next} remaining={d.counts.to_sort} />}

      <footer className="card space-y-1 p-4 text-sm text-text-2">
        <p>
          Dernière synchronisation :{" "}
          {d.lastRun ? (
            <>
              {dateTime(d.lastRun.started_at)} ({relativeDays(d.lastRun.started_at)}) —{" "}
              <span className={d.lastRun.status === "succes" ? "text-good" : d.lastRun.status === "echec" ? "text-bad" : "text-warn"}>{d.lastRun.status}</span>
            </>
          ) : (
            "jamais"
          )}
        </p>
        <p>
          Sources actives : {okSources.length ? okSources.map((s) => SOURCE_LABELS[s.source] ?? s.source).join(", ") : "aucune"}
          {errSources.length > 0 && (
            <span className="text-bad"> · en erreur : {errSources.map((s) => SOURCE_LABELS[s.source] ?? s.source).join(", ")}</span>
          )}
        </p>
        <Link href="/diagnostic" className="text-accent hover:underline">
          Diagnostic des sources
        </Link>
      </footer>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-text-2">{label}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
