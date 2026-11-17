import type { Metadata } from "next";
import Link from "next/link";
import { followUpAction } from "@/app/actions";
import { EmptyState } from "@/components/ui";
import { board, type BoardRow } from "@/lib/apply/service";
import { db } from "@/lib/db/client";
import { dateShort, isDue } from "@/lib/format";
import { STATUS_LABELS, type Status } from "@/lib/types";

export const metadata: Metadata = { title: "Candidatures" };
export const dynamic = "force-dynamic";

const COLUMNS: Status[] = ["a_etudier", "a_postuler", "candidature_envoyee", "relance_prevue", "entretien", "refus", "offre_recue"];

export default async function ApplicationsPage() {
  const rows = await board(db());
  const byStatus = new Map<string, BoardRow[]>();
  for (const r of rows) byStatus.set(r.status, [...(byStatus.get(r.status) ?? []), r]);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Candidatures</h1>
      {rows.length === 0 && (
        <EmptyState title="Aucune candidature en cours">Depuis une offre, clique sur « Préparer ma candidature ».</EmptyState>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 max-sm:flex-col">
        {COLUMNS.map((status) => {
          const items = byStatus.get(status) ?? [];
          return (
            <section key={status} className="w-full shrink-0 space-y-2 sm:w-72" aria-labelledby={`col-${status}`}>
              <h2 id={`col-${status}`} className="flex items-baseline justify-between text-sm font-semibold">
                {STATUS_LABELS[status]} <span className="text-muted">{items.length}</span>
              </h2>
              {items.map((r) => (
                <article key={r.job_id} className="card space-y-1 p-3 text-sm">
                  <Link href={r.has_pack ? `/offres/${r.job_id}/candidature` : `/offres/${r.job_id}`} className="font-medium hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-text-2">{[r.company, r.city].filter(Boolean).join(" · ")}</p>
                  {r.applied_at && <p className="text-muted">Envoyée le {dateShort(r.applied_at)}</p>}
                  {r.next_action_at && (
                    <p className={isDue(r.next_action_at) ? "font-medium text-warn" : "text-muted"}>
                      {r.next_action} : {dateShort(r.next_action_at)}
                    </p>
                  )}
                  {r.next_action_at && (
                    <form action={followUpAction} className="flex gap-2 pt-1">
                      <input type="hidden" name="id" value={r.job_id} />
                      <input type="hidden" name="redirect" value="/candidatures" />
                      <button name="followup" value="relance_faite" className="btn min-h-8 px-2 text-xs">
                        Relance faite
                      </button>
                      <button name="followup" value="clore" className="btn min-h-8 px-2 text-xs">
                        Plus de relance
                      </button>
                    </form>
                  )}
                  {!r.has_pack && (
                    <Link href={`/offres/${r.job_id}/candidature`} className="text-accent hover:underline">
                      Préparer le pack
                    </Link>
                  )}
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-muted">Pour changer le statut (entretien, refus, offre reçue…), ouvre l&apos;offre : le menu « Statut » est dans la section Suivi.</p>
    </main>
  );
}
