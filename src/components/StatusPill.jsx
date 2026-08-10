const STYLES = {
  approved: 'bg-success-soft text-success',
  paid: 'bg-success-soft text-success',
  active: 'bg-accent-violet-soft text-accent-blue-glow',
  pending: 'bg-warning-soft text-warning',
  rejected: 'bg-danger-soft text-danger',
  expired: 'bg-danger-soft text-danger',
}

export function StatusPill({ status, children }) {
  const style = STYLES[status?.toLowerCase()] || STYLES.pending
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-medium ${style}`}>
      {children || status}
    </span>
  )
}
