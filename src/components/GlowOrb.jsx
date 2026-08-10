export function GlowOrb({ color = 'blue', size = 500, className = '', style = {} }) {
  const gradient =
    color === 'violet'
      ? 'radial-gradient(circle, rgba(155,140,255,0.35) 0%, rgba(155,140,255,0) 70%)'
      : 'radial-gradient(circle, rgba(91,140,255,0.35) 0%, rgba(91,140,255,0) 70%)'
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute rounded-full ${className}`}
      style={{ width: size, height: size, background: gradient, ...style }}
    />
  )
}
