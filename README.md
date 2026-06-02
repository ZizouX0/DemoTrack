# DemoTrack — *your silent manager*

A career-management PWA for a solo **house & tech-house** producer with no team. It strips the friction out of getting your music to the right labels — turning demo submission from a thing you keep meaning to do into a weekly habit that compounds.

> **One-line pitch:** Find good labels, send great demos in minutes, never lose track of a follow-up, and learn from every reply — automatically.

The bottleneck for an unknown producer isn't talent or even contacts — it's **effort and consistency**. DemoTrack is engineered to remove friction and manufacture momentum: if sending a polished, tailored demo takes 3 minutes instead of 30, and the app proactively tells you who to follow up with today, you'll actually do the work.

See the source spec in [`DemoTrack_Specification-2.pdf`](./DemoTrack_Specification-2.pdf) and the phase plan in [`DemoTrack_Build_Plan.pdf`](./DemoTrack_Build_Plan.pdf).

---

## The core loop

Everything serves one repeating cycle, run for every track you want to place:

**1. Discover** → **2. Prepare** → **3. Generate** → **4. Send** (< 3 min) → **5. Track** → **6. Follow-up** → **7. Learn**

---

## What's built (all 13 phases)

| Module | What it does |
|---|---|
| **Track Vault** | Your catalogue: status (idea → demo-ready → submitted → signed), listen link, BPM/key, notes, per-track send & feedback history. |
| **Contacts CRM** | Every label/contact in one place: method + links, relationship stage, access path, A&R intel, full history. |
| **Label Discovery** | Browse/filter a **curated 288-label master** (tier, access path, method, genre, freshness); one-tap "Add to CRM" with "in CRM / submitted" indicators. |
| **Send Demo** | The friction-killer: pick track → pick contact → preset auto-fill → **AI hook** → pre-send checklist + exclusive-hold warning → mailto/Gmail or portal/DM → recorded in one tap. |
| **Email Presets + AI Hook** | Your own templates with merge fields; Claude writes only the one personalized sentence that earns a reply (≤30 words, facts-only). |
| **Follow-ups + Digest** | 7-day nudge / 14-day overdue queue, one-tap "Got a reply / Still silent", auto-logged silence, scheduled email digest. |
| **Feedback Log** | Every response tied to a track and contact; silence is data. |
| **A&R Intel & Prioritization** | Research notes per contact (feeds the AI hook); "untried + cold-demo-friendly first" sort with "times contacted". |
| **Dashboard + Funnel** | Conversion funnel (sent→opened→replied→considering→signed), response rate by genre/tier, work-session streak, CSV export. |
| **Demo Link Tracking** *(optional)* | Wrap Form/DM links to see when a label opens your demo. |
| **Work Sessions & Goals** | One-tap studio logging (hours + mood); goals with progress derived from real activity. |
| **Artist Press Kit** | Public EPK at `press.<domain>/{slug}` (served through a narrow, whitelisted endpoint) + **AI bio** in 3 tones. |

### Three AI features (Claude)
1. **Email hook** — the single tailored sentence per demo.
2. **Artist bio** — press-kit bio in 3 selectable tones, facts only.
3. *(Feedback pattern detection — future: reads across the whole feedback log.)*

All AI runs **server-side** in Supabase Edge Functions (`claude-opus-4-8`) so the Anthropic key never reaches the browser, with strict guardrails (facts-only, no fabricated stats/accolades).

---

## Tech stack

- **React 19 + Vite** — mobile-first, installable PWA
- **Tailwind CSS 4** — late-night-studio theme (near-black canvas, one acid-lime accent)
- **Supabase** — PostgreSQL + magic-link auth + Row-Level Security (12 tables) + Edge Functions (Deno) + `pg_cron`
- **Anthropic API (Claude)** — the 3 AI features
- **`mailto:` / Gmail compose deep links** — demos open prefilled in your own inbox; no relay, no deliverability risk
- **Vercel** — hosting for the app and public press-kit pages

---

## Project structure

