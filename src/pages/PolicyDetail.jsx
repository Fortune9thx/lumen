import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { StatusPill } from '../components/StatusPill.jsx'
import { ButtonPrimary, ButtonGhost } from '../components/Button.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { getPolicy, listClaimsByPolicy, cancelPolicy, checkWeatherTrigger } from '../lib/genlayer.js'

export function PolicyDetail() {
  const { id } = useParams()
  const [policy, setPolicy] = useState(null)
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [checkingTrigger, setCheckingTrigger] = useState(false)
  const [triggerError, setTriggerError] = useState(null)

  const load = () => {
    setLoading(true)
    setError(null)
    return Promise.all([getPolicy(id), listClaimsByPolicy(id)])
      .then(([p, c]) => {
        setPolicy(p)
        setClaims(c)
      })
      .catch((err) => setError(err.message || 'Failed to load policy'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleCancel = async () => {
    setCancelError(null)
    setCancelling(true)
    try {
      await cancelPolicy(id)
      await load()
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel policy')
    } finally {
      setCancelling(false)
    }
  }

  const handleCheckTrigger = async () => {
    setTriggerError(null)
    setCheckingTrigger(true)
    try {
      await checkWeatherTrigger(id)
      await load()
    } catch (err) {
      setTriggerError(err.message || 'Failed to check weather trigger')
    } finally {
      setCheckingTrigger(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-text-muted text-sm">Loading policy…</p>
      </AppShell>
    )
  }

  if (error || !policy) {
    return (
      <AppShell>
        <p className="text-danger text-sm">{error || 'Policy not found.'}</p>
      </AppShell>
    )
  }

  const hasClaim = claims.length > 0
  const latestClaim = claims[claims.length - 1]

  const steps = policy.status === 'cancelled'
    ? [
        { label: 'Policy created', done: true },
        { label: 'Active', done: true },
        { label: 'Cancelled', done: true },
      ]
    : [
        { label: 'Policy created', done: true },
        { label: 'Active', done: true },
        { label: 'Claim submitted', done: hasClaim },
        { label: 'Judged', done: hasClaim && latestClaim.status !== 'pending' },
        { label: 'Paid', done: policy.status === 'paid' },
      ]

  return (
    <AppShell>
      <Reveal>
        <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
          {policy.type === 'flight' ? 'Flight Delay & Cancellation' : 'Weather & Drought'}
        </p>
        <h1 className="font-serif font-light text-3xl md:text-4xl mb-8">Policy {policy.id}</h1>
      </Reveal>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Reveal delay={0.05}>
            <Card hover={false}>
              <p className="text-[15px] leading-relaxed">"{policy.coverage_text}"</p>
            </Card>
          </Reveal>

          <Reveal delay={0.1} className="flex flex-wrap gap-6 items-center">
            <StatusPill status={policy.status} />
            <span className="text-sm text-text-secondary">Coverage <span className="text-text-primary">{policy.coverage_amount}</span></span>
            <span className="text-sm text-text-secondary">Premium paid <span className="text-text-primary">{policy.premium}</span></span>
            {policy.type === 'flight' && (
              <span className="text-sm text-text-secondary">Expiry <span className="text-text-primary">{policy.expiry}</span></span>
            )}
            {policy.type === 'weather' && (
              <span className="text-sm text-text-secondary">Coverage window <span className="text-text-primary">{policy.period_start} → {policy.expiry}</span></span>
            )}
          </Reveal>

          <Reveal delay={0.15}>
            <div className="flex gap-4">
              {policy.type === 'flight' ? (
                <Link to="/claims/new" state={{ policyId: policy.id }}><ButtonPrimary>Submit Claim</ButtonPrimary></Link>
              ) : (
                policy.status === 'active' && (
                  <ButtonGhost onClick={handleCheckTrigger} disabled={checkingTrigger}>
                    {checkingTrigger ? 'Checking…' : 'Check Trigger Now'}
                  </ButtonGhost>
                )
              )}
              {policy.status === 'active' && (
                <ButtonGhost onClick={handleCancel} disabled={cancelling}>
                  {cancelling ? 'Cancelling…' : 'Cancel Policy'}
                </ButtonGhost>
              )}
            </div>
            {cancelError && <p className="text-xs text-danger mt-3">{cancelError}</p>}
            {triggerError && <p className="text-xs text-danger mt-3">{triggerError}</p>}
            {policy.type === 'weather' && policy.status === 'active' && !triggerError && (
              <p className="text-xs text-text-muted mt-3">
                Anyone can check this policy's trigger at any time — it's a no-op with no cost to the pool if the
                condition isn't met yet, and settles automatically the moment it is.
              </p>
            )}
            {policy.status === 'active' && (
              <p className="text-xs text-text-muted mt-3">
                Cancelling releases your reserved coverage back to the pool. The premium already paid is not refunded.
              </p>
            )}
          </Reveal>

          <Reveal delay={0.2}>
            <Card>
              <p className="text-sm font-medium mb-6">Timeline</p>
              <div className="relative pl-2">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-subtle" />
                <div className="space-y-5">
                  {steps.map((t) => (
                    <div key={t.label} className="relative flex items-center gap-4 pl-6">
                      <span
                        className={`absolute left-0 h-3.5 w-3.5 rounded-full border-2 ${
                          t.done
                            ? 'bg-accent-blue-glow border-accent-blue-glow shadow-[0_0_12px_rgba(123,163,255,0.6)]'
                            : 'bg-bg-void border-border-medium'
                        }`}
                      />
                      <span className={`text-sm ${t.done ? 'text-text-primary' : 'text-text-muted'}`}>{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <Card hover={false} className="h-fit">
            <p className="text-xs text-text-muted uppercase tracking-wide mb-3">Evidence sources</p>
            <p className="text-sm text-text-secondary leading-relaxed">
              {policy.type === 'flight'
                ? 'FlightAware, airline status pages, and public flight tracking APIs are consulted automatically by GenLayer validators when a claim is judged.'
                : 'Public rainfall and weather station records for your location are consulted automatically by GenLayer validators.'}
            </p>
          </Card>
        </Reveal>
      </div>
    </AppShell>
  )
}
