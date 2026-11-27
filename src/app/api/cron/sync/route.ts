import { dispatchSync } from "@/lib/sync/dispatch";

export const dynamic = "force-dynamic";

/**
 * Appelé chaque matin par le cron de Vercel (vercel.json) : déclenche le workflow GitHub « Synchro ».
 * Les tâches planifiées de GitHub peuvent avoir plusieurs heures de retard ; celles de Vercel arrivent
 * dans l'heure prévue. Protégé par CRON_SECRET (Vercel l'envoie en « Authorization: Bearer … »).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Non autorisé", { status: 401 });
  }
  const r = await dispatchSync();
  return Response.json({ dispatched: r.ok, status: r.status }, { status: r.ok ? 200 : 502 });
}
