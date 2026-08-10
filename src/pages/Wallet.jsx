import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { StatusPill } from '../components/StatusPill.jsx'
import { ButtonPrimary } from '../components/Button.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useWallet } from '../lib/WalletContext.jsx'
import { getPoolStatus, listClaimsByOwner, GEN_WEI } from '../lib/genlayer.js'

function weiToGen(wei) {
  if (!wei) return '0'
  const gen = BigInt(wei) / GEN_WEI
  return gen.toString()
}

export function Wallet() {
  const { address, connecting, connect, error } = useWallet()
  const [pool, setPool] = useState(null)
  const [poolError, setPoolError] = useState(null)
  const [claims, setClaims] = useState([])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimsError, setClaimsError] = useState(null)

  useEffect(() => {
    getPoolStatus()
      .then(setPool)
      .catch((err) => setPoolError(err.message || 'Failed to load pool status'))
  }, [])

  useEffect(() => {
    if (!address) return
    setClaimsLoading(true)
    setClaimsError(null)
    listClaimsByOwner(address)
      .then((all) => setClaims(all.reverse()))
      .catch((err) => setClaimsError(err.message || 'Failed to load claim history'))
      .finally(() => setClaimsLoading(false))
  }, [address])

  const paidClaims = claims.filter((c) => c.status === 'approved')
  const totalReceived = paidClaims.reduce((sum, c) => sum + (parseFloat((c.policy_coverage_amount || '0').replace(/[^0-9.]/g, '')) || 0), 0)

  return (
    <AppShell>
      <Reveal>
        <h1 className="font-serif font-light text-3xl md:text-4xl mb-10">Wallet</h1>
      </Reveal>

      <Reveal delay={0.05}>
        <Card hover={false} className="relative overflow-hidden mb-8">
          <div
            className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-25"
            style={{ background: 'radial-gradient(circle, rgba(91,140,255,0.4) 0%, transparent 70%)' }}
          />
          {address ? (
            <>
              <p className="relative text-sm text-text-secondary mb-1">Connected address</p>
              <p className="relative text-lg font-mono mb-6 break-all">{address}</p>
              <div className="relative flex items-center gap-8">
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Total received</p>
                  <p className="text-2xl font-serif">{totalReceived.toFixed(0)} GEN</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Approved claims</p>
                  <p className="text-2xl font-serif">{paidClaims.length}</p>
                </div>
              </div>
              <p className="relative text-xs text-text-muted leading-relaxed mt-6">
                Approved claim payouts settle directly to this address on-chain — GenLayer's consensus contract
                transfers GEN automatically once a claim is judged, so there's no separate withdrawal step here.
              </p>
            </>
          ) : (
            <>
              <p className="relative text-sm text-text-secondary mb-6">
                Connect your wallet to see your address and claim payout activity.
              </p>
              {error && <p className="relative text-xs text-danger mb-4">{error}</p>}
              <ButtonPrimary className="relative" onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect Wallet'}
              </ButtonPrimary>
            </>
          )}
        </Card>
      </Reveal>

      {address && (
        <Reveal delay={0.1} className="mb-8">
          <h2 className="text-lg font-medium mb-4">Claim History</h2>
          <div className="space-y-3">
            {claimsLoading && (
              <Card hover={false} className="text-center py-10">
                <p className="text-text-muted text-sm">Loading claim history…</p>
              </Card>
            )}
            {claimsError && (
              <Card hover={false} className="text-center py-10">
                <p className="text-danger text-sm">{claimsError}</p>
              </Card>
            )}
            {!claimsLoading && !claimsError && claims.length === 0 && (
              <Card hover={false} className="text-center py-10">
                <p className="text-text-muted text-sm">No claims filed yet.</p>
              </Card>
            )}
            {claims.map((c) => (
              <Link key={c.id} to={`/claims/${c.id}`}>
                <Card className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-text-muted uppercase tracking-wide mb-1">{c.policy_type} · {c.policy_id}</p>
                    <p className="text-sm text-text-secondary max-w-md">{c.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusPill status={c.status} />
                    {c.status === 'approved' && (
                      <p className="text-sm mt-2">{c.policy_coverage_amount}</p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Reveal>
      )}

      <Reveal delay={0.15}>
        <Card hover={false}>
          <p className="text-xs text-text-muted uppercase tracking-wide mb-4">Protocol Payout Pool</p>
          {poolError && <p className="text-sm text-danger">{poolError}</p>}
          {!poolError && !pool && <p className="text-sm text-text-muted">Loading pool status…</p>}
          {pool && (
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-text-secondary mb-1">Pool balance</p>
                <p className="text-2xl font-serif">{weiToGen(pool.pool_balance_wei)} GEN</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary mb-1">Reserved for open policies</p>
                <p className="text-2xl font-serif">{weiToGen(pool.reserved_liability_wei)} GEN</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary mb-1">Total premiums collected</p>
                <p className="text-lg">{weiToGen(pool.total_premiums_collected_wei)} GEN</p>
              </div>
              <div>
                <p className="text-sm text-text-secondary mb-1">Total payouts paid</p>
                <p className="text-lg">{weiToGen(pool.total_payouts_paid_wei)} GEN</p>
              </div>
            </div>
          )}
          <p className="text-xs text-text-muted leading-relaxed mt-6">
            Every policy's premium is collected into this shared pool in GEN, and its promised coverage amount is
            reserved from it immediately — a policy can only be created if the pool could actually cover the payout.
          </p>
        </Card>
      </Reveal>
    </AppShell>
  )
}
