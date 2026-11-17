import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { mutateJob } from "@/app/actions";
import { Chip, RecoChip, ScoreBadge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { getJob, getJobEvents } from "@/lib/db/jobs";
import { contractLabel, dateShort, dateTime, locationLabel, relativeDays, REMOTE_LABELS, salaryLabel, salaryNetHint, SOURCE_LABELS } from "@/lib/format";
import { IGNORE_LABELS, IGNORE_REASONS, STATUS_LABELS, STATUSES, type IgnoreReason } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = await getJob(db(), (await params).id);
  return { title: job?.title ?? "Offre" };
}

const WARNING_LABELS: Record<string, string> = {
  periode_deduite: "période (an/mois) déduite du montant",
  min_max_inverses: "minimum et maximum inversés dans l'annonce",
  treizieme_mois: "13e mois compté",
  brut_estime_depuis_net: "montant publié en net, brut estimé",
  montant_incoherent: "montant incohérent, ignoré",
  brut_suppose: "brut supposé (non précisé)",
};

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = db();
  const job = await getJob(sql, id);
  if (!job) notFound();
  if (!job.is_read) await sql`update jobs set is_read = true where id = ${job.id}`;
  const events = await getJobEvents(sql, job.id);
  const d = job.score_details;
  const main = job.sources[0];
  const here = `/offres/${job.id}`;

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Link href="/offres" className="text-sm text-accent hover:underline">
        ← Offres
      </Link>

      <header className="flex gap-4">
        <ScoreBadge score={job.score} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <RecoChip reco={d?.recommendation} />
            {d && <Chip>{d.category}</Chip>}
            {d?.familyLabel && <Chip tone="accent">{d.familyLabel}</Chip>}
            {d && <Chip>Confiance {d.confidence}</Chip>}
            {job.availability === "expiree" && <Chip tone="bad">Expirée</Chip>}
            {job.availability === "inconnue" && <Chip tone="warn">Disponibilité inconnue</Chip>}
          </div>
          <h1 className="mt-1.5 text-xl font-semibold leading-snug">{job.title}</h1>
          <p className="text-text-2">{job.company ?? "Entreprise non précisée"}</p>
        </div>
      </header>

      {d?.excluded && <p className="card border-bad p-3 text-sm text-bad">Écartée automatiquement : {d.excluded}</p>}

      <section className="card grid gap-1 p-4 text-sm sm:grid-cols-2">
        <Info label="Lieu" value={locationLabel(job.city, job.zone, job.distance_km) + (job.distance_km !== null ? " (à vol d'oiseau)" : "")} />
        <Info label="Contrat" value={contractLabel(job.contract, job.contract_months)} />
        <Info label="Télétravail" value={REMOTE_LABELS[job.remote]} />
        <Info
          label="Salaire"
          value={
            <>
              {salaryLabel(job.salary)}
              {salaryNetHint(job.salary) && <span className="block text-muted">{salaryNetHint(job.salary)}</span>}
              {job.salary?.warnings.length ? <span className="block text-muted">Note : {job.salary.warnings.map((w) => WARNING_LABELS[w] ?? w).join(", ")}</span> : null}
            </>
          }
        />
        <Info label="Publiée" value={job.published_at ? `${dateShort(job.published_at)} (${relativeDays(job.published_at)})` : "Date non fournie par la source"} />
        <Info label="Découverte" value={dateTime(job.first_seen_at)} />
        <Info label="Date limite" value={job.valid_through ? dateShort(job.valid_through) : "Non précisée"} />
        <Info label="Dernière vue en ligne" value={dateTime(job.last_seen_at)} />
      </section>

      <div className="flex flex-wrap gap-2">
        {main && (
          <a href={main.url} target="_blank" rel="noopener noreferrer" className="btn">
            Ouvrir l&apos;annonce ({SOURCE_LABELS[main.source] ?? main.source}) ↗
          </a>
        )}
        <Link href={`/offres/${job.id}/candidature`} className="btn btn-primary">
          Préparer ma candidature
        </Link>
        <ActionButton id={job.id} action="favorite" value={String(!job.is_favorite)} label={job.is_favorite ? "★ Retirer des favoris" : "☆ Favori"} back={here} />
        <ActionButton id={job.id} action="read" value="false" label="Marquer non lue" back="/offres" />
      </div>
      {job.sources.length > 1 && (
        <p className="text-sm text-text-2">
          Aussi publiée sur :{" "}
          {job.sources.slice(1).map((s, i) => (
            <span key={s.url}>
              {i > 0 && ", "}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {SOURCE_LABELS[s.source] ?? s.source}
              </a>
            </span>
          ))}
        </p>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Suivi</h2>
        <form action={mutateJob} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="status" />
          <input type="hidden" name="redirect" value={here} />
          <label htmlFor="status" className="text-sm">
            Statut
          </label>
          <select id="status" name="status" defaultValue={job.status} className="field w-auto">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="btn">Enregistrer</button>
        </form>
        {job.status === "ignoree" && job.ignore_reason && <p className="text-sm text-text-2">Ignorée : {IGNORE_LABELS[job.ignore_reason as IgnoreReason] ?? job.ignore_reason}</p>}
        <form action={mutateJob} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="ignore" />
          <input type="hidden" name="redirect" value={here} />
          <span className="w-full text-sm">Pas intéressé / ignorer :</span>
          {IGNORE_REASONS.map((r) => (
            <button key={r} name="reason" value={r} className="btn">
              {IGNORE_LABELS[r]}
            </button>
          ))}
        </form>
        <form action={mutateJob} className="space-y-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="notes" />
          <input type="hidden" name="redirect" value={here} />
          <label htmlFor="notes" className="text-sm">
            Notes
          </label>
          <textarea id="notes" name="notes" defaultValue={job.notes ?? ""} rows={3} maxLength={5000} className="field" />
          <button className="btn">Enregistrer les notes</button>
        </form>
      </section>

      {d && (
        <section className="card space-y-4 p-4">
          <h2 className="font-semibold">Pourquoi ce score</h2>
          <div className="space-y-3">
            {d.subscores.map((s) => (
              <div key={s.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium">
                    {s.label}
                    {s.neutral && <span className="ml-1 text-muted">(neutre)</span>}
                  </span>
                  <span className="tabular-nums text-text-2">
                    {s.points} / {s.max}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                  <div className="h-1.5 rounded-full bg-accent" style={{ width: `${s.max ? (s.points / s.max) * 100 : 0}%` }} />
                </div>
                <ul className="mt-1 list-disc pl-5 text-sm text-text-2">
                  {s.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <List title="Raisons de postuler" items={d.pros} tone="good" />
          <List title="Points d'attention" items={d.cons} tone="warn" />
          <List title="Obstacles potentiels" items={d.obstacles} tone="bad" />
          <List title="Compétences que tu as (citées dans l'annonce)" items={d.ownedSkills.map((s) => s.label)} />
          <List title="Compétences demandées que tu ne revendiques pas" items={d.missingSkills} />
          <List title="Expériences transférables à mettre en avant" items={d.transferable} />
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Description</h2>
        {job.description_partial && <p className="mt-1 text-sm text-warn">Extrait seulement : la source ne fournit pas le texte complet. Ouvre l&apos;annonce originale.</p>}
        <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-2">{job.description ?? "Description non disponible."}</div>
      </section>

      <section className="card space-y-2 p-4">
        <h2 className="font-semibold">Historique</h2>
        <ul className="text-sm text-text-2">
          <li>Disponibilité : {job.availability} (vérifiée {dateTime(job.availability_checked_at)})</li>
          {events.map((e, i) => (
            <li key={i}>
              {dateTime(e.created_at)} — {e.type}
              {e.payload ? ` : ${Object.values(e.payload).join(", ")}` : ""}
            </li>
          ))}
        </ul>
        <form action={mutateJob} className="flex gap-2 pt-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="report" />
          <input type="hidden" name="redirect" value={here} />
          <input name="message" required minLength={3} maxLength={1000} placeholder="Signaler une erreur (score, salaire, lieu…)" className="field" aria-label="Signaler une erreur" />
          <button className="btn">Signaler</button>
        </form>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p>
      <span className="text-muted">{label} : </span>
      {value}
    </p>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "good" | "warn" | "bad" }) {
  if (!items.length) return null;
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-text-2";
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className={`list-disc pl-5 text-sm ${color}`}>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function ActionButton({ id, action, value, label, back }: { id: string; action: string; value: string; label: string; back: string }) {
  return (
    <form action={mutateJob}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="value" value={value} />
      <input type="hidden" name="redirect" value={back} />
      <button className="btn">{label}</button>
    </form>
  );
}
