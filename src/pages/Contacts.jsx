import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge, { stageVariant } from '../components/Badge'
import LabelDiscovery from '../components/LabelDiscovery'

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

const RESPONSE_TYPE_OPTIONS = ['yes', 'no', 'not_for_us', 'constructive']
const RESPONSE_TYPE_LABELS = {
  yes: 'Yes — interested',
  no: 'No thanks',
  not_for_us: 'Not for us',
  constructive: 'Constructive feedback',
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

const EMPTY_INTEL = {
  runs_label: '',
  signs: '',
  recent_releases: '',
  submission_prefs: '',
  personal_angle: '',
  notes: '',
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

/* ── Prioritization sort ────────────────────────────────────── */
/**
 * Sort order:
 * 1. Untried (times_contacted === 0) AND cold_demo_friendly
 * 2. Remaining cold_demo_friendly
 * 3. open_window_only
 * 4. needs_warm_intro
 * 5. relationship_only
 * Within each group: times_contacted asc, then name asc
 */
const ACCESS_RANK = {
  cold_demo_friendly: 0,
  open_window_only: 1,
  needs_warm_intro: 2,
  relationship_only: 3,
}

function sortContacts(contacts, sendCounts) {
  function getCount(c) {
    return sendCounts[c.id]?.times_contacted ?? 0
  }
  function getGroup(c) {
    const count = getCount(c)
    const accessRank = ACCESS_RANK[c.access_path] ?? 4
    // Group 0: untried cold_demo_friendly
    if (count === 0 && c.access_path === 'cold_demo_friendly') return 0
    // Group 1: tried cold_demo_friendly
    if (c.access_path === 'cold_demo_friendly') return 1
    // Groups 2–5 by access rank
    return accessRank + 2
  }
  return [...contacts].sort((a, b) => {
    const ga = getGroup(a)
    const gb = getGroup(b)
    if (ga !== gb) return ga - gb
    const ca = getCount(a)
    const cb = getCount(b)
    if (ca !== cb) return ca - cb
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/* ── A&R Intel form ─────────────────────────────────────────── */
function ARIntelSection({ contact, user }) {
  const [intel, setIntel] = useState(EMPTY_INTEL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('ar_intel')
        .select('*')
        .eq('user_id', user.id)
        .eq('contact_id', contact.id)
        .maybeSingle()
      if (cancelled) return
      if (err) {
        setError(err.message)
      } else if (data) {
        setIntel({
          runs_label: data.runs_label ?? '',
          signs: data.signs ?? '',
          recent_releases: data.recent_releases ?? '',
          submission_prefs: data.submission_prefs ?? '',
          personal_angle: data.personal_angle ?? '',
          notes: data.notes ?? '',
        })
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [contact.id, user.id])

  function set(field, value) {
    setIntel((prev) => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    const { error: upsertErr } = await supabase
      .from('ar_intel')
      .upsert(
        {
          user_id: user.id,
          contact_id: contact.id,
          runs_label: intel.runs_label.trim() || null,
          signs: intel.signs.trim() || null,
          recent_releases: intel.recent_releases.trim() || null,
          submission_prefs: intel.submission_prefs.trim() || null,
          personal_angle: intel.personal_angle.trim() || null,
          notes: intel.notes.trim() || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,contact_id' }
      )

    if (upsertErr) {
      setError(upsertErr.message)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading A&R intel">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-10 animate-pulse rounded-lg border border-line bg-surface" />
        ))}
      </div>
    )
  }

  return (
    <section aria-labelledby="ar-intel-heading">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id="ar-intel-heading"
          className="text-xs font-medium uppercase tracking-wider text-muted"
        >
          A&amp;R Intel
        </h3>
        {saved && (
          <span className="flex items-center gap-1 text-[0.65rem] font-semibold text-ok">
            <IconCheck className="size-3" />
            Saved
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <Field id={`intel-runs-${contact.id}`} label="Who runs it">
          <input
            id={`intel-runs-${contact.id}`}
            type="text"
            className={inputCls}
            value={intel.runs_label}
            onChange={(e) => set('runs_label', e.target.value)}
            placeholder="e.g. Adam Beyer, Seth Troxler…"
          />
        </Field>

        <Field id={`intel-signs-${contact.id}`} label="What they sign">
          <input
            id={`intel-signs-${contact.id}`}
            type="text"
            className={inputCls}
            value={intel.signs}
            onChange={(e) => set('signs', e.target.value)}
            placeholder="e.g. driving techno, dark minimal, 125–135 BPM…"
          />
        </Field>

        <Field id={`intel-recent-${contact.id}`} label="Recent releases">
          <input
            id={`intel-recent-${contact.id}`}
            type="text"
            className={inputCls}
            value={intel.recent_releases}
            onChange={(e) => set('recent_releases', e.target.value)}
            placeholder="e.g. SOMA-452, Kode9 remix EP…"
          />
        </Field>

        <Field id={`intel-prefs-${contact.id}`} label="Submission preferences">
          <input
            id={`intel-prefs-${contact.id}`}
            type="text"
            className={inputCls}
            value={intel.submission_prefs}
            onChange={(e) => set('submission_prefs', e.target.value)}
            placeholder="e.g. demos@label.com, no SoundCloud links…"
          />
        </Field>

        <Field id={`intel-angle-${contact.id}`} label="Personal angle">
          <input
            id={`intel-angle-${contact.id}`}
            type="text"
            className={inputCls}
            value={intel.personal_angle}
            onChange={(e) => set('personal_angle', e.target.value)}
            placeholder="e.g. met at ADE, mutual with DJ X…"
          />
        </Field>

        <Field id={`intel-notes-${contact.id}`} label="Notes">
          <textarea
            id={`intel-notes-${contact.id}`}
            rows={3}
            className={inputCls}
            value={intel.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything else worth knowing…"
          />
        </Field>

        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.65rem] text-muted/70 italic">
            This intel feeds the AI email hook.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save intel'}
          </button>
        </div>
      </form>
    </section>
  )
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

/* ── Log Response Modal ─────────────────────────────────────── */
function LogResponseModal({ submissions, user, onClose, onSuccess }) {
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
              {s.tracks?.title ?? 'Unknown track'} · {s.method} · {fmtDate(s.sent_at)}
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

/* ── Contact history modal ──────────────────────────────────── */
function ContactHistoryModal({ contact, user, onClose, onEdit, onDelete }) {
  const [submissions, setSubmissions] = useState([])
  const [feedback, setFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [logOpen, setLogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [subRes, fbRes] = await Promise.all([
      supabase
        .from('submissions')
        .select('*, tracks(title)')
        .eq('contact_id', contact.id)
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false }),
      supabase
        .from('feedback')
        .select('*, tracks(title), contacts(name)')
        .eq('contact_id', contact.id)
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
  }, [contact.id, user.id])

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
            <p className="text-sm text-muted">No submissions exist for this contact yet.</p>
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
    <Modal open onClose={onClose} title={contact.name} wide>
      <div className="space-y-5">
        {/* Contact meta row */}
        <div className="flex flex-wrap gap-1.5">
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

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { onEdit(contact); onClose() }}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-text hover:text-text"
          >
            <IconEdit className="size-3.5" />
            Edit contact
          </button>
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
          >
            <IconPlus className="size-3.5" />
            Log response
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => { onDelete(contact.id); onClose() }}
              className="flex items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/20"
            >
              <IconCheck className="size-3.5" />
              Confirm delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger"
            >
              <IconTrash className="size-3.5" />
              Delete
            </button>
          )}
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
            {/* A&R Intel section */}
            <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
              <ARIntelSection contact={contact} user={user} />
            </div>

            {/* Submission history */}
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Sends ({submissions.length})
              </h3>
              {submissions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-surface/40 px-4 py-5 text-center text-sm text-muted">
                  No sends to this contact yet.
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
                          {s.tracks?.title ?? '—'}
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
                          {fb.tracks?.title && (
                            <span className="truncate text-xs text-muted max-w-[8rem]">
                              {fb.tracks.title}
                            </span>
                          )}
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

/* ── Contact card ───────────────────────────────────────────── */
function ContactCard({ contact, onEdit, onDelete, onViewHistory, sendCount }) {
  // Fix 10: two-tap delete confirm, consistent with history-modal delete pattern
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

  const timesContacted = sendCount?.times_contacted ?? 0
  const lastSentAt = sendCount?.last_sent_at
    ? new Date(sendCount.last_sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <article className="rounded-card border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onViewHistory(contact)}
            className="text-left group"
          >
            <h3 className="truncate font-display font-bold leading-tight group-hover:text-accent transition-colors">
              {contact.name}
            </h3>
          </button>
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
            {/* Contacted count badge */}
            {timesContacted === 0 ? (
              <Badge variant="accent">untried</Badge>
            ) : (
              <Badge variant="muted">contacted &times;{timesContacted}</Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onViewHistory(contact)}
            aria-label={`View history for ${contact.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <IconHistory className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(contact)}
            aria-label={`Edit ${contact.name}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <IconEdit className="size-4" />
          </button>
          {confirmingDelete ? (
            <button
              type="button"
              onClick={() => onDelete(contact.id)}
              aria-label={`Confirm delete ${contact.name}`}
              title="Confirm — this deletes all history"
              className="grid size-8 place-items-center rounded-lg bg-danger/10 text-danger transition-colors hover:bg-danger/20"
            >
              <IconCheck className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
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

      {/* Last sent from send counts (more accurate than last_contacted_at) */}
      {lastSentAt ? (
        <p className="text-xs text-muted">Last sent: {lastSentAt}</p>
      ) : lastContacted ? (
        <p className="text-xs text-muted">Last contacted: {lastContacted}</p>
      ) : null}

      {contact.notes && (
        <p className="line-clamp-2 text-xs text-muted">{contact.notes}</p>
      )}
    </article>
  )
}

/* ── Label discovery picker (Phase 3 modal — superseded by Discover tab) ── */
// The full-page Discover tab uses the LabelDiscovery component imported above.
// This inline picker is kept only for backward compatibility with the modal button.

/* ── Filter chips ───────────────────────────────────────────── */
function FilterChips({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
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

/* ── Main page ──────────────────────────────────────────────── */
export default function Contacts() {
  const { user } = useAuth()

  // Tab: 'crm' | 'discover'
  const [activeTab, setActiveTab] = useState('crm')

  const [contacts, setContacts] = useState([])
  const [sendCounts, setSendCounts] = useState({}) // keyed by contact_id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accessFilter, setAccessFilter] = useState('')

  // Manual add/edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Contact history modal
  const [historyContact, setHistoryContact] = useState(null)

  /* fetch */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [contactsRes, countsRes] = await Promise.all([
      supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('contact_send_counts')
        .select('contact_id, times_contacted, last_sent_at')
        .eq('user_id', user.id),
    ])

    if (contactsRes.error) {
      setError(contactsRes.error.message)
    } else {
      setContacts(contactsRes.data ?? [])
    }

    // Build a lookup map; counts query failure is non-fatal
    if (!countsRes.error && countsRes.data) {
      const map = {}
      for (const row of countsRes.data) {
        map[row.contact_id] = { times_contacted: row.times_contacted, last_sent_at: row.last_sent_at }
      }
      setSendCounts(map)
    }

    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

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

  /* derived: filtered + sorted contacts */
  const filteredContacts = contacts.filter((c) => {
    const matchCat = !categoryFilter || c.category === categoryFilter
    const matchAccess = !accessFilter || c.access_path === accessFilter
    return matchCat && matchAccess
  })

  const sortedContacts = sortContacts(filteredContacts, sendCounts)

  /* render */
  return (
    <section className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 10</p>
          <h1 className="mt-0.5 text-2xl font-extrabold">Labels &amp; Contacts</h1>
          <p className="mt-0.5 text-sm text-muted">
            {activeTab === 'crm'
              ? contacts.length > 0
                ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
                : 'Your outreach CRM.'
              : 'Browse the label master — add to your CRM instantly.'}
          </p>
        </div>
        {activeTab === 'crm' && (
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <IconPlus className="size-4" />
            Add
          </button>
        )}
      </header>

      {/* Segmented toggle: My CRM | Discover */}
      <div
        role="tablist"
        aria-label="Labels view"
        className="flex rounded-xl border border-line bg-surface-2 p-1 gap-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'crm'}
          onClick={() => setActiveTab('crm')}
          className={[
            'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
            activeTab === 'crm'
              ? 'bg-surface text-text shadow-sm'
              : 'text-muted hover:text-text',
          ].join(' ')}
        >
          My CRM
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'discover'}
          onClick={() => setActiveTab('discover')}
          className={[
            'flex-1 rounded-lg py-2 text-sm font-semibold transition-colors',
            activeTab === 'discover'
              ? 'bg-surface text-text shadow-sm'
              : 'text-muted hover:text-text',
          ].join(' ')}
        >
          Discover
        </button>
      </div>

      {/* ── My CRM tab ── */}
      {activeTab === 'crm' && (
        <>
          {/* Filter controls */}
          {!loading && contacts.length > 0 && (
            <div className="space-y-2">
              <FilterChips
                label="Filter by category"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={CATEGORY_OPTIONS.map((c) => [c, CATEGORY_LABELS[c]])}
              />
              <FilterChips
                label="Filter by access path"
                value={accessFilter}
                onChange={setAccessFilter}
                options={ACCESS_OPTIONS.map((a) => [a, ACCESS_LABELS[a]])}
              />
            </div>
          )}

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
                Add a label manually or discover from the label master.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => setActiveTab('discover')}
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

          {!loading && !error && contacts.length > 0 && (
            <>
              {/* Sort caption */}
              <p className="text-[0.65rem] text-muted/70 italic">
                Untried, cold-demo-friendly first — then by access path, times contacted ascending.
              </p>

              {sortedContacts.length === 0 ? (
                <p className="rounded-card border border-dashed border-line bg-surface/40 px-4 py-6 text-center text-sm text-muted">
                  No contacts match the current filters.
                </p>
              ) : (
                <div className="space-y-3">
                  {sortedContacts.map((c) => (
                    <ContactCard
                      key={c.id}
                      contact={c}
                      sendCount={sendCounts[c.id]}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                      onViewHistory={setHistoryContact}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Discover tab ── */}
      {activeTab === 'discover' && (
        <LabelDiscovery />
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

      {/* Contact history modal */}
      {historyContact && (
        <ContactHistoryModal
          contact={historyContact}
          user={user}
          onClose={() => setHistoryContact(null)}
          onEdit={openEdit}
          onDelete={handleDelete}
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
function IconSearch(props) {
  return (
    <svg {...svgBase(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
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
