// DemoTrack — Data Freshness Layer 4: automated link checker.
// Pings each label's contact_link and writes link_status + link_checked_at back
// to the shared labels master. This is the ONLY path allowed to write that
// read-only table — it runs with the service role.
//
// Scope & caveats (deliberate):
//   • Only http(s) URLs are checked — email routes (the largest category) have
//     no link to test, so they are skipped and left untouched.
//   • A "broken" result is a HINT, never a hard delete: the UI shows a badge and
//     adds the label to the re-check queue, but never hides it. Forms/DMs behind
//     JS or Cloudflare can false-positive, so a human still decides.
//   • Requests are batched with a small concurrency cap to stay polite.
//
// Deploy:  supabase functions deploy check-links --no-verify-jwt
// Trigger: weekly via pg_cron + pg_net (see freshness.sql), or POST manually.
//   Optional: set CRON_SECRET and send `x-cron-secret: <secret>` to gate it.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''

const CONCURRENCY = 6
const TIMEOUT_MS = 10_000
const UA = 'DemoTrackLinkCheck/1.0 (+https://demotrack.app)'

type LinkStatus = 'ok' | 'broken' | 'timeout'

async function probe(url: string): Promise<LinkStatus> {
  // Try HEAD first (cheap); fall back to GET if the server rejects HEAD.
  for (const method of ['HEAD', 'GET'] as const) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'user-agent': UA },
      })
      clearTimeout(timer)
      // 405/501 => method not allowed; retry with GET.
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
        continue
      }
      // 2xx/3xx and even 401/403/429 mean the endpoint is alive (just gated).
      if (res.status < 400 || res.status === 401 || res.status === 403 || res.status === 429) {
        return 'ok'
      }
      return 'broken'
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') return 'timeout'
      // network/DNS error on GET is a real failure; on HEAD, fall through to GET.
      if (method === 'GET') return 'broken'
    }
  }
  return 'broken'
}

/** Run an async mapper over items with a fixed concurrency cap. */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response('Server not configured', { status: 500 })
  }
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Only labels whose contact_link is an actual URL (skip email routes).
  const { data: labels, error } = await supabase
    .from('labels')
    .select('id, contact_link, submission_method')
    .neq('submission_method', 'email')
    .not('contact_link', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const targets = (labels ?? []).filter((l) =>
    /^https?:\/\//i.test(l.contact_link ?? '')
  )

  const now = new Date().toISOString()
  let ok = 0
  let broken = 0
  let timeout = 0

  await mapPool(targets, CONCURRENCY, async (label) => {
    const status = await probe(label.contact_link as string)
    if (status === 'ok') ok++
    else if (status === 'broken') broken++
    else timeout++
    // timeouts are inconclusive — record the attempt but don't mark broken.
    await supabase
      .from('labels')
      .update({ link_status: status, link_checked_at: now })
      .eq('id', label.id)
  })

  return new Response(
    JSON.stringify({ checked: targets.length, ok, broken, timeout, at: now }),
    { headers: { 'content-type': 'application/json' } }
  )
})
