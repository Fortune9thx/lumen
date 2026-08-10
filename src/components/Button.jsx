export function ButtonPrimary({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center h-12 px-7 rounded-full bg-accent-blue text-white text-[15px] font-medium
        transition-all duration-200 hover:shadow-[0_0_40px_rgba(91,140,255,0.35)] hover:brightness-110
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:brightness-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-void
        ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ButtonGhost({ children, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center h-12 px-7 rounded-full bg-transparent border border-border-soft text-text-primary text-[15px] font-medium
        transition-all duration-200 hover:bg-bg-card hover:border-border-medium
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue-glow focus-visible:ring-offset-2 focus-visible:ring-offset-bg-void
        ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
