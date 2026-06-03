-- ============================================================================
-- DemoTrack — Data Freshness System (turns last_verified from a static stamp
-- into a self-updating signal). Standalone & idempotent. Run AFTER schema.sql
-- with the service role.
--
-- Provides:
--   • labels.link_status / link_checked_at  — written by the check-links cron
--     Edge Function (service role) — the only path allowed to touch the shared
--     read-only labels master.
--   • label_reports                — per-user write-back (RLS owner-only):
--     "this route is broken / changed / closed" or "I re-verified it, still works".
--   • label_freshness (view)       — labels + the caller's own reports, so the
--     UI can compute an effective, per-user freshness for every label.
--   • label_recheck_queue (view)   — the actionable worklist: stale, broken,
--     or link-checker-flagged labels.
--
-- The freshness *buckets* (fresh / aging / stale) live in src/lib/freshness.js
-- so there is one source of truth for thresholds; this layer only exposes the
-- raw inputs (effective verified date, flagged-broken, automated link status).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Layer 4 inputs: automated link-check results on the shared master.
-- Only the check-links Edge Function (service role) ever writes these.
-- link_status: 'ok' | 'broken' | 'timeout' | null (never checked / not a URL)
-- ---------------------------------------------------------------------------
alter table labels add column if not exists link_status     text;
alter table labels add column if not exists link_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- Layer 2: user write-back. labels is read-only to users, so reports live in
-- their own owner-scoped table and are overlaid on the master at read time.
-- ---------------------------------------------------------------------------
do $$
begin
  create type label_report_kind as enum
    ('broken_link', 'route_changed', 'closed', 'verified_ok');
exception
  when duplicate_object then null;
end
$$;

create table if not exists label_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label_id   uuid not null references labels(id) on delete cascade,
  kind       label_report_kind not null,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists label_reports_user_idx  on label_reports(user_id);
create index if not exists label_reports_label_idx on label_reports(label_id);
create index if not exists label_reports_lookup_idx on label_reports(user_id, label_id, created_at desc);

alter table label_reports enable row level security;
drop policy if exists owner_all on label_reports;
create policy owner_all on label_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- label_freshness: every label, enriched with THIS user's freshness signal.
-- security_invoker => labels' public read + the caller's own label_reports.
--
--   my_verified_at  — latest "verified_ok" the user logged (a real send that
--                     confirmed the route still works). Refreshes the master
--                     for that user without editing it.
--   flagged_broken  — the user has a broken/changed/closed report that is more
--                     recent than their last verified_ok (so marking it verified
--                     again clears the flag).
--   effective_verified — the better of the seed date and the user's own check.
-- ---------------------------------------------------------------------------
create or replace view label_freshness
  with (security_invoker = true) as
select
  l.id,
  l.name,
  l.tier,
  l.access_path,
  l.submission_method,
  l.contact_link,
  l.genre_tags,
  l.submission_requirements,
  l.sources,
  l.why,
  l.last_verified,
  l.link_status,
  l.link_checked_at,
  v.my_verified_at,
  greatest(l.last_verified, v.my_verified_at::date) as effective_verified,
  coalesce(b.flagged_broken, false)                 as flagged_broken
from labels l
left join lateral (
  select max(r.created_at) as my_verified_at
  from label_reports r
  where r.label_id = l.id
    and r.user_id  = auth.uid()
    and r.kind     = 'verified_ok'
) v on true
left join lateral (
  select exists (
    select 1
    from label_reports r
    where r.label_id = l.id
      and r.user_id  = auth.uid()
      and r.kind in ('broken_link', 'route_changed', 'closed')
      and r.created_at > coalesce(
        (select max(v2.created_at)
           from label_reports v2
          where v2.label_id = l.id
            and v2.user_id  = auth.uid()
            and v2.kind     = 'verified_ok'),
        '-infinity'::timestamptz)
  ) as flagged_broken
) b on true;

-- ---------------------------------------------------------------------------
-- label_recheck_queue: the actionable subset — anything a careful producer
-- should re-check before relying on it. The UI surfaces a "Needs re-check (N)".
--   reason: 'flagged' (you reported it) > 'link_broken' (cron) > 'stale' (>1yr)
-- ---------------------------------------------------------------------------
create or replace view label_recheck_queue
  with (security_invoker = true) as
select
  f.*,
  case
    when f.flagged_broken                          then 'flagged'
    when f.link_status = 'broken'                  then 'link_broken'
    when f.effective_verified is null              then 'unverified'
    when f.effective_verified < (now() - interval '365 days')::date then 'stale'
    else null
  end as recheck_reason
from label_freshness f
where f.flagged_broken
   or f.link_status = 'broken'
   or f.effective_verified is null
   or f.effective_verified < (now() - interval '365 days')::date;

-- ---------------------------------------------------------------------------
-- Layer 4 schedule: run the check-links Edge Function weekly. Project-specific
-- (needs your project ref + the CRON_SECRET you set on the function), so it is
-- left commented — uncomment and fill in to enable. Mirrors the daily-digest
-- pattern in followups.sql.
--
-- select cron.schedule(
--   'demotrack_check_links', '0 6 * * 1',   -- Mondays 06:00 UTC
--   $$ select net.http_post(
--        url     := 'https://<PROJECT_REF>.functions.supabase.co/check-links',
--        headers := jsonb_build_object(
--                     'Content-Type','application/json',
--                     'x-cron-secret', current_setting('app.cron_secret', true))
--      ); $$
-- );
-- ---------------------------------------------------------------------------
