export function Card({ children, className = '', hover = true, ...props }) {
  return (
    <div
      className={`bg-bg-card border border-border-subtle rounded-2xl p-6 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.4)]
        transition-all duration-200 ${hover ? 'hover:border-border-soft hover:-translate-y-0.5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
