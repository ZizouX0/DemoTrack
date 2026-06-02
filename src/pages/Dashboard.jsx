import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Badge from '../components/Badge'
import Field, { inputCls, selectCls } from '../components/Field'
import Modal from '../components/Modal'

// The dashboard is the connective tissue. Phase 6 adds the Follow-up queue.
const LOOP = ['Discover', 'Prepare', 'Generate', 'Send', 'Track', 'Follow-up', 'Learn']

/* ── Analytics helpers ──────────────────────────────────────── */

/** Status rank — passed is excluded from funnel progression */
const STATUS_RANK = { sent: 0, opened: 1, replied: 2, considering: 3, signed: 4 }

/**
 * Compute funnel counts from submissions array.
 * Each stage = submissions whose rank >= that stage (excluding passed above sent).
 */
function computeFunnel(submissions) {
  const total = submissions.length
  const nonPassed = submissions.filter((s) => s.status !== 'passed')
  const passedCount = submissions.filter((s) => s.status === 'passed').length

  const rank = (s) => STATUS_RANK[s.status] ?? 0

  return {
    sent: total,
    opened: nonPassed.filter((s) => rank(s) >= 1).length,
    replied: nonPassed.filter((s) => rank(s) >= 2).length,
    considering: nonPassed.filter((s) => rank(s) >= 3).length,
    signed: nonPassed.filter((s) => rank(s) >= 4).length,
    passed: passedCount,
  }
}

/**
 * Response rate by genre (explode genre_tags arrays).
 * responded = status in (replied, considering, signed)
 */
function computeByGenre(submissions) {
  const RESPONDED = new Set(['replied', 'considering', 'signed'])
  const map = {} // genre -> { sent, responded }
  for (const sub of submissions) {
    const tags = sub.tracks?.genre_tags ?? []
    const responded = RESPONDED.has(sub.status)
    for (const tag of tags) {
      if (!tag) continue
      if (!map[tag]) map[tag] = { genre: tag, sent: 0, responded: 0 }
      map[tag].sent += 1
      if (responded) map[tag].responded += 1
    }
  }
  return Object.values(map)
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 6)
}

/**
 * Response rate by label tier.
 * null tier grouped as 'unlabeled'.
 */
function computeByTier(submissions) {
  const RESPONDED = new Set(['replied', 'considering', 'signed'])
  const map = {} // tier -> { sent, responded }
  for (const sub of submissions) {
    const tier = sub.contacts?.labels?.tier ?? 'unlabeled'
    const responded = RESPONDED.has(sub.status)
    if (!map[tier]) map[tier] = { tier, sent: 0, responded: 0 }
    map[tier].sent += 1
    if (responded) map[tier].responded += 1
  }
  // Order: elite, a, b, unlabeled
  const order = ['elite', 'a', 'b', 'unlabeled']
  return order.filter((t) => map[t]).map((t) => map[t])
}

/** Compute current consecutive-day streak from an array of date strings */
function computeStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0

  // Collect distinct calendar days (YYYY-MM-DD) from occurred_on or created_at
  const days = new Set()
  for (const s of sessions) {
    const raw = s.occurred_on || s.created_at
    if (!raw) continue
    days.add(raw.slice(0, 10))
  }
  if (days.size === 0) return 0

  const sorted = Array.from(days).sort().reverse() // most recent first

  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = new Date(Date.now() - 864e5).toISOString().slice(0, 10)

  // Streak must start from today or yesterday
  if (sorted[0] !== todayStr && sorted[0] !== yesterdayStr) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diffDays = Math.round((prev - curr) / 864e5)
    if (diffDays === 1) {
      streak++
    } else {
      break
    }
  }
  return streak
}

