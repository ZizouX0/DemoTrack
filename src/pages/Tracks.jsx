import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge, { trackStatusVariant } from '../components/Badge'

/* ── constants ─────────────────────────────────────────────── */
const STATUS_OPTIONS = ['idea', 'demo_ready', 'submitted', 'signed']
const STATUS_LABELS = { idea: 'Idea', demo_ready: 'Demo Ready', submitted: 'Submitted', signed: 'Signed' }
const LINK_TYPES = ['soundcloud', 'dropbox', 'gdrive', 'other']

const RESPONSE_TYPE_OPTIONS = ['yes', 'no', 'not_for_us', 'constructive']
const RESPONSE_TYPE_LABELS = {
  yes: 'Yes — interested',
  no: 'No thanks',
  not_for_us: 'Not for us',
  constructive: 'Constructive feedback',
}

const EMPTY_FORM = {
  title: '',
  genre_tags: '',
  bpm: '',
  musical_key: '',
  status: 'idea',
  listen_link: '',
  link_type: 'soundcloud',
  notes: '',
}

/* ── helpers ────────────────────────────────────────────────── */
function parseTags(raw) {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function tagsToString(arr) {
  return Array.isArray(arr) ? arr.join(', ') : ''
}

function formToRow(form, userId) {
  return {
    user_id: userId,
    title: form.title.trim(),
    genre_tags: parseTags(form.genre_tags),
    bpm: form.bpm ? parseInt(form.bpm, 10) : null,
    musical_key: form.musical_key.trim() || null,
    status: form.status,
    listen_link: form.listen_link.trim() || null,
    link_type: form.listen_link.trim() ? form.link_type : null,
    notes: form.notes.trim() || null,
  }
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* ── Response-type badge ────────────────────────────────────── */
function responseTypeVariant(type) {
  return (
    { yes: 'ok', no: 'danger', not_for_us: 'muted', constructive: 'accent', no_response: 'muted' }[type] ?? 'muted'
  )
}

function responseTypeLabel(type) {
  return (
    { yes: 'Yes', no: 'No', not_for_us: 'Not for us', constructive: 'Constructive', no_response: 'No response' }[type] ?? type
  )
}

/* ── Submission status badge variant ───────────────────────── */
function submissionStatusVariant(status) {
  return (
    {
      sent: 'muted',
      opened: 'info',
      replied: 'accent',
      considering: 'warn',
      signed: 'ok',
      passed: 'danger',
    }[status] ?? 'muted'
  )
}

/* ── Track form modal ───────────────────────────────────────── */
function TrackForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(
    initial ?? EMPTY_FORM
  )

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="track-title" label="Title" required>
        <input
          id="track-title"
          type="text"
          required
          className={inputCls}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Untitled track"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="track-bpm" label="BPM">
          <input
            id="track-bpm"
            type="number"
            min={60}
            max={220}
            className={inputCls}
            value={form.bpm}
            onChange={(e) => set('bpm', e.target.value)}
            placeholder="128"
          />
        </Field>
        <Field id="track-key" label="Key">
          <input
            id="track-key"
            type="text"
            className={inputCls}
            value={form.musical_key}
            onChange={(e) => set('musical_key', e.target.value)}
            placeholder="Am"
          />
        </Field>
      </div>

      <Field id="track-genre" label="Genre tags" hint="Comma-separated">
        <input
          id="track-genre"
          type="text"
          className={inputCls}
          value={form.genre_tags}
          onChange={(e) => set('genre_tags', e.target.value)}
          placeholder="tech house, minimal"
        />
      </Field>

      <Field id="track-status" label="Status">
        <select
          id="track-status"
          className={selectCls}
          value={form.status}
          onChange={(e) => set('status', e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field id="track-link" label="Listen link">
            <input
              id="track-link"
              type="url"
              className={inputCls}
              value={form.listen_link}
              onChange={(e) => set('listen_link', e.target.value)}
              placeholder="https://..."
            />
          </Field>
        </div>
        <Field id="track-link-type" label="Platform">
          <select
            id="track-link-type"
            className={selectCls}
            value={form.link_type}
            onChange={(e) => set('link_type', e.target.value)}
          >
            {LINK_TYPES.map((lt) => (
              <option key={lt} value={lt}>{lt.charAt(0).toUpperCase() + lt.slice(1)}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="track-notes" label="Notes">
        <textarea
          id="track-notes"
          rows={3}
          className={inputCls}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Vibe, reference, mixing notes…"
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
          onClick={onCancel}
          className="flex-1 rounded-lg border border-line py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save track'}
        </button>
      </div>
    </form>
  )
}

/* ── Log Response Modal ─────────────────────────────────────── */
function LogResponseModal({ submissions, onClose, onSuccess, user }) {
  const [submissionId, setSubmissionId] = useState(submissions[0]?.id ?? '')
  const [responseType, setResponseType] = useState('yes')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!submissionId) return
    setSubmitting(true)
    setError(null)

    const chosen = submissions.find((s) => s.id === submissionId)
    if (!chosen) {
      setError('Submission not found.')
      setSubmitting(false)
      return
    }

    const { error: fbErr } = await supabase.from('feedback').insert({
      user_id: user.id,
      track_id: chosen.track_id,
      contact_id: chosen.contact_id,
      submission_id: chosen.id,
      response_type: responseType,
      body: body.trim() || null,
    })

    if (fbErr) {
      setError(fbErr.message)
      setSubmitting(false)
      return
    }

    // Advance status to 'replied' only if currently 'sent' or 'opened'
    if (chosen.status === 'sent' || chosen.status === 'opened') {
      const { error: subErr } = await supabase
        .from('submissions')
        .update({ status: 'replied', updated_at: new Date().toISOString() })
        .eq('id', chosen.id)
        .eq('user_id', user.id)
      if (subErr) {
        setError(subErr.message)
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="log-submission" label="Submission" required>
        <select
          id="log-submission"
          className={selectCls}
          value={submissionId}
          onChange={(e) => setSubmissionId(e.target.value)}
          required
        >
          {submissions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.contacts?.name ?? 'Unknown'} · {s.method} · {fmtDate(s.sent_at)}
            </option>
          ))}
        </select>
      </Field>

      <Field id="log-response-type" label="Response type" required>
        <select
          id="log-response-type"
          className={selectCls}
          value={responseType}
          onChange={(e) => setResponseType(e.target.value)}
          required
        >
          {RESPONSE_TYPE_OPTIONS.map((v) => (
            <option key={v} value={v}>{RESPONSE_TYPE_LABELS[v]}</option>
          ))}
        </select>
      </Field>

      <Field id="log-body" label="Notes / paste their reply" hint="Optional">
        <textarea
          id="log-body"
          rows={3}
          className={inputCls}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Paste what they wrote or add context…"
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
          className="flex-1 rounded-lg border border-line py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !submissionId}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Log response'}
        </button>
      </div>
    </form>
  )
}

/* ── Track detail / history modal ───────────────────────────── */
function TrackDetailModal({ track, user, onClose, onEdit }) {
  const [submissions, setSubmissions] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [logOpen, setLogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [subRes, fbRes] = await Promise.all([
      supabase
        .from('submissions')
        .select('*, contacts(name)')
        .eq('track_id', track.id)
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false }),
      supabase
        .from('feedback')
        .select('*, tracks(title), contacts(name)')
        .eq('track_id', track.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (subRes.error) setError(subRes.error.message)
    else if (fbRes.error) setError(fbRes.error.message)
    else {
      setSubmissions(subRes.data ?? [])
      setFeedback(fbRes.data ?? [])
    }
    setLoading(false)
  }, [track.id, user.id])

  useEffect(() => { load() }, [load])

  function handleLogSuccess() {
    setLogOpen(false)
    load()
  }

  if (logOpen) {
    return (
      <Modal open onClose={() => setLogOpen(false)} title="Log response">
        {submissions.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">No submissions exist for this track yet.</p>
            <button
              type="button"
              onClick={() => setLogOpen(false)}
              className="w-full rounded-lg border border-line py-2.5 text-sm text-muted transition-colors hover:border-text hover:text-text"
            >
              Close
            </button>
          </div>
        ) : (
          <LogResponseModal
            submissions={submissions}
            user={user}
            onClose={() => setLogOpen(false)}
            onSuccess={handleLogSuccess}
          />
        )}
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title={track.title} wide>
      <div className="space-y-5">
        {/* Track meta row */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={trackStatusVariant(track.status)}>
            {STATUS_LABELS[track.status] ?? track.status}
          </Badge>
          {track.bpm && <Badge variant="info">{track.bpm} BPM</Badge>}
          {track.musical_key && <Badge variant="info">{track.musical_key}</Badge>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(track)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-text hover:text-text"
          >
            <IconEdit className="size-3.5" />
            Edit track
          </button>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <IconPlus className="size-3.5" />
            Log response
          </button>
        </div>

        {loading && (
          <div className="space-y-2" aria-busy="true" aria-label="Loading history">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 animate-pulse rounded-lg border border-line bg-surface" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            Failed to load history: {error}
          </p>
        )}

        {!loading && !error && (
          <>
            {/* Submission history */}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Sends ({submissions.length})
              </h3>
              {submissions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-surface/40 px-4 py-5 text-center text-sm text-muted">
                  No sends yet for this track.
                </p>
              ) : (
                <ul className="space-y-2" role="list">
                  {submissions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text">
                          {s.contacts?.name ?? '—'}
                        </p>
                        <p className="text-xs text-muted">
                          {s.method} · {fmtDate(s.sent_at)}
                        </p>
                      </div>
                      <Badge variant={submissionStatusVariant(s.status)}>
                        {s.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Feedback timeline */}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Responses ({feedback.length})
              </h3>
              {feedback.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-surface/40 px-4 py-5 text-center text-sm text-muted">
                  No responses logged yet.
                </p>
              ) : (
                <ul className="space-y-2" role="list">
                  {feedback.map((fb) => (
                    <li
                      key={fb.id}
                      className="rounded-lg border border-line bg-surface-2 px-3 py-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={responseTypeVariant(fb.response_type)}>
                            {fb.response_type === 'no_response' ? (
                              <span className="italic">{responseTypeLabel(fb.response_type)}</span>
                            ) : (
                              responseTypeLabel(fb.response_type)
                            )}
                          </Badge>
                          <span className="text-xs text-muted">
                            {fb.contacts?.name ?? '—'}
                          </span>
                        </div>
                        <span className="shrink-0 text-[0.65rem] text-muted/70">
                          {fmtDate(fb.created_at)}
                        </span>
                      </div>
                      {fb.body && (
                        <p className="text-xs text-text/80 leading-relaxed">{fb.body}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Modal>
  )
}

/* ── Track card ─────────────────────────────────────────────── */
function TrackCard({ track, onEdit, onDelete, onViewHistory }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onViewHistory(track)}
            className="text-left group"
          >
            <h3 className="truncate font-display font-bold leading-tight group-hover:text-accent transition-colors">
              {track.title}
            </h3>
          </button>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant={trackStatusVariant(track.status)}>
              {STATUS_LABELS[track.status] ?? track.status}
            </Badge>
            {track.bpm && (
              <Badge variant="info">{track.bpm} BPM</Badge>
            )}
            {track.musical_key && (
              <Badge variant="info">{track.musical_key}</Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onViewHistory(track)}
            aria-label={`View history for ${track.title}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <IconHistory className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(track)}
            aria-label={`Edit ${track.title}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <IconEdit className="size-4" />
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => onDelete(track.id)}
              aria-label="Confirm delete"
              className="grid size-8 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
            >
              <IconCheck className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${track.title}`}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <IconTrash className="size-4" />
            </button>
          )}
        </div>
      </div>

      {track.genre_tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {track.genre_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[0.65rem] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {track.listen_link && (
        <a
          href={track.listen_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <IconLink className="size-3.5" />
          {track.link_type ?? 'Listen'}
        </a>
      )}

      {track.notes && (
        <p className="line-clamp-2 text-xs text-muted">{track.notes}</p>
      )}
    </article>
  )
}

/* ── Main page ──────────────────────────────────────────────── */
export default function Tracks() {
  const { user } = useAuth()
  const [tracks, setTracks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Edit modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Show a "send demo" nudge after creating a new track
  const [justCreatedTitle, setJustCreatedTitle] = useState(null)

  // Detail / history modal
  const [detailTrack, setDetailTrack] = useState(null)

  /* fetch */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('tracks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setTracks(data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  /* open modals */
  function openNew() {
    setEditing(null)
    setSaveError(null)
    setModalOpen(true)
  }
  function openEdit(track) {
    setEditing({
      ...EMPTY_FORM,
      ...track,
      genre_tags: tagsToString(track.genre_tags),
      bpm: track.bpm ?? '',
      musical_key: track.musical_key ?? '',
      listen_link: track.listen_link ?? '',
      link_type: track.link_type ?? 'soundcloud',
      notes: track.notes ?? '',
    })
    setSaveError(null)
    // Close detail modal if open, open edit modal
    setDetailTrack(null)
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  /* save */
  async function handleSave(form) {
    setSaving(true)
    setSaveError(null)
    const row = formToRow(form, user.id)

    let err
    const isNew = !editing?.id
    if (!isNew) {
      const { error: e } = await supabase
        .from('tracks')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .eq('user_id', user.id)
      err = e
    } else {
      const { error: e } = await supabase.from('tracks').insert(row)
      err = e
    }

    if (err) {
      setSaveError(err.message)
    } else {
      if (isNew) {
        setJustCreatedTitle(form.title.trim())
      }
      closeModal()
      load()
    }
    setSaving(false)
  }

  /* delete */
  async function handleDelete(id) {
    const { error: err } = await supabase
      .from('tracks')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (err) {
      setError(err.message)
    } else {
      setTracks((prev) => prev.filter((t) => t.id !== id))
    }
  }

  /* render */
  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 2</p>
          <h1 className="mt-0.5 text-2xl font-extrabold">Track Vault</h1>
          <p className="mt-0.5 text-sm text-muted">
            {tracks.length > 0 ? `${tracks.length} track${tracks.length !== 1 ? 's' : ''}` : 'Your catalogue lives here.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
        >
          <IconPlus className="size-4" />
          Add
        </button>
      </header>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Failed to load tracks: {error}
          <button
            type="button"
            onClick={load}
            className="mt-2 block text-xs underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && tracks.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-8 text-center">
          <p className="font-display text-lg font-bold">No tracks yet</p>
          <p className="mt-1 text-sm text-muted">
            Add your first track and start building your catalogue.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-4 rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Add first track
          </button>
        </div>
      )}

      {/* Post-create nudge */}
      {justCreatedTitle && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/8 px-4 py-3">
          <p className="text-sm text-text">
            <span className="font-medium">{justCreatedTitle}</span> added.
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/send"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Send a demo with this &rarr;
            </Link>
            <button
              type="button"
              onClick={() => setJustCreatedTitle(null)}
              className="text-muted hover:text-text transition-colors"
              aria-label="Dismiss"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      )}

      {!loading && tracks.length > 0 && (
        <div className="space-y-3">
          {tracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              onEdit={openEdit}
              onDelete={handleDelete}
              onViewHistory={setDetailTrack}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing?.id ? 'Edit track' : 'New track'}
      >
        <TrackForm
          initial={editing}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
          error={saveError}
        />
      </Modal>

      {/* Track detail / history modal */}
      {detailTrack && (
        <TrackDetailModal
          track={detailTrack}
          user={user}
          onClose={() => setDetailTrack(null)}
          onEdit={openEdit}
        />
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
function IconPlus(props) {
  return <svg {...svgBase(props)}><path d="M12 5v14M5 12h14" /></svg>
}
function IconEdit(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  )
}
function IconTrash(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  )
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
function IconHistory(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}
function IconX(props) {
  return <svg {...svgBase(props)}><path d="M18 6 6 18M6 6l12 12" /></svg>
}
