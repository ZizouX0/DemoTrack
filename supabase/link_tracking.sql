-- ============================================================================
-- DemoTrack — Phase 11 (OPTIONAL): Demo Link Tracking (Spec §9)
-- Wrap Form/DM demo links so you can see when a label OPENS your demo.
-- Scoped to Form/DM only — never email (open-tracking hurts deliverability).
-- Standalone & idempotent. Run AFTER schema.sql with the service role.
--
-- Flow: app creates a tracked_links row (hash -> target_url) and pastes
-- track.<domain>/<hash> into the portal/DM. When opened, the track-redirect
-- Edge Function calls record_link_open(hash) -> logs a link_events row, flips
-- the submission to 'opened' (first open), and returns the real target to 302.
-- ============================================================================

create table if not exists tracked_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  submission_id uuid references submissions(id) on delete cascade,
  hash          text not null unique,
  target_url    text not null,
  created_at    timestamptz not null default now()
);
create index if not exists tracked_links_user_idx on tracked_links(user_id);
create index if not exists tracked_links_submission_idx on tracked_links(submission_id);

alter table tracked_links enable row level security;
drop policy if exists owner_all on tracked_links;
create policy owner_all on tracked_links
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The opener is anonymous (a label clicking a link), so the redirect path runs
-- with SECURITY DEFINER and bypasses RLS — but only ever touches the one row
-- matching the hash, and copies user_id/submission_id from that row.
create or replace function record_link_open(p_hash text, p_user_agent text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  link tracked_links;
begin
  select * into link from tracked_links where hash = p_hash;
  if not found then
    return null;
  end if;

  insert into link_events (user_id, submission_id, hash, user_agent)
  values (link.user_id, link.submission_id, link.hash, p_user_agent);

  -- First open advances the funnel: sent -> opened (never downgrades).
  if link.submission_id is not null then
    update submissions
       set status = 'opened', updated_at = now()
     where id = link.submission_id and status = 'sent';
  end if;

  return link.target_url;
end;
$$;

-- Only the track-redirect Edge Function calls this, and it runs with the
-- service role — client roles never need EXECUTE (security-advisor 0028/0029).
revoke execute on function record_link_open(text, text) from public, anon, authenticated;
grant execute on function record_link_open(text, text) to service_role;

-- Per-submission open counts, for the UI (security_invoker => caller's RLS).
create or replace view submission_open_counts
  with (security_invoker = true) as
select s.id as submission_id, s.user_id,
       count(e.id)::int as opens,
       max(e.opened_at) as last_opened_at
from submissions s
left join link_events e on e.submission_id = s.id
where s.user_id = auth.uid()
group by s.id, s.user_id;
