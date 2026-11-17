import { z } from "zod";
import { db } from "@/lib/db/client";
import { getJob } from "@/lib/db/jobs";
import { pdfFileName, renderCv, renderLetter } from "@/lib/apply/pdf";
import { getApplication, loadProfile, validationFor } from "@/lib/apply/service";
import { parseFactsYaml } from "@/lib/profile/facts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PDF du CV ou de la lettre. Le brouillon n'est exportable que si le contrôle anti-invention passe ;
 * la version envoyée (?version=envoye) est la copie figée, toujours disponible.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  if (!z.uuid().safeParse(id).success || !["cv", "lettre"].includes(doc)) return new Response("Introuvable", { status: 404 });
  const sql = db();
  const [job, app] = await Promise.all([getJob(sql, id), getApplication(sql, id)]);
  if (!job || !app) return new Response("Aucune candidature préparée pour cette offre", { status: 404 });
  const sent = new URL(req.url).searchParams.get("version") === "envoye";
  if (sent && !app.sent_snapshot) return new Response("Aucune version envoyée", { status: 404 });
  const pack = sent ? app.sent_snapshot!.pack : app.pack;
  if (!sent) {
    const v = await validationFor(sql, id, pack);
    if (!v.ok) {
      return new Response("Export bloqué : le contrôle anti-invention signale des phrases à corriger ou à valider.", {
        status: 409,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
  const snapshotFacts = sent && app.sent_snapshot?.factsYaml ? parseFactsYaml(app.sent_snapshot.factsYaml).facts : null;
  const facts = snapshotFacts ?? (await loadProfile(sql)).facts;
  const buffer = doc === "cv" ? await renderCv(pack, facts) : await renderLetter(pack, facts, job.company, job.title, sent ? new Date(app.sent_snapshot!.sentAt) : new Date());
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFileName(doc === "cv" ? "CV" : "Lettre", job.company)}"`,
      "Cache-Control": "no-store",
    },
  });
}
