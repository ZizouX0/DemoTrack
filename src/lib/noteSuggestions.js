// Quick-pick suggestions for the track notes field, grouped by the kind of
// detail an A&R actually scans for. Tapping a chip appends its text to the
// notes (the field stays free-text — these are just shortcuts). Placeholders
// in [brackets] are meant to be edited after insertion.
export const NOTE_SUGGESTIONS = [
  {
    group: 'Vibe',
    items: [
      'Rolling, hypnotic groove',
      'Dark, driving peak-time energy',
      'Warm, sunset terrace feel',
      'Stripped-back late-night minimal',
      'Euphoric melodic build',
      'Raw underground warehouse',
      'Groovy, bouncy and playful',
      'Deep, emotive and atmospheric',
    ],
  },
  {
    group: 'Reference',
    items: [
      'For fans of [artist]',
      "Sits alongside [label]'s recent releases",
      'Reference track: [track]',
      'Inspired by [artist] / [era]',
    ],
  },
  {
    group: 'Mix / format',
    items: [
      'Mixed & mastered, release-ready',
      'Rough mix — feedback welcome',
      'Club mix + radio edit available',
      'Stems available on request',
      'Mastered for club and streaming',
      'Extended mix [length]',
    ],
  },
]
