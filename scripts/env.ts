import { existsSync } from "node:fs";

/** Charge .env.local puis .env s'ils existent (les variables déjà définies, ex. secrets CI, sont prioritaires). */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
