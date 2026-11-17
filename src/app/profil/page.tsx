import type { Metadata } from "next";
import { ProfileEditor } from "./profile-editor";
import { loadProfile } from "@/lib/apply/service";
import { db } from "@/lib/db/client";

export const metadata: Metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await loadProfile(db());
  const groups = [
    { title: "Réalisations", items: profile.flat.filter((f) => f.kind === "realisation" || f.kind === "projet") },
    { title: "Compétences", items: profile.flat.filter((f) => f.kind === "competence") },
    { title: "Formation et langues", items: profile.flat.filter((f) => f.kind === "formation" || f.kind === "langue") },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Mon profil</h1>
        <p className="text-sm text-text-2">
          Source de vérité de tes CV et lettres : rien n&apos;est écrit qui ne soit pas ici. Version {profile.hash} (
          {profile.origin === "base" ? "modifiée dans l'application" : "fichier du dépôt"}).
        </p>
      </header>
      {groups.map((g) => (
        <section key={g.title} className="card p-4">
          <h2 className="font-semibold">{g.title}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {g.items.map((f) => (
              <li key={f.id} className={f.valid ? "" : "text-muted"}>
                <code className="text-xs text-muted">{f.id}</code> {f.text}
                {!f.valid && " (à confirmer : non utilisé)"}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <ProfileEditor yaml={profile.source} />
    </main>
  );
}
