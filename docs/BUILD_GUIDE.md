# DemoTrack — Build Guide v3.1 (Refined)

> Your silent manager. A career-management app for a solo house & tech-house
> producer with no team. It strips the friction out of getting your music to the
> right labels — turning demo submission from a thing you keep meaning to do into
> a weekly habit that compounds.

This is a **refinement** of Build Guide v2. It keeps the original thesis, core
loop, and module set, and layers in changes from a design review focused on
three things that v2 left under-specified or risky: **email deliverability,
honest label access paths, and the habit loop actually reaching you.**

House & Tech House · Independent Artist Toolkit · Tunis, Tunisia · 2026

---

## 0. What changed vs v2 (read this first)

| # | Change | Why |
|---|--------|-----|
| 1 | **Email is preset-driven, not AI-written end-to-end, and never relayed by the app.** You keep your own template presets; the app auto-fills merge fields and AI suggests only the one personalized `{hook}` sentence; the filled email opens in *your* Gmail / `mailto:` to send from your real inbox. | A server relay on `demotrack.app` lands demos in spam and burns domain reputation. Presets keep your voice + speed; AI on just the hook avoids the "generic AI email" smell while still removing the blank-page excuse. |
| 2 | **New `access_path` field on labels/contacts** (`cold-demo-friendly` / `open-window-only` / `needs-warm-intro` / `relationship-only`). | Several seed "elite" labels don't sign unknowns from cold demos. Tier ≠ accessibility. Prevents bouncing off walls. |
| 3 | **Exclusivity / hold tracking on tracks.** Send Demo warns before re-sending a held track. | Labels expect exclusive demos; shopping a held/signed track is a real faux-pas. v2's status field didn't capture this. |
| 4 | **Notifications/digest is now a first-class, early feature.** Scheduled email (or push) of "follow-ups due / demos opened." | The follow-up queue only changes behavior if it reaches you when the app is closed. Load-bearing for the weekly habit. |
| 5 | **Relationship stage on contacts** (`cold → engaged → responded → relationship`) + warm-up task type. | Signings increasingly come from warmed relationships, not pure cold sends. |
| 6 | **Structured per-label submission requirements** → enforced as a pre-send checklist. | The #1 cause of instant rejection is mechanical (wrong format, released track, album not single). Pure friction-killer. |
| 7 | **Removed the weighted contact-scoring formula entirely.** Replaced with a simple **"times contacted" count** per label (derived from submission history), sorted untried-first. | The cold-start problem was inherent to *having* a score — with little data a weighted number is false precision you'd never trust. A count needs no data, can't be undefined, and is honest. `access_path` already answers "who's worth cold-sending." |
| 8 | **AI prompts get hard guardrails** (anti-fabrication, length caps, hook required + no-duplicate warning). | Generic/hallucinated AI emails get rejected instantly; a duplicate hook is a mass-blast tell. |
| 9 | **Mobile-first + installable PWA** stated as a requirement, not an afterthought. | The weekly habit happens on a phone. |
| 10 | **Funnel/conversion view** (sent → opened → replied → considering → signed) as a Dashboard centerpiece + CSV export. | The most motivating and informative metric; also sets realistic expectations for cold reply rates. |
| 11 | **Leaner MVP ordering.** Ship the loop (Tracks → Contacts → Send → AI Email → Follow-up + digest) before the v3 polish. | The friction thesis says get the loop running fast; advanced toys come after the habit forms. |

---

## Design principles (apply to every module)

The whole app exists to remove friction, so manual data entry is the enemy.
These rules are non-negotiable when building any feature:

1. **Derive, don't ask.** If a number can be computed from existing data, never
   make the user type it. Times-contacted, goal progress, demos-sent-today, the
   funnel — all are **Postgres views** over `submissions`/`tracks`, not stored
   fields you keep in sync.
