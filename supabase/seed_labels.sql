-- ============================================================================
-- DemoTrack — seed: the 17 curated labels (Spec §11).
-- Every one clears the ≥3/5 quality bar. `tier` = prestige; `access_path` = how
-- realistically reachable for an unknown (different axes).
--
-- access_path values are STARTING SUGGESTIONS to verify during Phase 0 research,
-- so last_verified is intentionally NULL — Discovery will flag these for
-- verification rather than implying false precision.
--
-- Run AFTER schema.sql, with the service role (labels is read-only to clients).
-- Idempotent: re-running won't duplicate (unique on lower(name)).
-- ============================================================================

insert into labels (name, tier, access_path, genre_tags, why) values
  ('Drumcode',            'elite', 'relationship_only',   '{techno,tech-house}', 'Adam Beyer. Scene-defining — a long game, not a cold target.'),
  ('Experts Only',        'elite', 'needs_warm_intro',    '{tech-house,house}',  'John Summit. Peak of the scene.'),
  ('Black Book',          'elite', 'needs_warm_intro',    '{tech-house,house}',  'Chris Lake. A Beatport #1 machine.'),
  ('Catch & Release',     'elite', 'needs_warm_intro',    '{tech-house,house}',  'Fisher. Massive reach and chart dominance.'),
  ('Repopulate Mars',     'a',     'cold_demo_friendly',  '{tech-house,house}',  'Lee Foss. Where Mau P broke through. Open to demos.'),
  ('Dirtybird',           'a',     'cold_demo_friendly',  '{tech-house,house}',  'Claude VonStroke. Fun, quirky lane; launches careers.'),
  ('Hellbent',            'a',     'cold_demo_friendly',  '{tech-house}',        'Cloonee. Built for unknowns; charts constantly.'),
  ('Three Six Zero',      'a',     'cold_demo_friendly',  '{tech-house,house}',  'Dom Dolla. Open submissions; growing fast.'),
  ('Hot Creations',       'a',     'needs_warm_intro',    '{tech-house,house}',  'Jamie Jones. Deep scene credibility.'),
  ('Solid Grooves',       'a',     'cold_demo_friendly',  '{tech-house}',        'Michael Bibi. UK tech house institution.'),
  ('Sola',                'a',     'cold_demo_friendly',  '{tech-house,house}',  'Solardo. Consistent charting; email demos welcome.'),
  ('Toolroom',            'b',     'cold_demo_friendly',  '{tech-house,house}',  'Mark Knight. Solid distribution; long track record.'),
  ('Defected',            'b',     'cold_demo_friendly',  '{house,tech-house}',  'Huge catalogue; one send covers ~11 sub-labels.'),
  ('Knee Deep In Sound',  'b',     'cold_demo_friendly',  '{melodic-house,tech-house}', 'Hot Since 82. A less-competitive melodic lane.'),
  ('Suara',               'b',     'cold_demo_friendly',  '{tech-house,techno}', 'Coyu. Darker tech house niche.'),
  ('Club Sweat',          'b',     'cold_demo_friendly',  '{house,tech-house}',  'Australian reach; good for emerging artists.'),
  ('Space Yacht',         'b',     'open_window_only',    '{tech-house,house}',  'Reviews demos live on Twitch — the most transparent route in the scene.')
on conflict (lower(name)) do nothing;
