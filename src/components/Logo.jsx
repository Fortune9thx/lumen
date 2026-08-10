import { Link } from 'react-router-dom'

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2.5 group ${className}`}>
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-accent-blue-glow to-accent-violet blur-[6px] opacity-70 group-hover:opacity-100 transition-opacity" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      <span className="text-lg font-serif italic tracking-tight text-text-primary">Lumen</span>
    </Link>
  )
}
