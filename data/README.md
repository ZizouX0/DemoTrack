# DemoTrack — Contact Database (collected data)

This directory holds the **research workstream** described in the spec §12 ("Building
the contact database — a parallel track"). It feeds the `labels` table (spec §9) and
seeds the in-app Label Discovery library (Phase 3, spec §11).

## Files
- `labels.json` — the structured dataset (source of truth). One record per label, with
  submission channel, requirements, sub-label reach, provenance, and a confidence flag.
- `labels.csv` — flat export of the same data for quick import/seeding.

## Status (2026-06-01)
First batch: the **17 curated seed labels** from spec §11, each researched and verified.

| Metric | Value |
|---|---|
| Labels recorded | 17 / 17 seed |
| Contactable now (have a real demo channel) | 15 / 17 |
| High confidence (official page or ≥2 sources) | 12 |
| Medium confidence (single secondary source — re-verify) | 4 |
| Low confidence (no channel found yet) | 1 (Hellbent) |

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
- **Hellbent (low):** no public demo portal found on hellbentrecs.com (a Shopify store).
  Confirm via Cloonee's socials / a LabelRadar or Trackstack portal.
- **Hot Creations (medium):** the `hotcreationsdemos` SoundCloud account is the only
  signal; confirm the current policy.
- **Sola (medium):** `demos@solarecords.com` is from a single directory.
- **Solid Grooves / Suara (medium):** confirmed by directories / an older official post —
  cross-check against the live site.

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
