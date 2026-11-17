/**
 * Déclenchement manuel de la synchro depuis l'application : appelle le workflow GitHub Actions
 * (la collecte ne tourne jamais dans une fonction serverless). Nécessite GITHUB_DISPATCH_TOKEN
 * (jeton à portée limitée : Actions en écriture sur ce seul dépôt) et GITHUB_REPOSITORY (ex. "moi/jobradar").
 */
export function dispatchConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GITHUB_DISPATCH_TOKEN && env.GITHUB_REPOSITORY);
}

export async function dispatchSync(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number }> {
  if (!dispatchConfigured(env)) return { ok: false, status: 0 };
  const res = await fetchImpl(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/sync.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: env.GITHUB_REF_NAME || "main" }),
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: res.status === 204, status: res.status };
}
