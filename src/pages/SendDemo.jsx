import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { norm } from '../lib/labelNorm'
import { freshnessStatus, FRESHNESS_META, needsRecheck } from '../lib/freshness'
import Badge, { trackStatusVariant, tierVariant } from '../components/Badge'
import Field, { inputCls, selectCls } from '../components/Field'
import { buildPressKitUrl } from '../lib/pressKit'

/* ── constants ─────────────────────────────────────────────── */
const STATUS_LABELS = {
  idea: 'Idea',
  demo_ready: 'Demo Ready',
  submitted: 'Submitted',
  signed: 'Signed',
}
const CATEGORY_LABELS = {
  label: 'Label',
  dj: 'DJ',
  ar: 'A&R',
  curator: 'Curator',
  blog: 'Blog',
  promoter: 'Promoter',
  radio: 'Radio',
}
const KIND_LABELS = {
  cold_email: 'Cold Email',
  dm: 'DM',
  follow_up: 'Follow-up',
  form_note: 'Form Note',
}
const KIND_VARIANT = {
  cold_email: 'accent',
  dm: 'info',
  follow_up: 'warn',
  form_note: 'muted',
}

const ACCESS_LABELS = {
  cold_demo_friendly: 'Cold OK',
  open_window_only: 'Open Window',
  needs_warm_intro: 'Warm Intro',
  relationship_only: 'Relationship',
}

const TIER_RANK = { elite: 0, a: 1, b: 2 }
const ACCESS_RANK = {
  cold_demo_friendly: 0,
  open_window_only: 1,
  needs_warm_intro: 2,
  relationship_only: 3,
}

const RECENT_HOOKS_KEY = 'demotrack:recent_hooks'
const MAX_RECENT_HOOKS = 5

/* ── localStorage helpers ───────────────────────────────────── */
function getRecentHooks() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_HOOKS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function pushRecentHook(hook) {
  if (!hook?.trim()) return
  const trimmed = hook.trim()
  const existing = getRecentHooks().filter((h) => h !== trimmed)
  const next = [trimmed, ...existing].slice(0, MAX_RECENT_HOOKS)
  localStorage.setItem(RECENT_HOOKS_KEY, JSON.stringify(next))
}

/* ── merge-field fill ───────────────────────────────────────── */
function fillMergeFields(text, { track, contact, pressKit, artistName, hook }) {
  if (!text) return ''

  const genre = track?.genre_tags?.[0] ?? 'house'
  const trackTitle = track?.title ?? ''
  const labelName = contact?.name ?? ''
  const firstName = (contact?.name ?? '').split(' ')[0] || labelName
  const resolvedArtist = artistName || ''
  const bpm = track?.bpm != null ? String(track.bpm) : null
  const key = track?.musical_key ?? null
  const listenLink = track?.listen_link ?? null
  const pressKitLink =
    pressKit?.slug ? buildPressKitUrl(pressKit.slug) : null

  let result = text
    .replace(/\{genre\}/g, genre)
    .replace(/\{track_title\}/g, trackTitle)
    .replace(/\{label\}/g, labelName)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{artist_name\}/g, resolvedArtist)
    .replace(/\{hook\}/g, hook ?? '')

  if (bpm) {
    result = result.replace(/\{bpm\}/g, bpm)
  } else {
    result = result
      .replace(/\{bpm\}\s*BPM[,·\s]*/g, '')
      .replace(/\{bpm\}/g, '')
  }

  if (key) {
    result = result.replace(/\{key\}/g, key)
  } else {
    result = result.replace(/[,·]\s*\{key\}/g, '').replace(/\{key\}/g, '')
  }

  if (listenLink) {
    result = result.replace(/\{listen_link\}/g, listenLink)
  } else {
    // Remove the token; only drop the whole line if nothing meaningful remains
    // (i.e. only whitespace, punctuation, or a short label prefix like "Listen:").
    result = result
      .split('\n')
      .map((line) => {
        if (!line.includes('{listen_link}')) return line
        const stripped = line.replace(/\{listen_link\}/g, '').trim()
        // Drop line when it's empty or only a short label prefix remains
        if (!stripped || /^(listen|link)\s*[:：]?\s*$/i.test(stripped)) return null
        // Otherwise keep the line with the token replaced by an empty string
        return line.replace(/\{listen_link\}/g, '')
      })
      .filter((line) => line !== null)
      .join('\n')
  }

  if (pressKitLink) {
    result = result.replace(/\{press_kit_link\}/g, pressKitLink)
  } else {
    result = result
      .split('\n')
      .filter((line) => !line.includes('{press_kit_link}'))
      .join('\n')
  }

  result = result.replace(/\n{3,}/g, '\n\n').trim()

  return result
}

function stripSubjectLine(body) {
  return body.replace(/^Subject:.*\n?/i, '').trim()
}

