import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { Wordmark } from '../components/Splash'

export default function Login() {
  const { user, signInWithEmail } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | error
  const [error, setError] = useState('')

  // Already in — go where the guard sent us from, else home.
  if (user) return <Navigate to={location.state?.from?.pathname || '/'} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('saving')
    setError('')
    const { error } = await signInWithEmail(email.trim())
    if (error) {
      setError(error.message)
      setStatus('error')
    }
    // On success the `user` becomes set and we redirect via <Navigate> above.
  }

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <p className="mt-2 text-sm text-muted">Your silent manager. Ship your music.</p>
        </div>

        {!isSupabaseConfigured && (
          <p className="mb-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Supabase isn’t configured yet — set <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="rounded-card border border-line bg-surface p-5"
        >
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@studio.com"
            className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-text outline-none placeholder:text-muted/60 focus:border-accent"
          />
          {status === 'error' && (
            <p className="mt-2 text-xs text-danger">{error}</p>
          )}
          <button
            type="submit"
            disabled={status === 'saving'}
            className="mt-4 w-full rounded-lg bg-accent py-2.5 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === 'saving' ? 'Continuing…' : 'Continue'}
          </button>
          <p className="mt-3 text-center text-xs text-muted">
            No password, no email link — your email is just saved on this device.
          </p>
        </form>
      </div>
    </div>
  )
}
