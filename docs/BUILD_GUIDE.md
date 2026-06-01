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
| 1 | **Don't relay cold email through an app domain.** Send via the user's own Gmail (OAuth) or a `mailto:`/compose deep link. | A server relay on `demotrack.app` lands demos in spam and burns domain reputation. A&Rs trust mail from your real address. |
| 2 | **New `access_path` field on labels/contacts** (`cold-demo-friendly` / `open-window-only` / `needs-warm-intro` / `relationship-only`). | Several seed "elite" labels don't sign unknowns from cold demos. Tier ≠ accessibility. Prevents bouncing off walls. |
| 3 | **Exclusivity / hold tracking on tracks.** Send Demo warns before re-sending a held track. | Labels expect exclusive demos; shopping a held/signed track is a real faux-pas. v2's status field didn't capture this. |
| 4 | **Notifications/digest is now a first-class, early feature.** Scheduled email (or push) of "follow-ups due / demos opened." | The follow-up queue only changes behavior if it reaches you when the app is closed. Load-bearing for the weekly habit. |
| 5 | **Relationship stage on contacts** (`cold → engaged → responded → relationship`) + warm-up task type. | Signings increasingly come from warmed relationships, not pure cold sends. |
| 6 | **Structured per-label submission requirements** → enforced as a pre-send checklist. | The #1 cause of instant rejection is mechanical (wrong format, released track, album not single). Pure friction-killer. |
| 7 | **Scoring formula reworked for cold-start** (priors + Bayesian shrinkage + `access_path` gate). | v2's weights leave 70% of the score undefined for never-contacted labels and over-rank relationship-only labels. |
| 8 | **AI prompts get hard guardrails** (anti-fabrication, length caps, conditional hooks, JSON output). | Generic/hallucinated AI emails get rejected instantly. |
| 9 | **Mobile-first + installable PWA** stated as a requirement, not an afterthought. | The weekly habit happens on a phone. |
| 10 | **Funnel/conversion view** (sent → opened → replied → considering → signed) as a Dashboard centerpiece + CSV export. | The most motivating and informative metric; also sets realistic expectations for cold reply rates. |
| 11 | **Leaner MVP ordering.** Ship the loop (Tracks → Contacts → Send → AI Email → Follow-up + digest) before the v3 polish. | The friction thesis says get the loop running fast; advanced toys come after the habit forms. |

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
   find labels  track+kit   AI email   <3 min   opens     right time     log + patterns
                                                                   ↘ back to 1 with next track
```

Modules are just the tools that make each step effortless. **The loop is the
product.**

---

## 3. Structure — 4 layers

- **🎵 Music Layer** — Track Vault (catalogue + status + holds), Feedback Log (memory of every reaction).
- **📨 Outreach Layer (the heart)** — Contacts CRM, Send Demo, AI Email, Link Tracking, Follow-up, Contact Scoring, A&R Intel, Label Discovery.
- **👤 You Layer** — Artist Press Kit (EPK), Work Sessions, Goals.
- **📊 Dashboard + Notifications** — the home screen and the digest that reaches you when the app is closed.

---

## 4. The data model — 12 tables

All data in **Supabase (PostgreSQL)** with **Row-Level Security**; every row is
private to your account. (Single-user today; RLS keeps it safe and future-proof.)

| Table | Holds | Key changes vs v2 |
|-------|-------|-------------------|
| `contacts` | Your personal CRM — labels/DJs/A&Rs/curators/blogs/promoters/radio. | + `relationship_stage`, + `access_path` |
| `tracks` | Catalogue + status (`idea → demo-ready → submitted → signed`). | + `exclusive_hold_contact_id`, + `hold_until`, + readiness checklist fields |
| `submissions` | Every demo sent (track ↔ contact); follow-up dates & tracking. | + `method` (email/form/dm), + `tracking_enabled` |
| `feedback` | Every response, tied to track + contact. | + treat **silence** as an explicit logged signal |
| `templates` | Reusable email & follow-up templates. | — |
| `ar_intel` | Research notes, one record per contact. | — |
| `work_sessions` | Studio time logs (time, work, demos, mood). | — |
| `goals` | Targets + live progress. | — |
| `link_events` | Each click on a tracked demo link (timestamp, repeat count, country). | — |
| `press_kit` | Public EPK profile, one row per user. | — |
| `labels` | Curated discovery library (separate from CRM). | + `access_path`, + `genre_tags[]` (controlled vocab), + `last_verified`, + `sources[]`, + `parent_label_id` / sub-label links, + `submission_requirements` |
| `notifications` *(new)* | Queued/sent reminders & digests; user prefs (channel, cadence). | **New** — powers the habit loop |

**Relationships:** your account owns everything. A contact has many submissions;
each submission can have link_events and feedback. A track has many submissions
and feedback, and at most one active exclusive hold. `press_kit` is 1:1 with you.
`labels` is the read-only library seeding Discovery; pursued labels become
`contacts` rows.

### Controlled genre vocabulary (shared by tracks + labels)
Genre-fit scoring is 30% of the contact score and **only works if both sides use
the same tags.** Maintain one enum, e.g.: `tech-house`, `house`, `melodic-house`,
`minimal-deep-tech`, `afro-house`, `peak-time-techno`, `progressive-house`,
`bass-house`, `organic-house`. No free text.

---

## 5. The three AI features (with guardrails)

Claude is used in exactly three high-leverage, skippable-task places.

### 5.1 Demo email writing
- **Inputs (~13):** artist name, track name, genre tags, BPM, key, label name,
  why-it-fits, recent releases (only if known), private listen link, press-kit
  link, tone, A&R hook (only if `ar_intel` exists), prior history with contact.
- **Output:** strict JSON `{ "subject": ..., "body": ... }` + regex fallback parser.
- **Hard guardrails baked into the system prompt:**
  - One track only. Body ≤ ~120 words. No "Dear Sir/Madam," no life story, no
    walls of text. Lead with the track, not the bio.
  - **Never fabricate** releases, stats, plays, or an A&R angle. Reference a
    recent release / personal hook **only if** intel is provided; otherwise omit.
  - Respect the label's stated submission rules (e.g. "private SoundCloud only").
- **Tone presets → concrete instructions:** _Professional_ (concise, respectful),
  _Personal_ (one genuine line on why this label), _Direct_ (peak-time, no fluff).

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
| Email | 🟢 Green | AI draft → **opens your real inbox / Gmail compose (or sends via your connected Gmail)** → confirm logged. *(Changed from in-app relay.)* |
| Form | 🟡 Amber | App opens the portal/platform (LabelRadar, Demodrop, Typeform…) in a new tab → you submit → confirm. |
| DM | 🔵 Blue | App opens the profile → you send → confirm. |

### Pre-send checklist (new)
Before any send, Send Demo renders the target's `submission_requirements` as a
checklist (file format, unreleased-only, single-not-album, no-stream-links, etc.)
and **warns if the track is on exclusive hold elsewhere.**

### Contact scoring (reworked for cold-start)
Single 0–100 score; higher = more worth your time **right now**.

```
score = access_gate × ( 0.35·response_rate*  +  0.30·genre_fit
                       + 0.20·response_speed  +  0.15·history )

