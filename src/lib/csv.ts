import type { JobRow } from "./db/jobs";
import { contractLabel, salaryLabel } from "./format";
import { STATUS_LABELS } from "./types";

function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise les formules (injection CSV dans Excel / Sheets).
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV séparé par des points-virgules (Excel FR), avec BOM UTF-8. */
export function toCsv(jobs: JobRow[]): string {
  const header = ["Score", "Recommandation", "Titre", "Entreprise", "Ville", "Distance (km)", "Contrat", "Télétravail", "Salaire", "Publiée", "Statut", "Favori", "Notes", "Lien"];
  const rows = jobs.map((j) => [
    j.score,
    j.score_details?.recommendation,
    j.title,
    j.company,
    j.city,
    j.distance_km,
    contractLabel(j.contract, j.contract_months),
    j.remote,
    salaryLabel(j.salary),
    j.published_at ? new Date(j.published_at).toISOString().slice(0, 10) : "",
    STATUS_LABELS[j.status],
    j.is_favorite ? "oui" : "",
    j.notes,
    j.sources[0]?.url,
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