function buildMailtoUrl(email, subject, body) {
  return (
    `mailto:${encodeURIComponent(email)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  )
}

function buildGmailUrl(email, subject, body) {
  return (
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(email)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  )
}

function addDays(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/* ── Sort targets: cold_demo_friendly first, then tier, then name ── */
function sortTargets(targets) {
  return [...targets].sort((a, b) => {
    // CRM contacts come first (they have an id)
    const aInCRM = a.id ? 0 : 1
    const bInCRM = b.id ? 0 : 1
    if (aInCRM !== bInCRM) return aInCRM - bInCRM

    const ar = ACCESS_RANK[a.access_path ?? a._access_path] ?? 9
    const br = ACCESS_RANK[b.access_path ?? b._access_path] ?? 9
    if (ar !== br) return ar - br

    const tr = (TIER_RANK[a._tier] ?? 9) - (TIER_RANK[b._tier] ?? 9)
    if (tr !== 0) return tr

    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/* ── Step indicator ─────────────────────────────────────────── */
function StepBar({ step }) {
  const steps = ['Track', 'Target', 'Review', 'Done']
  return (
    <div className="flex items-center gap-1" role="list" aria-label="Steps">
      {steps.map((label, i) => {
        const idx = i + 1
        const done = idx < step
        const active = idx === step
        return (
          <div key={label} role="listitem" className="flex items-center gap-1">
            <div
              aria-current={active ? 'step' : undefined}
              className={[
                'flex size-6 items-center justify-center rounded-full text-[0.65rem] font-bold transition-colors',
                done
                  ? 'bg-ok/20 text-ok'
                  : active
                    ? 'bg-accent text-ink'
                    : 'bg-surface-2 text-muted',
              ].join(' ')}
            >
              {done ? <IconCheck className="size-3" /> : idx}
            </div>
            <span
              className={`text-[0.65rem] font-medium ${
                active ? 'text-text' : done ? 'text-ok' : 'text-muted'
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={`h-px w-4 ${done ? 'bg-ok/40' : 'bg-line'}`}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Step 1: pick a track ───────────────────────────────────── */
function PickTrack({ tracks, selected, onSelect }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Choose a track</p>
      {tracks.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center">
          <p className="text-sm text-muted">No tracks yet.</p>
          <Link
            to="/tracks"
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Add your first track &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              onClick={() => onSelect(track)}
              className={[
                'w-full rounded-lg border p-3 text-left transition-colors',
                selected?.id === track.id
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-line bg-surface hover:border-line/80 hover:bg-surface-2',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display font-bold text-sm">{track.title}</span>
                <Badge variant={trackStatusVariant(track.status)}>
                  {STATUS_LABELS[track.status] ?? track.status}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {track.bpm && (
                  <span className="text-[0.65rem] text-muted">{track.bpm} BPM</span>
                )}
                {track.musical_key && (
                  <span className="text-[0.65rem] text-muted">{track.musical_key}</span>
                )}
                {track.genre_tags?.slice(0, 3).map((g) => (
                  <span key={g} className="text-[0.65rem] text-muted">{g}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Stable key for a target (CRM contact id, or label id) ──── */
function targetKey(t) {
  return t?.id ?? `label-${t?.label_id}`
}

/* ── Step 2: pick a target (contacts + all labels) ──────────── */
function PickTarget({ targets, labelsLoading, selected, onSelect, multi = false, selectedKeys, onToggle, onProceed }) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [genreFilter, setGenreFilter] = useState('')
  const searchRef = useRef(null)

  // Derive distinct genre tags across all targets that have them
  const genreOptions = useMemo(() => {
    const tags = new Set()
    for (const t of targets) {
      for (const g of t._genres ?? []) {
        tags.add(g)
      }
    }
    return [...tags].sort((a, b) => norm(a).localeCompare(norm(b)))
  }, [targets])

  const filtered = useMemo(() => {
    const q = norm(search)

    return targets.filter((t) => {
      if (q) {
        const matchName = norm(t.name).includes(q)
        const matchGenre = (t._genres ?? []).some((g) => norm(g).includes(q))
        if (!matchName && !matchGenre) return false
      }
      if (tierFilter && t._tier !== tierFilter) return false
      if (accessFilter && (t.access_path ?? t._access_path) !== accessFilter) return false
      if (methodFilter && t.submission_method !== methodFilter) return false
      if (genreFilter && !(t._genres ?? []).includes(genreFilter)) return false
      return true
    })
  }, [targets, search, tierFilter, accessFilter, methodFilter, genreFilter])

  const hasActiveFilters = search || tierFilter || accessFilter || methodFilter || genreFilter

  function clearFilters() {
    setSearch('')
    setTierFilter('')
    setAccessFilter('')
    setMethodFilter('')
    setGenreFilter('')
    searchRef.current?.focus()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Pick a target</p>

      {/* Search */}
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search by name or genre"
          placeholder="Search by name or genre…"
          className={`${inputCls} pl-9`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-2">
        {/* Tier */}
        <div>
          <label htmlFor="target-tier" className="sr-only">Filter by tier</label>
          <select
            id="target-tier"
            className={selectCls}
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="">All tiers</option>
            <option value="elite">Elite</option>
            <option value="a">A-tier</option>
            <option value="b">B-tier</option>
          </select>
        </div>

        {/* Access */}
        <div>
          <label htmlFor="target-access" className="sr-only">Filter by access</label>
          <select
            id="target-access"
            className={selectCls}
            value={accessFilter}
            onChange={(e) => setAccessFilter(e.target.value)}
          >
            <option value="">All access</option>
            <option value="cold_demo_friendly">Cold Demo OK</option>
            <option value="open_window_only">Open Window</option>
            <option value="needs_warm_intro">Warm Intro</option>
            <option value="relationship_only">Relationship</option>
          </select>
        </div>

        {/* Method */}
        <div>
          <label htmlFor="target-method" className="sr-only">Filter by method</label>
          <select
            id="target-method"
            className={selectCls}
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="">All methods</option>
            <option value="email">Email</option>
            <option value="form">Form</option>
            <option value="dm">DM</option>
          </select>
        </div>

        {/* Genre */}
        <div>
          <label htmlFor="target-genre" className="sr-only">Filter by genre</label>
          <select
            id="target-genre"
            className={selectCls}
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
          >
            <option value="">All genres</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {norm(g).replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Count + clear */}
      <div className="flex items-center justify-between min-h-[1.25rem]">
        {!labelsLoading && (
          <p className="text-[0.65rem] text-muted">
            {filtered.length === targets.length
              ? `${targets.length} targets`
              : `${filtered.length} of ${targets.length}`}
          </p>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-auto text-[0.65rem] font-semibold uppercase tracking-wider text-muted/70 hover:text-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {labelsLoading && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading targets">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-lg border border-line bg-surface" />
          ))}
        </div>
      )}

      {!labelsLoading && filtered.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center">
          <p className="text-sm text-muted">
            {targets.length === 0
              ? 'No labels loaded yet.'
              : 'No results — try adjusting filters.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!labelsLoading && filtered.length > 0 && (
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-0.5" role="listbox" aria-label="Pick a target">
          {filtered.map((target) => {
            const isSelected = multi
              ? Boolean(selectedKeys?.has(targetKey(target)))
              : selected
                ? target.id
                  ? selected.id === target.id
                  : selected.label_id === target.label_id
                : false
            const isInCRM = Boolean(target.id)
            const tier = target._tier
            const access = target.access_path ?? target._access_path
            const method = target.submission_method
            // Freshness only applies to curated-master labels (have label_id),
            // not your own manually-added contacts.
            const freshStatus = freshnessStatus(target)
            const showFreshWarn = Boolean(target.label_id) && needsRecheck(freshStatus)

            return (
              <button
                key={target.id ?? `label-${target.label_id}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => (multi ? onToggle(target) : onSelect(target))}
                className={[
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-line bg-surface hover:border-line/60 hover:bg-surface-2',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    {multi && (
                      <span
                        aria-hidden="true"
                        className={[
                          'flex size-4 shrink-0 items-center justify-center rounded border',
                          isSelected ? 'border-accent bg-accent text-ink' : 'border-line bg-surface-2',
                        ].join(' ')}
                      >
                        {isSelected && <IconCheck className="size-3" />}
                      </span>
                    )}
                    <span className="truncate font-display font-bold text-sm leading-snug">{target.name}</span>
                  </span>
                  {isInCRM && (
                    <Badge variant="ok">In CRM</Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tier && (
                    <Badge variant={tierVariant(tier)}>
                      {tier === 'elite' ? 'Elite' : tier === 'a' ? 'A-tier' : 'B-tier'}
                    </Badge>
                  )}
                  {access && (
                    <Badge variant="muted">
                      {ACCESS_LABELS[access] ?? access}
                    </Badge>
                  )}
                  {method && (
                    <Badge variant="muted">
                      {method}
                    </Badge>
                  )}
                  {showFreshWarn && (
                    <Badge variant={FRESHNESS_META[freshStatus].variant}>
                      {FRESHNESS_META[freshStatus].label}
                    </Badge>
                  )}
                  {!isInCRM && target._genres?.slice(0, 2).map((g) => (
                    <span
                      key={g}
                      className="rounded border border-line/60 bg-surface-2 px-1.5 py-0.5 text-[0.6rem] font-medium text-muted/80 uppercase tracking-wider"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {multi && (
        <div className="sticky bottom-0 -mx-0.5 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-3">
          <button
            type="button"
            disabled={!selectedKeys || selectedKeys.size === 0}
            onClick={onProceed}
            className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {selectedKeys && selectedKeys.size > 0
              ? `Review ${selectedKeys.size} ${selectedKeys.size === 1 ? 'target' : 'targets'} →`
              : 'Select targets to send'}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Step 3 — email path ────────────────────────────────────── */
function EmailReviewPanel({
  track,
  contact,
  pressKit,
  artistName,
  userId,
  onConfirm,
  confirming,
  error,
  onBack,
}) {
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)

  const [hook, setHook] = useState('')
  const [hookLoading, setHookLoading] = useState(false)
  const [hookError, setHookError] = useState(null)
  const [hookWarn, setHookWarn] = useState(null)
  const hookTextareaRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingTemplates(true)
      const { data } = await supabase
        .from('templates')
        .select('id, name, kind, subject, body')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (cancelled) return
      const rows = data ?? []
      setTemplates(rows)
      const auto = rows.find((t) => t.kind === 'cold_email') ?? rows[0]
      if (auto) setSelectedTemplateId(auto.id)
      setLoadingTemplates(false)
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (!hook.trim()) { setHookWarn(null); return }
    const recents = getRecentHooks()
    if (recents.length > 0 && recents[0] === hook.trim()) {
      setHookWarn('Same hook as last time — consider tweaking it for freshness.')
    } else {
      setHookWarn(null)
    }
  }, [hook])

  const selectedTemplate =
    templates.find((t) => t.id === selectedTemplateId) ?? null

  const mergeCtx = { track, contact, pressKit: pressKit ?? null, artistName, hook }

  const filledSubject = fillMergeFields(selectedTemplate?.subject ?? '', mergeCtx)
  const filledBody = selectedTemplate
    ? stripSubjectLine(fillMergeFields(selectedTemplate.body ?? '', mergeCtx))
    : ''

  const emailAddress = contact.email ?? ''
  const mailtoUrl = emailAddress
    ? buildMailtoUrl(emailAddress, filledSubject, filledBody)
    : null
  const gmailUrl = emailAddress
    ? buildGmailUrl(emailAddress, filledSubject, filledBody)
    : null

  // Warn when template references {listen_link} but track has no listen link
  const templateRefsListenLink = Boolean(
    selectedTemplate &&
      (selectedTemplate.subject?.includes('{listen_link}') ||
        selectedTemplate.body?.includes('{listen_link}'))
  )
  const listenLinkMissing = templateRefsListenLink && !track?.listen_link

  // Fix 6: mailto length guard — some mail apps truncate at ~2000 chars
  const MAILTO_SAFE_LIMIT = 1900
  const mailtoTooLong = Boolean(mailtoUrl && mailtoUrl.length > MAILTO_SAFE_LIMIT)

  // Fix 5: track whether the user has opened the email draft
  const [emailOpened, setEmailOpened] = useState(false)
  const [unsentWarn, setUnsentWarn] = useState(false)
  // Fix 6: copy body state
  const [bodyCopied, setBodyCopied] = useState(false)

  const hookIsEmpty = !hook.trim()
  const hasNoTemplates = !loadingTemplates && templates.length === 0

  async function handleCopyBody() {
    if (!filledBody) return
    try {
      await navigator.clipboard.writeText(filledBody)
      setBodyCopied(true)
      setTimeout(() => setBodyCopied(false), 2000)
    } catch {
      // Fallback: create a temporary textarea and copy from it
      const ta = document.createElement('textarea')
      ta.value = filledBody
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setBodyCopied(true); setTimeout(() => setBodyCopied(false), 2000) } catch { /* ignore */ }
      document.body.removeChild(ta)
    }
  }

  function handleConfirmWithHook() {
    if (hookIsEmpty) return
    // Fix 5: if they haven't opened the email draft, show a one-time inline warn
    if (!emailOpened && emailAddress && selectedTemplate) {
      if (!unsentWarn) { setUnsentWarn(true); return }
    }
    setUnsentWarn(false)
    pushRecentHook(hook.trim())
    onConfirm()
  }

  async function handleSuggestHook() {
    setHookLoading(true)
    setHookError(null)
    try {
      const recentHooks = getRecentHooks()

      const [intelRes, labelRes] = await Promise.all([
        supabase
          .from('ar_intel')
          .select('runs_label, signs, recent_releases, submission_prefs, personal_angle, notes')
          .eq('user_id', userId)
          .eq('contact_id', contact.id)
          .maybeSingle(),
        contact.label_id
          ? supabase
              .from('labels')
              .select('why')
              .eq('id', contact.label_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      let arIntelString = ''
      if (intelRes.data) {
        const d = intelRes.data
        const parts = []
        if (d.runs_label) parts.push(`Runs: ${d.runs_label}`)
        if (d.signs) parts.push(`Signs: ${d.signs}`)
        if (d.recent_releases) parts.push(`Recent: ${d.recent_releases}`)
        if (d.submission_prefs) parts.push(`Prefs: ${d.submission_prefs}`)
        if (d.personal_angle) parts.push(`Angle: ${d.personal_angle}`)
        if (d.notes) parts.push(`Notes: ${d.notes}`)
        arIntelString = parts.join('. ')
      }

      // For label-targets that don't have a contact id yet, _why is on the target
      const labelWhy = labelRes.data?.why ?? contact._why ?? ''

      const { data, error: fnErr } = await supabase.functions.invoke('suggest-hook', {
        body: {
          track: {
            title: track.title,
            genre_tags: track.genre_tags ?? [],
            bpm: track.bpm,
            key: track.musical_key,
          },
          label: {
            name: contact.name,
            why: labelWhy,
            requirements: contact.notes ?? '',
          },
          ar_intel: arIntelString,
          artist_name: artistName,
          recent_hooks: recentHooks,
        },
      })
      if (fnErr) throw new Error(fnErr.message ?? 'Edge function error')
      if (data?.error) throw new Error(data.error)
      const suggested = (data?.hook ?? '').trim()
      if (!suggested) throw new Error('No hook returned — try again or type one manually.')
      setHook(suggested)
      setTimeout(() => hookTextareaRef.current?.focus(), 60)
    } catch (err) {
      setHookError(err.message)
    }
    setHookLoading(false)
  }

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="rounded-card border border-line bg-surface p-4 space-y-2">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Track</p>
          <p className="font-display font-bold">{track.title}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant={trackStatusVariant(track.status)}>
              {STATUS_LABELS[track.status] ?? track.status}
            </Badge>
            {track.bpm && <Badge variant="info">{track.bpm} BPM</Badge>}
            {track.musical_key && <Badge variant="info">{track.musical_key}</Badge>}
          </div>
        </div>
        <div className="border-t border-line pt-2">
          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Sending to</p>
          <p className="font-display font-bold">{contact.name}</p>
          <p className="text-xs text-muted">
            via email{emailAddress ? ` — ${emailAddress}` : ' — no email on file'}
          </p>
        </div>
      </div>

      {/* Preset picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Email Preset</p>

        {loadingTemplates && (
          <div className="h-10 animate-pulse rounded-lg border border-line bg-surface" />
        )}

        {hasNoTemplates && (
          <div className="rounded-lg border border-dashed border-line bg-surface/40 p-3 text-xs text-muted">
            No email presets yet.{' '}
            <Link to="/you" className="text-accent hover:underline">
              Go to You &rarr; Email Presets
            </Link>{' '}
            to add starter presets, then come back.
          </div>
        )}

        {!loadingTemplates && templates.length > 0 && (
          <div className="space-y-1.5" role="listbox" aria-label="Choose an email preset">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={selectedTemplateId === t.id}
                onClick={() => setSelectedTemplateId(t.id)}
                className={[
                  'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  selectedTemplateId === t.id
                    ? 'border-accent/50 bg-accent/10'
                    : 'border-line bg-surface hover:border-line/80 hover:bg-surface-2',
                ].join(' ')}
              >
                <span className="flex-1 truncate font-medium">{t.name}</span>
                <Badge variant={KIND_VARIANT[t.kind] ?? 'muted'}>
                  {KIND_LABELS[t.kind] ?? t.kind}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AI Hook section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">
            Hook
            <span className="ml-1 text-danger" aria-hidden="true">*</span>
          </p>
          <button
            type="button"
            disabled={hookLoading}
            onClick={handleSuggestHook}
            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
          >
            {hookLoading ? (
              <>
                <IconSpinner className="size-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <IconSparkle className="size-3.5" />
                Suggest hook (AI)
              </>
            )}
          </button>
        </div>

        <Field
          id="email-hook"
          label=""
          hint="One sentence that explains why this track fits this label — fills {hook} in your preset. Required."
        >
          <textarea
            id="email-hook"
            ref={hookTextareaRef}
            rows={3}
            className={inputCls}
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder={`e.g. "The rolling low-end and filtered stabs are exactly what ${contact.name} signs on the B-side."`}
            aria-required="true"
            aria-label="Email hook"
          />
        </Field>

        {hookError && (
          <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            <IconWarn className="mt-0.5 size-3.5 shrink-0" />
            <span>AI unavailable: {hookError} — type your hook manually above.</span>
          </div>
        )}

        {hookWarn && !hookError && (
          <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
            <IconWarn className="mt-0.5 size-3.5 shrink-0" />
            <span>{hookWarn}</span>
          </div>
        )}
      </div>

      {/* Fix 4: warn when template uses {listen_link} but track has none */}
      {listenLinkMissing && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          <IconWarn className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This template references <code className="font-mono">{'{listen_link}'}</code> but the
            selected track has no listen link — the token will be removed from the email.{' '}
            <Link to="/tracks" className="underline hover:no-underline">
              Add a listen link to the track
            </Link>
            .
          </span>
        </div>
      )}

      {/* Email preview */}
      {selectedTemplate && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Preview</p>
          <div className="rounded-card border border-line bg-surface p-4 space-y-3">
            {filledSubject && (
              <div>
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted mb-1">
                  Subject
                </p>
                <p className="text-sm text-text font-medium">{filledSubject}</p>
              </div>
            )}
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted mb-1">
                Body
              </p>
              {filledBody ? (
                <pre className="whitespace-pre-wrap font-sans text-xs text-text leading-relaxed">
                  {filledBody}
                </pre>
              ) : (
                <p className="text-xs text-muted italic">
                  Write or generate a hook above to see the full preview.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Open & send buttons */}
      {emailAddress && selectedTemplate && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Open &amp; send</p>

          {/* Fix 6: mailto length warning */}
          {mailtoTooLong && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-2.5 text-xs text-warn">
              <IconWarn className="mt-0.5 size-3.5 shrink-0" />
              <span>Long email — some mail apps truncate. Use Gmail or copy the body.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <a
              href={mailtoUrl ?? '#'}
              onClick={() => setEmailOpened(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <IconMail className="size-4 shrink-0" />
              Mail app
            </a>
            <a
              href={gmailUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setEmailOpened(true)}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <IconGmail className="size-4 shrink-0" />
              Gmail
            </a>
          </div>

          {/* Fix 6: copy body button — shown whenever mailto is too long */}
          {mailtoTooLong && (
            <button
              type="button"
              onClick={handleCopyBody}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 py-2 text-xs font-semibold text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <IconCopy className="size-3.5 shrink-0" />
              {bodyCopied ? 'Copied!' : 'Copy body'}
            </button>
          )}

          <p className="text-center text-[0.65rem] text-muted">
            Open, review in your mail client, then tap Confirm sent below.
          </p>
        </div>
      )}

      {!emailAddress && (
        <div className="rounded-lg border border-line bg-surface-2 p-3 text-center text-xs text-muted">
          No email address on this contact.{' '}
          <Link to="/contacts" className="text-accent hover:underline">
            Edit contact
          </Link>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Fix 5: inline "haven't opened" nudge — shown once on first confirm attempt */}
      {unsentWarn && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-warn">
          You haven't opened the email draft yet — record as sent anyway?{' '}
          <button
            type="button"
            onClick={() => {
              pushRecentHook(hook.trim())
              onConfirm()
            }}
            className="ml-1 font-semibold underline hover:no-underline"
          >
            Yes, record it
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Back
        </button>
        <button
          type="button"
          disabled={confirming || hookIsEmpty}
          onClick={handleConfirmWithHook}
          title={hookIsEmpty ? 'Write or generate a hook first' : undefined}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {confirming ? 'Recording…' : hookIsEmpty ? 'Add a hook first' : 'Confirm sent'}
        </button>
      </div>
    </div>
  )
}

/* ── Tracking-link URL builder ──────────────────────────────── */
function buildTrackedUrl(hash) {
  const base = import.meta.env.VITE_TRACK_BASE_URL
  if (base) return `${base}/${hash}`
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-redirect?h=${hash}`
}

/* ── Step 3 — form / DM path ────────────────────────────────── */
function NonEmailReviewPanel({
  track,
  contact,
  user,
  onConfirm,
  confirming,
  error,
  onBack,
  onTrackingHashChange,
}) {
  const method = contact.submission_method

  const [trackingHash, setTrackingHash] = useState(null)
  const [trackedUrl, setTrackedUrl] = useState(null)
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [trackingError, setTrackingError] = useState(null)
  const [copied, setCopied] = useState(false)
  // Fix 5: track whether the portal/DM link was opened
  const [linkOpened, setLinkOpened] = useState(false)
  const [unsentWarn, setUnsentWarn] = useState(false)

  const hasExclusiveHold =
    track.exclusive_hold_contact_id &&
    track.exclusive_hold_contact_id !== contact.id &&
    track.exclusive_hold_until &&
    new Date(track.exclusive_hold_until) >= new Date()

  const actionHref =
    method === 'form' ? contact.portal_url : contact.dm_link

  function handleAction() {
    if (!actionHref) return
    setLinkOpened(true)
    window.open(actionHref, '_blank', 'noopener,noreferrer')
  }

  function handleConfirmWithCheck() {
    if (!linkOpened && actionHref) {
      if (!unsentWarn) { setUnsentWarn(true); return }
    }
    setUnsentWarn(false)
    onConfirm()
  }

  const requirements = contact.notes || null

  async function handleCreateTrackingLink() {
    setTrackingLoading(true)
    setTrackingError(null)
    const hash = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const { error: insertErr } = await supabase
      .from('tracked_links')
      .insert({
        user_id: user.id,
        submission_id: null,
        hash,
        target_url: track.listen_link,
      })
    if (insertErr) {
      setTrackingError(
        'Could not create tracking link — proceed with your raw link above.'
      )
      setTrackingLoading(false)
      return
    }
    const url = buildTrackedUrl(hash)
    setTrackingHash(hash)
    setTrackedUrl(url)
    onTrackingHashChange(hash)
    setTrackingLoading(false)
  }

  async function handleCopy() {
    if (!trackedUrl) return
    try {
      await navigator.clipboard.writeText(trackedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select the input text
    }
  }

  return (
    <div className="space-y-4">
      {/* Track + Contact summary */}
      <div className="rounded-card border border-line bg-surface p-4 space-y-2">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Track</p>
          <p className="font-display font-bold">{track.title}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant={trackStatusVariant(track.status)}>
              {STATUS_LABELS[track.status] ?? track.status}
            </Badge>
            {track.bpm && <Badge variant="info">{track.bpm} BPM</Badge>}
            {track.musical_key && <Badge variant="info">{track.musical_key}</Badge>}
          </div>
        </div>
        <div className="border-t border-line pt-2">
          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Sending to</p>
          <p className="font-display font-bold">{contact.name}</p>
          <p className="text-xs text-muted capitalize">via {method}</p>
        </div>
      </div>

      {/* Exclusive hold warning */}
      {hasExclusiveHold && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
          <p className="font-semibold">Exclusive hold active</p>
          <p className="mt-0.5 text-warn/80">
            This track is on exclusive hold until{' '}
            {new Date(track.exclusive_hold_until).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            . Sending to another contact may breach that agreement.
          </p>
        </div>
      )}

      {/* Pre-send checklist */}
      <div className="rounded-card border border-line bg-surface p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Pre-send checklist</p>
        <CheckItem done={Boolean(track.listen_link)}>
          Track has a listen link{!track.listen_link && ' — add one in Track Vault'}
        </CheckItem>
        <CheckItem
          done={
            track.status === 'demo_ready' ||
            track.status === 'submitted' ||
            track.status === 'signed'
          }
        >
          Track is marked Demo Ready or above
        </CheckItem>
        <CheckItem done={Boolean(actionHref)}>
          {method === 'form' && 'Portal URL on file'}
          {method === 'dm' && 'DM link on file'}
          {!method && 'Submission method set'}
          {!actionHref && ' — edit the contact to add it'}
        </CheckItem>
        {requirements && (
          <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-1">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">
              Submission requirements
            </p>
            <p className="text-xs text-text whitespace-pre-line">{requirements}</p>
          </div>
        )}
      </div>

      {/* Track this link affordance */}
      {track.listen_link && (
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-accent">
                Track this link
                <Badge variant="muted" className="ml-2">Optional</Badge>
              </p>
              <p className="mt-0.5 text-[0.65rem] text-muted">
                Get notified when they open it.
              </p>
            </div>
            {!trackingHash && (
              <button
                type="button"
                disabled={trackingLoading}
                onClick={handleCreateTrackingLink}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {trackingLoading ? (
                  <>
                    <IconSpinner className="size-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <IconLink className="size-3.5" />
                    Create tracking link
                  </>
                )}
              </button>
            )}
          </div>

          {trackingError && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <IconWarn className="mt-0.5 size-3.5 shrink-0" />
              <span>{trackingError}</span>
            </div>
          )}

          {trackedUrl && (
            <div className="space-y-2">
              <Field
                id="tracked-url"
                label="Your tracking link"
                hint="Paste THIS link into the portal/DM instead of your raw link — you'll see when they open it. (Form/DM only — never use for email.)"
              >
                <div className="flex gap-2">
                  <input
                    id="tracked-url"
                    type="url"
                    readOnly
                    value={trackedUrl}
                    className={`${inputCls} flex-1 select-all font-mono text-[0.7rem] text-accent/90`}
                    onFocus={(e) => e.target.select()}
                    aria-label="Tracked link URL"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
                    aria-label="Copy tracking link"
                  >
                    {copied ? (
                      <>
                        <IconCheck className="size-3.5 text-ok" />
                        <span className="text-ok">Copied</span>
                      </>
                    ) : (
                      <>
                        <IconCopy className="size-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </Field>
              <div className="flex items-center gap-1.5">
                <Badge variant="ok">Active</Badge>
                <span className="text-[0.65rem] text-muted">
                  Opens will be linked to this submission on confirm.
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send action */}
      {actionHref ? (
        <button
          type="button"
          onClick={handleAction}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/10 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/20"
        >
          <IconSend className="size-4" />
          {method === 'form' && 'Open submission portal'}
          {method === 'dm' && 'Open DM link'}
        </button>
      ) : (
        <div className="rounded-lg border border-line bg-surface-2 p-3 text-center text-xs text-muted">
          No {method} address found on this contact. Edit the contact to add it.
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Fix 5: inline "haven't opened" nudge */}
      {unsentWarn && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs text-warn">
          You haven't opened the{' '}
          {method === 'form' ? 'submission portal' : 'DM link'} yet — record as sent anyway?{' '}
          <button
            type="button"
            onClick={() => { setUnsentWarn(false); onConfirm() }}
            className="ml-1 font-semibold underline hover:no-underline"
          >
            Yes, record it
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Back
        </button>
        <button
          type="button"
          disabled={confirming}
          onClick={handleConfirmWithCheck}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {confirming ? 'Recording…' : 'Confirm sent'}
        </button>
      </div>
    </div>
  )
}

/* ── Freshness caution — shown before either review panel ───────── */
function FreshnessCaution({ contact }) {
  // Only curated-master labels carry a verification signal.
  if (!contact.label_id) return null
  const status = freshnessStatus(contact)
  if (!needsRecheck(status)) return null

  const msg =
    status === 'broken'
      ? 'You reported this route as broken/changed. Double-check the submission link still works before sending.'
      : status === 'unverified'
        ? "This label's submission route has never been verified. Confirm the link is current before you rely on it."
        : "This label's submission route hasn't been verified in over a year. Routes change often — confirm it still works."

  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
      <IconWarn className="mt-0.5 size-3.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}

/* ── Step 3 router ──────────────────────────────────────────── */
function ReviewAndSend(props) {
  const { contact } = props
  return (
    <div className="space-y-4">
      <FreshnessCaution contact={contact} />
      {contact.submission_method === 'email' ? (
        <EmailReviewPanel {...props} />
      ) : (
        <NonEmailReviewPanel {...props} />
      )}
    </div>
  )
}

/* ── Shared check item ──────────────────────────────────────── */
function CheckItem({ done, children }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span
        className={[
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-ok/20 text-ok' : 'bg-surface-2 text-muted',
        ].join(' ')}
        aria-hidden="true"
      >
        {done ? <IconCheck className="size-2.5" /> : <IconMinus className="size-2.5" />}
      </span>
      <span className={done ? 'text-text' : 'text-muted'}>{children}</span>
    </div>
  )
}

/* ── Step 4: success state ──────────────────────────────────── */
function SuccessState({ track, contact, submission, onReset, secondaryWarn }) {
  const followUpDate = submission?.follow_up_due_at
    ? new Date(submission.follow_up_due_at).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ok/15">
        <IconCheck className="size-8 text-ok" />
      </div>
      <div>
        <h2 className="font-display text-xl font-extrabold">Demo sent!</h2>
        <p className="mt-1 text-sm text-muted">
          <span className="text-text font-medium">{track.title}</span> &rarr;{' '}
          <span className="text-text font-medium">{contact.name}</span>
        </p>
      </div>

      {/* Fix 3: surface non-blocking secondary write warnings */}
      {secondaryWarn && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn text-left">
          <IconWarn className="mt-0.5 size-3.5 shrink-0" />
          <span>{secondaryWarn}</span>
        </div>
      )}

      <div className="rounded-card border border-line bg-surface p-4 text-left space-y-2">
        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-accent">Send logged</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted">Method</p>
            <p className="capitalize text-text">{contact.submission_method}</p>
          </div>
          <div>
            <p className="text-muted">Status</p>
            <p className="text-text">Sent</p>
          </div>
          {followUpDate && (
            <div>
              <p className="text-muted">Follow-up due</p>
              <p className="text-text">{followUpDate}</p>
            </div>
          )}
          <div>
            <p className="text-muted">Sent at</p>
            <p className="text-text">
              {new Date().toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
        >
          Send another
        </button>
        <Link
          to="/"
          className="block w-full rounded-lg border border-line py-2.5 text-center text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}

/* ── Batch: progress header ─────────────────────────────────── */
function BatchProgress({ index, total, target, onSkip, busy }) {
  return (
    <div className="space-y-2 rounded-card border border-accent/30 bg-accent/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">
          Batch send · {index + 1} of {total}
        </p>
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted/70 hover:text-muted disabled:opacity-40"
        >
          Skip this one →
        </button>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${Math.round((index / total) * 100)}%` }}
        />
      </div>
      <p className="truncate text-xs text-muted">
        Now sending to <span className="font-medium text-text">{target?.name}</span>
      </p>
    </div>
  )
}

/* ── Batch: final summary ───────────────────────────────────── */
function BatchSummary({ track, results, onReset }) {
  const sent = results.filter((r) => r.status === 'sent').length
  const skipped = results.filter((r) => r.status === 'skipped').length

  return (
    <div className="space-y-4">
      <div className="text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-ok/15">
          <IconCheck className="size-8 text-ok" />
        </div>
        <h2 className="mt-3 font-display text-xl font-extrabold">Batch complete</h2>
        <p className="mt-1 text-sm text-muted">
          <span className="text-text font-medium">{sent}</span> sent
          {skipped > 0 && <> · <span className="text-text font-medium">{skipped}</span> skipped</>} ·{' '}
          <span className="text-text font-medium">{track.title}</span>
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface divide-y divide-line/50">
        {results.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
            <span className="truncate text-text">{r.name}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-[0.65rem] uppercase tracking-wider text-muted">{r.method}</span>
              {r.status === 'sent' ? (
                <Badge variant="ok">Sent</Badge>
              ) : r.status === 'skipped' ? (
                <Badge variant="muted">Skipped</Badge>
              ) : (
                <Badge variant="danger">Failed</Badge>
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
        >
          New send
        </button>
        <Link
          to="/"
          className="block w-full rounded-lg border border-line py-2.5 text-center text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────── */
export default function SendDemo() {
  const { user } = useAuth()
  const [tracks, setTracks] = useState([])
  const [contacts, setContacts] = useState([])
  const [labels, setLabels] = useState([])
  const [pressKit, setPressKit] = useState(null)
  const [loadingData, setLoadingData] = useState(true)
  const [labelsLoading, setLabelsLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('single') // 'single' | 'batch'
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [pendingTrackingHash, setPendingTrackingHash] = useState(null)
  // Fix 3: surface non-blocking secondary write warnings on the success screen
  const [secondaryWarn, setSecondaryWarn] = useState(null)

  // Batch queue state
  const [batchSelected, setBatchSelected] = useState([]) // array of target objects
  const [batchIndex, setBatchIndex] = useState(0)
  const [batchResults, setBatchResults] = useState([])

  const load = useCallback(async () => {
    setLoadingData(true)
    setLoadError(null)
    const [tracksRes, contactsRes, pressKitRes] = await Promise.all([
      supabase
        .from('tracks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true }),
      supabase
        .from('press_kit')
        .select('artist_name, slug, photo_url')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])
    if (tracksRes.error || contactsRes.error) {
      setLoadError(tracksRes.error?.message || contactsRes.error?.message)
    } else {
      setTracks(tracksRes.data ?? [])
      setContacts(contactsRes.data ?? [])
    }
    if (!pressKitRes.error) {
      setPressKit(pressKitRes.data ?? null)
    }
    setLoadingData(false)
  }, [user.id])

  // Load labels independently so the picker shows immediately even if labels are slow
  useEffect(() => {
    let cancelled = false
    setLabelsLoading(true)
    supabase
      .from('label_freshness')
      .select('id, name, tier, access_path, submission_method, contact_link, genre_tags, submission_requirements, why, last_verified, effective_verified, my_verified_at, flagged_broken, link_status')
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setLabels(data ?? [])
        setLabelsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { load() }, [load])

  // Derive artist name
  const artistName =
    pressKit?.artist_name ||
    (user?.email ? user.email.split('@')[0] : 'Unknown Artist')

  // Build unified target list: CRM contacts first, then labels not yet in CRM
  const targets = useMemo(() => {
    // Set of label_ids already in CRM
    const crmLabelIds = new Set(
      contacts.filter((c) => c.label_id).map((c) => c.label_id)
    )

    // Freshness signal keyed by label_id, so CRM contacts sourced from a label
    // carry the same warning as labels not yet added.
    const freshByLabel = new Map(labels.map((l) => [l.id, l]))
    const pickFresh = (l) =>
      l
        ? {
            last_verified: l.last_verified,
            effective_verified: l.effective_verified,
            my_verified_at: l.my_verified_at,
            flagged_broken: l.flagged_broken,
            link_status: l.link_status,
          }
        : {}

    // Enrich existing contacts with _tier / _genres / _access_path for filtering
    const crmTargets = contacts.map((c) => ({
      ...c,
      _tier: c._tier ?? null,
      _genres: c.genre_tags ?? [],
      _access_path: c.access_path ?? null,
      _why: c._why ?? '',
      ...pickFresh(c.label_id ? freshByLabel.get(c.label_id) : null),
    }))

    // Labels not yet in CRM
    const labelTargets = labels
      .filter((l) => !crmLabelIds.has(l.id))
      .map((label) => ({
        id: null,
        label_id: label.id,
        name: label.name,
        category: 'label',
        submission_method: label.submission_method ?? null,
        email: label.submission_method === 'email' ? (label.contact_link ?? null) : null,
        portal_url: label.submission_method === 'form' ? (label.contact_link ?? null) : null,
        dm_link: label.submission_method === 'dm' ? (label.contact_link ?? null) : null,
        access_path: label.access_path ?? null,
        notes: label.submission_requirements ?? null,
        _why: label.why ?? '',
        _tier: label.tier,
        _genres: label.genre_tags ?? [],
        _access_path: label.access_path ?? null,
        last_verified: label.last_verified,
        effective_verified: label.effective_verified,
        my_verified_at: label.my_verified_at,
        flagged_broken: label.flagged_broken,
        link_status: label.link_status,
      }))

    return sortTargets([...crmTargets, ...labelTargets])
  }, [contacts, labels])

  /* ── resolveContactId: get or create the CRM contact before submitting ── */
  async function resolveContactId(target) {
    if (target.id) return target.id

    // Fix 1: before inserting, check for an existing row to avoid duplicates
    // when label-sourced targets are used in batch (or retried).
    if (target.label_id) {
      const { data: existing, error: lookupErr } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', user.id)
        .eq('label_id', target.label_id)
        .maybeSingle()
      if (lookupErr) throw lookupErr
      if (existing?.id) return existing.id
    }

    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: user.id,
        name: target.name,
        category: 'label',
        submission_method: target.submission_method,
        email: target.email,
        portal_url: target.portal_url,
        dm_link: target.dm_link,
        access_path: target.access_path,
        relationship_stage: 'cold',
        label_id: target.label_id,
        notes: target.notes,
      })
      .select('id')
      .single()

    if (error) throw error
    return data.id
  }

  function handleSelectTrack(track) {
    setSelectedTrack(track)
    setStep(2)
  }

  function handleSelectTarget(target) {
    setSelectedContact(target)
    setStep(3)
  }

  /* ── recordSend: the shared logging path for one target ──────── */
  async function recordSend(target, trackingHash) {
    const contactId = await resolveContactId(target)

    const now = new Date().toISOString()
    const { data: submissionData, error: subErr } = await supabase
      .from('submissions')
      .insert({
        user_id: user.id,
        track_id: selectedTrack.id,
        contact_id: contactId,
        method: target.submission_method,
        status: 'sent',
        sent_at: now,
        follow_up_due_at: addDays(7),
        overdue_at: addDays(14),
      })
      .select()
      .single()

    if (subErr) throw subErr

    // Fix 3: secondary writes — capture errors and surface as non-blocking warnings
    const secondaryWarnings = []

    const { error: contactUpdateErr } = await supabase
      .from('contacts')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', contactId)
      .eq('user_id', user.id)
    if (contactUpdateErr) {
      console.warn('[recordSend] contact last_contacted_at update failed:', contactUpdateErr)
      secondaryWarnings.push("couldn't update contact")
    }

    if (selectedTrack.status === 'demo_ready') {
      const { error: trackStatusErr } = await supabase
        .from('tracks')
        .update({ status: 'submitted', updated_at: now })
        .eq('id', selectedTrack.id)
        .eq('user_id', user.id)
      if (trackStatusErr) {
        console.warn('[recordSend] track status bump failed:', trackStatusErr)
        secondaryWarnings.push("couldn't update track status")
      }
    }

    if (trackingHash) {
      const { error: linkErr } = await supabase
        .from('tracked_links')
        .update({ submission_id: submissionData.id })
        .eq('hash', trackingHash)
        .eq('user_id', user.id)
      if (linkErr) {
        console.warn('[recordSend] tracked_links association failed:', linkErr)
        secondaryWarnings.push("couldn't link tracking link")
      }
    }

    return { submissionData, contactId, secondaryWarnings }
  }

  async function handleConfirm() {
    if (!selectedTrack || !selectedContact) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const { submissionData, contactId, secondaryWarnings } = await recordSend(selectedContact, pendingTrackingHash)
      if (!selectedContact.id) {
        setSelectedContact((prev) => ({ ...prev, id: contactId }))
      }
      setSubmission(submissionData)
      // Fix 3: surface any non-blocking secondary write failures
      if (secondaryWarnings.length > 0) {
        setSecondaryWarn(`Logged, but ${secondaryWarnings.join(' and ')} — check your connection.`)
      }
      setConfirming(false)
      setStep(4)
    } catch (err) {
      setConfirmError(err.message ?? 'Something went wrong — please try again.')
      setConfirming(false)
    }
  }

  /* ── Batch handlers ──────────────────────────────────────────── */
  function toggleBatchTarget(target) {
    const key = targetKey(target)
    setBatchSelected((prev) =>
      prev.some((t) => targetKey(t) === key)
        ? prev.filter((t) => targetKey(t) !== key)
        : [...prev, target]
    )
  }

  function startBatch() {
    if (batchSelected.length === 0) return
    setBatchIndex(0)
    setBatchResults([])
    setPendingTrackingHash(null)
    setConfirmError(null)
    setStep(3)
  }

  function advanceBatch(result) {
    setBatchResults((prev) => [...prev, result])
    setPendingTrackingHash(null)
    setConfirmError(null)
    if (batchIndex + 1 < batchSelected.length) {
      setBatchIndex((i) => i + 1)
    } else {
      setStep(4)
    }
  }

  async function handleBatchConfirm() {
    const target = batchSelected[batchIndex]
    if (!selectedTrack || !target) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const { contactId } = await recordSend(target, pendingTrackingHash)
      // Fix 2: write resolved contactId back onto the batch target so retries
      // and any further processing won't create duplicate contacts.
      if (!target.id) {
        setBatchSelected((prev) =>
          prev.map((t, i) => (i === batchIndex ? { ...t, id: contactId } : t))
        )
      }
      setConfirming(false)
      advanceBatch({ name: target.name, method: target.submission_method, status: 'sent' })
    } catch (err) {
      // Fix 2: on error, keep user on the current target and show error with Retry
      setConfirmError(err.message ?? 'Something went wrong — please try again.')
      setConfirming(false)
      // (batchIndex is NOT advanced — user stays on the current target to retry or skip)
    }
  }

  function handleBatchSkip() {
    const target = batchSelected[batchIndex]
    if (!target) return
    advanceBatch({ name: target.name, method: target.submission_method, status: 'skipped' })
  }

  const batchSelectedKeys = useMemo(
    () => new Set(batchSelected.map(targetKey)),
    [batchSelected]
  )

  function handleReset() {
    setStep(1)
    setSelectedTrack(null)
    setSelectedContact(null)
    setSubmission(null)
    setConfirmError(null)
    setSecondaryWarn(null)
    setPendingTrackingHash(null)
    setBatchSelected([])
    setBatchIndex(0)
    setBatchResults([])
    load()
  }

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 5</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">Send Demo</h1>
        <p className="mt-0.5 text-sm text-muted">
          Pick a track, pick any label or contact, send — every send logged automatically.
        </p>
      </header>

      {step < 4 && <StepBar step={step} />}

      {loadingData && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="h-20 animate-pulse rounded-card border border-line bg-surface"
            />
          ))}
        </div>
      )}

      {!loadingData && loadError && (
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Failed to load data: {loadError}
          <button type="button" onClick={load} className="mt-2 block text-xs underline">
            Retry
          </button>
        </div>
      )}

      {!loadingData && !loadError && (
        <>
          {step === 1 && (
            <PickTrack
              tracks={tracks}
              selected={selectedTrack}
              onSelect={handleSelectTrack}
            />
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
                <span className="text-xs text-muted">Track:</span>
                <span className="truncate text-sm font-medium">{selectedTrack?.title}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedTrack(null); setStep(1) }}
                  className="ml-auto shrink-0 text-xs text-muted hover:text-text"
                >
                  Change
                </button>
              </div>

              {/* Mode toggle: one-at-a-time vs batch */}
              <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
                {[
                  ['single', 'One at a time'],
                  ['batch', 'Batch'],
                ].map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMode(val)}
                    className={[
                      'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                      mode === val ? 'bg-accent text-ink' : 'text-muted hover:text-text',
                    ].join(' ')}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {mode === 'batch' && (
                <p className="px-0.5 text-[0.65rem] text-muted">
                  Select several labels — you’ll write a tailored hook and send to each, one after another.
                </p>
              )}

              <PickTarget
                targets={targets}
                labelsLoading={labelsLoading}
                selected={selectedContact}
                onSelect={handleSelectTarget}
                multi={mode === 'batch'}
                selectedKeys={batchSelectedKeys}
                onToggle={toggleBatchTarget}
                onProceed={startBatch}
              />
            </div>
          )}

          {/* Step 3 — single */}
          {step === 3 && mode === 'single' && selectedTrack && selectedContact && (
            <ReviewAndSend
              track={selectedTrack}
              contact={selectedContact}
              pressKit={pressKit}
              artistName={artistName}
              userId={user.id}
              user={user}
              onConfirm={handleConfirm}
              confirming={confirming}
              error={confirmError}
              onBack={() => setStep(2)}
              onTrackingHashChange={setPendingTrackingHash}
            />
          )}

          {/* Step 3 — batch queue */}
          {step === 3 && mode === 'batch' && selectedTrack && batchSelected[batchIndex] && (
            <div className="space-y-4">
              <BatchProgress
                index={batchIndex}
                total={batchSelected.length}
                target={batchSelected[batchIndex]}
                onSkip={handleBatchSkip}
                busy={confirming}
              />
              {/* Fix 2: batch error with explicit Retry + Skip buttons */}
              {confirmError && (
                <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger space-y-2">
                  <p>{confirmError}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleBatchConfirm}
                      disabled={confirming}
                      className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 font-semibold text-danger transition-colors hover:bg-danger/20 disabled:opacity-40"
                    >
                      {confirming ? 'Retrying…' : 'Retry'}
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchSkip}
                      disabled={confirming}
                      className="rounded-md border border-line px-3 py-1.5 font-semibold text-muted transition-colors hover:border-text hover:text-text disabled:opacity-40"
                    >
                      Skip (nothing recorded)
                    </button>
                  </div>
                </div>
              )}
              <ReviewAndSend
                key={targetKey(batchSelected[batchIndex])}
                track={selectedTrack}
                contact={batchSelected[batchIndex]}
                pressKit={pressKit}
                artistName={artistName}
                userId={user.id}
                user={user}
                onConfirm={handleBatchConfirm}
                confirming={confirming}
                error={null}
                onBack={() => setStep(2)}
                onTrackingHashChange={setPendingTrackingHash}
              />
            </div>
          )}

          {/* Step 4 — single success */}
          {step === 4 && mode === 'single' && selectedTrack && selectedContact && (
            <SuccessState
              track={selectedTrack}
              contact={selectedContact}
              submission={submission}
              onReset={handleReset}
              secondaryWarn={secondaryWarn}
            />
          )}

          {/* Step 4 — batch summary */}
          {step === 4 && mode === 'batch' && selectedTrack && (
            <BatchSummary
              track={selectedTrack}
              results={batchResults}
              onReset={handleReset}
            />
          )}
        </>
      )}
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
    ...props,
  }
}
function IconCheck(props) {
  return <svg {...svgBase(props)}><path d="M20 6 9 17l-5-5" /></svg>
}
function IconMinus(props) {
  return <svg {...svgBase(props)}><path d="M5 12h14" /></svg>
}
function IconSend(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4Z" />
    </svg>
  )
}
function IconMail(props) {
  return (
    <svg {...svgBase(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}
function IconGmail(props) {
  return (
    <svg {...svgBase(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 7 10-7" />
    </svg>
  )
}
function IconSparkle(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5Z" />
    </svg>
  )
}
function IconSpinner(props) {
  return (
    <svg {...svgBase({ strokeWidth: 2, ...props })}>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
    </svg>
  )
}
function IconWarn(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="m10.29 3.86-8.34 14.45A1 1 0 0 0 2.82 20h18.36a1 1 0 0 0 .87-1.5L13.71 3.86a1 1 0 0 0-1.74 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function IconLink(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
function IconCopy(props) {
  return (
    <svg {...svgBase(props)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
