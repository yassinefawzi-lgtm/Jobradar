import { db } from "@/lib/db/client";
import { listJobs, parseFilters } from "@/lib/db/jobs";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Export CSV des offres filtrées (accès protégé par le proxy d'authentification). */
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const jobs = await listJobs(db(), parseFilters(params), 5000);
  const csv = toCsv(jobs);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jobradar-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
