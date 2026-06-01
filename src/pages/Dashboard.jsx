import { useAuth } from '../contexts/AuthContext'

// The dashboard is the connective tissue (full build: Phase 9). Phase 1 shows a
// grounded welcome + the core loop so the home screen is real from day one.
const LOOP = ['Discover', 'Prepare', 'Generate', 'Send', 'Track', 'Follow-up', 'Learn']

export default function Dashboard() {
  const { user } = useAuth()
  const name = user?.email?.split('@')[0] ?? 'producer'

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm text-muted">Welcome back,</p>
        <h1 className="text-2xl font-extrabold">{name}</h1>
      </header>

      <div className="rounded-card border border-line bg-surface p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">The loop</p>
        <p className="mt-1 text-sm text-muted">
          Run this for every track. The app makes each step fast and remembers the state.
        </p>
        <ol className="mt-4 flex flex-wrap gap-2">
          {LOOP.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs"
            >
              <span className="font-display font-bold text-accent">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center text-sm text-muted">
        Your demos-to-send, follow-ups due, and conversion funnel light up here as you
        build out the modules. <span className="text-text">(Dashboard — Phase 9.)</span>
      </div>
    </section>
  )
}