2. **One-tap over typing.** Anything that can't be derived should be a single tap:
   reply status, mood, send confirmation. Free-text is reserved for the **only
   three things a human genuinely must write — the `{hook}`, A&R intel notes, and
   feedback text.** Everything else is derived or tapped.
3. **Silence is data.** A demo going unanswered past the overdue window is an
   outcome the app logs automatically — the user types nothing.
4. **Structural privacy over careful config.** Where private and public data
   coexist (the press kit), expose public data through a narrow whitelisted path
   (a slug RPC), not by trusting an RLS policy to be perfect.

> Standing review question for each module: *"Can this be derived or made
> one-tap?"* If yes, do that instead.

---

## 1. What DemoTrack is & why it exists

DemoTrack is a personal command center for breaking through as an unknown
producer. It does the job a manager would do for a signed artist — holding the
accountability, the memory, and the workflow — because you don't have one.

**The core insight (unchanged, and correct):** the bottleneck isn't talent and
usually isn't even contacts — it's **effort and consistency**. If sending a
polished, tailored demo takes 3 minutes instead of 30, and the app proactively
tells you who to follow up with today, you'll actually do the work. Every design
decision exists to remove friction and manufacture momentum.

**One-line pitch:** _"Find good labels, send great demos in minutes, never lose
track of a follow-up, and learn from every reply — automatically."_

**Quality-over-quantity rule:** only labels/contacts that can genuinely change
your trajectory belong in the system. A label clears the bar only if it meets
**≥3 of 5**: Beatport chart presence · booking impact · streaming credibility ·
scene respect · accessible to unknown artists. Applied to every seeded label.

---

## 2. The core loop (the product)

```
1 DISCOVER → 2 PREPARE → 3 GENERATE → 4 SEND → 5 TRACK → 6 FOLLOW-UP → 7 LEARN
   find labels  track+kit   preset+hook <3 min   opens     right time     log + patterns
                                                                   ↘ back to 1 with next track
```

Modules are just the tools that make each step effortless. **The loop is the
product.**

---

## 3. Structure — 4 layers

- **🎵 Music Layer** — Track Vault (catalogue + status + holds), Feedback Log (memory of every reaction).
- **📨 Outreach Layer (the heart)** — Contacts CRM, Send Demo, AI Email, Link Tracking, Follow-up, A&R Intel, Label Discovery. (No scoring engine — labels carry a simple "times contacted" count instead.)
- **👤 You Layer** — Artist Press Kit (EPK), Work Sessions, Goals.
- **📊 Dashboard + Notifications** — the home screen and the digest that reaches you when the app is closed.

---

## 4. The data model — 12 tables

All data in **Supabase (PostgreSQL)** with **Row-Level Security**; every row is
private to your account. (Single-user today; RLS keeps it safe and future-proof.)

| Table | Holds | Key changes vs v2 |
|-------|-------|-------------------|
| `contacts` | Your personal CRM — labels/DJs/A&Rs/curators/blogs/promoters/radio. | + `relationship_stage`, + `access_path`, + `label_id` (back-ref to the Discovery master) |
| `tracks` | Catalogue + status (`idea → demo-ready → submitted → signed`). | + `exclusive_hold_contact_id`, + `hold_until`, + `listen_link`, + `link_type` (`soundcloud-private`/`dropbox`/`other`), + readiness checklist fields |
| `submissions` | Every demo sent (track ↔ contact); follow-up dates. | + `method` (email/form/dm), + **`status`** (`sent → opened → replied → considering → signed → passed`) — drives the queue & one-tap reply logging |
| `feedback` | Every response, tied to track + contact. | + **silence auto-logged** as a `no-response` record once overdue |
| `templates` | Your preset email & follow-up skeletons with `{merge_fields}` + one `{hook}` slot. | now first-class (preset-driven sends) |
| `ar_intel` | Research notes, one record per contact. | — |
| `work_sessions` | Studio time logs. | inputs reduced to **hours + one-tap mood**; "demos sent" auto-derived |
| `goals` | Targets; **progress derived, not stored**. | progress = a Postgres view over `submissions`/`tracks` |
| `link_events` | Each click on a tracked link (timestamp, repeat count, country). | **deferred to Phase 11, Form/DM links only** — not email |
| `press_kit` | Public EPK profile, one row per user. | + `is_public`; served via a slug RPC, never direct table reads |
| `labels` | Curated discovery library (separate from CRM). | + `access_path`, + `genre_tags[]` (controlled vocab), + `last_verified`, + `sources[]`, + `parent_label_id` / sub-label links, + `submission_requirements` |
| `notifications` *(new)* | Queued/sent reminders & digests; user prefs (channel, cadence). | **New** — fired by `pg_cron` |

