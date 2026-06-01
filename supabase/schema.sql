-- ============================================================================
-- DemoTrack — database schema (Phase 1)
-- Postgres / Supabase. 12 tables. Row-Level Security on every user-owned table
-- so each row is private to its account. Design principle: derive, don't store
-- (times-contacted, goal progress, the funnel are all computed, never typed).
--
-- Apply with the Supabase SQL editor, or: supabase db push
-- ============================================================================

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type contact_category as enum ('label','dj','ar','curator','blog','promoter','radio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_method as enum ('email','form','dm');
exception when duplicate_object then null; end $$;

do $$ begin
  create type relationship_stage as enum ('cold','engaged','responded','relationship');
exception when duplicate_object then null; end $$;

do $$ begin
  create type access_path as enum ('cold_demo_friendly','open_window_only','needs_warm_intro','relationship_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type track_status as enum ('idea','demo_ready','submitted','signed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type link_type as enum ('soundcloud','dropbox','gdrive','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('sent','opened','replied','considering','signed','passed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type response_type as enum ('yes','no','not_for_us','constructive','no_response');
exception when duplicate_object then null; end $$;

do $$ begin
  create type template_kind as enum ('cold_email','dm','follow_up','form_note');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_mood as enum ('fire','good','ok','low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type label_tier as enum ('elite','a','b');
exception when duplicate_object then null; end $$;

do $$ begin
  create type goal_metric as enum ('demos_sent','follow_ups','tracks_finished','sessions');
exception when duplicate_object then null; end $$;

do $$ begin
  create type goal_period as enum ('week','month','quarter','year');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_kind as enum ('digest','follow_up_nudge','overdue');
exception when duplicate_object then null; end $$;

-- updated_at helper -----------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- 11 · labels — curated discovery library (SHARED, read-only to users).
-- Listed first because contacts references it. Seeded via service role.
-- ============================================================================
create table if not exists labels (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  tier                    label_tier not null,
  access_path             access_path not null,
  submission_method       submission_method,
  contact_link            text,
  genre_tags              text[] not null default '{}',
  bpm_min                 int,
  bpm_max                 int,
  submission_requirements text,
  sources                 text[] not null default '{}',  -- ≥2 independent sources
  parent_label_id         uuid references labels(id) on delete set null,
  why                     text,                            -- why it clears the bar
  notes                   text,
  last_verified           date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists labels_tier_idx on labels(tier);
create index if not exists labels_access_path_idx on labels(access_path);
create unique index if not exists labels_name_key on labels(lower(name));

-- ============================================================================
-- 01 · contacts — your personal CRM
-- ============================================================================
create table if not exists contacts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  category            contact_category not null default 'label',
  submission_method   submission_method,
  email               text,
  portal_url          text,
  dm_link             text,
  relationship_stage  relationship_stage not null default 'cold',
  access_path         access_path,
  last_contacted_at   timestamptz,
  label_id            uuid references labels(id) on delete set null, -- back-ref to discovery master
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists contacts_user_idx on contacts(user_id);
create index if not exists contacts_label_idx on contacts(label_id);

-- ============================================================================
-- 02 · tracks — your catalogue
-- ============================================================================
create table if not exists tracks (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  title                    text not null,
  genre_tags               text[] not null default '{}',
  bpm                      int,
  musical_key              text,
  status                   track_status not null default 'idea',
  listen_link              text,
  link_type                link_type,
  readiness                jsonb not null default '{}'::jsonb,  -- readiness checklist
  notes                    text,
  exclusive_hold_contact_id uuid references contacts(id) on delete set null,
  exclusive_hold_until      date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists tracks_user_idx on tracks(user_id);

-- ============================================================================
-- 03 · submissions — every demo sent (track → contact)
-- ============================================================================
create table if not exists submissions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  track_id          uuid not null references tracks(id) on delete cascade,
  contact_id        uuid not null references contacts(id) on delete cascade,
  method            submission_method not null,
  status            submission_status not null default 'sent',
  sent_at           timestamptz not null default now(),
  follow_up_due_at  timestamptz,                 -- 7-day nudge target
  overdue_at        timestamptz,                 -- 14-day overdue flag
  no_response_logged boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists submissions_user_idx on submissions(user_id);
create index if not exists submissions_track_idx on submissions(track_id);
create index if not exists submissions_contact_idx on submissions(contact_id);
create index if not exists submissions_status_idx on submissions(status);

-- ============================================================================
-- 04 · feedback — every response (silence is auto-logged as no_response)
-- ============================================================================
create table if not exists feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  track_id       uuid not null references tracks(id) on delete cascade,
  contact_id     uuid not null references contacts(id) on delete cascade,
  submission_id  uuid references submissions(id) on delete set null,
  response_type  response_type not null,
  body           text,
  created_at     timestamptz not null default now()
);
create index if not exists feedback_user_idx on feedback(user_id);
create index if not exists feedback_track_idx on feedback(track_id);

-- ============================================================================
-- 05 · templates — preset email/DM/follow-up skeletons with one hook slot
-- ============================================================================
create table if not exists templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        template_kind not null default 'cold_email',
  subject     text,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists templates_user_idx on templates(user_id);

-- ============================================================================
-- 06 · ar_intel — research notes, one per contact
-- ============================================================================
create table if not exists ar_intel (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  contact_id        uuid not null references contacts(id) on delete cascade,
  runs_label        text,
  signs             text,
  recent_releases   text,
  submission_prefs  text,
  personal_angle    text,
  notes             text,
  updated_at        timestamptz not null default now(),
  unique (user_id, contact_id)
);
create index if not exists ar_intel_user_idx on ar_intel(user_id);

-- ============================================================================
-- 07 · work_sessions — studio time (hours + one-tap mood)
-- ============================================================================
create table if not exists work_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  hours        numeric(4,1),
  mood         session_mood,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists work_sessions_user_idx on work_sessions(user_id, session_date);

-- ============================================================================
-- 08 · goals — targets (progress is DERIVED, never stored)
-- ============================================================================
create table if not exists goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  metric      goal_metric not null,
  target      int not null check (target > 0),
  period      goal_period not null default 'month',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists goals_user_idx on goals(user_id);

-- ============================================================================
-- 09 · link_events — clicks on tracked Form/DM links (Phase 11, optional)
-- ============================================================================
create table if not exists link_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  submission_id  uuid references submissions(id) on delete cascade,
  hash           text not null,
  opened_at      timestamptz not null default now(),
  user_agent     text
);
create index if not exists link_events_user_idx on link_events(user_id);
create index if not exists link_events_hash_idx on link_events(hash);

-- ============================================================================
-- 10 · press_kit — public EPK, one row per user (served via slug endpoint)
-- ============================================================================
create table if not exists press_kit (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  slug         text not null unique,
  artist_name  text,
  bio          text,
  bio_tone     text,
  links        jsonb not null default '[]'::jsonb,
  releases     jsonb not null default '[]'::jsonb,
  stats        jsonb not null default '{}'::jsonb,
  stats_updated_at date,
  photo_url    text,
  auto_attach  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists press_kit_slug_idx on press_kit(slug);

-- ============================================================================
-- 12 · notifications — queued/sent reminders & digests (fired by pg_cron)
-- ============================================================================
create table if not exists notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          notification_kind not null,
  payload       jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id);
create index if not exists notifications_due_idx on notifications(scheduled_for) where sent_at is null;

-- updated_at triggers ---------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['labels','contacts','tracks','submissions','templates','ar_intel','press_kit']
  loop
    execute format(
      'drop trigger if exists set_updated_at on %I; create trigger set_updated_at before update on %I for each row execute function set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- Derived views (no stored scores / counts) -----------------------------------
-- "times contacted" per contact = count of submissions. Pure derivation.
create or replace view contact_send_counts as
select c.id as contact_id, c.user_id, count(s.id)::int as times_contacted,
       max(s.sent_at) as last_sent_at
from contacts c
left join submissions s on s.contact_id = c.id
group by c.id, c.user_id;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table contacts       enable row level security;
alter table tracks         enable row level security;
alter table submissions    enable row level security;
alter table feedback       enable row level security;
alter table templates      enable row level security;
alter table ar_intel       enable row level security;
alter table work_sessions  enable row level security;
alter table goals          enable row level security;
alter table link_events    enable row level security;
alter table press_kit      enable row level security;
alter table notifications  enable row level security;
alter table labels         enable row level security;

-- Owner-only policy on every user-owned table (one helper loop).
do $$
declare t text;
begin
  foreach t in array array[
    'contacts','tracks','submissions','feedback','templates','ar_intel',
    'work_sessions','goals','link_events','press_kit','notifications'
  ]
  loop
    execute format('drop policy if exists owner_all on %I;', t);
    execute format(
      'create policy owner_all on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t
    );
  end loop;
end $$;

-- labels is a shared, read-only library: any authenticated user may read it,
-- nobody writes from the client (seeded with the service role).
drop policy if exists labels_read on labels;
create policy labels_read on labels
  for select to authenticated using (true);

-- NOTE: the PUBLIC press-kit page is NOT exposed via RLS. It is served through a
-- narrow Edge Function (slug endpoint) using the service role that returns only
-- whitelisted fields — structural privacy, per design principle #4.
