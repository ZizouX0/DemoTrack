# Phase 0 — Contact Database Research

The app is the engine; this database is the fuel. Ongoing, never "done."
Research loop per contact: **Source → Verify (2 sources) → Qualify (≥3/5 bar)
→ Tier + access_path → Record → Maintain (last_verified).**

Tooling: native WebSearch/WebFetch (the `deep-research` approach). Firecrawl is
blocked by this environment's network allowlist (`api.firecrawl.dev` not
permitted), so it is not used here.

---

## Batch 1 — the 17 curated seed labels ✅ (verified 2026-06-01)

All 17 spec labels now have a **verified submission route + requirements +
sources**, captured in `research/labels.csv` and `supabase/seed_labels.sql`.

| Label | Tier | Access | Route |
|-------|------|--------|-------|
| Dirtybird | A | cold | Form (Label-Worx DemoBox) |
| Repopulate Mars | A | cold | Email `demos@repopulatemars.com` (private SC/Dropbox only) |
| Hellbent | A | cold | Portal (tstack.link/hellbent) |
| Three Six Zero | A | cold | LabelRadar portal |
| Solid Grooves | A | cold | Email `demo@solidgrooverecords.com` ⚠️ verify spelling |
| Sola | A | cold | Email `sola-demos@outlook.com` |
| Hot Creations | A | warm-intro | SoundCloud demo group (private) |
| Toolroom | B | cold | Portal `toolroomrecords.com/demos` + email |
| Defected | B | cold | LabelRadar portal (covers ~11 sub-labels) |
| Knee Deep In Sound | B | cold | Email `demos@hotsince82.com` |
| Suara | B | cold | LabelRadar portal |
| Club Sweat | B | cold | DropTrack portal + A&R email |
| Space Yacht | B | open-window | Tune Reactor (Twitch live, Mon/Thu 4pm PT) |
| Black Book | Elite | **cold** ⭐ | Open portal, 124–130 BPM, private link + bio |
| Catch & Release | Elite | warm-intro | Insomniac Music Group label page |
| Experts Only | Elite | warm-intro | **No open portal** — referrals/LinkedIn A&R |
| Drumcode | Elite | relationship | Website demo (techno-leaning) |

### Research notes / corrections to the spec's starting assumptions
- **Black Book** was listed as `needs_warm_intro`, but Chris Lake's label runs a
  real **open submission portal** (124–130 BPM, private link + bio, 2–4 wk wait).
  Reclassified to `cold_demo_friendly`. ⭐ A genuinely accessible elite target.
- **Experts Only** confirmed to have **no open demo route** — relationship only,
  matching its `needs_warm_intro` tag.
- **Defected** one submission reaches its sub-label network (DFTD, Glitterbox,
  Classic, Big Love, Soulfuric, Nu Groove…) — high efficiency multiplier.

### Low-confidence / to re-verify
- `Solid Grooves` demo email spelling (`solidgrooverecords.com` vs `solidgrooves`).
- `Sola` secondary route (`music@solardo…`) unconfirmed.
- `Catch & Release` exact current demo inbox (Insomniac-managed).

---

## Next batches (planned)

- **Batch 2–N — expand the label library** toward the spec's ~170 target: more
  cold-demo-friendly house/tech-house labels that genuinely move an unknown
  artist (e.g. Glasgow Underground, Cuttin' Headz, elrow Music, Snatch!,
  Realm, Hood Politics, Country Club Disco, Insomniac/IN/ROTATION, Higher
  Ground, Sola-adjacent, etc.) — each Sourced → Verified ×2 → Qualified.
- **Promo contacts (~98)** — radio (e.g. BBC R1 Dance, Rinse), blogs/press,
  Spotify/YouTube playlist & repost curators, premiere channels, podcasts, PR.
- Capture **sub-label `parent_label_id`** links and BPM ranges.

Quality bar for inclusion (≥3 of 5): Beatport chart presence · booking impact ·
streaming credibility · scene respect · accessible to unknowns.
