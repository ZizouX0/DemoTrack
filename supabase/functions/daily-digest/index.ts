// DemoTrack — Phase 6: scheduled email digest (Spec §6).
// Composes each user's "what to do today" digest (follow-ups due, overdue,
// recent replies) and emails it. Runs server-side with the service role.
//
// Deploy:  supabase functions deploy daily-digest --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=re_...   DIGEST_FROM="DemoTrack <digest@yourdomain>"
//          (optional) DIGEST_CRON_SECRET=<random>   # extra auth for the cron caller
// Trigger: from pg_cron via pg_net (see supabase/followups.sql), or manually.
//
// Auth: not JWT-gated (cron has no user). Requires the Authorization bearer to
// equal the service-role key or DIGEST_CRON_SECRET. Fails closed: if neither
// secret is configured the endpoint refuses to run.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const DIGEST_FROM = Deno.env.get('DIGEST_FROM') ?? 'DemoTrack <onboarding@resend.dev>'
const CRON_SECRET = Deno.env.get('DIGEST_CRON_SECRET') ?? ''

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

function authorized(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!SERVICE_KEY && !CRON_SECRET) return false // fail closed: nothing to check against
  return (SERVICE_KEY !== '' && bearer === SERVICE_KEY) || (CRON_SECRET !== '' && bearer === CRON_SECRET)
}

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: DIGEST_FROM, to, subject, text }),
  })
  return r.ok
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401)
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const nowIso = new Date().toISOString()

  // Optional: scope to a single user (manual test) via body { user_id }.
  let onlyUser: string | null = null
  try { onlyUser = (await req.json())?.user_id ?? null } catch { /* no body */ }

  // Open sends that need attention (due or overdue), with track + contact names.
  let q = supabase
    .from('submissions')
    .select('id,user_id,status,follow_up_due_at,overdue_at,tracks(title),contacts(name)')
    .in('status', ['sent', 'opened'])
    .or(`follow_up_due_at.lte.${nowIso},overdue_at.lte.${nowIso}`)
  if (onlyUser) q = q.eq('user_id', onlyUser)

  const { data: subs, error } = await q
  if (error) return json({ error: error.message }, 500)

  // Group by user.
  const byUser = new Map<string, { due: any[]; overdue: any[] }>()
  for (const s of subs ?? []) {
    const bucket = byUser.get(s.user_id) ?? { due: [], overdue: [] }
    if (s.overdue_at && s.overdue_at <= nowIso) bucket.overdue.push(s)
    else bucket.due.push(s)
    byUser.set(s.user_id, bucket)
  }

  const results: Array<Record<string, unknown>> = []
  for (const [userId, b] of byUser) {
    // recent replies (last 7 days) for a little positive signal
    const sevenAgo = new Date(Date.now() - 7 * 864e5).toISOString()
    const { count: recentReplies } = await supabase
      .from('feedback').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).neq('response_type', 'no_response').gte('created_at', sevenAgo)

    const line = (s: any) => `• "${s.tracks?.title ?? 'track'}" → ${s.contacts?.name ?? 'contact'}`
    const body =
      `Your DemoTrack digest\n\n` +
      (b.overdue.length ? `Overdue (14+ days, no reply) — decide to move on or nudge:\n${b.overdue.map(line).join('\n')}\n\n` : '') +
      (b.due.length ? `Follow up now (7+ days silent):\n${b.due.map(line).join('\n')}\n\n` : '') +
      (recentReplies ? `Good news: ${recentReplies} repl${recentReplies === 1 ? 'y' : 'ies'} in the last 7 days.\n\n` : '') +
      `Open DemoTrack to act on these. Keep the loop going.`
    const subject = `DemoTrack: ${b.due.length} to follow up, ${b.overdue.length} overdue`

    let emailed = false
    try {
      const { data: u } = await supabase.auth.admin.getUserById(userId)
      const to = u?.user?.email
      if (to) emailed = await sendEmail(to, subject, body)
    } catch { /* ignore email lookup/send errors per-user */ }

    await supabase.from('notifications').insert({
      user_id: userId,
      kind: 'digest',
      payload: { due: b.due.length, overdue: b.overdue.length, recent_replies: recentReplies ?? 0, emailed },
      scheduled_for: nowIso,
      sent_at: emailed ? nowIso : null,
    })

    results.push({ user_id: userId, due: b.due.length, overdue: b.overdue.length, emailed })
  }

  return json({ ok: true, users: results.length, sent: results.filter((r) => r.emailed).length, results })
})
