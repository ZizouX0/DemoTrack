import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { Wordmark } from '../components/Splash'

export default function Login() {
  const { user, signInWithEmail } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    setError('')
    const { error } = await signInWithEmail(email.trim())
    if (error) {
      setError(error.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
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
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>.
          </p>
        )}

        {status === 'sent' ? (
          <div className="rounded-card border border-line bg-surface p-5 text-center">
            <p className="font-display text-lg">Check your inbox</p>
            <p className="mt-1 text-sm text-muted">
              We sent a magic link to <span className="text-text">{email}</span>. Tap it to sign in.
            </p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-4 text-xs text-accent hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : (
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
              disabled={status === 'sending'}
              className="mt-4 w-full rounded-lg bg-accent py-2.5 font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              No password. We email you a one-tap sign-in link.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
