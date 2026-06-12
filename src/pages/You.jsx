import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Modal from '../components/Modal'
import Field, { inputCls, selectCls } from '../components/Field'
import Badge from '../components/Badge'
import { buildPressKitUrl } from '../lib/pressKit'

/* ── Press Kit helpers ──────────────────────────────────────── */
/** Convert artist name to URL-safe slug */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'story', label: 'Story' },
  { value: 'punchy', label: 'Punchy' },
]

/* ── Press Kit section ──────────────────────────────────────── */
function PressKitSection({ userId }) {
  /* ── data state ── */
  const [kit, setKit] = useState(null)        // null = not yet loaded
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  /* ── form state ── */
  const [artistName, setArtistName]   = useState('')
  const [slug, setSlug]               = useState('')
  const [slugEdited, setSlugEdited]   = useState(false) // user manually changed slug
  const [bio, setBio]                 = useState('')
  const [bioTone, setBioTone]         = useState('professional')
  const [links, setLinks]             = useState([])       // [{label,url}]
  const [releases, setReleases]       = useState([])       // [{title,url}]
  const [stats, setStats]             = useState([])       // [{label,value}] (local array form)
  const [photoUrl, setPhotoUrl]       = useState('')
  const [autoAttach, setAutoAttach]   = useState(true)

  /* ── ui state ── */
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState(null)
  const [saveOk, setSaveOk]           = useState(false)
  const [genLoading, setGenLoading]   = useState(false)
  const [genError, setGenError]       = useState(null)

  /* ── populate form from loaded kit ── */
  function populateForm(row) {
    setArtistName(row.artist_name ?? '')
    setSlug(row.slug ?? '')
    setSlugEdited(Boolean(row.slug))
    setBio(row.bio ?? '')
    setBioTone(row.bio_tone ?? 'professional')
    setLinks(Array.isArray(row.links) ? row.links : [])
    setReleases(Array.isArray(row.releases) ? row.releases : [])
    // stats is stored as {label: value} object — convert to array for editing
    const statsObj = row.stats && typeof row.stats === 'object' ? row.stats : {}
    setStats(Object.entries(statsObj).map(([label, value]) => ({ label, value: String(value) })))
    setPhotoUrl(row.photo_url ?? '')
    setAutoAttach(row.auto_attach ?? true)
  }

  /* ── load ── */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error: err } = await supabase
      .from('press_kit')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (err) {
      setLoadError(err.message)
    } else {
      setKit(data ?? null)
      if (data) populateForm(data)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  /* ── auto-slug from artist name ── */
  useEffect(() => {
    if (!slugEdited && artistName) {
      setSlug(slugify(artistName))
    }
  }, [artistName, slugEdited])

  /* ── AI bio generation ── */
  async function handleGenerateBio() {
    setGenLoading(true)
    setGenError(null)
    try {
      const statsObj = Object.fromEntries(stats.map((s) => [s.label, s.value]))
      const { data, error: fnErr } = await supabase.functions.invoke('generate-bio', {
        body: {
          artist_name: artistName,
          tone: bioTone,
          facts: {
            location: 'Tunis, Tunisia',
            releases,
            stats: statsObj,
            links,
            notes: '',
          },
        },
      })
      if (fnErr) throw new Error(fnErr.message ?? 'Edge function error')
      if (data?.error) throw new Error(data.error)
      const generated = (data?.bio ?? '').trim()
      if (!generated) throw new Error('No bio returned — try again or write manually.')
      setBio(generated)
    } catch (err) {
      setGenError(err.message)
    }
    setGenLoading(false)
  }

  /* ── save (upsert) ── */
  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveOk(false)

    // Convert stats array back to object; detect if stats changed
    const statsObj = Object.fromEntries(
      stats.filter((s) => s.label.trim()).map((s) => [s.label.trim(), s.value])
    )
    const prevStatsObj = kit?.stats && typeof kit.stats === 'object' ? kit.stats : {}
    const statsChanged = JSON.stringify(statsObj) !== JSON.stringify(prevStatsObj)
    const statsUpdatedAt = statsChanged ? new Date().toISOString().slice(0, 10) : (kit?.stats_updated_at ?? null)

    const row = {
      user_id: userId,
      slug: slug.trim() || null,
      artist_name: artistName.trim() || null,
      bio: bio.trim() || null,
      bio_tone: bioTone,
      links: links.filter((l) => l.url.trim()),
      releases: releases.filter((r) => r.url.trim()),
      stats: statsObj,
      stats_updated_at: statsUpdatedAt,
      photo_url: photoUrl.trim() || null,
      auto_attach: autoAttach,
      updated_at: new Date().toISOString(),
    }

    const { data: saved, error: err } = await supabase
      .from('press_kit')
      .upsert(row, { onConflict: 'user_id' })
      .select()
      .single()

    if (err) {
      // Unique constraint on slug
      if (err.code === '23505' || err.message?.toLowerCase().includes('slug')) {
        setSaveError('That handle is already taken — try another slug.')
      } else {
        setSaveError(err.message)
      }
    } else {
      setKit(saved)
      populateForm(saved)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    }
    setSaving(false)
  }

  /* ── links repeater helpers ── */
  function addLink() { setLinks((l) => [...l, { label: '', url: '' }]) }
  function updateLink(i, field, value) {
    setLinks((l) => l.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeLink(i) { setLinks((l) => l.filter((_, idx) => idx !== i)) }

  /* ── releases repeater helpers ── */
  function addRelease() { setReleases((r) => [...r, { title: '', url: '' }]) }
  function updateRelease(i, field, value) {
    setReleases((r) => r.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeRelease(i) { setReleases((r) => r.filter((_, idx) => idx !== i)) }

  /* ── stats repeater helpers ── */
  function addStat() { setStats((s) => [...s, { label: '', value: '' }]) }
  function updateStat(i, field, value) {
    setStats((s) => s.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }
  function removeStat(i) { setStats((s) => s.filter((_, idx) => idx !== i)) }

  /* ── render ── */
  if (loading) {
    return (
      <section aria-labelledby="press-kit-heading" className="space-y-3">
        <p id="press-kit-heading" className="text-xs font-medium uppercase tracking-wider text-accent">
          Press Kit
        </p>
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-12 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section aria-labelledby="press-kit-heading" className="space-y-3">
        <p id="press-kit-heading" className="text-xs font-medium uppercase tracking-wider text-accent">
          Press Kit
        </p>
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Failed to load press kit: {loadError}
          <button type="button" onClick={load} className="mt-2 block text-xs underline">
            Retry
          </button>
        </div>
      </section>
    )
  }

  const savedSlug = kit?.slug
  const publicUrl = savedSlug ? buildPressKitUrl(savedSlug) : null

  return (
    <section aria-labelledby="press-kit-heading" className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p id="press-kit-heading" className="text-xs font-medium uppercase tracking-wider text-accent">
          Press Kit
        </p>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent hover:underline"
            aria-label="View public press kit page"
          >
            <IconExternalLink className="size-3.5" />
            View public page
          </a>
        )}
      </div>

      {/* First-time callout */}
      {!kit && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-4 text-center space-y-1">
          <p className="font-display font-bold text-text text-sm">Set up your press kit</p>
          <p className="text-xs text-muted">
            Fill in your artist info below — it powers the{' '}
            <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.65rem] text-text">
              {'{press_kit_link}'}
            </code>{' '}
            merge field and your public press page.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5" noValidate>
        {/* ── Identity ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
            Identity
          </p>

          <Field id="pk-artist-name" label="Artist name">
            <input
              id="pk-artist-name"
              type="text"
              className={inputCls}
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="e.g. Aziz Dardouri"
            />
          </Field>

          <Field
            id="pk-slug"
            label="URL handle"
            hint="Your public press kit lives at this address."
          >
            <input
              id="pk-slug"
              type="text"
              className={inputCls}
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugEdited(true) }}
              placeholder="e.g. aziz-dardouri"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
            />
          </Field>

          {/* URL preview */}
          {slug && (
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs text-muted shrink-0">Public URL:</span>
              <span className="truncate font-mono text-[0.7rem] text-accent/80">
                press.demotrack.app/{slug}
              </span>
            </div>
          )}

          <Field id="pk-photo-url" label="Photo URL" hint="Paste a direct image link — no upload needed.">
            <input
              id="pk-photo-url"
              type="url"
              className={inputCls}
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        {/* ── Bio ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-4">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
            Bio
          </p>

          {/* Tone selector */}
          <Field id="pk-bio-tone" label="Tone">
            <div role="group" aria-label="Bio tone" className="flex gap-2 pt-0.5">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={bioTone === t.value}
                  onClick={() => setBioTone(t.value)}
                  className={[
                    'flex-1 rounded-lg border py-2 text-center text-xs font-semibold transition-colors',
                    bioTone === t.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-text',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>

          {/* Generate button + textarea */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="pk-bio"
                className="block text-xs font-medium uppercase tracking-wider text-muted"
              >
                Bio text
              </label>
              <button
                type="button"
                disabled={genLoading}
                onClick={handleGenerateBio}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
              >
                {genLoading ? (
                  <>
                    <IconSpinner className="size-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <IconSparkle className="size-3.5" />
                    Generate with AI
                  </>
                )}
              </button>
            </div>

            <textarea
              id="pk-bio"
              rows={6}
              className={inputCls}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Your artist bio — generate with AI or write your own…"
            />
          </div>

          {genError && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <IconWarn className="mt-0.5 size-3.5 shrink-0" />
              <span>AI unavailable: {genError} — write your bio manually above.</span>
            </div>
          )}
        </div>

        {/* ── Links ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
              Links
            </p>
            <button
              type="button"
              onClick={addLink}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <IconPlus className="size-3.5" />
              Add link
            </button>
          </div>

          {links.length === 0 && (
            <p className="text-xs text-muted/60">No links yet — add Soundcloud, Instagram, etc.</p>
          )}

          {links.map((link, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label={`Link ${i + 1} label`}
                  className={inputCls}
                  value={link.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="Label"
                />
                <input
                  type="url"
                  aria-label={`Link ${i + 1} URL`}
                  className={inputCls}
                  value={link.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLink(i)}
                aria-label={`Remove link ${i + 1}`}
                className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <IconTrash className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {/* ── Releases ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
              Releases
            </p>
            <button
              type="button"
              onClick={addRelease}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <IconPlus className="size-3.5" />
              Add release
            </button>
          </div>

          {releases.length === 0 && (
            <p className="text-xs text-muted/60">No releases yet — add tracks, EPs, or albums.</p>
          )}

          {releases.map((rel, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label={`Release ${i + 1} title`}
                  className={inputCls}
                  value={rel.title}
                  onChange={(e) => updateRelease(i, 'title', e.target.value)}
                  placeholder="Title"
                />
                <input
                  type="url"
                  aria-label={`Release ${i + 1} URL`}
                  className={inputCls}
                  value={rel.url}
                  onChange={(e) => updateRelease(i, 'url', e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRelease(i)}
                aria-label={`Remove release ${i + 1}`}
                className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <IconTrash className="size-4" />
              </button>
            </div>
          ))}
        </div>

        {/* ── Stats ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
              Stats
            </p>
            <button
              type="button"
              onClick={addStat}
              className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              <IconPlus className="size-3.5" />
              Add stat
            </button>
          </div>

          {stats.length === 0 && (
            <p className="text-xs text-muted/60">
              No stats yet — e.g. "Monthly listeners" / "12,400".
            </p>
          )}

          {stats.map((stat, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  aria-label={`Stat ${i + 1} label`}
                  className={inputCls}
                  value={stat.label}
                  onChange={(e) => updateStat(i, 'label', e.target.value)}
                  placeholder="Monthly listeners"
                />
                <input
                  type="text"
                  aria-label={`Stat ${i + 1} value`}
                  className={inputCls}
                  value={stat.value}
                  onChange={(e) => updateStat(i, 'value', e.target.value)}
                  placeholder="12,400"
                />
              </div>
              <button
                type="button"
                onClick={() => removeStat(i)}
                aria-label={`Remove stat ${i + 1}`}
                className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
              >
                <IconTrash className="size-4" />
              </button>
            </div>
          ))}

          {/* stats_updated_at display */}
          {kit?.stats_updated_at && (
            <p className="text-[0.65rem] text-muted/60">
              Stats last updated:{' '}
              {new Date(kit.stats_updated_at + 'T12:00:00').toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* ── Settings ── */}
        <div className="rounded-card border border-line bg-surface p-4 space-y-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted/70">
            Settings
          </p>

          <label className="flex cursor-pointer items-start gap-3">
            <div className="relative mt-0.5 shrink-0">
              <input
                id="pk-auto-attach"
                type="checkbox"
                checked={autoAttach}
                onChange={(e) => setAutoAttach(e.target.checked)}
                className="peer sr-only"
              />
              {/* custom toggle track */}
              <div
                aria-hidden="true"
                className={[
                  'h-5 w-9 rounded-full border transition-colors',
                  autoAttach
                    ? 'border-accent bg-accent/80'
                    : 'border-line bg-surface-2',
                ].join(' ')}
              />
              {/* thumb */}
              <div
                aria-hidden="true"
                className={[
                  'absolute top-0.5 size-4 rounded-full bg-text shadow transition-transform',
                  autoAttach ? 'translate-x-4' : 'translate-x-0.5',
                ].join(' ')}
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text leading-tight">
                Attach my press-kit link to every demo by default
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Automatically fills{' '}
                <code className="rounded bg-surface-2 px-1 font-mono text-[0.65rem]">
                  {'{press_kit_link}'}
                </code>{' '}
                in email presets.
              </p>
            </div>
          </label>
        </div>

        {/* ── Save errors / success ── */}
        {saveError && (
          <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {saveError}
          </p>
        )}

        {saveOk && (
          <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">
            <IconCheck className="size-3.5 shrink-0" />
            Press kit saved.
          </div>
        )}

        {/* ── Save button ── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : kit ? 'Save press kit' : 'Create press kit'}
        </button>
      </form>
    </section>
  )
}

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

/* ── Mood config ────────────────────────────────────────────── */
const MOODS = [
  { value: 'fire', emoji: '🔥', label: 'Fire' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'ok',   emoji: '😐', label: 'OK'   },
  { value: 'low',  emoji: '😞', label: 'Low'  },
]
const MOOD_EMOJI = Object.fromEntries(MOODS.map((m) => [m.value, m.emoji]))

/* ── Goal metric / period config ────────────────────────────── */
const METRIC_OPTIONS = [
  { value: 'demos_sent',       label: 'Demos sent'       },
  { value: 'follow_ups',       label: 'Follow-ups'       },
  { value: 'tracks_finished',  label: 'Tracks finished'  },
  { value: 'sessions',         label: 'Work sessions'    },
]
const PERIOD_OPTIONS = [
  { value: 'week',    label: 'Week'    },
  { value: 'month',   label: 'Month'   },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year',    label: 'Year'    },
]
const PERIOD_LABEL = Object.fromEntries(PERIOD_OPTIONS.map((p) => [p.value, p.label]))

/* ── Date helpers ───────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/** Return the ISO date string (YYYY-MM-DD) for the start of the current period */
function periodStart(period) {
  const now = new Date()
  let d
  if (period === 'week') {
    // Monday of current week
    const day = now.getDay() // 0=Sun
    const diff = day === 0 ? -6 : 1 - day
    d = new Date(now)
    d.setDate(now.getDate() + diff)
  } else if (period === 'month') {
    d = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    d = new Date(now.getFullYear(), q * 3, 1)
  } else {
    // year
    d = new Date(now.getFullYear(), 0, 1)
  }
  return d.toISOString().slice(0, 10)
}

/** Compute streak from an array of objects with a session_date property */
function computeStreak(sessions) {
  if (!sessions || sessions.length === 0) return 0
  const days = new Set()
  for (const s of sessions) {
    const raw = s.session_date
    if (!raw) continue
    days.add(raw.slice(0, 10))
  }
  if (days.size === 0) return 0
  const sorted = Array.from(days).sort().reverse()
  const t = todayStr()
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
  if (sorted[0] !== t && sorted[0] !== y) return 0
  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diff = Math.round((prev - curr) / 864e5)
    if (diff === 1) streak++
    else break
  }
  return streak
}

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

/* ══════════════════════════════════════════════════════════════
   PHASE 12 — WORK SESSIONS
══════════════════════════════════════════════════════════════ */

/** Fetch the count of submissions sent on a given date (YYYY-MM-DD) */
async function fetchDemosSentOnDay(userId, dateStr) {
  const { count, error } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('sent_at', `${dateStr}T00:00:00.000Z`)
    .lte('sent_at', `${dateStr}T23:59:59.999Z`)
  if (error) return 0
  return count ?? 0
}

/* ── Session log form ───────────────────────────────────────── */
function SessionForm({ userId, onSaved, onCancel }) {
  const [hours, setHours] = useState('')
  const [mood, setMood] = useState('good')
  const [date, setDate] = useState(todayStr())
  const [notes, setNotes] = useState('')
  const [demosCount, setDemosCount] = useState(null) // null = loading
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Auto-fetch demos sent on the selected date
  const fetchRef = useRef(0)
  useEffect(() => {
    if (!date) return
    setDemosCount(null)
    const ticket = ++fetchRef.current
    fetchDemosSentOnDay(userId, date).then((n) => {
      if (fetchRef.current === ticket) setDemosCount(n)
    })
  }, [date, userId])

  async function handleSubmit(e) {
    e.preventDefault()
    const h = parseFloat(hours)
    if (!h || h <= 0) { setError('Hours must be > 0'); return }
    if (!date) { setError('Pick a date'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('work_sessions').insert({
      user_id: userId,
      session_date: date,
      hours: h,
      mood,
      notes: notes.trim() || null,
    })
    if (err) {
      setError(err.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field id="sess-date" label="Date" required>
          <input
            id="sess-date"
            type="date"
            required
            className={inputCls}
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field id="sess-hours" label="Hours" required>
          <input
            id="sess-hours"
            type="number"
            required
            step="0.5"
            min="0.5"
            max="24"
            className={inputCls}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="1.5"
          />
        </Field>
      </div>

      {/* Demos sent that day — read-only context */}
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
        <span className="text-xs text-muted">Demos sent that day:</span>
        {demosCount === null ? (
          <span className="h-3 w-6 animate-pulse rounded bg-surface" />
        ) : (
          <span className="text-sm font-semibold text-text tabular-nums">
            {demosCount}
          </span>
        )}
      </div>

      {/* Mood picker */}
      <Field id="sess-mood" label="Mood">
        <div role="group" aria-label="Session mood" className="flex gap-2 pt-0.5">
          {MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mood === m.value}
              aria-label={m.label}
              onClick={() => setMood(m.value)}
              className={[
                'flex flex-1 flex-col items-center gap-1 rounded-lg border py-2.5 text-center transition-colors',
                mood === m.value
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-line bg-surface-2 text-muted hover:border-accent/40 hover:text-text',
              ].join(' ')}
            >
              <span className="text-xl leading-none" aria-hidden="true">{m.emoji}</span>
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider">{m.label}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field id="sess-notes" label="Notes">
        <textarea
          id="sess-notes"
          rows={2}
          className={inputCls}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What did you work on? (optional)"
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
          {saving ? 'Saving…' : 'Log session'}
        </button>
      </div>
    </form>
  )
}

/* ── Session card ───────────────────────────────────────────── */
function SessionCard({ session, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [demosCount, setDemosCount] = useState(null)

  useEffect(() => {
    fetchDemosSentOnDay(session.user_id, session.session_date).then(setDemosCount)
  }, [session.user_id, session.session_date])

  const fmtDate = new Date(session.session_date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return (
    <article className="rounded-card border border-line bg-surface p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl leading-none shrink-0" aria-hidden="true">
            {MOOD_EMOJI[session.mood] ?? '🙂'}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text leading-tight">{fmtDate}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
              <span>
                <span className="font-medium text-accent tabular-nums">{session.hours}h</span>
              </span>
              {demosCount !== null && (
                <span>{demosCount} demo{demosCount !== 1 ? 's' : ''} sent</span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          {confirming ? (
            <button
              type="button"
              onClick={() => onDelete(session.id)}
              aria-label="Confirm delete session"
              className="grid size-7 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
            >
              <IconCheck className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label="Delete session"
              className="grid size-7 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <IconTrash className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {session.notes && (
        <p className="line-clamp-2 text-xs text-muted/80 pl-[calc(2rem+0.625rem)]">
          {session.notes}
        </p>
      )}
    </article>
  )
}

/* ── Work Sessions section ──────────────────────────────────── */
function WorkSessionsSection({ userId }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: false })
      .limit(20)
    if (err) setError(err.message)
    else setSessions(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    const { error: err } = await supabase
      .from('work_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (err) setError(err.message)
    else setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  function handleSaved() {
    setShowForm(false)
    load()
  }

  const streak = computeStreak(sessions)

  return (
    <section aria-labelledby="work-sessions-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <p
          id="work-sessions-heading"
          className="text-xs font-medium uppercase tracking-wider text-accent"
        >
          Work Sessions
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition-opacity hover:opacity-90"
          >
            <IconPlus className="size-3.5" />
            Log session
          </button>
        )}
      </div>

      {/* Streak pill */}
      {!loading && !error && (
        <div className="flex items-center gap-2">
          {streak > 0 ? (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <span aria-hidden="true">🔥</span>
              {streak}-day streak
            </div>
          ) : (
            <p className="text-xs text-muted/60">No active streak — log a session to start one.</p>
          )}
        </div>
      )}

      {/* Inline log form */}
      {showForm && (
        <div className="rounded-card border border-accent/20 bg-surface p-4">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-accent">
            Log a session
          </p>
          <SessionForm
            userId={userId}
            onSaved={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-card border border-line bg-surface" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-card border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          Failed to load sessions: {error}
          <button type="button" onClick={load} className="mt-2 block text-xs underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && sessions.length === 0 && !showForm && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-5 text-center space-y-2">
          <p className="font-display font-bold text-text">No sessions yet</p>
          <p className="text-xs text-muted">
            Track your studio time to build a streak and see demos-per-session insights.
          </p>
        </div>
      )}

      {/* Session list */}
      {!loading && !error && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════
   PHASE 12 — GOALS
══════════════════════════════════════════════════════════════ */

const EMPTY_GOAL = { label: '', metric: 'demos_sent', target: '', period: 'month' }

/** Fetch actual count for a goal metric within the current period */
async function fetchActual(userId, metric, period) {
  const start = periodStart(period)
  try {
    if (metric === 'demos_sent') {
      const { count } = await supabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('sent_at', `${start}T00:00:00.000Z`)
      return count ?? 0
    }
    if (metric === 'sessions') {
      const { count } = await supabase
        .from('work_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('session_date', start)
      return count ?? 0
    }
    if (metric === 'follow_ups') {
      const { count } = await supabase
        .from('feedback')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', `${start}T00:00:00.000Z`)
      return count ?? 0
    }
    if (metric === 'tracks_finished') {
      const { count } = await supabase
        .from('tracks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['demo_ready', 'submitted', 'signed'])
        .gte('updated_at', `${start}T00:00:00.000Z`)
      return count ?? 0
    }
  } catch {
    return 0
  }
  return 0
}

/* ── Goal form ──────────────────────────────────────────────── */
function GoalForm({ initial, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial ?? EMPTY_GOAL)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const t = parseInt(form.target, 10)
    if (!form.label.trim()) return
    if (!t || t <= 0) return
    onSave({ ...form, target: t })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field id="goal-label" label="Label" required>
        <input
          id="goal-label"
          type="text"
          required
          className={inputCls}
          value={form.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="e.g. Send 4 demos / month"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field id="goal-metric" label="Metric" required>
          <select
            id="goal-metric"
            className={selectCls}
            value={form.metric}
            onChange={(e) => set('metric', e.target.value)}
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field id="goal-period" label="Period" required>
          <select
            id="goal-period"
            className={selectCls}
            value={form.period}
            onChange={(e) => set('period', e.target.value)}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="goal-target" label="Target" required hint="Must be a whole number greater than 0">
        <input
          id="goal-target"
          type="number"
          required
          min="1"
          step="1"
          className={inputCls}
          value={form.target}
          onChange={(e) => set('target', e.target.value)}
          placeholder="4"
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
          {saving ? 'Saving…' : initial?.id ? 'Update goal' : 'Create goal'}
        </button>
      </div>
    </form>
  )
}

/* ── Goal card ──────────────────────────────────────────────── */
function GoalCard({ goal, userId, onEdit, onDelete, onToggle }) {
  const [actual, setActual] = useState(null) // null = loading
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!goal.active) { setActual(null); return }
    fetchActual(userId, goal.metric, goal.period).then(setActual)
  }, [userId, goal.metric, goal.period, goal.active])

  const metricLabel = METRIC_OPTIONS.find((m) => m.value === goal.metric)?.label ?? goal.metric
  const pct = actual !== null && goal.target > 0
    ? Math.min(Math.round((actual / goal.target) * 100), 100)
    : 0
  const met = actual !== null && actual >= goal.target

  return (
    <article
      className={[
        'rounded-card border p-4 space-y-3 transition-opacity',
        goal.active ? 'border-line bg-surface' : 'border-line/40 bg-surface/40 opacity-60',
      ].join(' ')}
      aria-label={`Goal: ${goal.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={[
              'font-display font-bold leading-tight',
              goal.active ? 'text-text' : 'text-muted',
            ].join(' ')}>
              {goal.label}
            </p>
            {met && goal.active && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-ok/15 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-ok border border-ok/30"
                aria-label="Goal met"
              >
                <IconCheck className="size-3" /> Done
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="muted">{metricLabel}</Badge>
            <Badge variant={goal.active ? 'accent' : 'muted'}>{PERIOD_LABEL[goal.period]}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onEdit(goal)}
            aria-label={`Edit goal: ${goal.label}`}
            className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <IconEdit className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onToggle(goal)}
            aria-label={goal.active ? 'Pause goal' : 'Activate goal'}
            className={[
              'grid size-8 place-items-center rounded-lg transition-colors',
              goal.active
                ? 'text-muted hover:bg-surface-2 hover:text-warn'
                : 'text-ok hover:bg-ok/10',
            ].join(' ')}
          >
            {goal.active ? <IconPause className="size-4" /> : <IconPlay className="size-4" />}
          </button>
          {confirming ? (
            <button
              type="button"
              onClick={() => onDelete(goal.id)}
              aria-label="Confirm delete goal"
              className="grid size-8 place-items-center rounded-lg bg-danger/15 text-danger transition-colors hover:bg-danger/25"
            >
              <IconCheck className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Delete goal: ${goal.label}`}
              className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger"
            >
              <IconTrash className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress — only for active goals */}
      {goal.active && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Progress this {PERIOD_LABEL[goal.period].toLowerCase()}</span>
            <span className="tabular-nums font-semibold text-text">
              {actual === null ? '…' : actual}
              <span className="font-normal text-muted"> / {goal.target}</span>
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={actual ?? 0}
            aria-valuemin={0}
            aria-valuemax={goal.target}
            aria-label={`${actual ?? 0} of ${goal.target} ${metricLabel}`}
          >
            <div
              className={[
                'h-full rounded-full transition-all duration-700',
                met ? 'bg-ok' : 'bg-accent',
              ].join(' ')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {!goal.active && (
        <p className="text-xs text-muted/50 italic">Paused — activate to resume tracking</p>
      )}
    </article>
  )
}

/* ── Goals section ──────────────────────────────────────────── */
function GoalsSection({ userId }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setGoals(data ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null)
    setSaveError(null)
    setModalOpen(true)
  }
  function openEdit(goal) {
    setEditing({ ...EMPTY_GOAL, ...goal, target: String(goal.target) })
    setSaveError(null)
    setModalOpen(true)
  }
  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  async function handleSave(form) {
    setSaving(true)
    setSaveError(null)
    const row = {
      user_id: userId,
      label: form.label.trim(),
      metric: form.metric,
      target: form.target,
      period: form.period,
    }
    let err
    if (editing?.id) {
      const { error: e } = await supabase
        .from('goals')
        .update(row)
        .eq('id', editing.id)
        .eq('user_id', userId)
      err = e
    } else {
      const { error: e } = await supabase
        .from('goals')
        .insert({ ...row, active: true })
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

  async function handleDelete(id) {
    const { error: err } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (err) setError(err.message)
    else setGoals((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleToggle(goal) {
    const { error: err } = await supabase
      .from('goals')
      .update({ active: !goal.active })
      .eq('id', goal.id)
      .eq('user_id', userId)
    if (err) setError(err.message)
    else setGoals((prev) => prev.map((g) => g.id === goal.id ? { ...g, active: !g.active } : g))
  }

  const active = goals.filter((g) => g.active)
  const inactive = goals.filter((g) => !g.active)

  return (
    <section aria-labelledby="goals-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <p
          id="goals-heading"
          className="text-xs font-medium uppercase tracking-wider text-accent"
        >
          Goals
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-ink transition-opacity hover:opacity-90"
        >
          <IconPlus className="size-3.5" />
          New goal
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
          Failed to load goals: {error}
          <button type="button" onClick={load} className="mt-2 block text-xs underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && goals.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-surface/40 p-5 text-center space-y-2">
          <p className="font-display font-bold text-text">No goals yet</p>
          <p className="text-xs text-muted">
            Set a target for demos sent, sessions logged, or tracks finished — progress is tracked automatically.
          </p>
        </div>
      )}

      {!loading && !error && goals.length > 0 && (
        <div className="space-y-2">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              userId={userId}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
          {inactive.length > 0 && (
            <>
              <p className="pt-1 text-[0.65rem] font-semibold uppercase tracking-widest text-muted/50">
                Paused
              </p>
              {inactive.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  userId={userId}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                />
              ))}
            </>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing?.id ? 'Edit goal' : 'New goal'}
      >
        <GoalForm
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

/* ── Main You page ──────────────────────────────────────────── */
/* ── Account: change password ───────────────────────────────── */
function AccountSection() {
  const { updatePassword } = useAuth()
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (pw.length < 8) { setError('Use at least 8 characters.'); return }
    if (pw !== pw2) { setError('Passwords do not match.'); return }
    setBusy(true)
    const { error: err } = await updatePassword(pw)
    setBusy(false)
    if (err) { setError(err.message); return }
    setOk(true)
    setPw(''); setPw2('')
    setTimeout(() => { setOk(false); setOpen(false) }, 1500)
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-accent">Password</p>
          <p className="mt-0.5 text-xs text-muted">Change the password you sign in with.</p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:border-accent/40 hover:text-accent"
          >
            Change password
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field id="new-pw" label="New password" hint="At least 8 characters.">
            <input
              id="new-pw"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </Field>
          <Field id="new-pw2" label="Confirm new password">
            <input
              id="new-pw2"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </Field>
          {error && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
          )}
          {ok && (
            <p className="rounded-lg border border-ok/30 bg-ok/10 px-3 py-2 text-xs text-ok">Password updated.</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); setPw(''); setPw2('') }}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted transition-colors hover:border-text hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

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
    <section className="space-y-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-accent">Phase 13</p>
        <h1 className="mt-0.5 text-2xl font-extrabold">You</h1>
        <p className="mt-0.5 text-sm text-muted">Sessions, goals, presets, and your artist profile.</p>
      </header>

      {/* Signed in as */}
      <div className="rounded-card border border-line bg-surface p-4">
        <p className="text-xs uppercase tracking-wider text-muted">Signed in as</p>
        <p className="mt-0.5 text-text">{user?.email}</p>
      </div>

      {/* ── Account / password ── */}
      <AccountSection />

      {/* ── Work Sessions ── */}
      <WorkSessionsSection userId={user.id} />

      {/* ── Goals ── */}
      <GoalsSection userId={user.id} />

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

      {/* ── Press Kit ── */}
      <PressKitSection userId={user.id} />

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
    'aria-hidden': 'true',
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
function IconPause(props) {
  return (
    <svg {...svgBase(props)}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  )
}
function IconPlay(props) {
  return (
    <svg {...svgBase(props)}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}
function IconExternalLink(props) {
  return (
    <svg {...svgBase(props)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
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
function IconSpinner(props) {
  return (
    <svg {...svgBase({ strokeWidth: 2, ...props })}>
      <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
      <path d="M12 3a9 9 0 0 1 9 9" strokeLinecap="round" />
    </svg>
  )
}
