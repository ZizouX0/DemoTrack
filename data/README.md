# DemoTrack — Contact Database (collected data)

This directory holds the **research workstream** described in the spec §12 ("Building
the contact database — a parallel track"). It feeds the `labels` table (spec §9) and
seeds the in-app Label Discovery library (Phase 3, spec §11).

## Files
- `labels.json` — the structured dataset (source of truth). One record per label, with
  submission channel, requirements, sub-label reach, provenance, and a confidence flag.
- `labels.csv` — flat export of the same data for quick import/seeding.

## Status (2026-06-01)
- **Batches 1–3:** the 17 spec seed labels + 28 hand-researched additions (45).
- **Batch 4:** a parallel **6-agent sweep** of the house/tech-house universe → +95 (140).
- **Batch 5:** imported a user-provided master list (175 entries, stamped May 2025),
  then **re-verified every import label-by-label** with a parallel 5-agent pass against
  each label's own official source → **+65 verified** (and **22 rejected**).

| Metric | Value |
|---|---|
| Labels recorded | **205** |
| Contactable now (have a real demo channel) | 192 / 205 |
| High confidence (official page or ≥2 sources) | 104 |
| Medium confidence (single secondary source — re-verify) | 82 |
| Low confidence (channel unconfirmed / window-only) | 19 |
| Tier mix | 11 ELITE · 66 A · 128 B |

### Batch 5 — the master-list import was NOT trusted blindly
The uploaded file (`labelsdatabasemaster.js`) had a JS syntax error, a header/row
mismatch (claimed 175, parsed 170), an internal duplicate, and a uniform "May 2025"
stamp. A spot-check showed its contact details were **wrong/stale ~half the time**
(e.g. Skint, Running Back, CUFF all had bad addresses). So every candidate was
re-verified before keeping:
- **66** were already in our DB (incl. sub-label aliases) → skipped.
- **8** techno/off-genre and **7** sub-label-of-parent redundancies → dropped pre-merge.
- **87** new in-scope candidates were merged `pending`, then re-checked individually:
  **65 kept** (channels corrected where the file was wrong), **22 rejected** —
  off-genre techno (Truesoul, Intec, Soma, Cocoon Recordings, Minus, Odd Recordings,
  Senso, Arcane), commercial/other-genre (Kontor, Enhanced, Futuristica, Get The Sound),
  dormant (Tsuba, Leftroom), or phantom/unverifiable (Muse, Coco, Criterio, Tactile,
  NOXU Deep, Rejected, Odd Mob, Rebel Rave).
- Common corrections applied: Skint → `skint.demos@bmg.com`, Running Back →
  `demos@running-back.com`, Keinemusik → `drop@keinemusik.com`, CUFF → Trackstack,
  Mobilee → LabelRadar portal, Relief → `bruce@cajual.com`, Nite Grooves → King Street.

**Batch 4 coverage by slice:** tech house EU 17 · mainstream/festival 18 ·
melodic/progressive 20 · deep/soulful/disco 19 · afro/Latin 13 · bass/G-house 10
(97 raw → 95 after dropping cross-slice duplicates REALM Records & Permanent Vacation).
Batch 4 also resolved the earlier **REALM** ambiguity — it's Gorgon City's label, now
verified — and added **elrow Music** and **Kaluki Musik** (channels found this round).

Each agent applied the same rules: ≥3/5 quality bar, verify the demo channel, record
provenance + confidence, skip dormant labels (~2+ yrs no release) and ambiguous ones.
Notable **deliberate skips** (kept out for accuracy): Strictly Rhythm & Madhouse/MadTech
(legacy/dormant), Phonica (a shop, not a signing label), Main Course & Psycho Disco!
(dormant), Bassrush/Basscon (not house), plus several names that couldn't be confirmed
as active labels with a real channel.

## Method (the spec's research loop)
`Source → Verify (≥2 independent sources) → Qualify (≥3/5 bar) → Tier + access path →
Record (rules, links, sources, fetch date) → Maintain (stamp last-verified)`

- Submission details were checked against the **label's own demo page** wherever one
  exists, then cross-checked with a second source (directory, official social, or the
  portal provider). Aggregators used: labelsbase.net, findmylabels.com.
- Every record carries `sources[]` (URL + fetch date), `last_verified`, and `confidence`.
- Nothing was fabricated. Where a channel couldn't be confirmed, the record says so
  rather than guessing.

## Things to re-verify before bulk use
**Low confidence (9) — channel unconfirmed or window-only:** Hellbent, Night Bass,
Country Club Disco, Heist Recordings, Lobster Theremin, Wolf Music Recordings,
Whippin Records, Vatos Locos, Afterlife. Treat these as leads, not ready-to-send.

**Relationship-only / prestige (don't expect cold-demo success):** Drumcode, Innervisions,
Afterlife — listed for completeness; realistic only via a warm intro.

**Medium confidence (53):** mostly an email or portal from a single secondary directory
(labelsbase.net / findmylabels.com) or one official social post. Cross-check against the
label's own site before any bulk use. Known specifics to nail down:
- **REALM Records:** sources disagree on the address (a `demos@realm-records.com` /
  `realmrecordsdemos@gmail.com` / Trackstack all appear) — confirm the current one.
- **Crosstown Rebels:** `demos@` vs `info@crosstownrebels.com` across sources.
- **Hot Creations / Sola / Suara / Snatch!:** confirm against the live official channel.
- Batch-4 entries flagged by agents (site unreachable on fetch / JS-gated portal):
  Late Checkout, Colorize, Future House Music, SKINK, Zerothree — re-fetch the portal.

## Discrepancies vs. the spec's access-path guesses
The spec notes access-path values are "starting suggestions to verify." Three ELITE
labels listed as hard-to-reach actually run **open public demo portals** today:
- **Experts Only** — Trackstack portal (`tstack.app/expertsonly`)
- **Black Book** — Trackstack portal on the official site
- **Catch & Release** — Trackstack portal on followthefishtv.com

Each is flagged in `access_path_verified` and the record's `notes`.

## Sub-label reach (one send, many labels)
- **Defected** ≈ 11 sub-labels (`sub_label_multiplier: 11`).
- **Repopulate Mars** ≈ 3 — one email covers Repopulate Mars, South Of Saturn,
  North Of Neptune.

## Next (to grow toward the ~170-label / ~98-promo-contact target in §12)
1. Re-verify the medium/low records above against official channels.
2. Expand beyond the seed: more cold-demo-friendly A/B labels that clear the bar.
3. Begin the non-label promo contacts (radio, blogs, curators, repost networks).
4. Stand up a scheduled re-verification so `last_verified` stays fresh (Discovery flags stale entries).

## Provenance / tooling note
Collected with the Firecrawl CLI (search + scrape of public pages). The API key is kept
out of git (`.firecrawl.env`, gitignored); raw scrape cache lives in `.firecrawl/` (also
gitignored). Only public, lawful sources were used; role/business demo channels were
preferred over personal contact data.
