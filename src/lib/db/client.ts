import postgres from "postgres";

let client: postgres.Sql | null = null;

/** Connexion Postgres côté serveur uniquement (Supabase en production, PostgreSQL local en dev). */
export function db(): postgres.Sql {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant : voir .env.example");
  const local = /localhost|127\.0\.0\.1/.test(url);
  client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    ssl: local ? false : "require",
    prepare: false, // compatible avec le pooler de Supabase (mode transaction)
    idle_timeout: 20,
    onnotice: () => {},
  });
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}
