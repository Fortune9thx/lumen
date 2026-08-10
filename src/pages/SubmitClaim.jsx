import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { FormField, Input, Textarea } from '../components/FormField.jsx'
import { ButtonPrimary } from '../components/Button.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useWallet } from '../lib/WalletContext.jsx'
import { submitClaim, judgeClaim, listClaimsByPolicy } from '../lib/genlayer.js'
import { isValidUrl } from '../lib/validation.js'

const MIN_DESCRIPTION_LENGTH = 20

export function SubmitClaim() {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, connect } = useWallet()
  const policyId = location.state?.policyId

  const [description, setDescription] = useState('')
  const [urls, setUrls] = useState([''])
  const [fieldErrors, setFieldErrors] = useState({})
  const [stage, setStage] = useState('idle') // idle | submitting | judging | error
  const [error, setError] = useState(null)

  const updateUrl = (i, value) => setUrls((u) => u.map((x, idx) => (idx === i ? value : x)))

  const validateForm = () => {
    const errors = {}
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      errors.description = `Add a bit more detail — at least ${MIN_DESCRIPTION_LENGTH} characters.`
    }
    const filledUrls = urls.map((u) => u.trim()).filter(Boolean)
    if (filledUrls.length === 0) {
      errors.urls = 'At least one evidence URL is required.'
    } else if (!filledUrls.every(isValidUrl)) {
      errors.urls = 'Evidence URLs must be valid http(s) links.'
    }
    return errors
  }

  const handleSubmit = async () => {
    if (!policyId) {
      setError('Open this page from a policy\'s "Submit Claim" button so we know which policy to file against.')
      return
    }
    setError(null)
    const errors = validateForm()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      if (!address) await connect()
      setStage('submitting')
      const evidenceUrls = urls.map((u) => u.trim()).filter(Boolean).join(', ')
      await submitClaim({ policyId, description, evidenceUrls })

      // The write call confirms the tx but not the new claim's id, so look it up:
      // claims are appended in order, so the newest pending one is ours.
      const claims = await listClaimsByPolicy(policyId)
      const claim = claims.filter((c) => c.status === 'pending').at(-1)
      if (!claim) throw new Error('Claim was submitted but could not be located afterward.')

      setStage('judging')
      await judgeClaim(claim.id)
      navigate(`/claims/${claim.id}`)
    } catch (err) {
      setError(err.message || 'Failed to submit claim')
      setStage('error')
    }
  }

  return (
    <AppShell>
      <Reveal>
        <p className="text-xs text-text-muted uppercase tracking-wide mb-2">
          {policyId ? `Claim against ${policyId}` : 'No policy selected'}
        </p>
        <h1 className="font-serif font-light text-3xl md:text-4xl mb-10">Submit a Claim</h1>
      </Reveal>

      <Reveal delay={0.05} className="max-w-2xl space-y-6">
        <Card className="space-y-6">
          <FormField label="Describe what happened and why it matches the policy" error={fieldErrors.description}>
            <Textarea
              rows={6}
              placeholder="Flight BA287 was cancelled on Sept 12 due to a mechanical issue..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={fieldErrors.description}
            />
          </FormField>

          <div>
            <p className="text-[13px] md:text-sm text-text-secondary mb-2">Evidence URLs</p>
            <div className="space-y-3">
              {urls.map((u, i) => (
                <Input
                  key={i}
                  placeholder="https://flightaware.com/live/flight/BA287"
                  value={u}
                  onChange={(e) => updateUrl(i, e.target.value)}
                  error={fieldErrors.urls}
                />
              ))}
            </div>
            {fieldErrors.urls && <p className="text-xs text-danger mt-2">{fieldErrors.urls}</p>}
            <button
              type="button"
              onClick={() => setUrls([...urls, ''])}
              className="mt-3 text-sm text-accent-blue-glow hover:underline"
            >
              + Add another source
            </button>
            <p className="text-xs text-text-muted mt-3">Suggested sources: FlightAware, airline status page, airport board.</p>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <ButtonPrimary className="w-full" onClick={handleSubmit} disabled={stage === 'submitting' || stage === 'judging'}>
            {stage === 'submitting' && 'Submitting claim…'}
            {stage === 'judging' && 'GenLayer validators are judging…'}
            {(stage === 'idle' || stage === 'error') && 'Submit for GenLayer Judgment'}
          </ButtonPrimary>
          <p className="text-xs text-text-muted text-center">Expected resolution time: 30–60 minutes.</p>
        </Card>
      </Reveal>
    </AppShell>
  )
}
