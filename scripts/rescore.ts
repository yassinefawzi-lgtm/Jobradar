import "./env";
import { closeDb, db } from "../src/lib/db/client";
import { loadPreferences } from "../src/lib/db/repo";
import { rescoreAll } from "../src/lib/sync/rescore";

async function main() {
  const sql = db();
  const n = await rescoreAll(sql, await loadPreferences(sql));
  console.log(`${n} offres rescorées`);
}
main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
