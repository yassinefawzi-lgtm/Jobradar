import Anthropic from "@anthropic-ai/sdk";
import type postgres from "postgres";

/** Modèle utilisé pour rédiger CV et lettres. */
export const MODEL = "claude-opus-5-5";
/** Tarifs publics du modèle, en dollars par million de jetons (entrée, sortie). */
export const PRICE_USD_PER_MTOK = { input: 4, output: 20 };
/** Conversion indicative dollar → euro pour le compteur de budget (estimation, pas un taux du jour). */
export const USD_TO_EUR = 0.92;

export function aiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export function monthlyBudgetEur(env: Record<string, string | undefined> = process.env): number {
  const v = Number(env.AI_MONTHLY_BUDGET_EUR ?? 10);
  return Number.isFinite(v) && v >= 0 ? v : 10;
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function costEur(usage: { input_tokens: number; output_tokens: number }): number {
  const usd = (usage.input_tokens * PRICE_USD_PER_MTOK.input + usage.output_tokens * PRICE_USD_PER_MTOK.output) / 1_000_000;
  return Math.round(usd * USD_TO_EUR * 10_000) / 10_000;
}

export async function spentThisMonthEur(sql: postgres.Sql): Promise<number> {
  const [r] = await sql<{ total: string | null }[]>`
    select sum(cost_eur) as total from ai_usage where created_at >= date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`;
  return Number(r?.total ?? 0);
}

export async function recordUsage(
  sql: postgres.Sql,
  entry: { purpose: string; model: string; input_tokens: number; output_tokens: number; job_id?: string | null },
): Promise<number> {
  const cost = costEur(entry);
  await sql`insert into ai_usage (purpose, model, input_tokens, output_tokens, cost_eur, job_id)
    values (${entry.purpose}, ${entry.model}, ${entry.input_tokens}, ${entry.output_tokens}, ${cost}, ${entry.job_id ?? null})`;
  return cost;
}
