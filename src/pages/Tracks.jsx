import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge, { trackStatusVariant } from '../components/Badge'

/* ── constants ─────────────────────────────────────────────── */
const STATUS_OPTIONS = ['idea', 'demo_ready', 'submitted', 'signed']
const STATUS_LABELS = { idea: 'Idea', demo_ready: 'Demo Ready', submitted: 'Submitted', signed: 'Signed' }
const LINK_TYPES = ['soundcloud', 'dropbox', 'gdrive', 'other']

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

/* ── Track card ─────────────────────────────────────────────── */
function TrackCard({ track, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-bold leading-tight">{track.title}</h3>
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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null) // null = new, track obj = edit
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

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

  /* open modal */
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
    if (editing?.id) {
      // update
      const { error: e } = await supabase
        .from('tracks')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .eq('user_id', user.id)
      err = e
    } else {
      // insert
      const { error: e } = await supabase.from('tracks').insert(row)
      err = e
    }

    if (err) {
      setSaveError(err.message)
    } else {
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

      {!loading && tracks.length > 0 && (
        <div className="space-y-3">
          {tracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

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
