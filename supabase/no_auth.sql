-- ============================================================================
-- DemoTrack — single-user, NO-LOGIN mode.
-- Already applied to production (migration: remove_auth_single_user).
-- Kept here so the repo reflects the live database and the change is reproducible.
--
-- ⚠️ SECURITY: this DISABLES Row-Level Security. With the public anon key,
-- anyone who has the app URL can read and write all data. This is acceptable
-- ONLY for a private, single-user deployment on an unlisted URL. To restore
-- multi-user safety, re-enable RLS and revert to magic-link / password auth.
--
-- The app pins to one fixed owner id (the original account) so existing data
-- stays owned and the per-user views keep matching. Update OWNER below if the
-- owner ever changes, and re-run.
-- ============================================================================

-- OWNER: 5463fb44-8fb7-4f0c-872b-7787640cd676

-- 1. Disable RLS so the anon key (no session) can operate on every table.
alter table contacts        disable row level security;
alter table tracks          disable row level security;
alter table submissions     disable row level security;
alter table feedback        disable row level security;
alter table templates       disable row level security;
alter table ar_intel        disable row level security;
alter table work_sessions   disable row level security;
alter table goals           disable row level security;
alter table link_events     disable row level security;
alter table press_kit       disable row level security;
alter table notifications   disable row level security;
alter table tracked_links   disable row level security;
alter table label_reports   disable row level security;
alter table labels          disable row level security;
alter table promo_contacts  disable row level security;

-- 2. Ensure the anon role has table privileges (policies no longer gate it).
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to anon;
grant usage, select on all sequences in schema public to anon;

-- 3. Per-user views now key off the fixed owner id instead of auth.uid().
create or replace view contact_send_counts with (security_invoker = true) as
  select c.id as contact_id, c.user_id,
         count(s.id)::int as times_contacted,
         max(s.sent_at) as last_sent_at
  from contacts c
  left join submissions s on s.contact_id = c.id
  where c.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
  group by c.id, c.user_id;

create or replace view submission_open_counts with (security_invoker = true) as
  select s.id as submission_id, s.user_id,
         count(e.id)::int as opens,
         max(e.opened_at) as last_opened_at
  from submissions s
  left join link_events e on e.submission_id = s.id
  where s.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
  group by s.id, s.user_id;

create or replace view follow_up_queue with (security_invoker = true) as
  select s.id as submission_id, s.user_id, s.track_id, t.title as track_title,
         s.contact_id, c.name as contact_name, c.submission_method as method,
         c.email as contact_email, c.portal_url, c.dm_link,
         s.status, s.sent_at, s.follow_up_due_at, s.overdue_at, s.no_response_logged,
         case
           when s.overdue_at is not null and s.overdue_at <= now() then 'overdue'
           when s.follow_up_due_at is not null and s.follow_up_due_at <= now() then 'due'
           else 'waiting'
         end as state
  from submissions s
  join tracks t on t.id = s.track_id
  join contacts c on c.id = s.contact_id
  where s.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
    and s.status in ('sent','opened');

create or replace view label_freshness with (security_invoker = true) as
  select l.id, l.name, l.tier, l.access_path, l.submission_method, l.contact_link,
         l.genre_tags, l.submission_requirements, l.sources, l.why, l.last_verified,
         l.link_status, l.link_checked_at,
         v.my_verified_at,
         greatest(l.last_verified, v.my_verified_at::date) as effective_verified,
         coalesce(b.flagged_broken, false) as flagged_broken
  from labels l
  left join lateral (
    select max(r.created_at) as my_verified_at
    from label_reports r
    where r.label_id = l.id
      and r.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
      and r.kind = 'verified_ok'
  ) v on true
  left join lateral (
    select exists (
      select 1 from label_reports r
      where r.label_id = l.id
        and r.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
        and r.kind in ('broken_link','route_changed','closed')
        and r.created_at > coalesce(
          (select max(v2.created_at) from label_reports v2
            where v2.label_id = l.id
              and v2.user_id = '5463fb44-8fb7-4f0c-872b-7787640cd676'::uuid
              and v2.kind = 'verified_ok'),
          '-infinity'::timestamptz)
    ) as flagged_broken
  ) b on true;

create or replace view label_recheck_queue with (security_invoker = true) as
  select f.*, case
      when f.flagged_broken then 'flagged'
      when f.link_status = 'broken' then 'link_broken'
      when f.effective_verified is null then 'unverified'
      when f.effective_verified < (now() - interval '365 days')::date then 'stale'
      else null end as recheck_reason
  from label_freshness f
  where f.flagged_broken
     or f.link_status = 'broken'
     or f.effective_verified is null
     or f.effective_verified < (now() - interval '365 days')::date;
