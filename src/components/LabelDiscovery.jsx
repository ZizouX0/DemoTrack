import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Badge, { tierVariant } from './Badge'
import { inputCls, selectCls } from './Field'

/* ── Constants ──────────────────────────────────────────────────── */
const ACCESS_LABELS = {
  cold_demo_friendly: 'Cold Demo Friendly',
  open_window_only: 'Open Window Only',
  needs_warm_intro: 'Needs Warm Intro',
  relationship_only: 'Relationship Only',
}

const ACCESS_OPTIONS = [
  ['cold_demo_friendly', 'Cold Demo Friendly'],
  ['open_window_only', 'Open Window Only'],
  ['needs_warm_intro', 'Needs Warm Intro'],
  ['relationship_only', 'Relationship Only'],
]

const TIER_OPTIONS = [
  ['elite', 'Elite'],
  ['a', 'A-tier'],
  ['b', 'B-tier'],
]

const METHOD_OPTIONS = [
  ['email', 'Email'],
  ['form', 'Form'],
  ['dm', 'DM'],
]

const TIER_RANK = { elite: 0, a: 1, b: 2 }
const ACCESS_RANK = {
  cold_demo_friendly: 0,
  open_window_only: 1,
  needs_warm_intro: 2,
  relationship_only: 3,
}

// Today is 2026-06-01 per spec; use real Date so it stays correct after
const TODAY = new Date()
const SIX_MONTHS_AGO = new Date(TODAY)
SIX_MONTHS_AGO.setMonth(SIX_MONTHS_AGO.getMonth() - 6)

function isFresh(lastVerified) {
  if (!lastVerified) return false
  return new Date(lastVerified) >= SIX_MONTHS_AGO
}

