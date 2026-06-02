import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge from '../components/Badge'

/* ── constants ─────────────────────────────────────────────── */
const KIND_OPTIONS = ['cold_email', 'dm', 'follow_up', 'form_note']
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

const MERGE_FIELDS = [
  '{genre}', '{track_title}', '{label}', '{first_name}',
  '{artist_name}', '{bpm}', '{key}', '{listen_link}',
  '{press_kit_link}', '{hook}',
]

const STARTER_PRESETS = [
  {
    name: 'Cold email',
    kind: 'cold_email',
    subject: '{genre} demo — "{track_title}" for {label}',
    body: `Hi {first_name},

I'm {artist_name}, a house & tech house producer from Tunis. {hook}

"{track_title}" — {bpm} BPM, {key}. Private listen: {listen_link}
More on me: {press_kit_link}

Would love your thoughts. Thanks for listening.
{artist_name}`,
  },
  {
    name: 'DM (shorter)',
    kind: 'dm',
    subject: '',
    body: `Hey {first_name} — {hook}

New track "{track_title}" ({genre}, {bpm} BPM). Listen: {listen_link}

Let me know what you think.`,
  },
  {
    name: 'Warm follow-up',
    kind: 'follow_up',
    subject: 'Re: {track_title} — following up',
    body: `Hi {first_name},

Just following up on "{track_title}" I sent over recently. Happy to share stems or an exclusive window if you're interested.

Listen again: {listen_link}

Thanks,
{artist_name}`,
  },
  {
    name: 'Form / portal note',
    kind: 'form_note',
    subject: '',
    body: `Hi — I'm {artist_name}, a house & tech house producer from Tunis.

Track: "{track_title}" | {genre} | {bpm} BPM | {key}
Listen: {listen_link}

{hook}`,
  },
]

const EMPTY_FORM = { name: '', kind: 'cold_email', subject: '', body: '' }

/* ── Template form ──────────────────────────────────────────── */
function TemplateForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.body.trim()) return
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="tpl-name" label="Name" required>
        <input
          id="tpl-name"
          type="text"
          required
          className={inputCls}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="My cold email…"
        />
      </Field>

      <Field id="tpl-kind" label="Kind">
        <select
          id="tpl-kind"
          className={selectCls}
          value={form.kind}
          onChange={(e) => set('kind', e.target.value)}
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
      </Field>

      <Field id="tpl-subject" label="Subject line">
        <input
          id="tpl-subject"
          type="text"
          className={inputCls}
          value={form.subject}
          onChange={(e) => set('subject', e.target.value)}
          placeholder="Leave blank for DM / form presets"
        />
      </Field>

      <Field
        id="tpl-body"
        label="Body"
        required
        hint={`Available merge fields: ${MERGE_FIELDS.join('  ')}`}
      >
        <textarea
          id="tpl-body"
          rows={9}
          required
          className={inputCls}
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          placeholder="Write your template…"
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
          {saving ? 'Saving…' : 'Save preset'}
        </button>
      </div>
    </form>
  )
}

/* ── Template card ──────────────────────────────────────────── */
function TemplateCard({ template, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-bold leading-tight text-text">
            {template.name}
          </h3>
          <div className="mt-1.5">
            <Badge variant={KIND_VARIANT[template.kind] ?? 'muted'}>
              {KIND_LABELS[template.kind] ?? template.kind}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(template)}
            aria-label={`Edit ${template.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <IconEdit className="size-4" />
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => onDelete(template.id)}
              aria-label="Confirm delete"
              className="grid size-8 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
            >
              <IconCheck className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${template.name}`}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <IconTrash className="size-4" />
            </button>
          )}
        </div>
      </div>

      {template.subject && (
        <p className="truncate text-xs text-muted">
          <span className="font-medium text-muted/70 uppercase tracking-wider text-[0.6rem]">Subject </span>
          {template.subject}
        </p>
      )}

      <p className="line-clamp-2 text-xs text-muted whitespace-pre-line">
        {template.body}
      </p>
    </article>
  )
}

/* ── Main You page ──────────────────────────────────────────── */
export default function You() {
  const { user } = useAuth()

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [seeding, setSeeding] = useState(false)

  /* fetch */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setTemplates(data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  /* open modals */
  function openNew() {
    setEditing(null)
    setSaveError(null)
    setModalOpen(true)
  }
  function openEdit(template) {
    setEditing({
      ...EMPTY_FORM,
      ...template,
      subject: template.subject ?? '',
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
    const now = new Date().toISOString()
    const row = {
      user_id: user.id,
      name: form.name.trim(),
      kind: form.kind,
      subject: form.subject.trim() || null,
      body: form.body.trim(),
      updated_at: now,
    }

    let err
    if (editing?.id) {
      const { error: e } = await supabase
        .from('templates')
        .update(row)
        .eq('id', editing.id)
        .eq('user_id', user.id)
      err = e
    } else {
      const { error: e } = await supabase
        .from('templates')
        .insert({ ...row, created_at: now })
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
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (err) setError(err.message)
    else setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  /* seed starter presets */
  async function handleSeedStarters() {
    setSeeding(true)
    const now = new Date().toISOString()
    const rows = STARTER_PRESETS.map((p) => ({
      user_id: user.id,
      name: p.name,
      kind: p.kind,
      subject: p.subject || null,
      body: p.body,
      created_at: now,
      updated_at: now,
    }))
    const { error: err } = await supabase.from('templates').insert(rows)
    if (err) setError(err.message)
    else load()
    setSeeding(false)
  }

  /* render */
  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 5</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">You</h1>
        <p className="mt-0.5 text-sm text-muted">Email presets and your artist profile.</p>
      </header>

      {/* Signed in as */}
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Signed in as</p>
        <p className="mt-0.5 text-text">{user?.email}</p>
      </div>

      {/* Email Presets section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Email Presets</p>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <IconPlus className="size-3.5" />
            New preset
          </button>
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2].map((n) => (
              <div key={n} className="h-24 animate-pulse rounded-card border border-line bg-surface" />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            Failed to load presets: {error}
            <button type="button" onClick={load} className="mt-2 block text-xs underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="rounded-card border border-dashed border-line bg-surface/40 p-6 text-center space-y-3">
            <p className="font-display font-bold text-text">No presets yet</p>
            <p className="text-xs text-muted">
              Email presets let you draft and re-use personalised cold emails with merge fields.
            </p>
            <button
              type="button"
              disabled={seeding}
              onClick={handleSeedStarters}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <IconSparkle className="size-4" />
              {seeding ? 'Adding…' : 'Add starter presets'}
            </button>
          </div>
        )}

        {!loading && !error && templates.length > 0 && (
          <>
            <div className="space-y-3">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            {/* Offer starter seed even after user has some templates — only if no cold_email exists */}
            {!templates.some((t) => t.kind === 'cold_email') && (
              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedStarters}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
              >
                <IconSparkle className="size-3.5" />
                {seeding ? 'Adding…' : 'Add starter presets'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Future phases placeholder */}
      <div className="rounded-card border border-dashed border-line bg-surface/40 p-5 text-center text-xs text-muted">
        Artist Press Kit, Work Sessions &amp; Goals arrive in Phases 12–13.
      </div>

      {/* Template modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing?.id ? 'Edit preset' : 'New preset'}
        wide
      >
        <TemplateForm
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
function IconSparkle(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M12 3 9.5 9.5 3 12l6.5 2.5L12 21l2.5-6.5L21 12l-6.5-2.5Z" />
    </svg>
  )
}
