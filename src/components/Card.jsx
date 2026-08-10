export function Card({ children, className = '', hover = true, ...props }) {
  return (
    <div
      className={`bg-bg-card border border-border-soft rounded-2xl p-6 md:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.4)]
        transition-all duration-200 ${hover ? 'hover:bg-bg-card-hover hover:border-border-medium hover:shadow-[0_10px_36px_rgba(0,0,0,0.55)] hover:-translate-y-1' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
