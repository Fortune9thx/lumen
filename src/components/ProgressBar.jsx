const FILL = {
  default: 'bg-accent-blue',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function ProgressBar({ value = 0, status = 'default', className = '' }) {
  return (
    <div className={`w-full h-2 rounded-full bg-border-subtle overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${FILL[status] || FILL.default}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
