import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Email + password sign-in. No email link — the session is created instantly
  // and persisted, so you stay signed in on this device.
  const signInWithPassword = useCallback(
    (email, password) =>
      supabase.auth.signInWithPassword({
        email: (email ?? '').trim(),
        password: password ?? '',
      }),
    []
  )

  // Update the signed-in user's password.
  const updatePassword = useCallback(
    (password) => supabase.auth.updateUser({ password }),
    []
  )

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword,
      updatePassword,
      signOut,
    }),
    [session, loading, signInWithPassword, updatePassword, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
