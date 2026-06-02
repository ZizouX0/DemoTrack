/**
 * Labelled form field wrapper.
 * Renders a <label> + any child input/select/textarea with consistent styling.
 */
export default function Field({ id, label, hint, error, required, children }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wider text-muted">
        {label}
        {required && <span className="ml-0.5 text-accent" aria-hidden="true">*</span>}
      </label>
      {hint && <p className="text-xs text-muted/70">{hint}</p>}
      {children}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

/** Shared className for text inputs, selects, textareas */
export const inputCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-text outline-none placeholder:text-muted/60 focus:border-accent transition-colors'

/** Shared className for select elements (need appearance tweak) */
export const selectCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm text-text outline-none focus:border-accent transition-colors appearance-none'
