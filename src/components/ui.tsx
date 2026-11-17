import Link from "next/link";
import type { JobRow } from "@/lib/db/jobs";
import { contractLabel, isRecent, locationLabel, relativeDays, REMOTE_LABELS, salaryLabel, scoreTone, SOURCE_LABELS } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/types";

export function ScoreBadge({ score, size = "md" }: { score: number | null; size?: "md" | "lg" }) {
  const tone = scoreTone(score);
  const cls =
    tone === "good" ? "bg-good-soft text-good" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted";
  const dim = size === "lg" ? "h-14 w-14 text-xl" : "h-11 w-11 text-base";
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center rounded-xl font-semibold tabular-nums ${cls} ${dim}`} aria-label={`Score ${score ?? "non calculé"} sur 100`}>
      {score ?? "–"}
    </div>
  );
}

export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" | "accent" }) {
  const cls = {
    default: "bg-surface-2 text-text-2",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function RecoChip({ reco }: { reco: string | undefined }) {
  if (!reco) return null;
  const tone = reco === "Postuler" ? "good" : reco === "À tenter" ? "accent" : reco === "À vérifier" ? "warn" : "default";
  return <Chip tone={tone}>{reco}</Chip>;
}

export function JobCard({ job, showReason = true }: { job: JobRow; showReason?: boolean }) {
  const d = job.score_details;
  const isNew = isRecent(job.first_seen_at);
  return (
    <article className="card p-4">
      <div className="flex gap-3">
        <ScoreBadge score={job.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {isNew && <Chip tone="accent">Nouvelle</Chip>}
            {!job.is_read && !isNew && <Chip>Non lue</Chip>}
            {job.is_favorite && <Chip tone="warn">★ Favori</Chip>}
            {job.status !== "nouvelle" && <Chip>{STATUS_LABELS[job.status]}</Chip>}
            {job.availability === "expiree" && <Chip tone="bad">Expirée</Chip>}
            <RecoChip reco={d?.recommendation} />
          </div>
          <h3 className="mt-1.5 text-base font-semibold leading-snug">
            <Link href={`/offres/${job.id}`} className="hover:underline">
              {job.title}
            </Link>
          </h3>
          <p className="text-sm text-text-2">{job.company ?? "Entreprise non précisée"}</p>
          <p className="mt-1 text-sm text-text-2">
            {[locationLabel(job.city, job.zone, job.distance_km), contractLabel(job.contract, job.contract_months), REMOTE_LABELS[job.remote]].join(" · ")}
          </p>
          <p className="text-sm">
            <span className={job.salary ? "font-medium" : "text-muted"}>{salaryLabel(job.salary)}</span>
            <span className="text-muted">
              {" "}
              · {job.published_at ? `publiée ${relativeDays(job.published_at)}` : `vue ${relativeDays(job.first_seen_at)}`} ·{" "}
              {job.sources.map((s) => SOURCE_LABELS[s.source] ?? s.source).join(", ")}
            </span>
          </p>
          {showReason && d && <p className="mt-2 text-sm text-text-2">{d.summary}</p>}
        </div>
      </div>
    </article>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-text-2">{children}</div>}
    </div>
  );
}
