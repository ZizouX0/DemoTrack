// DemoTrack — Phase 11 (OPTIONAL): demo-link redirect + open tracking (Spec §9).
// A label opens track.<domain>/<hash> (or .../track-redirect?h=<hash>); we log a
// link_events row, flip the submission to 'opened', then 302 to the real link.
// Form/DM links only — never wrap email links.
//
// Deploy:  supabase functions deploy track-redirect --no-verify-jwt
//   (must be public — the opener is an anonymous label, not a logged-in user.)
// Point track.<yourdomain> at this function for pretty links (optional).

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  // Accept ?h=<hash> or a trailing path segment (.../track-redirect/<hash>).
  const hash = url.searchParams.get('h') || url.pathname.split('/').filter(Boolean).pop() || ''
  if (!hash || hash === 'track-redirect') {
    return new Response('Missing link id', { status: 400 })
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response('Server not configured', { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  const ua = req.headers.get('user-agent') ?? null

  const { data: target, error } = await supabase.rpc('record_link_open', { p_hash: hash, p_user_agent: ua })
  if (error || !target) {
    return new Response('Link not found', { status: 404 })
  }

  return new Response(null, { status: 302, headers: { Location: target as string } })
})