```
src/
  pages/            Login, Dashboard, Tracks, Contacts, SendDemo, You
  components/       AppShell, Modal, Field, Badge, LabelDiscovery, Splash, RequireAuth
  contexts/         AuthContext
  lib/              supabase client
supabase/
  schema.sql            12 tables, enums, RLS (owner-only), views
  seed_labels.sql       288 verified labels (idempotent upsert)
  promo_contacts.sql    74 non-label promo contacts (table + seed)
  followups.sql         follow-up queue view, auto-no-response, pg_cron tick
  link_tracking.sql     tracked_links + open-logging RPC (optional)
  functions/
    suggest-hook/       AI email hook (Claude)
    generate-bio/       AI press-kit bio, 3 tones (Claude)
    daily-digest/       scheduled follow-up email digest
    track-redirect/     public demo-link redirect + open tracking (optional)
    press-kit/          public EPK page (whitelisted slug endpoint)
data/
  labels.json / .csv          the 288-label research dataset (source of truth)
  promo_contacts.json / .csv  the 74 promo contacts
  README.md                   research methodology, provenance, coverage
```

Every user-owned table is protected by Row-Level Security (`auth.uid() = user_id`); `labels` is a shared read-only master. The public press-kit endpoint returns only whitelisted fields — private CRM/tracks can never leak (design principle #4).

---

## Local development

```bash
npm install
cp .env.example .env.local      # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev                     # Vite dev server
npm run build                   # production build (+ PWA)
npm run lint
```

The app runs without the Edge Functions deployed — the AI hook/bio simply fall back to manual entry.

---

## Deploying to your Supabase project

**1. Database** (run with the service role, in order):
```
schema.sql  →  seed_labels.sql  ·  promo_contacts.sql  ·  followups.sql  ·  link_tracking.sql
```
`pg_cron` is enabled on Supabase, so the daily follow-up tick schedules itself.

**2. Edge Functions:**
```bash
supabase functions deploy suggest-hook
supabase functions deploy generate-bio
supabase functions deploy daily-digest   --no-verify-jwt
supabase functions deploy track-redirect --no-verify-jwt   # optional
supabase functions deploy press-kit      --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional (email digest):
supabase secrets set RESEND_API_KEY=re_... DIGEST_FROM="DemoTrack <digest@yourdomain>"
```
To send the digest on a schedule, uncomment the `pg_net` block in `followups.sql`.

**3. App env** (`.env.local` / Vercel):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SITE_URL=https://your-app-url            # magic-link redirect
VITE_TRACK_BASE_URL=https://track.yourdomain  # optional (link tracking)
VITE_PRESS_BASE_URL=https://press.yourdomain  # optional (press kit)
```

**Domains:** `demotrack.app` (the app) · `press.demotrack.app` (public press kit) · `track.demotrack.app` (optional Form/DM redirects).

---

## Data model — 12 tables (Supabase / PostgreSQL, RLS on every row)

`contacts` · `tracks` · `submissions` · `feedback` · `templates` · `ar_intel` · `work_sessions` · `goals` · `link_events` · `press_kit` · `labels` (shared read-only master) · `notifications`. Plus Phase-11 `tracked_links` and the `follow_up_queue` / `contact_send_counts` / `submission_open_counts` views.

---

## The contact database

The fuel is a curated, *not* exhaustive database — only labels that can genuinely change an unknown artist's trajectory (each clears a ≥3-of-5 bar: Beatport presence, booking impact, streaming credibility, scene respect, accessibility). Built and verified through a research workstream documented in [`data/README.md`](data/README.md):

- **288 labels** — 183 high-confidence (official page or ≥2 sources), each with submission channel, requirements, provenance, and `last_verified`.
- **74 promotional contacts** — radio, blogs, playlist curators, repost networks, YouTube, podcasts, PR — with free/freemium/paid flags.

Routes change — records carry a confidence flag and a verification date, and Discovery flags stale entries.

---

## What success looks like

Not vanity metrics — behavior change: you submit weekly, you actually follow up (because the digest reaches you), you always know which labels you haven't tried, and a send takes under 3 minutes. Cold-demo reply rates in this scene are realistically 5–15%, which is exactly why every send is engineered to cost ~3 minutes — the math only closes when friction is near zero.

---

*DemoTrack · Built for one producer. One purpose. Ship your music. · Tunis, 2026*
