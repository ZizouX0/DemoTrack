/* Phase 1 ships the shell; each module lands in its own phase. This keeps the
   navigation real and honest about what's coming next. */
export default function ModulePlaceholder({ title, tagline, phase, children }) {
  return (
    <section>
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">
          Phase {phase}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">{title}</h1>
        {tagline && <p className="mt-1 text-sm text-muted">{tagline}</p>}
      </header>
      {children ?? (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center text-sm text-muted">
          Coming in Phase {phase}.
        </div>
      )}
    </section>
  )
}
