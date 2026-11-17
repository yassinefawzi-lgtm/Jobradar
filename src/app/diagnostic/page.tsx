import type { Metadata } from "next";
import { Chip } from "@/components/ui";
import { db } from "@/lib/db/client";
import { dashboard, syncHistory } from "@/lib/db/jobs";
import { dateTime, SOURCE_LABELS } from "@/lib/format";
import { defaultConnectors } from "@/lib/sync/run";

export const metadata: Metadata = { title: "Synchronisation" };
export const dynamic = "force-dynamic";

export default async function DiagnosticPage() {
  const sql = db();
  const [{ sources }, runs] = await Promise.all([dashboard(sql), syncHistory(sql)]);
  const connectors = defaultConnectors();

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Synchronisation</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sources</h2>
        {connectors.map((c) => {
          const st = sources.find((s) => s.source === c.id);
          const reason = c.unavailableReason();
          const inError = st?.last_error_at && (!st.last_success_at || st.last_error_at >= st.last_success_at);
          return (
            <div key={c.id} className="card p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                {reason ? <Chip tone="warn">Non configurée</Chip> : inError ? <Chip tone="bad">En erreur</Chip> : st?.last_success_at ? <Chip tone="good">Active</Chip> : <Chip>Jamais lancée</Chip>}
              </div>
              {reason && <p className="mt-1 text-text-2">{reason}</p>}
              {st && (
                <p className="mt-1 text-text-2">
                  Dernier succès : {dateTime(st.last_success_at)} · {st.last_count ?? 0} offres vues
                  {inError && <span className="block text-bad">Erreur ({dateTime(st.last_error_at)}) : {st.last_error}</span>}
                </p>
              )}
            </div>
          );
        })}
        <p className="text-sm text-muted">
          Synchronisation manuelle : <code>pnpm sync</code>. La planification quotidienne (7 h 30) arrive en phase 4.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Historique</h2>
        {runs.length === 0 && <p className="text-sm text-text-2">Aucune synchronisation pour l&apos;instant.</p>}
        {runs.map((r) => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                #{r.id} · {dateTime(r.started_at)} · {r.trigger}
              </span>
              <Chip tone={r.status === "succes" ? "good" : r.status === "echec" ? "bad" : "warn"}>{r.status}</Chip>
            </div>
            {r.stats?.totals && (
              <p className="mt-1 text-text-2">
                {r.stats.totals.created} nouvelles · {r.stats.totals.merged} fusionnées · {r.stats.totals.updated} mises à jour
              </p>
            )}
            <ul className="mt-1 text-text-2">
              {r.stats?.sources?.map((s) => (
                <li key={s.source}>
                  {SOURCE_LABELS[s.source] ?? s.source} : {s.status}
                  {s.message ? ` — ${s.message}` : ""}
                  {s.warnings?.length ? ` (${s.warnings.join(" ; ")})` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
