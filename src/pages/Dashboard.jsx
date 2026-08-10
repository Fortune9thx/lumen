import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { StatusPill } from '../components/StatusPill.jsx'
import { ButtonPrimary } from '../components/Button.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useWallet } from '../lib/WalletContext.jsx'
import { listPoliciesByOwner, listClaimsByOwner } from '../lib/genlayer.js'

function EmptyState({ label }) {
  return (
    <Card hover={false} className="text-center py-12">
      <p className="text-text-muted text-sm">{label}</p>
    </Card>
  )
}

export function Dashboard() {
  const { address, connecting, connect, error: walletError } = useWallet()
  const [policies, setPolicies] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(false)
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [claimsError, setClaimsError] = useState(null)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    setLoadError(null)
    listPoliciesByOwner(address)
      .then(setPolicies)
      .catch((err) => setLoadError(err.message || 'Failed to load policies'))
      .finally(() => setLoading(false))

    setClaimsLoading(true)
    setClaimsError(null)
    listClaimsByOwner(address)
      .then((all) => setClaims(all.slice(-5).reverse()))
      .catch((err) => setClaimsError(err.message || 'Failed to load claims'))
      .finally(() => setClaimsLoading(false))
  }, [address])

  const totalCoverage = policies.reduce((sum, p) => sum + (parseFloat((p.coverage_amount || '0').replace(/[^0-9.]/g, '')) || 0), 0)

  return (
    <AppShell>
      <Reveal className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <h1 className="font-serif font-light text-3xl md:text-4xl">
            {address ? 'Good evening' : 'Welcome to Lumen'}
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            {address
              ? <>Net coverage active: <span className="text-text-primary">{totalCoverage.toFixed(0)} GEN</span></>
              : 'Connect your wallet to view your policies and claims.'}
          </p>
        </div>
        {!address && (
          <ButtonPrimary onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect Wallet'}
          </ButtonPrimary>
        )}
      </Reveal>

      {walletError && <p className="text-sm text-danger mb-6">{walletError}</p>}

      <Reveal delay={0.05} className="grid sm:grid-cols-3 gap-4 mb-12">
        {[
          { to: '/policies/new/flight', label: 'New', title: 'Flight Policy' },
          { to: '/policies/new/weather', label: 'New', title: 'Weather Policy' },
          { to: '/claims/new', label: 'Submit', title: 'Claim' },
        ].map((a) => (
          <Link key={a.to} to={a.to}>
            <motion.div whileHover={{ y: -3 }} transition={{ duration: 0.2 }}>
              <Card className="h-full">
                <p className="text-sm text-text-secondary mb-1">{a.label}</p>
                <p className="font-medium">{a.title}</p>
              </Card>
            </motion.div>
          </Link>
        ))}
      </Reveal>

      {address && (
        <div className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <Reveal delay={0.1}>
              <h2 className="text-lg font-medium mb-4">Active Policies</h2>
              <div className="space-y-3">
                {loading && <EmptyState label="Loading policies…" />}
                {loadError && <EmptyState label={loadError} />}
                {!loading && !loadError && policies.length === 0 && (
                  <EmptyState label="No active policies yet. Create your first one above." />
                )}
                {policies.map((p) => (
                  <Link key={p.id} to={`/policies/${p.id}`}>
                    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                      <Card className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">{p.type}</p>
                          <p className="text-sm text-text-secondary max-w-md">{p.coverage_text}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <StatusPill status={p.status} />
                          <p className="text-sm mt-2">{p.coverage_amount}</p>
                        </div>
                      </Card>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <h2 className="text-lg font-medium mb-4">Recent Claims</h2>
              <div className="space-y-3">
                {claimsLoading && <EmptyState label="Loading claims…" />}
                {claimsError && <EmptyState label={claimsError} />}
                {!claimsLoading && !claimsError && claims.length === 0 && (
                  <EmptyState label="No claims submitted yet." />
                )}
                {claims.map((c) => (
                  <Link key={c.id} to={`/claims/${c.id}`}>
                    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                      <Card className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">{c.policy_type} · {c.policy_id}</p>
                          <p className="text-sm text-text-secondary max-w-md">{c.description}</p>
                        </div>
                        <StatusPill status={c.status} />
                      </Card>
                    </motion.div>
                  </Link>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <Card className="relative overflow-hidden">
              <div
                className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-40"
                style={{ background: 'radial-gradient(circle, rgba(91,140,255,0.35) 0%, transparent 70%)' }}
              />
              <p className="relative text-sm text-text-secondary mb-1">Wallet</p>
              <p className="relative text-sm font-mono mb-6 break-all">{address}</p>
              <Link to="/wallet" className="relative block">
                <ButtonPrimary className="w-full">View Wallet</ButtonPrimary>
              </Link>
            </Card>
          </Reveal>
        </div>
      )}
    </AppShell>
  )
}
