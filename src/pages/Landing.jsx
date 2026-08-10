import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo.jsx'
import { ButtonPrimary, ButtonGhost } from '../components/Button.jsx'
import { Card } from '../components/Card.jsx'
import { GlowOrb } from '../components/GlowOrb.jsx'
import { StatusPill } from '../components/StatusPill.jsx'
import { Reveal } from '../components/Reveal.jsx'

const PROGRESS_FILL = {
  default: 'bg-accent-blue',
  warning: 'bg-warning',
}

function AnimatedProgress({ value, status = 'default' }) {
  return (
    <div className="w-full h-2 rounded-full bg-border-subtle overflow-hidden">
      <motion.div
        initial={{ width: '0%' }}
        whileInView={{ width: `${value}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
        className={`h-full rounded-full ${PROGRESS_FILL[status] || PROGRESS_FILL.default}`}
      />
    </div>
  )
}

export function Landing() {
  return (
    <div className="relative bg-bg-void text-text-primary overflow-hidden">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-bg-void/70 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#products" className="hover:text-text-primary transition-colors">Products</a>
            <a href="#how-it-works" className="hover:text-text-primary transition-colors">How it works</a>
            <a href="#trust" className="hover:text-text-primary transition-colors">For Builders</a>
          </nav>
          <div className="flex items-center gap-5">
            <Link to="/dashboard" className="hidden sm:block text-sm text-text-secondary hover:text-text-primary transition-colors">
              Log in
            </Link>
            <Link to="/dashboard">
              <button className="h-10 px-5 rounded-full bg-white text-bg-void text-sm font-medium hover:brightness-95 transition-all">
                Get Started
              </button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-32 pb-20 text-center">
        <GlowOrb color="blue" size={700} className="-top-40 left-1/2 -translate-x-1/2 opacity-60" />
        <GlowOrb color="violet" size={500} className="top-20 right-10 opacity-40" />

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative font-serif font-light text-[44px] leading-[1.05] sm:text-6xl md:text-7xl lg:text-8xl max-w-4xl"
        >
          Insurance written<br />in language
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: 'easeOut' }}
          className="relative mt-6 max-w-xl text-base md:text-lg text-text-secondary"
        >
          Policies in plain English. Claims judged by decentralized AI. Settled in minutes on GenLayer.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
          className="relative mt-10 flex flex-col sm:flex-row items-center gap-4"
        >
          <Link to="/policies/new/flight"><ButtonPrimary>Create a policy</ButtonPrimary></Link>
          <a href="#how-it-works"><ButtonGhost>See how it works</ButtonGhost></a>
        </motion.div>

        {/* Floating consensus / policy visualization */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.45, ease: 'easeOut' }}
          className="relative mt-20 w-full max-w-md"
        >
          <div className="relative mx-auto h-72 w-72 sm:h-80 sm:w-80">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, rgba(91,140,255,0.25) 0%, rgba(155,140,255,0.12) 45%, transparent 72%)',
              }}
            />
            <div className="absolute inset-8 rounded-full border border-border-soft" />
            <div className="absolute inset-16 rounded-full border border-border-subtle" />
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-56"
            >
              <Card hover={false} className="text-left bg-bg-card/90 backdrop-blur-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-text-muted">Flight Delay — BA287</span>
                  <StatusPill status="approved">Approved</StatusPill>
                </div>
                <p className="text-2xl font-serif">$480.00</p>
                <p className="text-xs text-text-muted mt-1">Settled by 5 validators · 41 min</p>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Products */}
      <section id="products" className="relative px-6 py-28 max-w-6xl mx-auto">
        <Reveal className="text-center mb-14">
          <h2 className="font-serif font-light text-4xl md:text-5xl">Two products. Real protection.</h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6">
          <Reveal delay={0.05}>
            <Card className="h-full flex flex-col">
              <div className="mb-6 h-12 w-12 rounded-xl bg-accent-violet-soft flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue-glow">
                  <path d="M2 16l4-1 4.5-6.5L22 3 21 10l-6.5 6.5L14 20l-1-4-3.5 3.5L8 22l-2-4-4-2 2.5-1.5L2 16z" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-medium mb-3">Flight Delay & Cancellation</h3>
              <p className="text-text-secondary text-[15px] leading-relaxed mb-8">
                Write your coverage in your own words — flight number, threshold, payout. If your flight is delayed
                or cancelled, GenLayer validators check live flight data and settle automatically.
              </p>
              <div className="mt-auto">
                <Link to="/policies/new/flight" className="text-accent-blue-glow text-sm font-medium hover:underline">
                  Explore Flight Coverage →
                </Link>
              </div>
            </Card>
          </Reveal>

          <Reveal delay={0.15}>
            <Card className="h-full flex flex-col">
              <div className="mb-6 h-12 w-12 rounded-xl bg-accent-violet-soft flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent-blue-glow">
                  <path d="M12 2v6M6 9l1.5 1.5M18 9l-1.5 1.5M4 15a8 8 0 0116 0c0 3-3 5-8 5s-8-2-8-5z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-xl md:text-2xl font-medium mb-3">Weather & Drought</h3>
              <p className="text-text-secondary text-[15px] leading-relaxed mb-8">
                Describe the rainfall condition that matters to you — a location, a threshold, a window of time.
                Parametric triggers settle the moment the data confirms it.
              </p>
              <div className="mt-auto">
                <Link to="/policies/new/weather" className="text-accent-blue-glow text-sm font-medium hover:underline">
                  Explore Weather Coverage →
                </Link>
              </div>
            </Card>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="relative px-6 py-28">
        <GlowOrb color="violet" size={600} className="top-0 left-1/2 -translate-x-1/2 opacity-25" />
        <div className="relative max-w-5xl mx-auto">
          <Reveal className="text-center mb-16">
            <h2 className="font-serif font-light text-4xl md:text-5xl">How it works</h2>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              { n: '01', title: 'Write your policy in plain English', body: 'No forms, no jargon — describe exactly what should be covered.' },
              { n: '02', title: 'Event happens', body: 'Submit evidence, or let a parametric trigger fire automatically.' },
              { n: '03', title: 'AI validators judge intent', body: 'GenLayer’s decentralized validators reach consensus and settle payout in minutes.' },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 0.1} className="text-center md:text-left">
                <div className="mx-auto md:mx-0 mb-5 h-14 w-14 rounded-full flex items-center justify-center relative">
                  <div className="absolute inset-0 rounded-full bg-accent-violet-soft blur-md" />
                  <span className="relative font-serif text-lg text-accent-blue-glow">{step.n}</span>
                </div>
                <h3 className="text-lg font-medium mb-2">{step.title}</h3>
                <p className="text-text-secondary text-sm leading-relaxed">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Live examples */}
      <section className="relative px-6 py-28 max-w-6xl mx-auto">
        <Reveal className="text-center mb-14">
          <h2 className="font-serif font-light text-4xl md:text-5xl">See it in action</h2>
          <p className="text-text-secondary text-sm mt-4 max-w-md mx-auto">
            Two real policies, mid-lifecycle — one settled, one still being monitored.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-6">
          <Reveal delay={0.05}>
            <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle, rgba(91,140,255,0.5) 0%, transparent 70%)' }}
                />
                <div className="relative flex items-center justify-between mb-4">
                  <span className="text-xs text-text-muted uppercase tracking-wide">Flight Policy</span>
                  <StatusPill status="active">Active</StatusPill>
                </div>
                <p className="relative text-[15px] leading-relaxed text-text-secondary mb-6">
                  "Pay me $500 if flight BA287 from LHR to JFK on Sept 12 is delayed more than 3 hours or cancelled."
                </p>
                <div className="relative flex items-center justify-between text-sm mb-2">
                  <span className="text-text-muted">Coverage</span>
                  <span className="text-text-primary font-medium">$500.00</span>
                </div>
                <div className="relative">
                  <AnimatedProgress value={62} />
                </div>
                <p className="relative text-xs text-text-muted mt-2">62% of coverage window elapsed</p>
              </Card>
            </motion.div>
          </Reveal>

          <Reveal delay={0.15}>
            <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <Card className="relative overflow-hidden">
                <div
                  className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-20"
                  style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.5) 0%, transparent 70%)' }}
                />
                <div className="relative flex items-center justify-between mb-4">
                  <span className="text-xs text-text-muted uppercase tracking-wide">Weather Policy</span>
                  <StatusPill status="pending">Monitoring</StatusPill>
                </div>
                <p className="relative text-[15px] leading-relaxed text-text-secondary mb-6">
                  "Pay me $2,000 if Nakuru County receives less than 5mm of rain over any 15 consecutive days between
                  Mar 1 and May 31."
                </p>
                <div className="relative flex items-center justify-between text-sm mb-2">
                  <span className="text-text-muted">Coverage</span>
                  <span className="text-text-primary font-medium">$2,000.00</span>
                </div>
                <div className="relative">
                  <AnimatedProgress value={28} status="warning" />
                </div>
                <p className="relative text-xs text-text-muted mt-2">9 of 15 dry days recorded</p>
              </Card>
            </motion.div>
          </Reveal>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="relative px-6 py-28 overflow-hidden">
        <GlowOrb color="blue" size={550} className="top-0 left-1/4 opacity-15" />
        <GlowOrb color="violet" size={450} className="bottom-0 right-1/4 opacity-15" />
        <div className="relative max-w-3xl mx-auto text-center">
          <Reveal>
            <h2 className="font-serif font-light text-3xl md:text-4xl leading-snug mb-6">
              Settled by decentralized AI.<br />No oracles. No human adjusters.
            </h2>
            <p className="text-text-secondary text-[15px] md:text-base leading-relaxed mb-10">
              Every claim is evaluated on-chain by GenLayer's validator network, reasoning directly over live web
              data and evidence — fully transparent, fully auditable.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="flex items-center justify-center gap-3 mb-10">
            <div className="flex -space-x-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, scale: 0.6 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: 'easeOut' }}
                  className="relative h-9 w-9 rounded-full border-2 border-bg-void flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, var(--accent-blue) ${i * 15}%, var(--accent-violet))` }}
                >
                  <span className="absolute inset-0 rounded-full bg-success blur-[6px] opacity-0 animate-pulse" />
                </motion.span>
              ))}
            </div>
            <span className="text-sm text-text-muted">5 validators reached consensus</span>
          </Reveal>

          <Reveal delay={0.15}>
            <span className="inline-flex items-center gap-2 text-sm text-text-muted border border-border-subtle rounded-full px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-blue-glow" />
              Built for the GenLayer adjudication layer
            </span>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative px-6 py-32">
        <GlowOrb color="blue" size={800} className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50" />
        <Reveal className="relative max-w-2xl mx-auto text-center">
          <h2 className="font-serif font-light text-4xl md:text-6xl leading-tight mb-8">
            Start protecting what matters<br />in language, not code.
          </h2>
          <Link to="/policies/new/flight">
            <ButtonPrimary className="px-9">Create your first policy</ButtonPrimary>
          </Link>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-border-subtle px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <Logo />
          <div className="flex items-center gap-8 text-sm text-text-secondary">
            <a href="#products" className="hover:text-text-primary transition-colors">Products</a>
            <a href="#how-it-works" className="hover:text-text-primary transition-colors">How it works</a>
            <a href="#trust" className="hover:text-text-primary transition-colors">For Builders</a>
          </div>
          <span className="text-xs text-text-muted">Powered by GenLayer</span>
        </div>
      </footer>
    </div>
  )
}
