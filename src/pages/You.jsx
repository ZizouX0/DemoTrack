import { useAuth } from '../contexts/AuthContext'
import ModulePlaceholder from '../components/ModulePlaceholder'

export default function You() {
  const { user } = useAuth()
  return (
    <ModulePlaceholder
      phase={13}
      title="You"
      tagline="Press kit, work sessions, and goals — the solo-operator backbone."
    >
      <div className="space-y-3">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Signed in as</p>
          <p className="mt-0.5 text-text">{user?.email}</p>
        </div>
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center text-sm text-muted">
          Artist Press Kit, Work Sessions & Goals arrive in Phases 12–13.
        </div>
      </div>
    </ModulePlaceholder>
  )
}