function methodIcon(method) {
  if (method === 'email') return '✉'
  if (method === 'form') return '⊞'
  if (method === 'dm') return '◎'
  return '—'
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* ── Sort labels: cold_demo_friendly first, then by tier, then name ── */
function sortLabels(labels) {
  return [...labels].sort((a, b) => {
    const ar = ACCESS_RANK[a.access_path] ?? 9
    const br = ACCESS_RANK[b.access_path] ?? 9
    if (ar !== br) return ar - br
    const tr = (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9)
    if (tr !== 0) return tr
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/* ── FilterChips ────────────────────────────────────────────────── */
function FilterChips({ groupLabel, options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={groupLabel}>
      <button
        type="button"
        onClick={() => onChange('')}
        className={[
          'rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider transition-colors',
          value === ''
            ? 'border-accent/50 bg-accent/15 text-accent'
            : 'border-line bg-surface-2 text-muted hover:border-line/60 hover:text-text',
        ].join(' ')}
      >
        All
      </button>
      {options.map(([val, lbl]) => (
        <button
          key={val}
          type="button"
          onClick={() => onChange(value === val ? '' : val)}
          className={[
            'rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider transition-colors',
            value === val
              ? 'border-accent/50 bg-accent/15 text-accent'
              : 'border-line bg-surface-2 text-muted hover:border-line/60 hover:text-text',
          ].join(' ')}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}

/* ── FreshnessBadge ─────────────────────────────────────────────── */
function FreshnessBadge({ lastVerified }) {
  if (isFresh(lastVerified)) {
    return (
      <Badge variant="ok">
        verified {fmtDate(lastVerified)}
      </Badge>
    )
  }
  return (
    <Badge variant="warn">
      {lastVerified ? `stale — ${fmtDate(lastVerified)}` : 'stale — re-verify'}
    </Badge>
  )
}

/* ── LabelCard ──────────────────────────────────────────────────── */
function LabelCard({ label, inCRM, submitted, onAdd, adding }) {
  const [reqOpen, setReqOpen] = useState(false)
  const reqId = `req-${label.id}`

  const contactPreview = label.contact_link
    ? label.contact_link.length > 40
      ? label.contact_link.slice(0, 40) + '…'
      : label.contact_link
    : null

  const contactHref =
    label.submission_method === 'email' && label.contact_link
      ? `mailto:${label.contact_link}`
      : label.contact_link || null

  return (
    <article
      className="rounded-card border border-line bg-surface p-4 space-y-3"
      aria-label={label.name}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="truncate font-display font-bold leading-tight text-text">
            {label.name}
          </h3>

          <div className="flex flex-wrap gap-1.5">
            {label.tier && (
              <Badge variant={tierVariant(label.tier)}>
                {label.tier === 'elite' ? 'Elite' : label.tier === 'a' ? 'A-tier' : 'B-tier'}
              </Badge>
            )}
            {label.access_path && (
              <Badge variant="muted">
                {ACCESS_LABELS[label.access_path] ?? label.access_path}
              </Badge>
            )}
            {label.submission_method && (
              <Badge variant="muted">
                {methodIcon(label.submission_method)} {label.submission_method}
              </Badge>
            )}
            {inCRM && (
              <Badge variant="ok">In CRM</Badge>
            )}
            {submitted && (
              <Badge variant="accent">submitted</Badge>
            )}
          </div>
        </div>

        {/* Add / Added button */}
        <div className="shrink-0">
          {inCRM ? (
            <span
              aria-label="Already in CRM"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs font-semibold text-ok cursor-default select-none"
            >
              <IconCheck className="size-3.5" />
              Added
            </span>
          ) : (
            <button
              type="button"
              disabled={adding}
              onClick={() => onAdd(label)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {adding ? (
                <>
                  <IconSpinner className="size-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <IconPlus className="size-3.5" />
                  Add to CRM
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Contact link */}
      {contactHref && contactPreview && (
        <a
          href={contactHref}
          target={label.submission_method !== 'email' ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <IconLink className="size-3.5" />
          {contactPreview}
        </a>
      )}

      {/* Genre tags */}
      {label.genre_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {label.genre_tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-line/60 bg-surface-2 px-1.5 py-0.5 text-[0.6rem] font-medium text-muted/80 uppercase tracking-wider"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Why line */}
      {label.why && (
        <p className="text-xs text-muted leading-relaxed">{label.why}</p>
      )}

      {/* Freshness badge */}
      <div>
        <FreshnessBadge lastVerified={label.last_verified} />
      </div>

      {/* Submission requirements — collapsible */}
      {label.submission_requirements && (
        <div>
          <button
            type="button"
            aria-expanded={reqOpen}
            aria-controls={reqId}
            onClick={() => setReqOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted/70 hover:text-muted transition-colors"
          >
            <IconChevron
              className={['size-3 transition-transform', reqOpen ? 'rotate-180' : ''].join(' ')}
            />
            Submission requirements
          </button>
          {reqOpen && (
            <p
              id={reqId}
              className="mt-1.5 rounded-lg border border-line/60 bg-surface-2 px-3 py-2.5 text-xs text-text/80 leading-relaxed"
            >
              {label.submission_requirements}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

/* ── Main LabelDiscovery component ──────────────────────────────── */
export default function LabelDiscovery() {
  const { user } = useAuth()

  // Master data
  const [labels, setLabels] = useState([])
  const [labelsLoading, setLabelsLoading] = useState(true)
  const [labelsError, setLabelsError] = useState(null)

  // CRM state: Set of label_ids already in CRM, and Set of contact_ids that have submissions
  const [crmLabelMap, setCrmLabelMap] = useState(new Map()) // label_id → contact_id
  const [submittedContactIds, setSubmittedContactIds] = useState(new Set())
  const [statusLoading, setStatusLoading] = useState(true)

  // Per-card adding state: Set of label IDs currently being inserted
  const [addingIds, setAddingIds] = useState(new Set())

  // Filters
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [freshnessFilter, setFreshnessFilter] = useState('') // '' | 'fresh' | 'stale'

  const searchRef = useRef(null)

  /* ── Load labels ─────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false
    async function fetchLabels() {
      setLabelsLoading(true)
      setLabelsError(null)
      const { data, error: err } = await supabase
        .from('labels')
        .select(
          'id, name, tier, access_path, submission_method, contact_link, genre_tags, submission_requirements, sources, why, last_verified'
        )
        .order('name', { ascending: true })
      if (cancelled) return
      if (err) {
        setLabelsError(err.message)
      } else {
        setLabels(data ?? [])
      }
      setLabelsLoading(false)
    }
    fetchLabels()
    return () => { cancelled = true }
  }, [])

  /* ── Load CRM status (contacts with label_id + submitted contact ids) ── */
  const loadCRMStatus = useCallback(async () => {
    if (!user?.id) return
    setStatusLoading(true)
    const [contactsRes, subsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, label_id')
        .eq('user_id', user.id)
        .not('label_id', 'is', null),
      supabase
        .from('submissions')
        .select('contact_id')
        .eq('user_id', user.id),
    ])

    // Build label_id → contact_id map
    if (!contactsRes.error && contactsRes.data) {
      const map = new Map()
      for (const row of contactsRes.data) {
        if (row.label_id) map.set(row.label_id, row.id)
      }
      setCrmLabelMap(map)
    }

    // Build set of contact_ids that have at least one submission
    if (!subsRes.error && subsRes.data) {
      setSubmittedContactIds(new Set(subsRes.data.map((r) => r.contact_id)))
    }

    setStatusLoading(false)
  }, [user?.id])

  useEffect(() => { loadCRMStatus() }, [loadCRMStatus])

  /* ── Add to CRM ──────────────────────────────────────────────── */
  async function handleAdd(label) {
    if (addingIds.has(label.id)) return
    setAddingIds((prev) => new Set(prev).add(label.id))

    const row = {
      user_id: user.id,
      name: label.name,
      category: 'label',
      submission_method: label.submission_method ?? null,
      email: label.submission_method === 'email' ? (label.contact_link ?? null) : null,
      portal_url: label.submission_method === 'form' ? (label.contact_link ?? null) : null,
      dm_link: label.submission_method === 'dm' ? (label.contact_link ?? null) : null,
      access_path: label.access_path ?? null,
      relationship_stage: 'cold',
      label_id: label.id,
      notes: label.submission_requirements ?? null,
    }

    const { data, error: err } = await supabase
      .from('contacts')
      .insert(row)
      .select('id, label_id')
      .single()

    if (!err && data) {
      // Optimistically update status — no reload needed
      setCrmLabelMap((prev) => new Map(prev).set(data.label_id, data.id))
    }

    setAddingIds((prev) => {
      const next = new Set(prev)
      next.delete(label.id)
      return next
    })
  }

  /* ── Filter + sort ───────────────────────────────────────────── */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const result = labels.filter((l) => {
      if (q) {
        const matchName = l.name.toLowerCase().includes(q)
        const matchGenre = (l.genre_tags ?? []).some((g) => g.toLowerCase().includes(q))
        if (!matchName && !matchGenre) return false
      }
      if (tierFilter && l.tier !== tierFilter) return false
      if (accessFilter && l.access_path !== accessFilter) return false
      if (methodFilter && l.submission_method !== methodFilter) return false
      if (freshnessFilter === 'fresh' && !isFresh(l.last_verified)) return false
      if (freshnessFilter === 'stale' && isFresh(l.last_verified)) return false
      return true
    })

    return sortLabels(result)
  }, [labels, search, tierFilter, accessFilter, methodFilter, freshnessFilter])

  const hasActiveFilters = search || tierFilter || accessFilter || methodFilter || freshnessFilter

  function clearAllFilters() {
    setSearch('')
    setTierFilter('')
    setAccessFilter('')
    setMethodFilter('')
    setFreshnessFilter('')
    searchRef.current?.focus()
  }

  /* ── Render ──────────────────────────────────────────────────── */
  const isLoading = labelsLoading || statusLoading

  return (
    <div className="space-y-5">
      {/* Search bar */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          ref={searchRef}
          type="search"
          id="discovery-search"
          aria-label="Search labels by name or genre"
          placeholder="Search by name or genre tag…"
          className={`${inputCls} pl-9`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter rows */}
      <div className="space-y-2.5">
        <FilterChips
          groupLabel="Filter by tier"
          options={TIER_OPTIONS}
          value={tierFilter}
          onChange={setTierFilter}
        />
        <FilterChips
          groupLabel="Filter by access path"
          options={ACCESS_OPTIONS}
          value={accessFilter}
          onChange={setAccessFilter}
        />
        <FilterChips
          groupLabel="Filter by submission method"
          options={METHOD_OPTIONS}
          value={methodFilter}
          onChange={setMethodFilter}
        />

        {/* Freshness filter — select, not chips, to save space */}
        <div className="flex items-center gap-2">
          <label htmlFor="freshness-filter" className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Freshness
          </label>
          <select
            id="freshness-filter"
            className={`${selectCls} max-w-[14rem]`}
            value={freshnessFilter}
            onChange={(e) => setFreshnessFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="fresh">Verified in last 6 months</option>
            <option value="stale">Stale / unverified</option>
          </select>
        </div>
      </div>

      {/* Result count + clear */}
      <div className="flex items-center justify-between gap-2 min-h-[1.5rem]">
        {!isLoading && !labelsError && (
          <p className="text-xs text-muted">
            {filtered.length === labels.length
              ? `${labels.length} labels`
              : `${filtered.length} of ${labels.length} labels`}
          </p>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="ml-auto text-[0.65rem] font-semibold uppercase tracking-wider text-muted/70 hover:text-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading label directory">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-card border border-line bg-surface"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {!isLoading && labelsError && (
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Failed to load labels: {labelsError}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !labelsError && filtered.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 px-4 py-10 text-center space-y-2">
          <p className="font-display font-bold text-text">No labels found</p>
          <p className="text-sm text-muted">
            {labels.length === 0
              ? 'The label directory is empty.'
              : 'Try adjusting your search or filters.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="mt-1 rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Label cards */}
      {!isLoading && !labelsError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((label) => {
            const contactId = crmLabelMap.get(label.id)
            const inCRM = contactId !== undefined
            const submitted = inCRM && submittedContactIds.has(contactId)
            return (
              <LabelCard
                key={label.id}
                label={label}
                inCRM={inCRM}
                submitted={submitted}
                onAdd={handleAdd}
                adding={addingIds.has(label.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Inline SVG icons ────────────────────────────────────────────── */
function svgBase(props) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    ...props,
  }
}

function IconPlus(props) {
  return <svg {...svgBase(props)}><path d="M12 5v14M5 12h14" /></svg>
}

function IconCheck(props) {
  return <svg {...svgBase(props)}><path d="M20 6 9 17l-5-5" /></svg>
}

function IconLink(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function IconSearch(props) {
  return (
    <svg {...svgBase(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function IconChevron(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function IconSpinner(props) {
  return (
    <svg {...svgBase({ strokeWidth: 2, ...props })}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
