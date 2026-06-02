// DemoTrack — Phase 13: AI bio generation (Spec §5, feature 2).
// Writes the press-kit bio in one of 3 selectable tones, FROM the artist's
// profile facts only — never invents numbers or accolades. Server-side so the
// Anthropic key stays out of the browser. JWT-verified by default.
//
// Deploy:  supabase functions deploy generate-bio
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import Anthropic from 'npm:@anthropic-ai/sdk@0.69.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TONES: Record<string, string> = {
  professional: 'Professional and concise — third person, press-ready, the kind of bio a label or promoter would paste verbatim.',
  story: 'Warm and personal — first person, a short origin-and-direction story; human, not corporate.',
  punchy: 'Short and punchy — high-energy, a few crisp lines with attitude; no fluff.',
}

const SYSTEM = `You write an artist BIO for a house / tech-house producer's press kit.

Hard rules:
- 60–110 words. No headings, no markdown, no quotation marks around the whole thing.
- Use ONLY the facts provided. NEVER invent numbers, streams, chart positions, label signings, accolades, press quotes, or collaborations that aren't in the input. If a fact isn't given, don't imply it.
- Don't pad with clichés ("up-and-coming", "passion for music", "based in the studio"). Be specific to the facts.
- Write in the requested tone.
Respond strictly as JSON matching the schema: {"bio": "<text>"}.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }) }

  const toneKey = String(body.tone ?? 'professional').toLowerCase()
  const toneInstr = TONES[toneKey] ?? TONES.professional
  const artist = typeof body.artist_name === 'string' && body.artist_name ? body.artist_name : 'this artist'
  const facts = (body.facts ?? {}) as Record<string, unknown>

  const factLines = [
    `Artist name: ${artist}.`,
    `Genre: house & tech house.`,
    facts.location ? `Based in: ${facts.location}.` : 'Based in: Tunis, Tunisia.',
    Array.isArray(facts.releases) && facts.releases.length ? `Releases: ${(facts.releases as any[]).map((r) => (typeof r === 'string' ? r : r?.title ?? '')).filter(Boolean).join('; ')}.` : '',
    facts.stats && Object.keys(facts.stats as object).length ? `Stats (use only if given, do not round up): ${JSON.stringify(facts.stats)}.` : '',
    Array.isArray(facts.links) && facts.links.length ? `Links/platforms present: ${(facts.links as any[]).map((l) => l?.label ?? l).filter(Boolean).join(', ')}.` : '',
    facts.notes ? `Extra facts: ${facts.notes}` : '',
  ].filter(Boolean).join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: { type: 'object', properties: { bio: { type: 'string' } }, required: ['bio'], additionalProperties: false } },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Tone: ${toneInstr}\n\nFacts:\n${factLines}` }],
    })
    const textBlock = resp.content.find((b) => b.type === 'text') as { text?: string } | undefined
    let bio = ''
    try { bio = (JSON.parse(textBlock?.text ?? '{}').bio ?? '').trim() } catch { bio = (textBlock?.text ?? '').trim() }
    if (!bio) throw new Error('Empty bio returned')
    return new Response(JSON.stringify({ bio, tone: toneKey }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `Claude error ${err.status}: ${err.message}` : (err as Error).message
    return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
