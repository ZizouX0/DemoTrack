import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

// Single-user, no-login mode. The app no longer authenticates against Supabase;
// it pins to one fixed owner (the original account) so all existing data stays
// owned and the per-user views keep matching. The email is stored locally and
// used only for display / as the artist-name fallback.
//
// SECURITY: paired with RLS being disabled in the database, anyone with the URL
// can read/write this data. Acceptable only for a private, unlisted deployment.
export const OWNER_ID = '5463fb44-8fb7-4f0c-872b-7787640cd676'
const PROFILE_KEY = 'demotrack:profile'

function readEmail() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')?.email ?? null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [email, setEmail] = useState(readEmail)

  // "Sign in" just remembers the email — no link, no password, instant.
  const signInWithEmail = useCallback((value) => {
    const clean = (value ?? '').trim()
    if (!clean) return Promise.resolve({ error: { message: 'Enter your email.' } })
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: clean }))
    setEmail(clean)
    return Promise.resolve({ error: null })
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(PROFILE_KEY)
    setEmail(null)
    return Promise.resolve()
  }, [])

  const user = useMemo(
    () => (email ? { id: OWNER_ID, email } : null),
    [email]
  )

  const value = useMemo(
    () => ({
      session: user ? { user } : null,
      user,
      loading: false,
      signInWithEmail,
      signOut,
    }),
    [user, signInWithEmail, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
