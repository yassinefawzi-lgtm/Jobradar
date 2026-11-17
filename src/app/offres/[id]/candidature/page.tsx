import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { applied, preparePack, savePack } from "@/app/actions";
import { CopyButton } from "@/components/copy-button";
import { Chip } from "@/components/ui";
import { type Pack, type Sentence, VARIANT_LABELS, VARIANTS, letterText, wordCount } from "@/lib/apply/pack";
import { aiStatus, getApplication, loadProfile, validationFor } from "@/lib/apply/service";
import { db } from "@/lib/db/client";
import { getJob } from "@/lib/db/jobs";
import { dateTime } from "@/lib/format";
import type { Fact } from "@/lib/profile/facts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Préparer ma candidature" };

const STATUS_LABEL = { couvert: "Couvert", partiel: "Déclaré, sans réalisation", non_couvert: "Non couvert" } as const;

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const sql = db();
  const job = await getJob(sql, id);
  if (!job) notFound();
  const [app, ai, profile] = await Promise.all([getApplication(sql, id), aiStatus(sql), loadProfile(sql)]);
  const offerUrl = job.sources[0]?.url;

  if (!app) {
    return (
      <main className="mx-auto max-w-3xl space-y-4">
        <Back id={id} />
        <h1 className="text-xl font-semibold">Préparer ma candidature</h1>
        <p className="text-text-2">
          {job.title} — {job.company ?? "entreprise non précisée"}
        </p>
        <GenerateForm id={id} aiConfigured={ai.configured} />
        <AiBudget ai={ai} />
      </main>
    );
  }

  const v = await validationFor(sql, id, app.pack);
  const pack = app.pack;
  const facts = profile.index;
  const errorsCount = v.issues.filter((i) => i.level === "erreur").length;
  const mail = `${pack.email.body.map((s) => s.text).join("\n")}`;
  const mailto = `mailto:?subject=${encodeURIComponent(pack.email.subject)}&body=${encodeURIComponent(mail)}`;

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <Back id={id} />
      <header>
        <h1 className="text-xl font-semibold">Préparer ma candidature</h1>
        <p className="text-text-2">
          {job.title} — {job.company ?? "entreprise non précisée"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone={app.generated_by === "ia" ? "accent" : "default"}>{app.generated_by === "ia" ? "Rédigé avec l'IA" : "Rédigé sans IA"}</Chip>
          <Chip>Variante : {VARIANT_LABELS[pack.variant]}</Chip>
          <Chip>Lettre : {wordCount(letterText(pack))} mots</Chip>
          {app.sent_snapshot && <Chip tone="good">Envoyée le {dateTime(app.sent_snapshot.sentAt)}</Chip>}
        </div>
        {app.generation_note && <p className="mt-2 text-sm text-warn">{app.generation_note}</p>}
      </header>

      {q.erreur && <p className="card border-bad p-3 text-sm text-bad">{q.erreur}</p>}
      {q.enregistre && <p className="text-sm text-good">Modifications enregistrées.</p>}
      {q.envoye && <p className="card p-3 text-sm text-good">Candidature enregistrée comme envoyée. Relance prévue dans 7 jours.</p>}

      <section className={`card p-4 ${v.ok ? "" : "border-bad"}`} aria-live="polite">
        {v.ok ? (
          <p className="font-medium text-good">Contrôle anti-invention : toutes les phrases sont rattachées à tes faits.</p>
        ) : (
          <p className="font-medium text-bad">
            Contrôle anti-invention : {errorsCount} problème(s). Corrige les phrases surlignées ou valide-les explicitement. Export bloqué en attendant.
          </p>
        )}
        {v.issues.filter((i) => i.level === "alerte").map((i, k) => (
          <p key={k} className="text-sm text-warn">
            {i.message}
          </p>
        ))}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Envoyer</h2>
        <div className="flex flex-wrap gap-2">
          {offerUrl && (
            <a href={offerUrl} target="_blank" rel="noopener noreferrer" className="btn">
              Ouvrir l&apos;annonce ↗
            </a>
          )}
          {v.ok ? (
            <>
              <a href={`/api/candidatures/${id}/cv`} target="_blank" className="btn btn-primary">
                Télécharger le CV (PDF)
              </a>
              <a href={`/api/candidatures/${id}/lettre`} target="_blank" className="btn btn-primary">
                Télécharger la lettre (PDF)
              </a>
            </>
          ) : (
            <span className="btn opacity-50" aria-disabled="true">
              PDF bloqués (contrôle)
            </span>
          )}
          <CopyButton text={`${pack.email.subject}\n\n${mail}`} label="Copier l'e-mail" />
          <a href={mailto} className="btn">
            Écrire l&apos;e-mail
          </a>
        </div>
        <p className="text-xs text-muted">« Écrire l&apos;e-mail » ouvre ta messagerie avec l&apos;objet et le texte ; ajoute les deux PDF en pièces jointes.</p>
        <form action={applied} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="hidden" name="id" value={id} />
          <label htmlFor="channel" className="text-sm">
            Canal
          </label>
          <select id="channel" name="channel" className="field w-auto" defaultValue="site">
            <option value="site">Formulaire du site</option>
            <option value="email">E-mail</option>
            <option value="autre">Autre</option>
          </select>
          <button className="btn btn-primary" disabled={!v.ok}>
            J&apos;ai postulé
          </button>
        </form>
        {app.sent_snapshot && (
          <p className="text-sm text-text-2">
            Version envoyée :{" "}
            <a href={`/api/candidatures/${id}/cv?version=envoye`} className="text-accent hover:underline" target="_blank">
              CV
            </a>{" "}
            ·{" "}
            <a href={`/api/candidatures/${id}/lettre?version=envoye`} className="text-accent hover:underline" target="_blank">
              lettre
            </a>
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <aside className="space-y-3">
          <details className="card p-4" open>
            <summary className="cursor-pointer font-semibold">Annonce</summary>
            <div className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-line text-sm text-text-2">{job.description ?? "Description non disponible."}</div>
          </details>
          <section className="card p-4">
            <h2 className="font-semibold">Couverture des exigences</h2>
            {pack.coverage.length === 0 && <p className="text-sm text-text-2">Aucune exigence repérée automatiquement.</p>}
            <ul className="mt-2 space-y-1 text-sm">
              {pack.coverage.map((c) => (
                <li key={c.requirement} className="flex justify-between gap-2">
                  <span>{c.requirement}</span>
                  <Chip tone={c.status === "couvert" ? "good" : c.status === "partiel" ? "warn" : "bad"}>{STATUS_LABEL[c.status]}</Chip>
                </li>
              ))}
            </ul>
          </section>
          <GenerateForm id={id} aiConfigured={ai.configured} current={pack.variant} regenerate />
          <AiBudget ai={ai} />
        </aside>

        <form action={savePack} className="space-y-5">
          <input type="hidden" name="id" value={id} />
          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">CV</h2>
            <SentenceField path="cv.title" s={pack.cv.title} issues={v.byPath["cv.title"]} facts={facts} label="Intitulé visé" />
            {pack.cv.summary.map((s, i) => (
              <SentenceField key={i} path={`cv.summary.${i}`} s={s} issues={v.byPath[`cv.summary.${i}`]} facts={facts} label={i === 0 ? "Accroche" : undefined} />
            ))}
            {pack.cv.experiences.map((e, i) => (
              <div key={e.factId} className="space-y-2">
                <h3 className="text-sm font-medium">{facts.get(e.factId)?.label ?? e.factId}</h3>
                {e.bullets.map((s, j) => (
                  <SentenceField key={j} path={`cv.experiences.${i}.bullets.${j}`} s={s} issues={v.byPath[`cv.experiences.${i}.bullets.${j}`]} facts={facts} />
                ))}
              </div>
            ))}
            {pack.cv.projects.length > 0 && <h3 className="text-sm font-medium">Projets personnels</h3>}
            {pack.cv.projects.map((s, i) => (
              <SentenceField key={i} path={`cv.projects.${i}`} s={s} issues={v.byPath[`cv.projects.${i}`]} facts={facts} />
            ))}
            <p className="text-sm text-text-2">Compétences (ordre) : {pack.cv.skills.join(" · ")}</p>
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Lettre de motivation</h2>
            {pack.letter.paragraphs.map((p, i) => (
              <div key={i} className="space-y-2 border-l-2 border-line pl-3">
                {p.map((s, j) => (
                  <SentenceField key={j} path={`letter.paragraphs.${i}.${j}`} s={s} issues={v.byPath[`letter.paragraphs.${i}.${j}`]} facts={facts} />
                ))}
              </div>
            ))}
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">E-mail d&apos;accompagnement</h2>
            <label className="block text-sm" htmlFor="emailSubject">
              Objet
            </label>
            <input id="emailSubject" name="emailSubject" defaultValue={pack.email.subject} className="field" maxLength={200} />
            {pack.email.body.map((s, i) => (
              <SentenceField key={i} path={`email.body.${i}`} s={s} issues={v.byPath[`email.body.${i}`]} facts={facts} />
            ))}
          </section>

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">Réponses types pour les formulaires</h2>
            <SentenceField path="answers.salary" s={pack.answers.salary} issues={v.byPath["answers.salary"]} facts={facts} label="Prétentions salariales" />
            <SentenceField path="answers.availability" s={pack.answers.availability} issues={v.byPath["answers.availability"]} facts={facts} label="Disponibilité" />
            <SentenceField path="answers.why" s={pack.answers.why} issues={v.byPath["answers.why"]} facts={facts} label="Pourquoi ce poste (300 caractères)" />
          </section>

          <div className="sticky bottom-20 z-10 sm:bottom-4">
            <button className="btn btn-primary w-full shadow-lg">Enregistrer et revérifier</button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Back({ id }: { id: string }) {
  return (
    <Link href={`/offres/${id}`} className="text-sm text-accent hover:underline">
      ← Retour à l&apos;offre
    </Link>
  );
}

function SentenceField({ path, s, issues, facts, label }: { path: string; s: Sentence; issues?: string[]; facts: Map<string, Fact>; label?: string }) {
  const bad = !!issues?.length && !s.userValidated;
  const rows = Math.min(8, Math.max(2, Math.ceil(s.text.length / 70)));
  return (
    <div className={`rounded-lg p-2 ${bad ? "bg-bad-soft" : ""}`}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-text-2" htmlFor={`s-${path}`}>
          {label}
        </label>
      )}
      <textarea id={`s-${path}`} name={`s:${path}`} defaultValue={s.text} rows={rows} className="field" aria-invalid={bad} />
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {s.sources.length === 0 && <span className="text-xs text-muted">{s.kind === "liaison" ? "Phrase de liaison" : "Sans source"}</span>}
        {s.sources.map((src) => (
          <span key={src} title={src === "annonce" ? "Repris de l'annonce" : (facts.get(src)?.text ?? "Source inconnue")} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-2">
            {src === "annonce" ? "annonce" : src === "preferences" ? "tes préférences" : (facts.get(src)?.label.slice(0, 40) ?? `? ${src}`)}
          </span>
        ))}
      </div>
      {issues?.length ? (
        <div className="mt-1 text-xs">
          {issues.map((m) => (
            <p key={m} className={s.userValidated ? "text-warn" : "text-bad"}>
              {m}
            </p>
          ))}
          <label className="mt-1 flex items-center gap-1.5 text-text-2">
            <input type="checkbox" name={`ok:${path}`} defaultChecked={s.userValidated} /> Je confirme que cette phrase est exacte
          </label>
        </div>
      ) : null}
    </div>
  );
}

function GenerateForm({ id, aiConfigured, current, regenerate }: { id: string; aiConfigured: boolean; current?: Pack["variant"]; regenerate?: boolean }) {
  return (
    <form action={preparePack} className="card space-y-3 p-4">
      <input type="hidden" name="id" value={id} />
      <h2 className="font-semibold">{regenerate ? "Régénérer" : "Générer le pack"}</h2>
      <label className="block text-sm" htmlFor={`variant-${id}`}>
        Variante de CV
      </label>
      <select id={`variant-${id}`} name="variant" defaultValue={current ?? ""} className="field">
        <option value="">Automatique (selon le métier)</option>
        {VARIANTS.map((v) => (
          <option key={v} value={v}>
            {VARIANT_LABELS[v]}
          </option>
        ))}
      </select>
      <label className={`flex items-center gap-2 text-sm ${aiConfigured ? "" : "text-muted"}`}>
        <input type="checkbox" name="useAi" defaultChecked={aiConfigured} disabled={!aiConfigured} /> Rédiger avec l&apos;IA
        {!aiConfigured && " (clé API non configurée)"}
      </label>
      {regenerate && <p className="text-xs text-warn">Régénérer remplace le brouillon et tes modifications. Une candidature déjà envoyée garde sa copie figée.</p>}
      <button className="btn btn-primary w-full">{regenerate ? "Régénérer" : "Générer"}</button>
    </form>
  );
}

function AiBudget({ ai }: { ai: { configured: boolean; spent: number; budget: number } }) {
  return (
    <p className="text-xs text-muted">
      IA : {ai.configured ? "configurée" : "non configurée"} · dépensé ce mois-ci ≈ {ai.spent.toFixed(2).replace(".", ",")} € sur {ai.budget} € (estimation)
    </p>
  );
}
