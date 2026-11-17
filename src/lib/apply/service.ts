import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type postgres from "postgres";
import { aiConfigured, claude, MODEL, monthlyBudgetEur, recordUsage, spentThisMonthEur } from "../ai/claude";
import { getJob } from "../db/jobs";
import { loadPreferences } from "../db/repo";
import { type Fact, type Facts, factIndex, factsHash, flattenFacts, parseFactsYaml, readFactsFile } from "../profile/facts";
import type { Family } from "../scoring/preferences";
import { type AiPack, aiPackSchema, aiToPack, buildUserPrompt, SYSTEM_PROMPT } from "./ai";
import { generatePack, type OfferInput, offerText, preferencesText } from "./generate";
import { getAt, type Pack, packSchema, type Variant } from "./pack";
import { validatePack, type ValidationResult } from "./validate";

type Sql = postgres.Sql;
const asJson = (v: unknown) => v as postgres.JSONValue;

export const FOLLOW_UP_DAYS = 7;

export interface Profile {
  facts: Facts;
  flat: Fact[];
  index: Map<string, Fact>;
  hash: string;
  source: string;
  origin: "base" | "fichier";
}

/** Profil courant : version modifiée dans l'app (base) si elle existe, sinon profile/facts.yaml. */
export async function loadProfile(sql: Sql): Promise<Profile> {
  const rows = await sql<{ value: { yaml: string } }[]>`select value from settings where key = 'facts_yaml'`;
  const fromDb = rows[0]?.value?.yaml;
  const source = fromDb ?? readFactsFile();
  const parsed = parseFactsYaml(source);
  if (!parsed.facts) throw new Error(`Profil invalide : ${parsed.errors.join(" ; ")}`);
  const flat = flattenFacts(parsed.facts);
  return { facts: parsed.facts, flat, index: factIndex(flat), hash: factsHash(source), source, origin: fromDb ? "base" : "fichier" };
}

