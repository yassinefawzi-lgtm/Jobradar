-- JobRadar : schéma initial (phase 1)
-- L'application accède à la base uniquement côté serveur (connexion Postgres).
-- La Row Level Security est activée sur toutes les tables SANS politique :
-- l'API publique de Supabase (clé anon) ne peut donc rien lire ni écrire.

create extension if not exists pgcrypto;

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  title text not null,
  company text,
  city text,
  postal_code text,
  lat double precision,
  lon double precision,
  distance_km double precision,
  zone text not null default 'inconnue',          -- rouen | caen | teletravail | autre | inconnue
  contract text not null default 'INCONNU',       -- CDI | CDD | INTERIM | STAGE | ALTERNANCE | FREELANCE | AUTRE | INCONNU
  contract_months integer,
  remote text not null default 'inconnu',         -- total | hybride | aucun | inconnu
  salary jsonb,                                   -- voir src/lib/normalize/salary.ts
  description text,
  description_partial boolean not null default false,
  published_at timestamptz,
  valid_through timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  availability text not null default 'inconnue',  -- active | expiree | inconnue
  availability_checked_at timestamptz,
  score integer,
  score_details jsonb,
  scored_at timestamptz,
  status text not null default 'nouvelle',
  is_read boolean not null default false,
  is_favorite boolean not null default false,
  ignore_reason text,
  notes text,
  updated_at timestamptz not null default now()
);
create index if not exists jobs_fingerprint_idx on jobs (fingerprint);
create index if not exists jobs_score_idx on jobs (score desc nulls last);
create index if not exists jobs_first_seen_idx on jobs (first_seen_at desc);
create index if not exists jobs_status_idx on jobs (status);

create table if not exists job_sources (
  id bigserial primary key,
  job_id uuid not null references jobs (id) on delete cascade,
  source text not null,
  source_job_id text not null,
  url text not null,
  canonical_url text not null,
  raw jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (source, source_job_id)
);
create index if not exists job_sources_job_idx on job_sources (job_id);
create index if not exists job_sources_canonical_idx on job_sources (canonical_url);

create table if not exists job_events (
  id bigserial primary key,
  job_id uuid not null references jobs (id) on delete cascade,
  type text not null,            -- statut | lue | favori | ignoree | note | disponibilite | erreur_signalee
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists job_events_job_idx on job_events (job_id, created_at desc);

create table if not exists sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'en_cours',   -- en_cours | succes | partiel | echec
  trigger text not null default 'manuel',    -- manuel | planifie | cli
  stats jsonb,
  errors jsonb
);

create table if not exists source_status (
  source text primary key,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_count integer
);

create table if not exists geocache (
  key text primary key,
  lat double precision,
  lon double precision,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table jobs enable row level security;
alter table job_sources enable row level security;
alter table job_events enable row level security;
alter table sync_runs enable row level security;
alter table source_status enable row level security;
alter table geocache enable row level security;
alter table settings enable row level security;