**Relationships:** your account owns everything. A contact has many submissions;
each submission can have feedback (and, later, link_events). A track has many
submissions and feedback, and at most one active exclusive hold. `press_kit` is
1:1 with you. `labels` is the read-only master; **"Add to my CRM" copies a label
into `contacts` with `label_id` pointing back** — you maintain personal data on
the contact, the master keeps the verified route, and Discovery flags your copy
"source updated — review" when the master changes. No live sync.

**No scoring table.** "Times contacted" is a **derived count** of `submissions`
per contact, not a stored or computed score — there is nothing to recalculate or
keep in sync.

### Controlled genre vocabulary (shared by tracks + labels)
Genre filtering in Discovery (and the AI email's "why it fits" reasoning) **only
works if both sides use the same tags.** Maintain one enum, e.g.: `tech-house`,
`house`, `melodic-house`, `minimal-deep-tech`, `afro-house`, `peak-time-techno`,
`progressive-house`, `bass-house`, `organic-house`. No free text.

---

## 5. The three AI features (with guardrails)

Claude is used in exactly three high-leverage, skippable-task places.

### 5.1 Email presets + AI hook suggestion
The email is **not** AI-written end-to-end. You keep a small library of your own
**preset templates** (a skeleton with merge fields); the app auto-fills everything
mechanical, and AI suggests only the **one personalized sentence** (`{hook}`) that
actually earns a reply. This is faster than full generation *and* more personal
than a tweaked block of copy-paste.

**How a preset works** — a skeleton with merge fields the app fills from the
track + contact + your profile, plus exactly one slot you personalize:
```
Subject: {genre} demo — "{track_title}" for {label}

Hi {first_name},

I'm {artist_name}, a house & tech house producer from Tunis. {hook}

"{track_title}" — {bpm} BPM, {key}. Private listen: {listen_link}
More on me: {press_kit_link}

Would love your thoughts. Thanks for listening.
{artist_name}
```
Everything in `{...}` auto-fills **except `{hook}`**. A send is: pick track → pick
label → confirm/tweak the hook → send. Suggested starter presets: *cold email*,
*DM* (shorter), *warm follow-up*, *form-portal note*.

**The AI's only job** is to draft the `{hook}` — one honest sentence tailored to
this label, e.g. _"Your recent Cloonee EP on Hellbent is exactly the lane this
track sits in."_ You always review/edit before it goes.
- **Inputs to the hook prompt:** label name, genre tags, the track's vibe, and
  the `ar_intel` record **if one exists**.
- **Output:** 1–2 plain-text sentence options (no JSON needed — it's one field).
- **Hard guardrails:** ≤ ~30 words; **never fabricate** a release, stat, or
  personal angle — if no `ar_intel` exists, return a generic-but-honest line (or
  nothing) rather than inventing one. The hook field is **required** and the app
  **warns if it's empty or identical to a recent send** (anti-mass-blast).

**Sending:** the filled template opens in your own Gmail / a `mailto:` compose
window with subject + body prefilled — you send from your real inbox. No in-app
relay, no deliverability risk, no send engine to build.

### 5.2 Artist bio generation
3 tones (Professional / Story / Punchy) from profile **facts only** — no invented
numbers or accolades. One click to a usable EPK bio.

### 5.3 Feedback pattern detection
Reads across the whole feedback log and surfaces patterns. Guardrails:
- Require a **minimum N** of responses before asserting a pattern (no horoscopes
  on 2 data points).
- **Silence is a signal** — include no-reply outcomes.
- **Cite the evidence** behind every claim ("darker peak-time tracks: 4/9 replies
  vs melodic 1/11").
- Blend in **label-DB priors** so insights aren't empty in month one.

---

## 6. How outreach works

### Three submission methods (color-coded in Send Demo)
| Method | Badge | Flow |
|--------|-------|------|
| Email | 🟢 Green | Pick preset → app auto-fills merge fields → AI suggests the `{hook}`, you confirm/tweak → **opens your Gmail / `mailto:` prefilled** → you send → confirm logged. *(No in-app relay.)* |
| Form | 🟡 Amber | App opens the portal/platform (LabelRadar, Demodrop, Typeform…) in a new tab → you submit → confirm. |
| DM | 🔵 Blue | App opens the profile → you send → confirm. |

### Pre-send checklist (new)
Before any send, Send Demo renders the target's `submission_requirements` as a
checklist (file format, unreleased-only, single-not-album, no-stream-links, etc.)
and **warns if the track is on exclusive hold elsewhere.**

### Prioritization — no scoring engine, just two honest signals
There is **no weighted contact score.** A computed 0–100 score has a cold-start
problem (almost no data early) and is false precision you'd never trust. Instead,
prioritization comes from two signals that need **zero history**:

- **`access_path`** — who's even worth a cold send. Discovery shows
  `cold-demo-friendly` first; `relationship-only` elites go to a separate
  **"long game"** list, not the weekly cold-send queue.
- **Times contacted** — a simple count per label, derived from `submissions`
  (`count(submissions WHERE contact_id = …)`). `0` = your next target; a high
  count with no reply = change the track or move on.

**Default Discovery sort:** cold-demo-friendly + untried (0 contacts) first, then
by tier. Stale labels (no re-verify in ~6 months) get a freshness badge. That's
the whole prioritizer — nothing to compute, nothing to debug, nothing that breaks
on day one.

### Follow-up timing & reply visibility
The app sends from your own Gmail, so **it can't see replies** — the queue is
driven by a `submissions.status` you advance with one tap, never by reading your
inbox.
- **7 days silence** → gentle first-nudge queued.
- **14 days** → flagged overdue; a `no-response` feedback record is **auto-logged**
  (silence becomes data with zero typing).
- The queue shows only `status = sent/opened` submissions, each with two taps:
  **"Got a reply"** (opens a 5-second feedback log → moves to `replied`) and
  **"Still silent"** (keeps nudging). No more nagging someone who already answered.
- All of this is **pushed via the notifications digest** (fired by `pg_cron`), not
  just parked in-app.
- *("Opened, no reply" smart prompts depend on link tracking, which is deferred to
  Phase 11 and scoped to Form/DM only — see §7.)*

---

## 7. Tech stack

| Tech | Role |
|------|------|
| React 19 + Vite | UI + fast dev/build. **Mobile-first, installable PWA.** |
| Tailwind CSS 4 | Styling system. |
| **Vercel** | Hosting/deploy for the app + the public press-kit pages; handles the subdomains. |
| Supabase (PostgreSQL) | DB + **magic-link** auth + RLS. 12 tables. |
| Supabase **Storage** | One bucket, for the press-kit photo only. Audio is **never hosted** (external links). |
| Supabase **pg_cron** + Scheduled Edge Function | Fires the daily/weekly digest and the 7/14-day follow-up triggers. |
| Anthropic API (Claude) | AI features. With email trimmed to the `{hook}`, usage (and cost) is tiny. |
| `mailto:` / Gmail compose deep link | Demo email opens **prefilled in your own inbox** — no relay, no send engine, no deliverability risk. |
| Edge Function (Deno) | Phase 11 link-tracking redirect (Form/DM only) **+** the slug RPC that serves the public press kit. |

Domains: `demotrack.app` (app) · `press.demotrack.app/{slug}` (EPK) ·
`track.demotrack.app` (Phase-11 redirects — **Form/DM links only**, never email,
to keep tracked links away from inbox reputation).

---

## 8. Seed database — 17 curated labels

Loaded in Phase 3. Every one clears the ≥3/5 bar. **Tier reflects prestige;
`access_path` reflects realistic accessibility — they are different axes.**

| # | Label | Tier | Suggested access_path | Why it belongs |
|---|-------|------|----------------------|----------------|
| 1 | Drumcode | ELITE | relationship-only | Adam Beyer. Scene-defining — but a long game, not a cold target. |
| 2 | Experts Only | ELITE | needs-warm-intro | John Summit. Peak of the scene. |
| 3 | Black Book | ELITE | needs-warm-intro | Chris Lake. Beatport #1 machine. |
| 4 | Catch & Release | ELITE | needs-warm-intro | Fisher. Massive reach. |
| 5 | Repopulate Mars | A | cold-demo-friendly | Lee Foss. Where Mau P broke. Open to demos. |
| 6 | Dirtybird | A | cold-demo-friendly | Claude VonStroke. Launches careers. |
| 7 | Hellbent | A | cold-demo-friendly | Cloonee. Built for unknowns. |
| 8 | Three Six Zero | A | cold-demo-friendly | Dom Dolla. Open submissions. |
| 9 | Hot Creations | A | needs-warm-intro | Jamie Jones. Deep cred. |
| 10 | Solid Grooves | A | cold-demo-friendly | Michael Bibi. UK TH institution. |
| 11 | Sola | A | cold-demo-friendly | Solardo. Email demos welcome. |
| 12 | Toolroom | B | cold-demo-friendly | Mark Knight. Solid distribution. |
| 13 | Defected | B | cold-demo-friendly | Huge catalogue; one send covers ~11 sub-labels. |
| 14 | Knee Deep In Sound | B | cold-demo-friendly | Hot Since 82. Less-competitive melodic lane. |
| 15 | Suara | B | cold-demo-friendly | Coyu. Darker niche. |
| 16 | Club Sweat | B | cold-demo-friendly | Australian reach; good for emerging. |
| 17 | Space Yacht | B | open-window-only | Reviews demos live on Twitch — most transparent route. |

> `access_path` values above are review suggestions to verify during Phase 0
> research, not gospel — windows open and close.

---

## 9. Building the contact database — a parallel track (Phase 0)

The database is the **fuel**; the app is the engine. This runs *alongside* the
build, never after, and is never fully "done."

**Research loop per contact:** Source → Verify (2 independent sources) → Qualify
(≥3/5 bar) → Tier + `access_path` + priority → Record (rules, links, sources,
A&R note) → Maintain (stamp `last_verified`, re-check; Discovery flags stale).

**Already built:** ≈170 verified labels + ≈98 non-label promo contacts (radio,
blogs, YouTube/Spotify curators, repost networks, podcasts, editorial, PR), and
the 17-label in-app seed. **Ongoing:** migrate into the `labels` table, keep
verifications fresh, capture sub-label efficiency multipliers (1 Defected ≈ 11
sub-labels; 1 Repopulate Mars ≈ 3), add new qualified contacts.

---

## 10. Build plan — phases

**Parallel track (throughout):** _Phase 0 — Contact DB research_ (ongoing).

### MVP — get the loop running fast
1. **Foundation** — Supabase project · 12-table schema · **magic-link** auth · RLS · React+Vite+Tailwind PWA shell + routing · **Vercel deploy**. _Done: you can log in, data secured, deployed._
2. **Track Vault** — add/edit/list tracks · status · `listen_link` + `link_type` (**audio stays external — unlisted SoundCloud recommended**) · notes · readiness checklist · hold field. _Done: tracks stored with status._
3. **Contacts CRM** — 7 categories · method + links · `relationship_stage` · `access_path` · seed 17 labels · history view. _Done: label list lives in-app._
4. **Send Demo** — pick track+contact · choose a preset · auto-fill merge fields · 3 methods (email opens your inbox prefilled / form / DM) · pre-send checklist + hold warning · record to history with `status`. **← first usable milestone.**
5. **Email presets + AI hook** — preset CRUD with `{merge_fields}` · auto-fill from track/contact/profile · wire Claude to suggest the `{hook}` (guardrails: ≤30 words, no fabrication, required, no-duplicate warning) · `mailto:`/Gmail prefill. _Done: a tailored, personal demo email in ~1 minute, sent from your own inbox._
6. **Follow-up + Notifications digest** — preset follow-ups · 7/14-day `pg_cron` rules · **one-tap reply status** ("Got a reply" / "Still silent") · auto-logged silence · overdue queue · **scheduled email digest.** _Done: it tells you who to follow up, you close the loop in one tap, and it reminds you when the app is shut._

### Intelligence — make every send smarter
7. **Feedback Log** — one-tap reply logging from the queue · response types · **auto `no-response` records** on overdue · link back to track/contact. _Done: every reply and non-reply captured with almost no typing._
8. **A&R Intel & prioritization** — A&R intel records per contact · show "times contacted" on every label · Discovery sorts untried + cold-demo-friendly first. **(No weighted score.)** _Done: each label shows your history at a glance and untried targets surface first._
9. **Dashboard + Funnel** — aggregate signals · sent→opened→replied→considering→signed funnel · response-rate by genre/tier · streak · CSV export. _Done: home screen answers "what now?"_

### Advanced (v3) — the unfair advantages
10. **Label Discovery** — browse/filter the `labels` master (genre/BPM/method/tier/access_path) · **"Add to my CRM"** promotion (copies to `contacts` with `label_id` back-ref) · "have I submitted?" · freshness/"source updated" warnings · sub-label reach hints.
11. **Demo Link Tracking** *(optional)* — Edge Function redirect · unique hash · `link_events` · **Form/DM links only, never email** · open/repeat triggers → follow-up. _Lower priority: SoundCloud play counts already give a listen signal for free._
12. **Work Sessions & Goals** — **goal progress is a derived view** (counts from `submissions`/`tracks`, you only set targets) · sessions reduced to **hours + one-tap mood**, demos-sent auto-filled.
13. **Artist Press Kit** — profile fields · manual stats + **"updated {date}" stamp** · public page served by a **slug RPC returning only whitelisted fields** (no direct table exposure) · AI bio (3 tones) · auto-attach toggle into Send Demo.

---

## 11. What success looks like

The app only matters if it changes behavior. Real measures, not vanity metrics:
- You submit demos **weekly**, not "whenever."
- You **actually follow up** (because the digest reaches you).
- You always know which labels you **haven't tried** yet.
- A send takes **under 3 minutes**.
- A response from ≥1 label within **3 months** of consistent use.
- Longer-term target: **one signing within 6 months** of consistent use.

---

## 12. Unfair advantages & first moves

**Advantages:** demo link tracking (time follow-ups to real interest) · AI woven
into the loop (removes the exact stalling tasks) · a curated-not-exhaustive,
freshness-tracked label DB with submission rules and honest access paths.

**First moves:** start Phase 1 (Supabase + schema + auth/RLS + PWA shell) ·
protect the friction rule (any slow flow is the first bug to fix) · **get to
Phase 4 fast** — a working send-and-record tool is where the app starts paying
you back.

**Time-sensitive windows to verify & act on:** KNTXT (Charlotte de Witte — annual
open window), Intec Digital (Carl Cox — relaunched, actively seeking), Space Yacht
(weekly live Twitch demo reviews).

---

_Built for one producer. One purpose. Ship your music._