response_rate*  = Bayesian blend of the label-DB prior and your own sends:
                  (prior·k + your_replies) / (k + your_sends),  k ≈ 3
genre_fit       = 0.6·tag_overlap + 0.3·bpm_range_match + 0.1·key/energy_match
access_gate     = 1.0 cold-demo-friendly · 0.8 open-window-only
                  · 0.5 needs-warm-intro · 0.3 relationship-only
```
- New labels score on **reputation prior**, then your real data takes over.
- Stale data (no re-verify in ~6 months) lowers **confidence**, shown as a badge —
  it doesn't silently corrupt the number.
- `relationship-only` elites are routed to a separate **"long game"** list, not
  your weekly cold-send queue.

### Follow-up timing
- **7 days silence** → gentle first-nudge queued.
- **14 days** → flagged overdue.
- **Opened, no reply** (from link tracking) → smart prompt (interest proven,
  timing ideal).
- All of the above is **pushed to you via the notifications digest**, not just
  parked in an in-app queue.

---

## 7. Tech stack

| Tech | Role |
|------|------|
| React 19 + Vite | UI + fast dev/build. **Mobile-first, installable PWA.** |
| Tailwind CSS 4 | Styling system. |
| Supabase (PostgreSQL) | DB + auth + RLS. 12 tables. |
| Anthropic API (Claude) | The 3 AI features. Sonnet-class balances quality/cost. |
| Gmail OAuth (or `mailto:` deep link) | Cold-email sending **as you** — protects deliverability. *(Changed.)* |
| Edge Functions (Deno) | Link-tracking redirect **and** the scheduled notifications digest. |

Domains: `demotrack.app` (app) · `press.demotrack.app/{slug}` (EPK) ·
`track.demotrack.app` (tracking redirects — used mainly for Form/DM sends and
follow-ups to avoid touching email reputation).

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
1. **Foundation** — Supabase project · 12-table schema · email auth · RLS · React+Vite+Tailwind PWA shell + routing. _Done: you can log in, data secured._
2. **Track Vault** — add/edit/list tracks · status · listen link · notes · readiness checklist · hold field. _Done: tracks stored with status._
3. **Contacts CRM** — 7 categories · method + links · `relationship_stage` · `access_path` · seed 17 labels · history view. _Done: label list lives in-app._
4. **Send Demo** — pick track+contact · 3 methods (email via your inbox / form / DM) · pre-send checklist + hold warning · record to history. **← first usable milestone.**
5. **AI Email Generation** — wire Claude · ~13-input form · tone presets · guardrails · JSON output + fallback parser. _Done: tailored draft in seconds._
6. **Follow-up + Notifications digest** — template engine · 7/14-day rules · overdue queue · **scheduled email/push digest.** _Done: the app tells you who to follow up — and reminds you when it's closed._

### Intelligence — make every send smarter
7. **Feedback Log** — responses + silence against submissions · types · link back to track/contact. _Done: every reply (and non-reply) captured._
8. **Contact Scoring & A&R Intel** — cold-start formula + access_gate + score bands · intel records. _Done: contacts ranked, research attached._
9. **Dashboard + Funnel** — aggregate signals · sent→opened→replied→considering→signed funnel · response-rate by genre/tier · streak · CSV export. _Done: home screen answers "what now?"_

### Advanced (v3) — the unfair advantages
10. **Demo Link Tracking** — Edge Function redirect · unique hash · `link_events` · open/repeat triggers → follow-up.
11. **Label Discovery** — browse/filter the `labels` table (genre/BPM/method/response/tier/access_path) · "have I submitted?" · freshness warnings · sub-label reach hints.
12. **Work Sessions & Goals** — session logging · goal types/timeframes/progress.
13. **Artist Press Kit** — profile fields · public page + slug · AI bio (3 tones) · auto-attach toggle into Send Demo.

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
