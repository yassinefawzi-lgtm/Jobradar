import Link from "next/link";
import { mutateJob } from "@/app/actions";
import type { JobRow } from "@/lib/db/jobs";
import { IGNORE_LABELS, IGNORE_REASONS } from "@/lib/types";
import { JobCard } from "./ui";

/** File de tri : une carte à la fois, trois décisions, raison de rejet en un tap. */
export function TriageCard({ job, remaining }: { job: JobRow; remaining: number }) {
  return (
    <section aria-labelledby="tri-titre" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="tri-titre" className="text-lg font-semibold">
          À trier
        </h2>
        <span className="text-sm text-muted">{remaining} en attente</span>
      </div>
      <JobCard job={job} />
      <div className="grid grid-cols-2 gap-2">
        <form action={mutateJob}>
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="status" />
          <input type="hidden" name="status" value="a_postuler" />
          <input type="hidden" name="redirect" value={`/offres/${job.id}/candidature`} />
          <button className="btn btn-primary w-full">Préparer</button>
        </form>
        <form action={mutateJob}>
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="later" />
          <button className="btn w-full">Plus tard</button>
        </form>
      </div>
      <details className="card p-3">
        <summary className="cursor-pointer text-sm font-medium">Ignorer… (choisir la raison)</summary>
        <form action={mutateJob} className="mt-3 flex flex-wrap gap-2">
          <input type="hidden" name="id" value={job.id} />
          <input type="hidden" name="action" value="ignore" />
          {IGNORE_REASONS.map((r) => (
            <button key={r} name="reason" value={r} className="btn">
              {IGNORE_LABELS[r]}
            </button>
          ))}
        </form>
      </details>
      <p className="text-center text-sm">
        <Link href={`/offres/${job.id}`} className="text-accent hover:underline">
          Voir l&apos;analyse détaillée
        </Link>
      </p>
    </section>
  );
}
