# DemoTrack

> Your silent manager. Ship your music.

A mobile-first PWA that does a manager's job for a solo house & tech-house
producer: find the right labels, send great demos in minutes, never lose track
of a follow-up, and learn from every reply. The whole app is engineered to
remove friction and manufacture momentum — because the bottleneck is *effort and
consistency*, not talent.

See the full spec in [`DemoTrack_Specification-2.pdf`](./DemoTrack_Specification-2.pdf)
and the phase checklist in [`DemoTrack_Build_Plan.pdf`](./DemoTrack_Build_Plan.pdf).

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + Vite 6, Tailwind CSS 4, installable PWA |
| Data / auth | Supabase (Postgres + magic-link auth + Row-Level Security), 12 tables |
| Scheduling | Supabase `pg_cron` + Edge Functions (digests, 7/14-day follow-ups) |
| AI | Anthropic API (Claude) — email hook, bio, feedback patterns |
| Sending | `mailto:` / Gmail deep link — no relay, no deliverability risk |
| Hosting | Vercel (`demotrack.app`, `press.demotrack.app`, `track.demotrack.app`) |

## Status — Phase 1 (Foundation) ✅

- React + Vite + Tailwind 4 PWA shell, mobile-first, with bottom-nav app shell
- Supabase magic-link auth + route guard + auth context
- Full 12-table schema with RLS (`supabase/schema.sql`)
- Seed for the 17 curated labels (`supabase/seed_labels.sql`)
- Module screens stubbed honestly per their build phase

Subsequent phases (Track Vault, Contacts CRM, Send Demo, …) build on this shell.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project values
npm run dev
```

### Database

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor (creates the 12 tables + RLS).
3. Run `supabase/seed_labels.sql` to load the 17 curated labels.
4. Put the project URL + anon key in `.env.local` (see `.env.example`).

Magic-link auth works out of the box once the project URL/anon key are set and
your site URL is allowed in Supabase Auth settings.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview the build
- `npm run lint` — lint

---

DemoTrack · Built for one producer. One purpose. · Tunis, 2026
