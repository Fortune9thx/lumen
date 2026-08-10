export function FormField({ label, error, children }) {
  return (
    <label className="flex flex-col gap-2">
      {label && <span className="text-[13px] md:text-sm text-text-secondary">{label}</span>}
      {children}
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  )
}

const fieldBase =
  'w-full bg-bg-elevated border rounded-xl text-text-primary placeholder:text-text-muted px-4 h-12 md:h-13 ' +
  'transition-all duration-200 focus:outline-none focus:shadow-[0_0_0_4px_rgba(91,140,255,0.12)]'

function borderClass(error) {
  return error ? 'border-danger focus:border-danger' : 'border-border-soft focus:border-accent-blue'
}

export function Input({ error, className = '', ...props }) {
  return <input className={`${fieldBase} ${borderClass(error)} ${className}`} {...props} />
}

export function Textarea({ error, className = '', ...props }) {
  return <textarea className={`${fieldBase} ${borderClass(error)} h-auto py-3 resize-none ${className}`} {...props} />
}
