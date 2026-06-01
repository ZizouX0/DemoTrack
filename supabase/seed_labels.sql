-- ============================================================================
-- DemoTrack — seed: the 17 curated labels (Spec §11), ENRICHED with Phase 0
-- research (verified submission routes, requirements, sources).
--
-- tier        = prestige.  access_path = realistic reachability for an unknown.
-- last_verified stamped 2026-06-01 (web-verified). Routes change — re-verify.
-- Sources: official label demo pages + an independent aggregator, per contact.
--
-- Run AFTER schema.sql, with the service role (labels is read-only to clients).
-- Idempotent: re-running upserts (updates the enriched fields).
-- ============================================================================

insert into labels
  (name, tier, access_path, submission_method, contact_link, genre_tags, bpm_min, bpm_max, submission_requirements, sources, why, last_verified)
values
  ('Dirtybird','a','cold_demo_friendly','form','https://www.label-worx.com/demo/dirtybird','{house,tech-house}',null,null,
   'Name, email, track title, confirm rights, state if exclusive. They listen to all; no feedback guaranteed; demos may be played on socials/streams.',
   '{dirtybirdrecords.com,label-worx.com/demo/dirtybird}','Claude VonStroke. Fun, quirky lane; launches careers.','2026-06-01'),

  ('Repopulate Mars','a','cold_demo_friendly','email','demos@repopulatemars.com','{tech-house,house}',null,null,
   'Private SoundCloud or Dropbox links ONLY (no GDrive/WeTransfer). Max 4 demos; private playlist if multiple. Downloads ON. Extended mixes preferred. Also covers South Of Saturn & North Of Neptune.',
   '{repopulatemars.com/demos,findmylabels.com}','Lee Foss. Where Mau P broke through. Open to demos.','2026-06-01'),

  ('Hellbent','a','cold_demo_friendly','form','https://tstack.link/hellbent','{tech-house}',null,null,
   'Unreleased tech house; private link via submission portal. Built to foster unknown artists.',
   '{hellbentrecs.com,soundcloud.com/hellbentrecords}','Cloonee. Built for unknowns; charts constantly.','2026-06-01'),

  ('Three Six Zero','a','cold_demo_friendly','form','https://www.labelradar.com/labels/threesixzero/portal','{tech-house,house}',null,null,
   'Open submission via LabelRadar portal.',
   '{threesixzero.com/recording,labelradar.com}','Dom Dolla / Eats Everything / Noizu. Open submissions; growing fast.','2026-06-01'),

  ('Solid Grooves','a','cold_demo_friendly','email','demo@solidgrooverecords.com','{tech-house}',null,null,
   'Email demo. EXTREMELY high volume — very low response rate. Verify exact address (sources vary on spelling).',
   '{solidgrooves.co.uk,findmylabels.com}','Michael Bibi & PAWSA. UK tech house institution.','2026-06-01'),

  ('Sola','a','cold_demo_friendly','email','sola-demos@outlook.com','{tech-house,house}',null,null,
   'Private SoundCloud links. A secondary route (music@solardo) seen — verify.',
   '{facebook.com/SolamusicUK,labelsbase.net/sola-records}','Solardo. Consistent charting; email demos welcome.','2026-06-01'),

  ('Hot Creations','a','needs_warm_intro','dm','https://soundcloud.com/groups/hot-creations-demo','{tech-house,house}',null,null,
   'Upload PRIVATELY to SoundCloud and join the Hot Creations SoundCloud group; include contact details. Reputationally selective.',
   '{hotcreations.com,soundcloud.com/hotcreationsdemos}','Jamie Jones & Lee Foss. Deep scene credibility.','2026-06-01'),

  ('Toolroom','b','cold_demo_friendly','form','https://toolroomrecords.com/demos','{house,tech-house}',null,null,
   'Portal preferred (LabelRadar-backed); email demos@toolroomrecords.com. Listen to all, reply only if interested.',
   '{toolroomrecords.com/demos,labelradar.com}','Mark Knight. Solid distribution; long track record.','2026-06-01'),

  ('Defected','b','cold_demo_friendly','form','https://www.labelradar.com/labels/defected/portal','{house,tech-house}',null,null,
   'LabelRadar; drag-drop MP3. Follow guidelines or auto-deleted. One submission covers sub-labels (DFTD, Glitterbox, Classic, Big Love, Soulfuric, Nu Groove, etc.).',
   '{defected.com/demos,musicweek.com}','Huge catalogue; one send covers ~11 sub-labels.','2026-06-01'),

  ('Knee Deep In Sound','b','cold_demo_friendly','email','demos@hotsince82.com','{melodic-house,tech-house}',null,null,
   'Email demos (alt: kdisdemos@gmail.com). Melodic / less-competitive lane.',
   '{labelsbase.net/knee-deep-in-sound,soundcloud.com/kneedeepinsound}','Hot Since 82. A less-competitive melodic lane.','2026-06-01'),

  ('Suara','b','cold_demo_friendly','form','https://www.labelradar.com/labels/suaramusic/portal','{tech-house,techno}',null,null,
   'LabelRadar portal (label mgmt: labelmanagement@suara-music.com).',
   '{suara-music.com/contact,labelradar.com}','Coyu. Darker tech house niche.','2026-06-01'),

  ('Club Sweat','b','cold_demo_friendly','form','https://sweatitout.droptrack.com/demo/','{house,tech-house}',null,null,
   'DropTrack portal (Pro skips queue). A&R email: towelhandles@sweatitoutmusic.com. Sub-label of Sweat It Out — wonkier/deeper club.',
   '{sweatitout.droptrack.com/demo,findmylabels.com}','Australian reach; good for emerging artists.','2026-06-01'),

  ('Space Yacht','b','open_window_only','form','https://spaceyacht.net/tunereactor','{tech-house,house}',null,null,
   'Tune Reactor LIVE reviews on Twitch Mon & Thu 4pm PT (small donation for live feedback). Also a LabelRadar portal.',
   '{spaceyacht.net/tunereactor,festivalinsider.com}','Reviews demos live on Twitch — the most transparent route in the scene.','2026-06-01'),

  ('Black Book','elite','cold_demo_friendly','form','https://www.blackbookrecs.com/pages/demo-submissions','{tech-house,house}',124,130,
   'OPEN PORTAL. Tech house/house 124-130 BPM. Private SoundCloud/streaming link (not a raw file) + short bio + release history. Allow 2-4 weeks; no follow-ups in that window. Reclassified from needs_warm_intro — they run an open portal.',
   '{blackbookrecs.com/pages/demo-submissions,findmylabels.com}','Chris Lake. A Beatport #1 machine.','2026-06-01'),

  ('Catch & Release','elite','needs_warm_intro','email','https://www.insomniacmusicgroup.com/label/catch-release/','{tech-house,techno}',null,null,
   'Routed via Insomniac Music Group label page; website submission. Selective. Verify current demo route.',
   '{findmylabels.com/catch-release,insomniacmusicgroup.com}','Fisher. Massive reach and chart dominance.','2026-06-01'),

  ('Experts Only','elite','needs_warm_intro','dm',null,'{house,techno}',null,null,
   'NO open demo portal (confirmed). Highly selective; talent found via referrals / scene presence. Best path: A&R on LinkedIn, mutual connections, private demo link, no attachments.',
   '{expertsonlyrecs.com,stereodaily.com}','John Summit. Peak of the scene.','2026-06-01'),

  ('Drumcode','elite','relationship_only','form','https://www.drumcode.se/','{techno,tech-house}',null,null,
   'Website demo; very high volume. A long game, not a cold target — ensure strong fit. Predominantly techno.',
   '{drumcode.se,labelsbase.net/drumcode}','Adam Beyer. Scene-defining — a long game.','2026-06-01')

on conflict (lower(name)) do update set
  tier = excluded.tier,
  access_path = excluded.access_path,
  submission_method = excluded.submission_method,
  contact_link = excluded.contact_link,
  genre_tags = excluded.genre_tags,
  bpm_min = excluded.bpm_min,
  bpm_max = excluded.bpm_max,
  submission_requirements = excluded.submission_requirements,
  sources = excluded.sources,
  why = excluded.why,
  last_verified = excluded.last_verified;
