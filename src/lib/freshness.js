/**
 * Data-freshness logic — the single source of truth for how a label's
 * verification age is bucketed and badged. Used by Label Discovery and Send
 * Demo so the signal is identical everywhere a producer makes a decision.
 *
 * Inputs come from the `label_freshness` view:
 *   effective_verified — better of seed last_verified and the user's own check
 *   flagged_broken     — user reported the route broken/changed/closed
 *   link_status        — automated cron link check ('ok' | 'broken' | 'timeout')
 */

export const FRESH_DAYS = 180 // ≤ 6 months → fresh
export const AGING_DAYS = 365 // ≤ 12 months → aging, beyond → stale

/** Days between an ISO/date string and now (floored). null-safe. */
export function daysSince(dateLike) {
  if (!dateLike) return null
  const t = new Date(dateLike).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/**
 * Reduce the better of two verification dates.
 * Either argument may be null/undefined.
 */
export function effectiveVerified(lastVerified, myVerifiedAt) {
  const a = lastVerified ? new Date(lastVerified).getTime() : null
  const b = myVerifiedAt ? new Date(myVerifiedAt).getTime() : null
  if (a == null && b == null) return null
  return new Date(Math.max(a ?? -Infinity, b ?? -Infinity)).toISOString()
}

/**
 * Bucket a label into a freshness status.
 * Accepts the shape returned by the label_freshness view (or a plain label
 * with last_verified). `broken` always wins — a known-dead route is worse
 * than an old-but-maybe-fine one.
 *
 * @returns 'fresh' | 'aging' | 'stale' | 'broken' | 'unverified'
 */
export function freshnessStatus(input = {}) {
  const {
    effective_verified,
    last_verified,
    my_verified_at,
    flagged_broken,
    link_status,
  } = input

  if (flagged_broken || link_status === 'broken') return 'broken'

  const eff =
    effective_verified ?? effectiveVerified(last_verified, my_verified_at)
  const days = daysSince(eff)
  if (days == null) return 'unverified'
  if (days <= FRESH_DAYS) return 'fresh'
  if (days <= AGING_DAYS) return 'aging'
  return 'stale'
}

/** Badge variant + short label per status (matches Badge.jsx variants). */
export const FRESHNESS_META = {
  fresh: { variant: 'ok', label: 'Verified' },
  aging: { variant: 'warn', label: 'Aging' },
  stale: { variant: 'danger', label: 'Stale' },
  broken: { variant: 'danger', label: 'Route reported' },
  unverified: { variant: 'muted', label: 'Unverified' },
}

/** True for the two statuses a producer should re-check before relying on. */
export function needsRecheck(status) {
  return status === 'stale' || status === 'broken' || status === 'unverified'
}

/** Format a date for badges, e.g. "14 Mar 2026". null-safe. */
export function fmtVerified(dateLike) {
  if (!dateLike) return null
  const d = new Date(dateLike)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
