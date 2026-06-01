import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loud in dev if the project isn't configured — a silent null client
// produces confusing auth errors later.
if (!url || !anonKey) {
  console.warn(
    '[DemoTrack] Supabase env vars missing. Copy .env.example to .env.local and fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const isSupabaseConfigured = Boolean(url && anonKey)
