import { estimatedNetMonthly, formatSalary, referenceAnnual } from "./normalize/salary";
import type { Salary } from "./types";

const TZ = "Europe/Paris";

export function relativeDays(d: Date | string | null): string {
  if (!d) return "date inconnue";
  const date = new Date(d);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;
  return `le ${date.toLocaleDateString("fr-FR", { timeZone: TZ, day: "numeric", month: "short" })}`;
}

export function dateTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dateShort(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
}

export function salaryLabel(s: Salary | null): string {
  return formatSalary(s);
}

export function salaryNetHint(s: Salary | null): string | null {
  const ref = referenceAnnual(s);
  if (ref === null) return null;
  return `≈ ${estimatedNetMonthly(ref).toLocaleString("fr-FR")} € net/mois (estimation)`;
}

export const ZONE_LABELS: Record<string, string> = {
  rouen: "Zone Rouen",
  caen: "Zone Caen",
  teletravail: "Télétravail",
  autre: "Hors zone",
  inconnue: "Lieu inconnu",
};

export const REMOTE_LABELS: Record<string, string> = {
  total: "100 % télétravail",
  hybride: "Télétravail partiel",
  aucun: "Sur site",
  inconnu: "Télétravail non précisé",
};

export const SOURCE_LABELS: Record<string, string> = {
  hellowork: "HelloWork",
  adzuna: "Adzuna",
  francetravail: "France Travail",
};

export function contractLabel(contract: string, months: number | null): string {
  if (contract === "CDD") return months ? `CDD ${months} mois` : "CDD";
  if (contract === "INCONNU") return "Contrat non précisé";
  if (contract === "AUTRE") return "Autre contrat";
  return contract === "INTERIM" ? "Intérim" : contract;
}

export function locationLabel(city: string | null, zone: string, distanceKm: number | null): string {
  const place = city ?? "Lieu non précisé";
  if (distanceKm === null) return place;
  const ref = zone === "caen" ? "Caen" : "Rouen";
  return `${place} · ${Math.round(distanceKm)} km de ${ref}`;
}

export function scoreTone(score: number | null): "good" | "warn" | "muted" {
  if (score === null) return "muted";
  if (score >= 70) return "good";
  if (score >= 55) return "warn";
  return "muted";
}

/** Vrai si l'échéance est atteinte. */
export function isDue(d: Date | string): boolean {
  return new Date(d).getTime() <= Date.now();
}

/** Vrai si la date est dans les dernières 24 heures. */
export function isRecent(d: Date | string, hours = 24): boolean {
  return Date.now() - new Date(d).getTime() < hours * 3_600_000;
}
