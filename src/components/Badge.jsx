/**
 * Status / category badge chip.
 * variant: 'accent' | 'ok' | 'warn' | 'danger' | 'muted' | 'info'
 */
export default function Badge({ children, variant = 'muted' }) {
  const cls = {
    accent: 'bg-accent/15 text-accent border-accent/30',
    ok: 'bg-ok/15 text-ok border-ok/30',
    warn: 'bg-warn/15 text-warn border-warn/30',
    danger: 'bg-danger/15 text-danger border-danger/30',
    muted: 'bg-surface-2 text-muted border-line',
    info: 'bg-surface-2 text-text border-line',
  }[variant] ?? 'bg-surface-2 text-muted border-line'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${cls}`}
    >
      {children}
    </span>
  )
}

/** Map track_status enum → badge variant */
export function trackStatusVariant(status) {
  return (
    { idea: 'muted', demo_ready: 'accent', submitted: 'warn', signed: 'ok' }[status] ?? 'muted'
  )
}

/** Map relationship_stage enum → badge variant */
export function stageVariant(stage) {
  return (
    { cold: 'muted', engaged: 'info', responded: 'warn', relationship: 'ok' }[stage] ?? 'muted'
  )
}

/** Map label tier → badge variant */
export function tierVariant(tier) {
  return { elite: 'accent', a: 'ok', b: 'info' }[tier] ?? 'muted'
}