export async function saveProfileYaml(sql: Sql, yaml: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const parsed = parseFactsYaml(yaml);
  if (!parsed.facts) return { ok: false, errors: parsed.errors };
  await sql`insert into settings (key, value) values ('facts_yaml', ${sql.json({ yaml })})
    on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return { ok: true };
}

export interface ApplicationRow {
  id: string;
  job_id: string;
  variant: Variant;
  pack: Pack;
  generated_by: "ia" | "modele";
  facts_hash: string;
  generation_note: string | null;
  sent_snapshot: { pack: Pack; sentAt: string; factsHash: string; factsYaml?: string } | null;
  applied_at: Date | null;
  channel: string | null;
  next_action: string | null;
  next_action_at: Date | null;
  updated_at: Date;
}

export async function getApplication(sql: Sql, jobId: string): Promise<ApplicationRow | null> {
  const rows = await sql<ApplicationRow[]>`select * from applications where job_id = ${jobId}`;
  return rows[0] ?? null;
}

/** Signature minimale de l'appel structuré à Claude (injectable dans les tests). */
export type AiCaller = (args: { system: string; user: string }) => Promise<{
  parsed: AiPack | null;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}>;

export const callClaude: AiCaller = async ({ system, user }) => {
  const res = await claude().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: "medium", format: zodOutputFormat(aiPackSchema) },
    messages: [{ role: "user", content: user }],
  });
  return { parsed: res.parsed_output ?? null, stopReason: res.stop_reason, usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } };
};

function contextFor(offer: OfferInput, profile: Profile, prefsText: string) {
  return { facts: profile.index, offerText: offerText(offer), preferencesText: prefsText };
}

export interface PrepareResult {
  application: ApplicationRow;
  validation: ValidationResult;
}

/**
 * Prépare (ou régénère) le pack d'une offre. Utilise l'IA si une clé est configurée et que le budget
 * du mois le permet ; sinon, ou en cas d'échec, le générateur sans IA. Ne touche jamais à une
 * candidature déjà envoyée (copie figée conservée).
 */
export async function prepareApplication(
  sql: Sql,
  jobId: string,
  opts: { useAi?: boolean; variant?: Variant; ai?: AiCaller; env?: Record<string, string | undefined> } = {},
): Promise<PrepareResult> {
  const job = await getJob(sql, jobId);
  if (!job) throw new Error("Offre introuvable");
  const [profile, prefs] = await Promise.all([loadProfile(sql), loadPreferences(sql)]);
  const offer: OfferInput = { title: job.title, company: job.company, description: job.description, family: (job.score_details?.family ?? null) as Family | null };
  const prefsText = preferencesText(prefs);
  const draft = generatePack(offer, profile.facts, profile.index, prefs, { variant: opts.variant });

  let pack = draft;
  let generatedBy: "ia" | "modele" = "modele";
  let note: string | null = null;
  const env = opts.env ?? process.env;
  if (opts.useAi !== false) {
    if (!opts.ai && !aiConfigured(env)) note = "IA non configurée (ANTHROPIC_API_KEY absent) : version sans IA";
    else if ((await spentThisMonthEur(sql)) >= monthlyBudgetEur(env)) note = `Budget IA du mois atteint (${monthlyBudgetEur(env)} €) : version sans IA`;
    else {
      try {
        const res = await (opts.ai ?? callClaude)({ system: SYSTEM_PROMPT, user: buildUserPrompt(offer, profile.flat, draft) });
        await recordUsage(sql, { purpose: "pack", model: MODEL, ...res.usage, job_id: jobId });
        if (res.stopReason === "refusal" || !res.parsed) note = "L'IA n'a pas produit de réponse exploitable : version sans IA";
        else {
          const candidate = packSchema.safeParse(aiToPack(res.parsed, draft));
          if (candidate.success) {
            pack = candidate.data;
            generatedBy = "ia";
          } else note = "Réponse de l'IA hors format : version sans IA";
        }
      } catch (err) {
        note = `Erreur IA (${err instanceof Error ? err.message.slice(0, 120) : "inconnue"}) : version sans IA`;
      }
    }
  }

  const [row] = await sql<ApplicationRow[]>`
    insert into applications (job_id, variant, pack, generated_by, facts_hash, generation_note)
    values (${jobId}, ${pack.variant}, ${sql.json(asJson(pack))}, ${generatedBy}, ${profile.hash}, ${note})
    on conflict (job_id) do update set variant = excluded.variant, pack = excluded.pack, generated_by = excluded.generated_by,
      facts_hash = excluded.facts_hash, generation_note = excluded.generation_note, updated_at = now()
    returning *`;
  return { application: row, validation: validatePack(pack, contextFor(offer, profile, prefsText)) };
}

/** Contexte de validation d'une candidature existante. */
export async function validationFor(sql: Sql, jobId: string, pack: Pack): Promise<ValidationResult> {
  const job = await getJob(sql, jobId);
  if (!job) throw new Error("Offre introuvable");
  const [profile, prefs] = await Promise.all([loadProfile(sql), loadPreferences(sql)]);
  const offer: OfferInput = { title: job.title, company: job.company, description: job.description, family: null };
  return validatePack(pack, contextFor(offer, profile, preferencesText(prefs)));
}

/** Enregistre les modifications de texte et les validations explicites de l'utilisateur. */
export async function savePackEdits(sql: Sql, jobId: string, edits: Record<string, string>, validated: string[], emailSubject?: string): Promise<ValidationResult> {
  const app = await getApplication(sql, jobId);
  if (!app) throw new Error("Aucune candidature préparée pour cette offre");
  const pack = structuredClone(app.pack);
  for (const [path, text] of Object.entries(edits)) {
    const s = getAt(pack, path);
    if (!s || typeof s !== "object" || !("text" in s)) continue;
    const clean = text.trim().slice(0, 1200);
    if (clean && clean !== s.text) {
      s.text = clean;
      s.userValidated = false; // un texte modifié doit être re-contrôlé
    }
  }
  for (const path of validated) {
    const s = getAt(pack, path);
    if (s && typeof s === "object" && "text" in s) s.userValidated = true;
  }
  if (emailSubject !== undefined) pack.email.subject = emailSubject.trim().slice(0, 200) || pack.email.subject;
  const parsed = packSchema.parse(pack);
  await sql`update applications set pack = ${sql.json(asJson(parsed))}, updated_at = now() where job_id = ${jobId}`;
  return validationFor(sql, jobId, parsed);
}

/** « J'ai postulé » : refusé si le contrôle anti-invention échoue ; sinon copie figée + relance. */
export async function markApplied(sql: Sql, jobId: string, channel: string, now = new Date()): Promise<void> {
  const app = await getApplication(sql, jobId);
  if (!app) throw new Error("Aucune candidature préparée pour cette offre");
  const validation = await validationFor(sql, jobId, app.pack);
  if (!validation.ok) throw new Error("Le contrôle anti-invention bloque l'envoi : corrige ou valide les phrases signalées");
  // La copie figée garde aussi le profil utilisé : le PDF envoyé reste identique même si le profil change.
  const profile = await loadProfile(sql);
  const snapshot = { pack: app.pack, sentAt: now.toISOString(), factsHash: profile.hash, factsYaml: profile.source };
  const next = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000);
  await sql.begin(async (tx) => {
    await tx`update applications set sent_snapshot = ${tx.json(asJson(snapshot))}, applied_at = ${now}, channel = ${channel},
      next_action = 'Relancer', next_action_at = ${next}, updated_at = now() where job_id = ${jobId}`;
    await tx`update jobs set status = 'candidature_envoyee', is_read = true, updated_at = now() where id = ${jobId}`;
    await tx`insert into job_events (job_id, type, payload) values (${jobId}, 'candidature', ${tx.json({ channel, sentAt: snapshot.sentAt })})`;
  });
}

/** Relance faite : prochaine relance dans 7 jours ; « Clore » retire la relance. */
export async function followUp(sql: Sql, jobId: string, action: "relance_faite" | "clore", now = new Date()): Promise<void> {
  if (action === "relance_faite") {
    const next = new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000);
    await sql`update applications set next_action = 'Relancer à nouveau', next_action_at = ${next}, updated_at = now() where job_id = ${jobId}`;
    await sql`update jobs set status = 'relance_prevue', updated_at = now() where id = ${jobId}`;
    await sql`insert into job_events (job_id, type, payload) values (${jobId}, 'relance', ${sql.json({ at: now.toISOString() })})`;
  } else {
    await sql`update applications set next_action = null, next_action_at = null, updated_at = now() where job_id = ${jobId}`;
  }
}

export interface BoardRow {
  job_id: string;
  title: string;
  company: string | null;
  city: string | null;
  score: number | null;
  status: string;
  applied_at: Date | null;
  next_action: string | null;
  next_action_at: Date | null;
  url: string | null;
  has_pack: boolean;
}

export async function board(sql: Sql): Promise<BoardRow[]> {
  return sql<BoardRow[]>`
    select j.id as job_id, j.title, j.company, j.city, j.score, j.status, a.applied_at, a.next_action, a.next_action_at,
      (select s.url from job_sources s where s.job_id = j.id order by s.first_seen_at limit 1) as url,
      a.id is not null as has_pack
    from jobs j left join applications a on a.job_id = j.id
    where j.status in ('a_etudier', 'a_postuler', 'candidature_envoyee', 'relance_prevue', 'entretien', 'refus', 'offre_recue')
    order by coalesce(a.next_action_at, a.applied_at, j.updated_at) asc`;
}

export async function dueFollowUps(sql: Sql, now = new Date()): Promise<BoardRow[]> {
  return sql<BoardRow[]>`
    select j.id as job_id, j.title, j.company, j.city, j.score, j.status, a.applied_at, a.next_action, a.next_action_at,
      null::text as url, true as has_pack
    from applications a join jobs j on j.id = a.job_id
    where a.next_action_at is not null and a.next_action_at <= ${now} and j.status in ('candidature_envoyee', 'relance_prevue')
    order by a.next_action_at asc`;
}

export async function aiStatus(sql: Sql): Promise<{ configured: boolean; spent: number; budget: number }> {
  return { configured: aiConfigured(), spent: await spentThisMonthEur(sql), budget: monthlyBudgetEur() };
}
