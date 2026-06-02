import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Badge, { trackStatusVariant, stageVariant } from '../components/Badge'
import Field, { inputCls } from '../components/Field'

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
/**
 * Replace all supported placeholders in `text`.
 * Any placeholder whose value is absent is either removed or its whole line
 * is dropped — so the caller never sees a raw {tag} in output.
 */
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
    pressKit?.slug ? `https://press.demotrack.app/${pressKit.slug}` : null

  let result = text
    .replace(/\{genre\}/g, genre)
    .replace(/\{track_title\}/g, trackTitle)
    .replace(/\{label\}/g, labelName)
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{artist_name\}/g, resolvedArtist)
    .replace(/\{hook\}/g, hook ?? '')

  // BPM: remove gracefully if absent
  if (bpm) {
    result = result.replace(/\{bpm\}/g, bpm)
  } else {
    result = result
      .replace(/\{bpm\}\s*BPM[,·\s]*/g, '')
      .replace(/\{bpm\}/g, '')
  }

  // Key: remove gracefully if absent
  if (key) {
    result = result.replace(/\{key\}/g, key)
  } else {
    result = result.replace(/[,·]\s*\{key\}/g, '').replace(/\{key\}/g, '')
  }

  // Listen link: remove whole line if absent
  if (listenLink) {
    result = result.replace(/\{listen_link\}/g, listenLink)
  } else {
    result = result
      .split('\n')
      .filter((line) => !line.includes('{listen_link}'))
      .join('\n')
  }

  // Press kit link: remove whole line if absent (no press_kit row or no slug)
  if (pressKitLink) {
    result = result.replace(/\{press_kit_link\}/g, pressKitLink)
  } else {
    result = result
      .split('\n')
      .filter((line) => !line.includes('{press_kit_link}'))
      .join('\n')
  }

  // Collapse runs of more than two blank lines
  result = result.replace(/\n{3,}/g, '\n\n').trim()

  return result
}

/**
 * If the template body starts with "Subject: …\n", strip it so it isn't
 * double-rendered in the body preview / mail body.
 */
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

