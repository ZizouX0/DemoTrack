import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge, { stageVariant, tierVariant } from '../components/Badge'

/* ── constants ─────────────────────────────────────────────── */
const CATEGORY_OPTIONS = ['label', 'dj', 'ar', 'curator', 'blog', 'promoter', 'radio']
const CATEGORY_LABELS = { label: 'Label', dj: 'DJ', ar: 'A&R', curator: 'Curator', blog: 'Blog', promoter: 'Promoter', radio: 'Radio' }
const METHOD_OPTIONS = ['email', 'form', 'dm']
const STAGE_OPTIONS = ['cold', 'engaged', 'responded', 'relationship']
const ACCESS_OPTIONS = ['cold_demo_friendly', 'open_window_only', 'needs_warm_intro', 'relationship_only']
const ACCESS_LABELS = {
  cold_demo_friendly: 'Cold Demo Friendly',
  open_window_only: 'Open Window Only',
  needs_warm_intro: 'Needs Warm Intro',
  relationship_only: 'Relationship Only',
}

const EMPTY_FORM = {
  name: '',
  category: 'label',
  submission_method: 'email',
  email: '',
  portal_url: '',
  dm_link: '',
  relationship_stage: 'cold',
  access_path: 'cold_demo_friendly',
  notes: '',
  label_id: null,
}

/* ── helpers ────────────────────────────────────────────────── */
function formToRow(form, userId) {
  return {
    user_id: userId,
    name: form.name.trim(),
    category: form.category,
    submission_method: form.submission_method || null,
    email: form.email.trim() || null,
    portal_url: form.portal_url.trim() || null,
    dm_link: form.dm_link.trim() || null,
    relationship_stage: form.relationship_stage,
    access_path: form.access_path || null,
    notes: form.notes.trim() || null,
    label_id: form.label_id || null,
  }
}

function methodIcon(method) {
  if (method === 'email') return '✉'
  if (method === 'form') return '⊞'
  if (method === 'dm') return '◎'
  return '—'
}

