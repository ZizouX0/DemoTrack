// DemoTrack — Phase 6: scheduled email digest (Spec §6).
// Composes each user's "what to do today" digest (follow-ups due, overdue,
// recent replies) and emails it. Runs server-side with the service role.
//
// Deploy:  supabase functions deploy daily-digest --no-verify-jwt
// Config:  RESEND_API_KEY + DIGEST_FROM as function secrets, OR stored in
//          Vault as 'resend_api_key' / 'digest_from' (no redeploy needed).
// Trigger: from pg_cron via pg_net (see supabase/followups.sql), or manually.
//
// Auth: not JWT-gated (cron has no user). The Authorization bearer must equal
// the service-role key, the DIGEST_CRON_SECRET function secret, or the
// 'demotrack_cron_secret' Vault secret (checked via the service-role-only
// verify_cron_secret RPC — this is what the pg_cron trigger uses). Fails
// closed on any mismatch.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const DIGEST_FROM_DEFAULT = 'DemoTrack <onboarding@resend.dev>'
const DIGEST_FROM = Deno.env.get('DIGEST_FROM') ?? ''
const CRON_SECRET = Deno.env.get('DIGEST_CRON_SECRET') ?? ''

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

async function authorized(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!bearer) return false
  if (SERVICE_KEY && bearer === SERVICE_KEY) return true
  if (CRON_SECRET && bearer === CRON_SECRET) return true
  // Vault-stored cron secret — the pg_cron trigger sends this one.
  const { data } = await supabase.rpc('verify_cron_secret', { p_secret: bearer })
  return data === true
}

// Mail config: env secrets win; otherwise fall back to Vault so the key can be
// added with plain SQL and no function redeploy.
async function mailConfig(supabase: ReturnType<typeof createClient>): Promise<{ key: string; from: string }> {
  let key = RESEND_API_KEY
  let from = DIGEST_FROM
  if (!key) {
    const { data } = await supabase.rpc('get_vault_secret', { p_name: 'resend_api_key' })
    key = (data as string | null) ?? ''
  }
  if (!from) {
    const { data } = await supabase.rpc('get_vault_secret', { p_name: 'digest_from' })
    from = (data as string | null) ?? DIGEST_FROM_DEFAULT
  }
  return { key, from }
}

async function sendEmail(cfg: { key: string; from: string }, to: string, subject: string, text: string): Promise<boolean> {
  if (!cfg.key) return false
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to, subject, text }),
  })
  return r.ok
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500)

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  if (!(await authorized(req, supabase))) return json({ error: 'Unauthorized' }, 401)

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

  const cfg = await mailConfig(supabase)

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
      if (to) emailed = await sendEmail(cfg, to, subject, body)
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
