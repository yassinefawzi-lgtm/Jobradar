-- JobRadar : candidatures et consommation IA (phase 2)

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs (id) on delete cascade,
  variant text not null,
  pack jsonb not null,                 -- brouillon courant (modifiable)
  generated_by text not null,          -- ia | modele
  facts_hash text not null,            -- version de profile/facts.yaml utilisée
  generation_note text,                -- ex. raison du repli sans IA
  sent_snapshot jsonb,                 -- copie figée de ce qui a été envoyé
  applied_at timestamptz,
  channel text,                        -- site, e-mail, autre
  next_action text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applications_next_action_idx on applications (next_action_at);

create table if not exists ai_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  purpose text not null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cost_eur numeric(10, 4) not null,
  job_id uuid references jobs (id) on delete set null
);
create index if not exists ai_usage_created_idx on ai_usage (created_at);

alter table applications enable row level security;
alter table ai_usage enable row level security;
