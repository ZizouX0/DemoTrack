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

export const isSupabaseConfigured = Boolean(url && anonKey)

// Use a syntactically valid placeholder when unconfigured: createClient throws
// ("supabaseUrl is required") on an empty string, which would crash the whole
// app at import before the UI can show a helpful message. The placeholder lets
// the module load; `isSupabaseConfigured` gates any real auth/data calls.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    // Email + password auth: persist the session so you stay signed in on this
    // device. No magic links, so we don't parse auth tokens from the URL.
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)