/** Escape a single CSV field */
function csvField(val) {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/** Trigger a client-side CSV download */
function downloadCsv(rows, filename) {
  const header = ['sent_at', 'status', 'track_title', 'contact_name', 'method']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [r.sent_at, r.status, r.track_title, r.contact_name, r.method]
        .map(csvField)
        .join(',')
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/* ── Analytics sub-components ──────────────────────────────── */

function FunnelBar({ label, count, total, note }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const width = total > 0 ? `${Math.max((count / total) * 100, count > 0 ? 2 : 0)}%` : '0%'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums text-text">
          {count}
          <span className="ml-1.5 text-muted/70">
            {total > 0 ? `${pct}%` : '—'}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width }}
          role="img"
          aria-label={`${label}: ${count} (${pct}%)`}
        />
      </div>
      {note && <p className="text-[0.6rem] text-muted/50 italic">{note}</p>}
    </div>
  )
}

function RateRow({ label, sent, responded }) {
  const pct = sent > 0 ? Math.round((responded / sent) * 100) : null
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs border-b border-line/40 last:border-0">
      <span className="truncate text-muted max-w-[45%]">{label}</span>
      <span className="tabular-nums text-muted/70 shrink-0">
        {responded}/{sent}
      </span>
      <span
        className={[
          'tabular-nums font-semibold shrink-0 w-10 text-right',
          pct === null ? 'text-muted/50' : pct >= 15 ? 'text-ok' : pct >= 5 ? 'text-warn' : 'text-muted',
        ].join(' ')}
      >
        {pct === null ? '—' : `${pct}%`}
      </span>
    </div>
  )
}

const TIER_LABEL = { elite: 'Elite', a: 'A-list', b: 'B-list', unlabeled: 'Other' }

