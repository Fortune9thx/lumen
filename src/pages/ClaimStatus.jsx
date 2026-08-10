import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { StatusPill } from '../components/StatusPill.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { getClaim, getPolicy } from '../lib/genlayer.js'

export function ClaimStatus() {
  const { id } = useParams()
  const [claim, setClaim] = useState(null)
  const [policy, setPolicy] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getClaim(id)
      .then(async (c) => {
        setClaim(c)
        setPolicy(await getPolicy(c.policy_id))
      })
      .catch((err) => setError(err.message || 'Failed to load claim'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <AppShell>
        <p className="text-text-muted text-sm">Loading claim…</p>
      </AppShell>
    )
  }

  if (error || !claim) {
    return (
      <AppShell>
        <p className="text-danger text-sm">{error || 'Claim not found.'}</p>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <Reveal>
        <p className="text-xs text-text-muted uppercase tracking-wide mb-2">Claim {claim.id}</p>
      </Reveal>

      <Reveal delay={0.05}>
        <Card hover={false} className="mb-8 relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-25"
            style={{
              background:
                claim.status === 'approved'
                  ? 'radial-gradient(circle, rgba(52,211,153,0.4) 0%, transparent 70%)'
                  : claim.status === 'rejected'
                  ? 'radial-gradient(circle, rgba(248,113,113,0.4) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(251,191,36,0.4) 0%, transparent 70%)',
            }}
          />
          <div className="relative">
            <StatusPill status={claim.status} />
            {claim.status === 'approved' && policy && (
              <p className="text-3xl font-serif mt-4">{policy.coverage_amount}</p>
            )}
            {claim.status === 'pending' && (
              <p className="text-sm text-text-secondary mt-4">
                GenLayer validators are still reaching consensus. This page will reflect the result once judgment
                finalizes on-chain.
              </p>
            )}
          </div>
        </Card>
      </Reveal>

      {claim.reasoning && (
        <Reveal delay={0.1}>
          <Card className="mb-6">
            <p className="text-sm font-medium mb-3">AI Reasoning</p>
            <p className="text-[15px] leading-relaxed text-text-secondary">{claim.reasoning}</p>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.15}>
        <Card>
          <p className="text-sm font-medium mb-3">Claim description</p>
          <p className="text-[15px] leading-relaxed text-text-secondary">{claim.description}</p>
        </Card>
      </Reveal>

      {claim.evidence_urls && (
        <Reveal delay={0.2}>
          <Card className="mt-6">
            <p className="text-sm font-medium mb-3">Evidence submitted</p>
            <ul className="space-y-2 text-sm text-text-secondary">
              {claim.evidence_urls.split(',').map((u) => (
                <li key={u} className="break-all">{u.trim()}</li>
              ))}
            </ul>
          </Card>
        </Reveal>
      )}

      <Reveal delay={0.25}>
        <p className="text-xs text-text-muted text-center mt-10">
          This decision was reached by GenLayer validators.
        </p>
      </Reveal>
    </AppShell>
  )
}
