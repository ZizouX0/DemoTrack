// DemoTrack — AI bio generation (Spec §5, feature 2).
// Writes the press-kit bio in one of 3 tones, FROM the artist's facts only —
// never invents numbers or accolades. Server-side; JWT-verified by default.
//
// Provider: FREE by default via Groq (no credit card) if GROQ_API_KEY is set;
// falls back to Anthropic (claude-opus-4-8) if only ANTHROPIC_API_KEY is set.
//
// Deploy:  supabase functions deploy generate-bio
// Secret:  supabase secrets set GROQ_API_KEY=gsk_...   (free — console.groq.com)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
Respond strictly as JSON: {"bio": "<text>"}.`

async function complete(system: string, userMsg: string): Promise<string> {
  const groqKey = Deno.env.get('GROQ_API_KEY')
  if (groqKey) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 500,
      }),
    })
    if (!r.ok) throw new Error(`Groq error ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const data = await r.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (anthropicKey) {
    const { default: Anthropic } = await import('npm:@anthropic-ai/sdk@0.69.0')
    const client = new Anthropic({ apiKey: anthropicKey })
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMsg }],
    })
    const tb = resp.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined
    return tb?.text ?? ''
  }

  throw new Error('No AI key set. Add a FREE Groq key: supabase secrets set GROQ_API_KEY=gsk_... (from console.groq.com), or ANTHROPIC_API_KEY.')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return j({ error: 'Use POST' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return j({ error: 'Invalid JSON body' }, 400) }

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
    const raw = await complete(SYSTEM, `Tone: ${toneInstr}\n\nFacts:\n${factLines}`)
    // Anthropic (no JSON mode) may fence the JSON in ```...``` — strip before parsing.
    const cleaned = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let bio = ''
    try { bio = (JSON.parse(cleaned).bio ?? '').trim() } catch { bio = cleaned }
    if (!bio) throw new Error('Empty bio returned')
    return j({ bio, tone: toneKey })
  } catch (err) {
    return j({ error: (err as Error).message }, 502)
  }
})
