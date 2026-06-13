// DemoTrack — AI email hook (Spec §5, feature 1).
// Writes ONLY the single personalized sentence ("the hook") for a demo email.
// Runs server-side so API keys never reach the browser. JWT-verified by default.
//
// Provider: FREE by default via Groq (no credit card) if GROQ_API_KEY is set;
// falls back to Anthropic (claude-opus-4-8) if only ANTHROPIC_API_KEY is set.
//
// Deploy:  supabase functions deploy suggest-hook
// Secret:  supabase secrets set GROQ_API_KEY=gsk_...      (free — console.groq.com)
//   or:    supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const j = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SYSTEM = `You write ONE sentence — "the hook" — the single personalized line a house / tech-house producer drops into a cold demo email to a record label. It must make the A&R feel this track was sent to THEM specifically, not blasted to 50 labels.

What makes a great hook:
- It names a CONCRETE point of fit between this exact track and this exact label — the sound, the energy, a signed artist or release the label is known for (only if that fact is provided), or where it would sit in their catalogue.
- It is specific and quietly confident. A&Rs read hundreds of these; vagueness reads as spam.

Hard rules:
- Output EXACTLY ONE sentence, maximum 30 words. Plain text — no greeting, no sign-off, no quotation marks, no emoji, no hashtags.
- Use ONLY the facts provided. NEVER invent a release, chart stat, signing, collaborator, event, play count, or "angle" that isn't in the input.
- If the only facts are genre / BPM / energy, write an honest line grounded in those and the label's stated focus — do not fabricate to sound impressive.
- Ban these clichés and self-centred openers: "huge fan", "big fan", "check out", "I think you'll love", "I'd love for you to", "hope you're well", "I've been making music". Lead with the track and the fit, not with yourself.

Good examples (mimic the STYLE only — never reuse their facts):
- "This rolling, hypnotic 126 BPM tech-house cut with a stripped late-night groove would sit naturally between your recent minimal deep-tech releases."
- "Built on a warm organic-house groove and tribal percussion, it carries the sun-down terrace energy your label is known for."
- "A driving peak-time techno roller with a dark modular lead — exactly the after-midnight weight your A&R has been signing."

Respond strictly as JSON: {"hook": "<sentence>"}.`

// ---- Provider call: returns the raw model text (expected to be JSON) ----
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
        temperature: 0.7,
        max_tokens: 300,
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
      max_tokens: 256,
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

  const track = (body.track ?? {}) as Record<string, unknown>
  const label = (body.label ?? {}) as Record<string, unknown>
  const arIntel = typeof body.ar_intel === 'string' ? body.ar_intel : ''
  const artistName = typeof body.artist_name === 'string' ? body.artist_name : 'an independent producer'
  const recentHooks = Array.isArray(body.recent_hooks) ? (body.recent_hooks as string[]) : []

  const facts = [
    `Artist: ${artistName} (house & tech house, Tunis).`,
    track.title ? `Track: "${track.title}".` : '',
    Array.isArray(track.genre_tags) && track.genre_tags.length ? `Track genres: ${(track.genre_tags as string[]).join(', ')}.` : '',
    track.bpm ? `BPM: ${track.bpm}.` : '',
    track.key ? `Key: ${track.key}.` : '',
    track.notes ? `Track vibe / reference / mix notes (use for the sound description): ${track.notes}` : '',
    `Label: ${label.name ?? 'this label'}.`,
    Array.isArray(label.genre_tags) && label.genre_tags.length ? `Label genres / focus: ${(label.genre_tags as string[]).join(', ')}.` : '',
    label.why ? `Why the label matters: ${label.why}` : '',
    label.requirements ? `Label submission notes: ${label.requirements}` : '',
    arIntel ? `A&R intel / personal angle: ${arIntel}` : '',
    recentHooks.length ? `AVOID repeating these recently-used hooks: ${recentHooks.map((h) => `"${h}"`).join('; ')}` : '',
  ].filter(Boolean).join('\n')

  try {
    const raw = await complete(SYSTEM, `Write the hook from these facts:\n\n${facts}`)
    // Anthropic (no JSON mode) may fence the JSON in ```...``` — strip before parsing.
    const cleaned = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    let hook = ''
    try { hook = (JSON.parse(cleaned).hook ?? '').trim() } catch { hook = cleaned.replace(/^["']|["']$/g, '') }
    if (!hook) throw new Error('Empty hook returned')
    return j({ hook })
  } catch (err) {
    return j({ error: (err as Error).message }, 502)
  }
})
