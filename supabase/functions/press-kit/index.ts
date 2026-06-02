// DemoTrack — Phase 13: public press-kit page (Spec §10, design principle #4).
// Serves press.<domain>/{slug} as a narrow, server-rendered page using the
// service role and returning ONLY whitelisted fields — the private CRM, tracks,
// submissions, etc. can never leak, because this endpoint only ever selects the
// six public press_kit columns. There is NO RLS path to private data here.
//
// Deploy:  supabase functions deploy press-kit --no-verify-jwt
//   (public — anyone with the slug can view the EPK.)
// Point press.<yourdomain> at this function for pretty URLs.

import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function page(k: Record<string, any>): string {
  const links = Array.isArray(k.links) ? k.links : []
  const releases = Array.isArray(k.releases) ? k.releases : []
  const stats = k.stats && typeof k.stats === 'object' ? k.stats : {}
  const statEntries = Object.entries(stats)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(k.artist_name || 'Press Kit')} — DemoTrack</title>
<meta name="description" content="${esc((k.bio || '').slice(0, 150))}">
<style>
:root{--ink:#0b0b0f;--surface:#14141b;--line:#2a2a37;--muted:#8b8b9e;--text:#ededf2;--accent:#c2ff1f}
*{box-sizing:border-box}body{margin:0;background:var(--ink);color:var(--text);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;background-image:radial-gradient(120% 80% at 50% -10%,rgba(194,255,31,.06),transparent 60%)}
.wrap{max-width:640px;margin:0 auto;padding:40px 20px 64px}
.photo{width:96px;height:96px;border-radius:16px;object-fit:cover;border:1px solid var(--line)}
h1{font-size:2rem;letter-spacing:-.02em;margin:18px 0 2px}
.tag{color:var(--accent);font-size:.8rem;text-transform:uppercase;letter-spacing:.08em}
.bio{color:#d7d7e0;white-space:pre-wrap;margin:18px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;margin:14px 0}
.lbl{color:var(--accent);font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.row{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:.85rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.stat b{display:block;font-size:1.3rem;color:#fff}.stat span{color:var(--muted);font-size:.8rem}
.foot{color:var(--muted);font-size:.75rem;margin-top:28px}
.upd{color:var(--muted);font-size:.72rem;margin-top:8px}
</style></head><body><div class="wrap">
${k.photo_url ? `<img class="photo" src="${esc(k.photo_url)}" alt="${esc(k.artist_name)}">` : ''}
<div class="tag">House &amp; Tech House</div>
<h1>${esc(k.artist_name || 'Artist')}</h1>
${k.bio ? `<p class="bio">${esc(k.bio)}</p>` : ''}
${statEntries.length ? `<div class="card"><div class="lbl">Stats</div><div class="stats">${statEntries.map(([key, val]) => `<div class="stat"><b>${esc(val)}</b><span>${esc(key)}</span></div>`).join('')}</div>${k.stats_updated_at ? `<div class="upd">Updated ${esc(k.stats_updated_at)}</div>` : ''}</div>` : ''}
${releases.length ? `<div class="card"><div class="lbl">Releases</div>${releases.map((r: any) => { const t = typeof r === 'string' ? r : (r?.title ?? ''); const u = typeof r === 'object' ? r?.url : ''; return t ? `<div>${u ? `<a href="${esc(u)}" rel="noopener">${esc(t)}</a>` : esc(t)}</div>` : '' }).join('')}</div>` : ''}
${links.length ? `<div class="card"><div class="lbl">Links</div><div class="row">${links.map((l: any) => { const lab = typeof l === 'string' ? l : (l?.label ?? l?.url ?? ''); const u = typeof l === 'object' ? l?.url : l; return u ? `<a class="chip" href="${esc(u)}" rel="noopener" target="_blank">${esc(lab)}</a>` : '' }).join('')}</div></div>` : ''}
<div class="foot">Press kit powered by DemoTrack</div>
</div></body></html>`
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const slug = url.searchParams.get('slug') || url.pathname.split('/').filter(Boolean).pop() || ''
  if (!slug || slug === 'press-kit') return new Response('Not found', { status: 404 })
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response('Server not configured', { status: 500 })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  // WHITELIST: only these public columns are ever selected. No user_id, no joins.
  const { data, error } = await supabase
    .from('press_kit')
    .select('artist_name, bio, links, releases, stats, stats_updated_at, photo_url')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !data) {
    return new Response('<!doctype html><meta charset=utf-8><title>Not found</title><body style="background:#0b0b0f;color:#ededf2;font-family:system-ui;text-align:center;padding:80px">Press kit not found.</body>',
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  return new Response(page(data), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  })
})
