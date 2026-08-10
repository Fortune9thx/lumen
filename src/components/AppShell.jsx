import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from './Logo.jsx'
import { GlowOrb } from './GlowOrb.jsx'
import { useWallet } from '../lib/WalletContext.jsx'

function shortAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function WalletButton() {
  const { address, connecting, connect, error } = useWallet()

  if (address) {
    return (
      <span className="flex items-center gap-2 h-9 px-4 rounded-full border border-border-soft text-sm text-text-secondary">
        <span className="h-2 w-2 rounded-full bg-success" />
        {shortAddress(address)}
      </span>
    )
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      title={error || undefined}
      className="h-9 px-4 rounded-full bg-white text-bg-void text-sm font-medium hover:brightness-95 transition-all disabled:opacity-60"
    >
      {connecting ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}

function WrongChainBanner() {
  const { wrongChain, targetChainName, switchChain, switchingChain } = useWallet()
  if (!wrongChain) return null

  return (
    <div className="border-b border-warning/30 bg-warning-soft">
      <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-warning">
          Your wallet is on the wrong network. Lumen runs on <span className="font-medium">{targetChainName}</span>.
        </p>
        <button
          onClick={switchChain}
          disabled={switchingChain}
          className="text-sm font-medium text-warning underline underline-offset-2 disabled:opacity-60"
        >
          {switchingChain ? 'Switching…' : 'Switch network'}
        </button>
      </div>
    </div>
  )
}

const NAV = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Wallet', to: '/wallet' },
]

export function AppShell({ children }) {
  const location = useLocation()
  return (
    <div className="relative min-h-screen bg-bg-void overflow-hidden">
      <GlowOrb color="blue" size={600} className="-top-60 left-1/3 -translate-x-1/2 opacity-25" />
      <GlowOrb color="violet" size={450} className="top-20 -right-32 opacity-15" />

      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-void/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-8">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`text-sm transition-colors ${
                  location.pathname === item.to
                    ? 'text-text-primary'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>
        <WrongChainBanner />
      </header>

      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="relative max-w-6xl mx-auto px-6 py-10"
        >
          {children}
        </motion.main>
      </AnimatePresence>
    </div>
  )
}
