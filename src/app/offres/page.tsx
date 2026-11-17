import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, JobCard } from "@/components/ui";
import { db } from "@/lib/db/client";
import { listJobs, parseFilters } from "@/lib/db/jobs";
import { FAMILIES } from "@/lib/scoring/preferences";
import { STATUS_LABELS, STATUSES } from "@/lib/types";

export const metadata: Metadata = { title: "Offres" };
export const dynamic = "force-dynamic";

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const f = parseFilters(params);
  const jobs = await listJobs(db(), f);
  const exportQuery = new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)])).toString();

  return (
    <main className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Offres</h1>
        <a href={`/api/export${exportQuery ? `?${exportQuery}` : ""}`} className="text-sm text-accent hover:underline">
          Exporter en CSV
        </a>
      </div>

      <form method="get" className="card grid grid-cols-2 gap-2 p-3 sm:grid-cols-4" aria-label="Filtres">
        <input name="q" defaultValue={f.q} placeholder="Recherche (titre, entreprise, mot-clé)" className="field col-span-2" />
        <Select name="only" value={f.only} label="Afficher" options={[["toutes", "Toutes (hors écartées)"], ["nouvelles", "Nouvelles (24 h)"], ["non_lues", "Non lues"], ["favoris", "Favoris"], ["ecartees", "Écartées"]]} />
        <Select name="sort" value={f.sort} label="Trier par" options={[["score", "Score"], ["date", "Date de publication"], ["salaire", "Salaire publié"], ["decouverte", "Date de découverte"]]} />
        <Select name="minScore" value={f.minScore?.toString()} label="Score minimum" options={[["", "Score : tous"], ["55", "≥ 55"], ["70", "≥ 70"], ["85", "≥ 85"]]} />
        <Select name="contract" value={f.contract} label="Contrat" options={[["", "Contrat : tous"], ["CDI", "CDI"], ["CDD", "CDD"], ["AUTRE", "Autre / non précisé"]]} />
        <Select name="zone" value={f.zone} label="Zone" options={[["", "Zone : toutes"], ["rouen", "Rouen"], ["caen", "Caen"], ["teletravail", "Télétravail complet"], ["inconnue", "Lieu inconnu"]]} />
        <Select name="remote" value={f.remote} label="Télétravail" options={[["", "Télétravail : tous"], ["total", "100 %"], ["hybride", "Partiel"], ["aucun", "Aucun"]]} />
        <Select name="family" value={f.family} label="Famille" options={[["", "Famille : toutes"], ...Object.entries(FAMILIES).map(([k, v]) => [k, `${k} · ${v}`] as [string, string])]} />
        <Select name="days" value={f.days?.toString()} label="Publication" options={[["", "Publiée : toutes"], ["1", "Dernières 24 h"], ["3", "3 derniers jours"], ["7", "7 derniers jours"], ["30", "30 derniers jours"]]} />
        <Select name="minSalary" value={f.minSalary?.toString()} label="Salaire" options={[["", "Salaire : tous"], ["31000", "≥ 31 k€ brut/an"], ["35000", "≥ 35 k€ brut/an"], ["40000", "≥ 40 k€ brut/an"]]} />
        <Select name="source" value={f.source} label="Source" options={[["", "Source : toutes"], ["hellowork", "HelloWork"], ["francetravail", "France Travail"], ["adzuna", "Adzuna"]]} />
        <Select name="status" value={f.status} label="Statut" options={[["", "Statut : tous (hors ignorées)"], ...STATUSES.map((s) => [s, STATUS_LABELS[s]] as [string, string])]} />
        <input name="skill" defaultValue={f.skill} placeholder="Compétence (ex. CRM)" className="field" aria-label="Compétence" />
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          <button className="btn btn-primary">Filtrer</button>
          <Link href="/offres" className="btn">
            Réinitialiser
          </Link>
        </div>
      </form>

      <p className="text-sm text-muted">{jobs.length} offre(s)</p>
      <div className="space-y-3">
        {jobs.length ? jobs.map((job) => <JobCard key={job.id} job={job} />) : <EmptyState title="Aucune offre ne correspond à ces filtres." />}
      </div>
    </main>
  );
}

function Select({ name, value, label, options }: { name: string; value: string | undefined; label: string; options: [string, string][] }) {
  return (
    <select name={name} defaultValue={value ?? options[0][0]} aria-label={label} className="field">
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