/* ── Step indicator ─────────────────────────────────────────── */
function StepBar({ step }) {
  const steps = ['Track', 'Contact', 'Review', 'Done']
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

/* ── Step 2: pick a contact ─────────────────────────────────── */
function PickContact({ contacts, selected, onSelect }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Choose a contact</p>
      {contacts.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center">
          <p className="text-sm text-muted">No contacts yet.</p>
          <Link
            to="/contacts"
            className="mt-2 inline-block text-sm text-accent hover:underline"
          >
            Add a contact &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onSelect(contact)}
              className={[
                'w-full rounded-lg border p-3 text-left transition-colors',
                selected?.id === contact.id
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-line bg-surface hover:border-line/80 hover:bg-surface-2',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display font-bold text-sm">{contact.name}</span>
                <div className="flex gap-1">
                  <Badge variant="info">
                    {CATEGORY_LABELS[contact.category] ?? contact.category}
                  </Badge>
                  <Badge variant={stageVariant(contact.relationship_stage)}>
                    {contact.relationship_stage}
                  </Badge>
                </div>
              </div>
              {contact.submission_method && (
                <p className="mt-0.5 text-[0.65rem] text-muted capitalize">
                  via {contact.submission_method}
                </p>
              )}
            </button>
          ))}
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
  /* ── template state ── */
  const [templates, setTemplates] = useState([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)

  /* ── hook state ── */
  const [hook, setHook] = useState('')
  const [hookLoading, setHookLoading] = useState(false)
  const [hookError, setHookError] = useState(null)
  const [hookWarn, setHookWarn] = useState(null)
  const hookTextareaRef = useRef(null)

  /* load templates */
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
      // Auto-select: prefer cold_email, else first
      const auto = rows.find((t) => t.kind === 'cold_email') ?? rows[0]
      if (auto) setSelectedTemplateId(auto.id)
      setLoadingTemplates(false)
    }
    load()
    return () => { cancelled = true }
  }, [userId])

  /* hook duplicate guard */
  useEffect(() => {
    if (!hook.trim()) { setHookWarn(null); return }
    const recents = getRecentHooks()
    if (recents.length > 0 && recents[0] === hook.trim()) {
      setHookWarn('Same hook as last time — consider tweaking it for freshness.')
    } else {
      setHookWarn(null)
    }
  }, [hook])

  /* derived filled content */
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

  const hookIsEmpty = !hook.trim()
  const hasNoTemplates = !loadingTemplates && templates.length === 0

  /* AI hook */
  async function handleSuggestHook() {
    setHookLoading(true)
    setHookError(null)
    try {
      const recentHooks = getRecentHooks()

      // Fetch A&R intel and label.why in parallel, gracefully
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

      // Compose ar_intel string from non-empty fields
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

      const labelWhy = labelRes.data?.why ?? ''

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

  /* confirm: persist hook then call parent */
  function handleConfirmWithHook() {
    if (hookIsEmpty) return
    pushRecentHook(hook.trim())
    onConfirm()
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
          <div className="grid grid-cols-2 gap-2">
            <a
              href={mailtoUrl ?? '#'}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <IconMail className="size-4 shrink-0" />
              Mail app
            </a>
            <a
              href={gmailUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <IconGmail className="size-4 shrink-0" />
              Gmail
            </a>
          </div>
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

/* ── Step 3 — form / DM path (unchanged from Phase 4) ──────── */
function NonEmailReviewPanel({
  track,
  contact,
  onConfirm,
  confirming,
  error,
  onBack,
}) {
  const method = contact.submission_method

  const hasExclusiveHold =
    track.exclusive_hold_contact_id &&
    track.exclusive_hold_contact_id !== contact.id &&
    track.exclusive_hold_until &&
    new Date(track.exclusive_hold_until) >= new Date()

  const actionHref =
    method === 'form' ? contact.portal_url : contact.dm_link

  function handleAction() {
    if (!actionHref) return
    window.open(actionHref, '_blank', 'noopener,noreferrer')
  }

  const requirements = contact.notes || null

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
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {confirming ? 'Recording…' : 'Confirm sent'}
        </button>
      </div>
    </div>
  )
}

/* ── Step 3 router ──────────────────────────────────────────── */
function ReviewAndSend(props) {
  const { contact } = props
  if (contact.submission_method === 'email') {
    return <EmailReviewPanel {...props} />
  }
  return <NonEmailReviewPanel {...props} />
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
function SuccessState({ track, contact, submission, onReset }) {
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

/* ── Main page ──────────────────────────────────────────────── */
export default function SendDemo() {
  const { user } = useAuth()
  const [tracks, setTracks] = useState([])
  const [contacts, setContacts] = useState([])
  const [pressKit, setPressKit] = useState(null) // absent if user hasn't filled press_kit
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [step, setStep] = useState(1)
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [submission, setSubmission] = useState(null)

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
      // press_kit is optional — use maybeSingle so a missing row isn't an error
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
    // press_kit absence (null data, no error) is handled gracefully
    if (!pressKitRes.error) {
      setPressKit(pressKitRes.data ?? null)
    }
    setLoadingData(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Derive a display name for the artist
  const artistName =
    pressKit?.artist_name ||
    (user?.email ? user.email.split('@')[0] : 'Unknown Artist')

  function handleSelectTrack(track) {
    setSelectedTrack(track)
    setStep(2)
  }

  function handleSelectContact(contact) {
    setSelectedContact(contact)
    setStep(3)
  }

  async function handleConfirm() {
    if (!selectedTrack || !selectedContact) return
    setConfirming(true)
    setConfirmError(null)

    const now = new Date().toISOString()
    const followUpAt = addDays(7)
    const overdueAt = addDays(14)

    const { data: submissionData, error: subErr } = await supabase
      .from('submissions')
      .insert({
        user_id: user.id,
        track_id: selectedTrack.id,
        contact_id: selectedContact.id,
        method: selectedContact.submission_method,
        status: 'sent',
        sent_at: now,
        follow_up_due_at: followUpAt,
        overdue_at: overdueAt,
      })
      .select()
      .single()

    if (subErr) {
      setConfirmError(subErr.message)
      setConfirming(false)
      return
    }

    await supabase
      .from('contacts')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', selectedContact.id)
      .eq('user_id', user.id)

    if (selectedTrack.status === 'demo_ready') {
      await supabase
        .from('tracks')
        .update({ status: 'submitted', updated_at: now })
        .eq('id', selectedTrack.id)
        .eq('user_id', user.id)
    }

    setSubmission(submissionData)
    setConfirming(false)
    setStep(4)
  }

  function handleReset() {
    setStep(1)
    setSelectedTrack(null)
    setSelectedContact(null)
    setSubmission(null)
    setConfirmError(null)
    load()
  }

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 5</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">Send Demo</h1>
        <p className="mt-0.5 text-sm text-muted">
          Pick a track, pick a contact, send — every send logged.
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
              <PickContact
                contacts={contacts}
                selected={selectedContact}
                onSelect={handleSelectContact}
              />
            </div>
          )}

          {step === 3 && selectedTrack && selectedContact && (
            <ReviewAndSend
              track={selectedTrack}
              contact={selectedContact}
              pressKit={pressKit}
              artistName={artistName}
              userId={user.id}
              onConfirm={handleConfirm}
              confirming={confirming}
              error={confirmError}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && selectedTrack && selectedContact && (
            <SuccessState
              track={selectedTrack}
              contact={selectedContact}
              submission={submission}
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
