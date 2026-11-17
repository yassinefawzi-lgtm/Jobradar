"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { applyMutation } from "@/lib/db/jobs";

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
