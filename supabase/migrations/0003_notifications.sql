-- JobRadar : anti-doublon des notifications (phase 4)
alter table jobs add column if not exists notified_at timestamptz;
create index if not exists jobs_notified_idx on jobs (notified_at);
