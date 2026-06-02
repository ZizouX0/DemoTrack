// DemoTrack — AI email hook (Spec §5, feature 1).
// Writes ONLY the single personalized sentence ("the hook") that slots into the
// user's email preset. Runs server-side so ANTHROPIC_API_KEY never reaches the
// browser. Guardrails: <=30 words, one sentence, facts-only (no fabrication).
//
// Deploy:  supabase functions deploy suggest-hook
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Auth:    JWT-verified by default (only signed-in users can call it).

import Anthropic from 'npm:@anthropic-ai/sdk@0.69.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You write ONE sentence: the single personalized line ("the hook") a house / tech-house producer drops into a cold demo email to a record label, saying why THIS track fits THIS label.

Hard rules:
- Maximum 30 words. Exactly ONE sentence. Plain text — no greeting, no sign-off, no quotation marks, no emoji.
- Use ONLY the facts provided about the track and the label. NEVER invent a release, chart stat, signing, artist name, event, or any "angle" that isn't in the input.
- If you don't have a specific angle, write an honest, non-generic line grounded in the track's genre/energy and the label's stated focus — do not fabricate to sound impressive.
- No hype clichés ("huge fan", "check it out", "I think you'll love"). Be specific and confident, not fawning.
Respond strictly as JSON matching the schema: {"hook": "<sentence>"}.`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not set. Run: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const track = (body.track ?? {}) as Record<string, unknown>
  const label = (body.label ?? {}) as Record<string, unknown>
  const arIntel = typeof body.ar_intel === 'string' ? body.ar_intel : ''
  const artistName = typeof body.artist_name === 'string' ? body.artist_name : 'an independent producer'
  const recentHooks = Array.isArray(body.recent_hooks) ? (body.recent_hooks as string[]) : []

  // Compact, fact-only context. Anything absent is simply omitted (never guessed).
  const facts = [
    `Artist: ${artistName} (house & tech house, Tunis).`,
    track.title ? `Track: "${track.title}".` : '',
    Array.isArray(track.genre_tags) && track.genre_tags.length ? `Track genres: ${(track.genre_tags as string[]).join(', ')}.` : '',
    track.bpm ? `BPM: ${track.bpm}.` : '',
    track.key ? `Key: ${track.key}.` : '',
    `Label: ${label.name ?? 'this label'}.`,
    label.why ? `Why the label matters: ${label.why}` : '',
    label.requirements ? `Label submission notes: ${label.requirements}` : '',
    arIntel ? `A&R intel / personal angle: ${arIntel}` : '',
    recentHooks.length ? `AVOID repeating these recently-used hooks (write something different): ${recentHooks.map((h) => `"${h}"`).join('; ')}` : '',
  ].filter(Boolean).join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 256,
      thinking: { type: 'disabled' },
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { hook: { type: 'string' } },
            required: ['hook'],
            additionalProperties: false,
          },
        },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Write the hook from these facts:\n\n${facts}` }],
    })

    const textBlock = resp.content.find((b) => b.type === 'text') as { text?: string } | undefined
    let hook = ''
    try {
      hook = (JSON.parse(textBlock?.text ?? '{}').hook ?? '').trim()
    } catch {
      hook = (textBlock?.text ?? '').trim()
    }
    if (!hook) throw new Error('Empty hook returned')

    return new Response(JSON.stringify({ hook }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `Claude error ${err.status}: ${err.message}` : (err as Error).message
    return new Response(JSON.stringify({ error: msg }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
