"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { applyMutation } from "@/lib/db/jobs";
import { z } from "zod";
import { followUp, markApplied, prepareApplication, savePackEdits, saveProfileYaml } from "@/lib/apply/service";
import { VARIANTS } from "@/lib/apply/pack";


async function requireSession() {
  const store = await cookies();
  if (!(await verifySessionToken(store.get(SESSION_COOKIE)?.value))) redirect("/connexion");
}

/** Toutes les actions sur une offre passent ici : session vérifiée, entrée validée (zod), puis persistance. */
export async function mutateJob(formData: FormData) {
  await requireSession();
  const action = String(formData.get("action") ?? "");
  const id = String(formData.get("id") ?? "");
  const input: Record<string, unknown> = { action, id };
  if (action === "status") input.status = formData.get("status");
  if (action === "read" || action === "favorite") input.value = formData.get("value") === "true";
  if (action === "ignore") input.reason = formData.get("reason");
  if (action === "notes") input.notes = String(formData.get("notes") ?? "");
  if (action === "report") input.message = String(formData.get("message") ?? "");
  await applyMutation(db(), input);
  revalidatePath("/", "layout");
  const back = String(formData.get("redirect") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back);
}

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  // Petit délai fixe : ralentit les essais en série.
  await new Promise((r) => setTimeout(r, 400));
  if (!(await checkPassword(password))) return { error: "Mot de passe incorrect, ou application non configurée (APP_PASSWORD / SESSION_SECRET)." };
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/connexion");
}

// --- Phase 2 : candidatures ----------------------------------------------------


const uuid = z.uuid();

export async function preparePack(formData: FormData) {
  await requireSession();
  const id = uuid.parse(formData.get("id"));
  const variant = z.enum(VARIANTS).optional().parse(formData.get("variant") || undefined);
  const useAi = formData.get("useAi") === "on";
  await prepareApplication(db(), id, { variant, useAi });
  // Préparer une candidature fait passer l'offre « à postuler » (sans écraser un statut plus avancé).
  await db()`update jobs set status = 'a_postuler', is_read = true, updated_at = now() where id = ${id} and status in ('nouvelle', 'a_etudier', 'plus_tard')`;
  revalidatePath("/", "layout");
  redirect(`/offres/${id}/candidature`);
}

export async function savePack(formData: FormData) {
  await requireSession();
  const id = uuid.parse(formData.get("id"));
  const edits: Record<string, string> = {};
  const validated: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.startsWith("s:")) edits[key.slice(2)] = value;
    if (key.startsWith("ok:")) validated.push(key.slice(3));
  }
  const subject = formData.get("emailSubject");
  await savePackEdits(db(), id, edits, validated, typeof subject === "string" ? subject : undefined);
  revalidatePath(`/offres/${id}/candidature`);
  redirect(`/offres/${id}/candidature?enregistre=1`);
}

export async function applied(formData: FormData) {
  await requireSession();
  const id = uuid.parse(formData.get("id"));
  const channel = z.enum(["site", "email", "autre"]).parse(formData.get("channel"));
  try {
    await markApplied(db(), id, channel);
  } catch (err) {
    redirect(`/offres/${id}/candidature?erreur=${encodeURIComponent(err instanceof Error ? err.message : "Erreur")}`);
  }
  revalidatePath("/", "layout");
  redirect(`/offres/${id}/candidature?envoye=1`);
}

export async function followUpAction(formData: FormData) {
  await requireSession();
  const id = uuid.parse(formData.get("id"));
  const action = z.enum(["relance_faite", "clore"]).parse(formData.get("followup"));
  await followUp(db(), id, action);
  revalidatePath("/", "layout");
  const back = String(formData.get("redirect") ?? "/candidatures");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/candidatures");
}

export async function saveProfile(_prev: { errors?: string[]; ok?: boolean } | undefined, formData: FormData) {
  await requireSession();
  const yaml = String(formData.get("yaml") ?? "");
  if (yaml.length > 200_000) return { errors: ["Profil trop long"] };
  const r = await saveProfileYaml(db(), yaml);
  if (!r.ok) return { errors: r.errors };
  revalidatePath("/profil");
  return { ok: true };
}
