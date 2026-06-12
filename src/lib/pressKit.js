/* ── Shared press-kit URL builder ───────────────────────────── */

/**
 * Build the public press-kit URL from a slug.
 * Prefers VITE_PRESS_BASE_URL; falls back to the Supabase functions URL.
 */
export function buildPressKitUrl(slug) {
  const base = import.meta.env.VITE_PRESS_BASE_URL
  if (base) return `${base}/${slug}`
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/press-kit?slug=${slug}`
}
