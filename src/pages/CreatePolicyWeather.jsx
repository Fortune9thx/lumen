import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from '../components/AppShell.jsx'
import { Card } from '../components/Card.jsx'
import { FormField, Input, Textarea } from '../components/FormField.jsx'
import { ButtonPrimary } from '../components/Button.jsx'
import { Reveal } from '../components/Reveal.jsx'
import { useWallet } from '../lib/WalletContext.jsx'
import { createWeatherPolicy } from '../lib/genlayer.js'
import { isValidWholeGenAmount, validate } from '../lib/validation.js'

const CHECKS = [
  ['location', (v) => (v || '').trim().length >= 2, 'Location is required'],
  ['period', (v) => (v || '').trim().length >= 2, 'Coverage period is required'],
  ['coverageText', (v) => (v || '').trim().length >= 20, 'Describe the condition in at least 20 characters'],
  ['coverageAmountGen', (v) => isValidWholeGenAmount(v), 'Enter a whole GEN amount greater than 0, e.g. 2000'],
  ['premiumGen', (v) => isValidWholeGenAmount(v), 'Enter a whole GEN amount greater than 0, e.g. 120'],
]

export function CreatePolicyWeather() {
  const navigate = useNavigate()
  const { address, connect } = useWallet()
  const [form, setForm] = useState({
    location: '',
    period: '',
    coverageText: '',
    coverageAmountGen: '',
    premiumGen: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async () => {
    setError(null)
    const errors = validate(form, CHECKS)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      if (!address) await connect()
      setSubmitting(true)
      const hash = await createWeatherPolicy(form)
      navigate('/dashboard', { state: { justCreated: hash } })
    } catch (err) {
      setError(err.message || 'Failed to create policy')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <Reveal>
        <h1 className="font-serif font-light text-3xl md:text-4xl mb-2">New Weather Policy</h1>
        <p className="text-text-secondary text-sm mb-10">Describe your rainfall or drought condition in plain English.</p>
      </Reveal>

      <div className="grid lg:grid-cols-2 gap-8">
        <Reveal delay={0.05}>
          <Card className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Location" error={fieldErrors.location}>
                <Input placeholder="Nakuru County, Kenya" value={form.location} onChange={set('location')} error={fieldErrors.location} />
              </FormField>
              <FormField label="Coverage period" error={fieldErrors.period}>
                <Input placeholder="Mar 1 – May 31" value={form.period} onChange={set('period')} error={fieldErrors.period} />
              </FormField>
            </div>
            <FormField label="Coverage in your own words" error={fieldErrors.coverageText}>
              <Textarea
                rows={5}
                placeholder='e.g. "Pay me 2000 GEN if Nakuru County receives less than 5mm of rain over any 15 consecutive days between Mar 1 and May 31."'
                value={form.coverageText}
                onChange={set('coverageText')}
                error={fieldErrors.coverageText}
              />
            </FormField>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Coverage amount (GEN)" error={fieldErrors.coverageAmountGen}>
                <Input placeholder="2000" inputMode="numeric" value={form.coverageAmountGen} onChange={set('coverageAmountGen')} error={fieldErrors.coverageAmountGen} />
              </FormField>
              <FormField label="Premium (GEN)" error={fieldErrors.premiumGen}>
                <Input placeholder="120" inputMode="numeric" value={form.premiumGen} onChange={set('premiumGen')} error={fieldErrors.premiumGen} />
              </FormField>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              This is a parametric policy — your premium is paid in GEN and held in Lumen's payout pool. GenLayer
              validators monitor live rainfall data and settle automatically when your condition is met.
            </p>
            {error && <p className="text-xs text-danger">{error}</p>}
            <ButtonPrimary className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating…' : address ? 'Create Policy & Pay Premium' : 'Connect Wallet to Continue'}
            </ButtonPrimary>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="h-fit sticky top-24 relative overflow-hidden" hover={false}>
            <div
              className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full opacity-25"
              style={{ background: 'radial-gradient(circle, rgba(155,140,255,0.4) 0%, transparent 70%)' }}
            />
            <p className="relative text-xs text-text-muted uppercase tracking-wide mb-4">Policy Preview</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={form.coverageText ? 'filled' : 'empty'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="relative text-[15px] leading-relaxed text-text-primary min-h-24"
              >
                {form.coverageText || 'Your policy language will appear here as you write it.'}
              </motion.p>
            </AnimatePresence>
          </Card>
        </Reveal>
      </div>
    </AppShell>
  )
}
