-- ============================================================================
-- DemoTrack — Phase 6: Follow-up Workflows + Digest (Spec §6)
-- Standalone & idempotent. Run AFTER schema.sql with the service role.
--
-- Provides:
--   • follow_up_queue        — view: open sends with a computed due/overdue state
--   • log_overdue_no_responses() — auto-log 'no_response' feedback past 14 days
--   • queue_followup_notifications() — enqueue 7-day nudge / 14-day overdue rows
--   • run_followups_tick()   — the function pg_cron calls daily
--   • (guarded) pg_cron schedule + a commented pg_net → daily-digest snippet
--
-- Timing comes from submissions.follow_up_due_at (sent + 7d) and
-- submissions.overdue_at (sent + 14d), set when a demo is recorded.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The follow-up queue: every still-open send, with a state the UI can sort on.
-- security_invoker => the caller's RLS applies (each user sees only their own).
-- "open" = awaiting a reply (sent / opened). Replied/considering/signed/passed
-- have left the silence loop.
-- ---------------------------------------------------------------------------
create or replace view follow_up_queue
  with (security_invoker = true) as
select
  s.id              as submission_id,
  s.user_id,
  s.track_id,
  t.title           as track_title,
  s.contact_id,
  c.name            as contact_name,
  c.submission_method as method,
  c.email           as contact_email,
  c.portal_url,
  c.dm_link,
  s.status,
  s.sent_at,
  s.follow_up_due_at,
  s.overdue_at,
  s.no_response_logged,
  case
    when s.overdue_at      is not null and s.overdue_at      <= now() then 'overdue'
    when s.follow_up_due_at is not null and s.follow_up_due_at <= now() then 'due'
    else 'waiting'
  end as state
from submissions s
join tracks   t on t.id = s.track_id
join contacts c on c.id = s.contact_id
where s.user_id = auth.uid()
  and s.status in ('sent','opened');

-- ---------------------------------------------------------------------------
-- Silence is data: past the 14-day overdue window, auto-log a 'no_response'
-- feedback record exactly once (guarded by submissions.no_response_logged).
-- SECURITY DEFINER so the scheduler (no auth.uid()) can write across users;
-- user_id is copied from the submission, so rows stay correctly owned.
-- ---------------------------------------------------------------------------
create or replace function log_overdue_no_responses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  logged int := 0;
begin
  with overdue as (
    select s.id, s.user_id, s.track_id, s.contact_id
    from submissions s
    where s.overdue_at is not null
      and s.overdue_at <= now()
      and s.no_response_logged = false
      and s.status in ('sent','opened')
    for update of s skip locked
  ),
  ins as (
    insert into feedback (user_id, track_id, contact_id, submission_id, response_type, body)
    select user_id, track_id, contact_id, id, 'no_response',
           'Auto-logged: no response within the 14-day window.'
    from overdue
    returning submission_id
  )
  update submissions s
     set no_response_logged = true, updated_at = now()
    from ins
   where s.id = ins.submission_id;
  get diagnostics logged = row_count;
  return logged;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enqueue reminder rows (the scheduled digest reads/sends these). One row per
-- (submission, kind); re-running never duplicates. kind: follow_up_nudge at 7d,
-- overdue at 14d.
-- ---------------------------------------------------------------------------
create or replace function queue_followup_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare queued int := 0; n int;
begin
  -- 7-day silence nudges
  insert into notifications (user_id, kind, payload, scheduled_for)
  select s.user_id, 'follow_up_nudge',
         jsonb_build_object('submission_id', s.id, 'contact_id', s.contact_id, 'track_id', s.track_id),
         now()
  from submissions s
  where s.follow_up_due_at is not null and s.follow_up_due_at <= now()
    and (s.overdue_at is null or s.overdue_at > now())
    and s.status in ('sent','opened')
    and not exists (
      select 1 from notifications x
      where x.user_id = s.user_id and x.kind = 'follow_up_nudge'
        and x.payload->>'submission_id' = s.id::text
    );
  get diagnostics n = row_count; queued := queued + n;

  -- 14-day overdue flags
  insert into notifications (user_id, kind, payload, scheduled_for)
  select s.user_id, 'overdue',
         jsonb_build_object('submission_id', s.id, 'contact_id', s.contact_id, 'track_id', s.track_id),
         now()
  from submissions s
  where s.overdue_at is not null and s.overdue_at <= now()
    and s.status in ('sent','opened')
    and not exists (
      select 1 from notifications x
      where x.user_id = s.user_id and x.kind = 'overdue'
        and x.payload->>'submission_id' = s.id::text
    );
  get diagnostics n = row_count; queued := queued + n;
  return queued;
end;
$$;

-- ---------------------------------------------------------------------------
-- One entrypoint for the daily scheduler.
-- ---------------------------------------------------------------------------
create or replace function run_followups_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform log_overdue_no_responses();
  perform queue_followup_notifications();
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule it daily at 08:00 UTC — only if pg_cron is available (it is on
-- Supabase). Guarded so this file also loads on a vanilla Postgres.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('demotrack_followups_tick')
      where exists (select 1 from cron.job where jobname = 'demotrack_followups_tick');
    perform cron.schedule('demotrack_followups_tick', '0 8 * * *', 'select run_followups_tick();');
  else
    raise notice 'pg_cron not available — schedule run_followups_tick() externally (it is enabled on Supabase).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Email digest: the daily-digest Edge Function composes & sends the digest.
-- On Supabase, trigger it from the same daily tick via pg_net (uncomment and
-- fill your project ref + a service-role/anon JWT stored in Vault). Left
-- commented because it is project-specific.
--
-- select cron.schedule(
--   'demotrack_daily_digest', '5 8 * * *',
--   $$ select net.http_post(
--        url     := 'https://<PROJECT_REF>.functions.supabase.co/daily-digest',
--        headers := jsonb_build_object('Content-Type','application/json',
--                     'Authorization','Bearer ' || current_setting('app.service_role_key', true))
--      ); $$
-- );
-- ---------------------------------------------------------------------------