/* ── Contact form modal ─────────────────────────────────────── */
function ContactForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial ?? EMPTY_FORM)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="contact-name" label="Name" required>
        <input
          id="contact-name"
          type="text"
          required
          className={inputCls}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Drumcode, Hot Creations…"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="contact-category" label="Category">
          <select
            id="contact-category"
            className={selectCls}
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </Field>

        <Field id="contact-method" label="Submit via">
          <select
            id="contact-method"
            className={selectCls}
            value={form.submission_method}
            onChange={(e) => set('submission_method', e.target.value)}
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
            ))}
          </select>
        </Field>
      </div>

      {form.submission_method === 'email' && (
        <Field id="contact-email" label="Email address">
          <input
            id="contact-email"
            type="email"
            className={inputCls}
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="demos@label.com"
          />
        </Field>
      )}

      {form.submission_method === 'form' && (
        <Field id="contact-portal" label="Portal URL">
          <input
            id="contact-portal"
            type="url"
            className={inputCls}
            value={form.portal_url}
            onChange={(e) => set('portal_url', e.target.value)}
            placeholder="https://…"
          />
        </Field>
      )}

      {form.submission_method === 'dm' && (
        <Field id="contact-dm" label="DM link">
          <input
            id="contact-dm"
            type="url"
            className={inputCls}
            value={form.dm_link}
            onChange={(e) => set('dm_link', e.target.value)}
            placeholder="https://instagram.com/…"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field id="contact-stage" label="Relationship">
          <select
            id="contact-stage"
            className={selectCls}
            value={form.relationship_stage}
            onChange={(e) => set('relationship_stage', e.target.value)}
          >
            {STAGE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </Field>

        <Field id="contact-access" label="Access">
          <select
            id="contact-access"
            className={selectCls}
            value={form.access_path}
            onChange={(e) => set('access_path', e.target.value)}
          >
            {ACCESS_OPTIONS.map((a) => (
              <option key={a} value={a}>{ACCESS_LABELS[a]}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="contact-notes" label="Notes">
        <textarea
          id="contact-notes"
          rows={3}
          className={inputCls}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="What you know about them, what they're looking for…"
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
          {saving ? 'Saving…' : 'Save contact'}
        </button>
      </div>
    </form>
  )
}

/* ── Contact card ───────────────────────────────────────────── */
function ContactCard({ contact, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false)

  const contactLink =
    contact.submission_method === 'email'
      ? contact.email
      : contact.submission_method === 'form'
        ? contact.portal_url
        : contact.dm_link

  const contactHref =
    contact.submission_method === 'email' && contact.email
      ? `mailto:${contact.email}`
      : contactLink || null

  const lastContacted = contact.last_contacted_at
    ? new Date(contact.last_contacted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display font-bold leading-tight">{contact.name}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge variant="info">{CATEGORY_LABELS[contact.category] ?? contact.category}</Badge>
            <Badge variant={stageVariant(contact.relationship_stage)}>
              {contact.relationship_stage}
            </Badge>
            {contact.submission_method && (
              <Badge variant="muted">
                {methodIcon(contact.submission_method)} {contact.submission_method}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(contact)}
            aria-label={`Edit ${contact.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <IconEdit className="size-4" />
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => onDelete(contact.id)}
              aria-label="Confirm delete"
              className="grid size-8 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
            >
              <IconCheck className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${contact.name}`}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <IconTrash className="size-4" />
            </button>
          )}
        </div>
      </div>

      {contact.access_path && (
        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted">
          {ACCESS_LABELS[contact.access_path] ?? contact.access_path}
        </p>
      )}

      {contactHref && contactLink && (
        <a
          href={contactHref}
          target={contact.submission_method !== 'email' ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
        >
          <IconLink className="size-3.5" />
          {contactLink.length > 40 ? contactLink.slice(0, 40) + '…' : contactLink}
        </a>
      )}

      {lastContacted && (
        <p className="text-xs text-muted">Last contacted: {lastContacted}</p>
      )}

      {contact.notes && (
        <p className="line-clamp-2 text-xs text-muted">{contact.notes}</p>
      )}
    </article>
  )
}

/* ── Label discovery picker ─────────────────────────────────── */
function LabelDiscovery({ existingLabelIds, onAdd, onClose }) {
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    async function fetchLabels() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('labels')
        .select('id, name, tier, access_path, submission_method, contact_link, genre_tags, submission_requirements, why')
        .order('name', { ascending: true })
      if (err) setError(err.message)
      else setLabels(data ?? [])
      setLoading(false)
    }
    fetchLabels()
  }, [])

  const filtered = labels.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase()) ||
      (l.genre_tags ?? []).some((g) => g.toLowerCase().includes(search.toLowerCase()))
    const matchTier = !tierFilter || l.tier === tierFilter
    const matchAccess = !accessFilter || l.access_path === accessFilter
    const alreadyAdded = existingLabelIds.has(l.id)
    return matchSearch && matchTier && matchAccess && !alreadyAdded
  })

  async function handleAdd() {
    if (!selected) return
    setAdding(true)
    await onAdd(selected)
    setAdding(false)
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="space-y-2">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="search"
            aria-label="Search labels"
            placeholder="Search by name or genre…"
            className={`${inputCls} pl-9`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Filter by tier"
            className={selectCls}
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="">All tiers</option>
            <option value="elite">Elite</option>
            <option value="a">A-tier</option>
            <option value="b">B-tier</option>
          </select>
          <select
            aria-label="Filter by access"
            className={selectCls}
            value={accessFilter}
            onChange={(e) => setAccessFilter(e.target.value)}
          >
            <option value="">All access</option>
            {ACCESS_OPTIONS.map((a) => (
              <option key={a} value={a}>{ACCESS_LABELS[a]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-14 animate-pulse rounded-lg border border-line bg-surface" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-danger">Failed to load labels: {error}</p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">
          {labels.length === 0 ? 'No labels available.' : 'No results — try a different search or filter.'}
        </p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {filtered.map((label) => (
            <button
              key={label.id}
              type="button"
              onClick={() => setSelected(selected?.id === label.id ? null : label)}
              className={[
                'w-full rounded-lg border p-3 text-left transition-colors',
                selected?.id === label.id
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-line bg-surface-2 hover:border-line/80 hover:bg-surface',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-sm">{label.name}</span>
                <div className="flex shrink-0 gap-1">
                  {label.tier && <Badge variant={tierVariant(label.tier)}>{label.tier}</Badge>}
                  {label.submission_method && (
                    <Badge variant="muted">{label.submission_method}</Badge>
                  )}
                </div>
              </div>
              {label.genre_tags?.length > 0 && (
                <p className="mt-0.5 truncate text-[0.65rem] text-muted">
                  {label.genre_tags.join(', ')}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Preview of selected */}
      {selected && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-accent">{selected.name}</p>
          {selected.why && (
            <p className="text-xs text-muted">{selected.why}</p>
          )}
          {selected.submission_requirements && (
            <div className="rounded bg-surface-2 px-2 py-1.5">
              <p className="text-[0.65rem] font-medium uppercase tracking-wider text-muted mb-0.5">Requirements</p>
              <p className="text-xs text-text">{selected.submission_requirements}</p>
            </div>
          )}
        </div>
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
          type="button"
          disabled={!selected || adding}
          onClick={handleAdd}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {adding ? 'Adding…' : 'Add to contacts'}
        </button>
      </div>
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────────── */
export default function Contacts() {
  const { user } = useAuth()
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Manual add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Label discovery modal
  const [discoverOpen, setDiscoverOpen] = useState(false)

  /* fetch */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setContacts(data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  /* existing label IDs to prevent duplicates */
  const existingLabelIds = new Set(contacts.map((c) => c.label_id).filter(Boolean))

  /* open modals */
  function openNew() {
    setEditing(null)
    setSaveError(null)
    setModalOpen(true)
  }
  function openEdit(contact) {
    setEditing({
      ...EMPTY_FORM,
      ...contact,
      email: contact.email ?? '',
      portal_url: contact.portal_url ?? '',
      dm_link: contact.dm_link ?? '',
      notes: contact.notes ?? '',
    })
    setSaveError(null)
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  /* save manual contact */
  async function handleSave(form) {
    setSaving(true)
    setSaveError(null)
    const row = formToRow(form, user.id)

    let err
    if (editing?.id) {
      const { error: e } = await supabase
        .from('contacts')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .eq('user_id', user.id)
      err = e
    } else {
      const { error: e } = await supabase.from('contacts').insert(row)
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
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
    if (err) setError(err.message)
    else setContacts((prev) => prev.filter((c) => c.id !== id))
  }

  /* add from label discovery */
  async function handleAddFromLabel(label) {
    // Derive contact_link into the right field based on submission_method
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
    const { error: err } = await supabase.from('contacts').insert(row)
    if (err) {
      setError(err.message)
    } else {
      setDiscoverOpen(false)
      load()
    }
  }

  /* render */
  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 3</p>
          <h1 className="mt-0.5 text-2xl font-extrabold">Labels &amp; Contacts</h1>
          <p className="mt-0.5 text-sm text-muted">
            {contacts.length > 0
              ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
              : 'Your outreach CRM.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDiscoverOpen(true)}
            aria-label="Add from label discovery"
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
          >
            <IconSearch className="size-4" />
            Discover
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <IconPlus className="size-4" />
            Add
          </button>
        </div>
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
          Failed to load contacts: {error}
          <button type="button" onClick={load} className="mt-2 block text-xs underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && contacts.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-8 text-center">
          <p className="font-display text-lg font-bold">No contacts yet</p>
          <p className="mt-1 text-sm text-muted">
            Add a label manually or discover from 288 seeded labels.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setDiscoverOpen(true)}
              className="rounded-lg border border-line px-5 py-2 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
            >
              Browse Labels
            </button>
            <button
              type="button"
              onClick={openNew}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
            >
              Add manually
            </button>
          </div>
        </div>
      )}

      {!loading && contacts.length > 0 && (
        <div className="space-y-3">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Manual add/edit modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing?.id ? 'Edit contact' : 'New contact'}
      >
        <ContactForm
          initial={editing}
          onSave={handleSave}
          onCancel={closeModal}
          saving={saving}
          error={saveError}
        />
      </Modal>

      {/* Label discovery modal */}
      <Modal
        open={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        title="Discover Labels"
        wide
      >
        <LabelDiscovery
          existingLabelIds={existingLabelIds}
          onAdd={handleAddFromLabel}
          onClose={() => setDiscoverOpen(false)}
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
function IconSearch(props) {
  return (
    <svg {...svgBase(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}
