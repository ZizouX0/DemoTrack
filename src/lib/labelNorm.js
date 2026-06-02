/**
 * Normalise a string for fuzzy search: lowercase, collapse hyphens/underscores
 * to spaces, then trim. This lets "tech house" match the stored value "tech-house".
 */
export function norm(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