/* ── Analytics block ────────────────────────────────────────── */
function AnalyticsBlock() {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState(null) // null = loading
  const [streak, setStreak] = useState(null)           // null = loading
  const [error, setError] = useState(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      // Submissions with genre tags + label tier + track title + contact name
      const { data, error: subErr } = await supabase
        .from('submissions')
        .select(
          'id, status, sent_at, method, tracks(genre_tags, title), contacts(name, label_id, labels(tier))'
        )
        .eq('user_id', user.id)

      if (!active) return
      if (subErr) {
        setError(subErr.message)
        setSubmissions([])
      } else {
        setSubmissions(data ?? [])
      }

      // Work sessions — non-fatal
      try {
        const { data: wsData } = await supabase
          .from('work_sessions')
          .select('created_at, occurred_on')
        if (active) setStreak(computeStreak(wsData ?? []))
      } catch {
        if (active) setStreak(0)
      }
    }

    load()
    return () => { active = false }
  }, [user.id])

  async function handleExport() {
    setExporting(true)
    try {
      // Use already-loaded submissions, map to CSV rows
      const rows = (submissions ?? []).map((s) => ({
        sent_at: s.sent_at ?? '',
        status: s.status ?? '',
        track_title: s.tracks?.title ?? '',
        contact_name: s.contacts?.name ?? '',
        method: s.method ?? '',
      }))
      const today = new Date().toISOString().slice(0, 10)
      downloadCsv(rows, `demotrack-submissions-${today}.csv`)
    } finally {
      setExporting(false)
    }
  }

  // Loading skeleton
  if (submissions === null) {
    return (
      <div
        className="space-y-3 animate-pulse"
        aria-busy="true"
        aria-label="Loading analytics"
      >
        <div className="h-4 w-32 rounded-full bg-surface-2" />
        <div className="h-24 rounded-card border border-line bg-surface" />
        <div className="h-20 rounded-card border border-line bg-surface" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        Analytics unavailable: {error}
      </div>
    )
  }

  const funnel = computeFunnel(submissions)
  const byGenre = computeByGenre(submissions)
  const byTier = computeByTier(submissions)
  const totalSent = funnel.sent
  const totalResponded = funnel.replied + funnel.considering + funnel.signed
  const overallRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : null

  return (
    <div className="space-y-4">
      {/* ── 1. Conversion funnel ── */}
      <div className="rounded-card border border-line bg-surface p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Your funnel</p>
          {totalSent > 0 && (
            <span className="text-[0.65rem] text-muted/70 tabular-nums">
              {totalSent} total sent
            </span>
          )}
        </div>

        {totalSent === 0 ? (
          <p className="py-2 text-center text-xs text-muted/60">
            No submissions yet —{' '}
            <Link to="/send" className="text-accent hover:underline">
              send a demo
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            <FunnelBar label="Sent" count={funnel.sent} total={totalSent} />
            <FunnelBar
              label="Opened"
              count={funnel.opened}
              total={totalSent}
              note="Populates once link tracking is active (Phase 11)"
            />
            <FunnelBar label="Replied" count={funnel.replied} total={totalSent} />
            <FunnelBar label="Considering" count={funnel.considering} total={totalSent} />
            <FunnelBar label="Signed" count={funnel.signed} total={totalSent} />
            {funnel.passed > 0 && (
              <div className="flex items-center justify-between pt-1 text-xs border-t border-line/40">
                <span className="text-muted/60">Passed (no)</span>
                <span className="tabular-nums text-muted/60">{funnel.passed}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. Response rates ── */}
      {totalSent > 0 && (
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Response rates
          </p>
          <p className="text-[0.65rem] text-muted/60 leading-relaxed">
            Cold-demo rates of 5–15% are normal — low numbers reflect the industry, not your demos.
          </p>

          {/* Overall */}
          <div className="flex items-center justify-between py-1.5 text-xs border-b border-line/40">
            <span className="font-medium text-text">Overall</span>
            <span className="tabular-nums text-muted/70">{totalResponded}/{totalSent}</span>
            <span
              className={[
                'tabular-nums font-semibold w-10 text-right',
                overallRate === null
                  ? 'text-muted/50'
                  : overallRate >= 15
                  ? 'text-ok'
                  : overallRate >= 5
                  ? 'text-warn'
                  : 'text-muted',
              ].join(' ')}
            >
              {overallRate === null ? '—' : `${overallRate}%`}
            </span>
          </div>

          {/* By genre */}
          {byGenre.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50 pb-1">
                By genre
              </p>
              {byGenre.map((g) => (
                <RateRow
                  key={g.genre}
                  label={g.genre}
                  sent={g.sent}
                  responded={g.responded}
                />
              ))}
            </div>
          )}

          {/* By tier */}
          {byTier.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest text-muted/50 pb-1">
                By label tier
              </p>
              {byTier.map((t) => (
                <RateRow
                  key={t.tier}
                  label={TIER_LABEL[t.tier] ?? t.tier}
                  sent={t.sent}
                  responded={t.responded}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 3. Streak + Export row ── */}
      <div className="flex items-center justify-between gap-3">
        {/* Streak */}
        <div className="flex items-center gap-2 text-sm">
          {streak === null || streak === 0 ? (
            <span className="text-xs text-muted/60">No sessions logged yet</span>
          ) : (
            <>
              <span aria-hidden="true" className="text-base leading-none">🔥</span>
              <span className="font-display font-bold text-text">
                {streak}-day streak
              </span>
            </>
          )}
        </div>

        {/* CSV export */}
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || totalSent === 0}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Export submissions as CSV"
        >
          <IconDownload className="size-3.5" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}

/* ── helpers ────────────────────────────────────────────────── */
function daysSince(isoString) {
  if (!isoString) return null
  const diff = Date.now() - new Date(isoString).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Variant for follow-up state badge */
function stateVariant(state) {
  if (state === 'overdue') return 'danger'
  if (state === 'due') return 'accent'
  return 'muted'
}

/** Variant + label for the submission method badge */
function methodVariant(method) {
  if (method === 'email') return 'info'
  if (method === 'form') return 'warn'
  if (method === 'dm') return 'accent'
  return 'muted'
}

/* ── Reply modal ────────────────────────────────────────────── */
const RESPONSE_LABELS = {
  yes: 'Yes — interested',
  no: 'No thanks',
  not_for_us: 'Not for us',
  constructive: 'Constructive feedback',
}

function ReplyModal({ item, onClose, onSuccess }) {
  const { user } = useAuth()
  const [responseType, setResponseType] = useState('yes')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const now = new Date().toISOString()

    // INSERT into feedback
    const { error: fbErr } = await supabase.from('feedback').insert({
      user_id: user.id,
      track_id: item.track_id,
      contact_id: item.contact_id,
      submission_id: item.submission_id,
      response_type: responseType,
      body: body.trim() || null,
    })

    if (fbErr) {
      setError(fbErr.message)
      setSubmitting(false)
      return
    }

    // UPDATE submissions status → replied
    const { error: subErr } = await supabase
      .from('submissions')
      .update({ status: 'replied', updated_at: now })
      .eq('id', item.submission_id)
      .eq('user_id', user.id)

    if (subErr) {
      setError(subErr.message)
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSuccess(item.submission_id)
  }

  return (
    <Modal open title="Log a reply" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-muted">
          <span className="font-medium text-text">{item.track_title}</span>
          {' → '}
          <span className="font-medium text-text">{item.contact_name}</span>
        </div>

        <Field id="response-type" label="Their response" required>
          <select
            id="response-type"
            className={selectCls}
            value={responseType}
            onChange={(e) => setResponseType(e.target.value)}
            required
          >
            {Object.entries(RESPONSE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="reply-body"
          label="Paste their reply"
          hint="Optional — paste the actual message for your records."
        >
          <textarea
            id="reply-body"
            rows={4}
            className={inputCls}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Paste what they wrote…"
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save reply'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ── Queue item card ────────────────────────────────────────── */
function QueueCard({ item, onReply, onSnooze }) {
  const days = daysSince(item.sent_at)

  // Build the "open channel" link
  let openHref = null
  if (item.method === 'email' && item.contact_email) {
    openHref = `mailto:${item.contact_email}`
  } else if (item.method === 'form' && item.portal_url) {
    openHref = item.portal_url
  } else if (item.method === 'dm' && item.dm_link) {
    openHref = item.dm_link
  }

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display font-bold text-sm text-text leading-tight">
            {item.track_title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {item.contact_name}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 justify-end">
          <Badge variant={methodVariant(item.method)}>{item.method}</Badge>
          <Badge variant={stateVariant(item.state)}>
            {item.state === 'overdue' ? 'Overdue' : 'Due'}
          </Badge>
        </div>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-xs text-muted">
        {days !== null && (
          <span>
            sent{' '}
            <span className="font-medium text-text">
              {days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`}
            </span>
          </span>
        )}
        {item.state === 'overdue' && item.no_response_logged && (
          <span className="text-muted/60 italic">no-response logged</span>
        )}
        {openHref && (
          <a
            href={openHref}
            target={item.method !== 'email' ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted transition-colors hover:border-accent/40 hover:text-accent"
            aria-label={`Open ${item.method} channel for ${item.contact_name}`}
          >
            <IconExternalLink className="size-3" />
            Open
          </a>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onReply(item)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-ok/30 bg-ok/10 py-2 text-xs font-semibold text-ok transition-colors hover:bg-ok/20"
        >
          <IconCheck className="size-3.5" />
          Got a reply
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 py-2 text-xs font-semibold text-muted transition-colors hover:border-text hover:text-text"
        >
          <IconClock className="size-3.5" />
          Still silent
        </button>
      </div>
    </article>
  )
}

/* ── Group header ───────────────────────────────────────────── */
function GroupHeader({ label, count, variant }) {
  return (
    <div className="flex items-center gap-2">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <span
        className={[
          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold',
          variant === 'danger'
            ? 'bg-danger/15 text-danger'
            : 'bg-accent/15 text-accent',
        ].join(' ')}
      >
        {count}
      </span>
    </div>
  )
}

/* ── Skeleton loader ────────────────────────────────────────── */
function QueueSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading follow-ups">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="h-28 animate-pulse rounded-card border border-line bg-surface"
        />
      ))}
    </div>
  )
}

/* ── Follow-up queue section ────────────────────────────────── */
function FollowUpQueue() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [replyItem, setReplyItem] = useState(null) // item being replied to

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('follow_up_queue')
      .select('*')
    if (qErr) {
      setError(qErr.message)
    } else {
      // Sort each group by sent_at ascending (oldest first) — done after grouping
      setQueue(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Optimistically remove an item after action
  function removeItem(submissionId) {
    setQueue((prev) => prev.filter((i) => i.submission_id !== submissionId))
  }

  async function handleSnooze(item) {
    // Optimistic: remove from local list (it becomes 'waiting' after snooze)
    removeItem(item.submission_id)

    const now = new Date().toISOString()
    await supabase
      .from('submissions')
      .update({ follow_up_due_at: addDays(7), updated_at: now })
      .eq('id', item.submission_id)
      .eq('user_id', user.id)
    // No need to reload — item is already gone from the local list
  }

  function handleReplySuccess(submissionId) {
    removeItem(submissionId)
    setReplyItem(null)
  }

  if (loading) return <QueueSkeleton />

  if (error) {
    return (
      <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        Failed to load follow-ups: {error}
        <button
          type="button"
          onClick={load}
          className="mt-2 block text-xs underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    )
  }

  // Separate by state — hide 'waiting' but count them
  const overdue = queue
    .filter((i) => i.state === 'overdue')
    .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
  const due = queue
    .filter((i) => i.state === 'due')
    .sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at))
  const waitingCount = queue.filter((i) => i.state === 'waiting').length

  const hasActionable = overdue.length > 0 || due.length > 0

  if (!hasActionable && waitingCount === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center">
        <p className="text-sm text-muted">Nothing to follow up — send some demos</p>
        <Link
          to="/send"
          className="mt-2 inline-block text-sm font-semibold text-accent hover:underline"
        >
          Send a demo &rarr;
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Overdue group */}
        {overdue.length > 0 && (
          <div className="space-y-2">
            <GroupHeader label="Overdue" count={overdue.length} variant="danger" />
            {overdue.map((item) => (
              <QueueCard
                key={item.submission_id}
                item={item}
                onReply={setReplyItem}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}

        {/* Due group */}
        {due.length > 0 && (
          <div className="space-y-2">
            <GroupHeader label="Due" count={due.length} variant="accent" />
            {due.map((item) => (
              <QueueCard
                key={item.submission_id}
                item={item}
                onReply={setReplyItem}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}

        {/* Waiting count */}
        {waitingCount > 0 && (
          <p className="text-center text-xs text-muted/60">
            {waitingCount} more send{waitingCount !== 1 ? 's' : ''} waiting — nothing due yet
          </p>
        )}
      </div>

      {/* Reply modal */}
      {replyItem && (
        <ReplyModal
          item={replyItem}
          onClose={() => setReplyItem(null)}
          onSuccess={handleReplySuccess}
        />
      )}
    </>
  )
}

/* ── Page ───────────────────────────────────────────────────── */
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

      {/* Phase 6: Follow-up queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Follow-ups</h2>
        </div>
        <FollowUpQueue />
      </div>

      {/* Phase 9: Analytics — funnel + response rates + streak + export */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">Analytics</h2>
        <AnalyticsBlock />
      </div>
    </section>
  )
}

/* ── Inline icons ───────────────────────────────────────────── */
function svgBase(props) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    ...props,
  }
}

function IconCheck(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function IconClock(props) {
  return (
    <svg {...svgBase(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function IconExternalLink(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

function IconDownload(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
