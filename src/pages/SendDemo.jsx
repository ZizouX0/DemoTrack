import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Badge, { trackStatusVariant, stageVariant } from '../components/Badge'

/* ── constants ─────────────────────────────────────────────── */
const STATUS_LABELS = { idea: 'Idea', demo_ready: 'Demo Ready', submitted: 'Submitted', signed: 'Signed' }
const CATEGORY_LABELS = { label: 'Label', dj: 'DJ', ar: 'A&R', curator: 'Curator', blog: 'Blog', promoter: 'Promoter', radio: 'Radio' }

/* ── helpers ────────────────────────────────────────────────── */
function buildMailto(track, contact) {
  const subject = encodeURIComponent(`Demo Submission: ${track.title}`)
  const genre = track.genre_tags?.join(', ') || ''
  const bpmKey = [track.bpm && `${track.bpm} BPM`, track.musical_key].filter(Boolean).join(' · ')
  // Phase 5: replace placeholder with AI-generated body
  const body = encodeURIComponent(
    `Hi,\n\nI wanted to share my latest track "${track.title}" for your consideration.\n\n` +
    (genre ? `Genre: ${genre}\n` : '') +
    (bpmKey ? `${bpmKey}\n` : '') +
    (track.listen_link ? `\nListen: ${track.listen_link}\n` : '') +
    `\n[AI-generated intro — Phase 5]\n\nBest,`
  )
  return `mailto:${contact.email || ''}?subject=${subject}&body=${body}`
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
              className={`text-[0.65rem] font-medium ${active ? 'text-text' : done ? 'text-ok' : 'text-muted'}`}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={`h-px w-4 ${done ? 'bg-ok/40' : 'bg-line'}`} aria-hidden="true" />
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
                  <Badge variant="info">{CATEGORY_LABELS[contact.category] ?? contact.category}</Badge>
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

/* ── Step 3: review + confirm ───────────────────────────────── */
function ReviewAndSend({ track, contact, onConfirm, confirming, error, onBack }) {
  const method = contact.submission_method
  const hasExclusiveHold =
    track.exclusive_hold_contact_id &&
    track.exclusive_hold_contact_id !== contact.id &&
    track.exclusive_hold_until &&
    new Date(track.exclusive_hold_until) >= new Date()

  const actionHref =
    method === 'email'
      ? buildMailto(track, contact)
      : method === 'form'
        ? contact.portal_url
        : contact.dm_link

  function handleAction() {
    if (!actionHref) return
    if (method === 'email') {
      window.location.href = actionHref
    } else {
      window.open(actionHref, '_blank', 'noopener,noreferrer')
    }
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
            <Badge variant={trackStatusVariant(track.status)}>{STATUS_LABELS[track.status] ?? track.status}</Badge>
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
            {new Date(track.exclusive_hold_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
            Sending to another contact may breach that agreement.
          </p>
        </div>
      )}

      {/* Checklist */}
      <div className="rounded-card border border-line bg-surface p-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Pre-send checklist</p>

        <CheckItem done={Boolean(track.listen_link)}>
          Track has a listen link{!track.listen_link && ' — add one in Track Vault'}
        </CheckItem>

        <CheckItem done={track.status === 'demo_ready' || track.status === 'submitted' || track.status === 'signed'}>
          Track is marked Demo Ready or above
        </CheckItem>

        <CheckItem done={Boolean(actionHref)}>
          {method === 'email' && 'Email address on file'}
          {method === 'form' && 'Portal URL on file'}
          {method === 'dm' && 'DM link on file'}
          {!method && 'Submission method set'}
          {actionHref === null && ' — edit the contact to add it'}
        </CheckItem>

        {requirements && (
          <div className="rounded-lg border border-line bg-surface-2 p-3 space-y-1">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">Submission requirements</p>
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
          {method === 'email' && 'Open email client'}
          {method === 'form' && 'Open submission portal'}
          {method === 'dm' && 'Open DM link'}
        </button>
      ) : (
        <div className="rounded-lg border border-line bg-surface-2 p-3 text-center text-xs text-muted">
          No {method} address found on this contact. Edit the contact to add it.
        </div>
      )}

      <div className="rounded-card border border-dashed border-line bg-surface/40 p-3 text-center text-xs text-muted">
        Phase 5 — AI intro draft will appear here.
      </div>

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
    ? new Date(submission.follow_up_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
              {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
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
  const [loadingData, setLoadingData] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const [step, setStep] = useState(1) // 1 | 2 | 3 | 4
  const [selectedTrack, setSelectedTrack] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState(null)
  const [submission, setSubmission] = useState(null)

  const load = useCallback(async () => {
    setLoadingData(true)
    setLoadError(null)
    const [tracksRes, contactsRes] = await Promise.all([
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
    ])
    if (tracksRes.error || contactsRes.error) {
      setLoadError(tracksRes.error?.message || contactsRes.error?.message)
    } else {
      setTracks(tracksRes.data ?? [])
      setContacts(contactsRes.data ?? [])
    }
    setLoadingData(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

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

    // Insert submission row
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

    // Update contact's last_contacted_at
    await supabase
      .from('contacts')
      .update({ last_contacted_at: now, updated_at: now })
      .eq('id', selectedContact.id)
      .eq('user_id', user.id)

    // Optionally advance track status to submitted if it was demo_ready
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

  /* render */
  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 4</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">Send Demo</h1>
        <p className="mt-0.5 text-sm text-muted">Pick a track, pick a contact, send — every send logged.</p>
      </header>

      {/* Step bar (hide on done) */}
      {step < 4 && <StepBar step={step} />}

      {/* Loading */}
      {loadingData && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-20 animate-pulse rounded-card border border-line bg-surface" />
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
              {/* show selected track context */}
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
