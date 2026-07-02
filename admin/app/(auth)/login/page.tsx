import LoginForm from './login-form'
import { Clock, TrendingUp, Banknote } from 'lucide-react'
import timeveraLogo from '../../../lib/timevera-web-logo.png'
import arkoLogo from '../../../lib/arko-logo.png'
import buildoneLogo from '../../../lib/buildone-logo.png'

const ERROR_MESSAGES: Record<string, string> = {
  not_admin: 'This portal is for admin accounts only. Please sign in with an admin account.',
}

const FEATURES = [
  { icon: Clock,      title: 'Time Tracking', sub: 'Per project' },
  { icon: TrendingUp, title: 'Labour Cost',   sub: 'Real-time' },
  { icon: Banknote,   title: 'Xero Payroll',  sub: 'Automated' },
]

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const initialError = params.error ? (ERROR_MESSAGES[params.error] ?? null) : null

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center"
      style={{
        backgroundColor: '#000000',
        backgroundImage: 'url(/login_bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark gradient overlay — keeps the photo visible but text/form readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(105deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.9) 100%)' }}
      />

      {/* soft glow behind the form for depth */}
      <div
        className="absolute top-[18%] right-[-6%] w-[560px] h-[560px] rounded-full pointer-events-none animate-glow-pulse"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 68%)' }}
      />

      {/* top hairline accent */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)' }}
      />

      {/* vignette — darkens edges for focus */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(135% 115% at 45% 45%, transparent 38%, rgba(0,0,0,0.8) 100%)' }}
      />

      <div className="relative z-10 w-full max-w-[1500px] mx-auto px-6 sm:px-12 lg:px-20 flex items-center justify-center lg:justify-between gap-12">

        {/* ── Left branding (centered content, pinned far-left) ── */}
        <div className="hidden lg:flex flex-col items-center text-center max-w-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="animate-fade-in-up mb-7">
            <img
              src={timeveraLogo.src}
              alt="Timevera"
              className="h-16 w-auto object-contain animate-float-slow"
            />
          </div>

          <span
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] mb-5 animate-fade-in-up delay-75"
            style={{ background: 'rgba(28,26,22,0.14)', border: '1px solid rgba(28,26,22,0.28)', color: '#A1A1AA' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#A1A1AA' }} />
            Workforce Management · Admin
          </span>

          <h1 className="text-6xl xl:text-7xl font-black leading-[1.02] text-white animate-fade-in-up delay-100">
            Welcome<br />back.
          </h1>

          <p className="mt-6 text-lg leading-relaxed max-w-md text-white/90 animate-fade-in-up delay-150">
            Your command center for managing the crew across Build One &amp; ARKO Joinery.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed max-w-md mx-auto animate-fade-in-up delay-200" style={{ color: '#A1A1AA' }}>
            Track site and workshop hours in real time, monitor labour cost per project, approve
            overtime, and run fortnightly payroll straight into Xero — all from one dashboard.
          </p>
          <p className="mt-4 text-sm font-medium max-w-md mx-auto animate-fade-in-up delay-300" style={{ color: '#A1A1AA' }}>
            Built for the office — invisible to the crew. Every hour costed, allocated, and pay-ready.
          </p>

          <div className="mt-12 flex items-start justify-center gap-12 animate-fade-in-up delay-400">
            {FEATURES.map(({ icon: Icon, title, sub }) => (
              <div key={title} className="flex flex-col items-center gap-2.5">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-300 hover:scale-110 hover:-translate-y-1"
                  style={{ background: 'rgba(28,26,22,0.14)', border: '1px solid rgba(28,26,22,0.24)' }}
                >
                  <Icon size={22} style={{ color: '#A1A1AA' }} strokeWidth={2} />
                </div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="text-[11px]" style={{ color: '#71717A' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Floating glass form card with a glow that runs the border ── */}
        <div className="glow-card w-full max-w-md shrink-0 animate-scale-in">
          <div
            className="glow-card-inner rounded-3xl p-8 sm:p-10"
            style={{
              background: 'rgba(255,255,255,0.07)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 30px 70px -15px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* BuildOne + ARKO logos at the top of the card */}
            <div className="flex items-center justify-center gap-4 mb-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={buildoneLogo.src}
                alt="BuildOne"
                className="h-7 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
              <span className="w-px h-6" style={{ background: 'rgba(255,255,255,0.2)' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={arkoLogo.src}
                alt="ARKO Joinery"
                className="h-7 w-auto object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            </div>

            <h2 className="text-2xl font-bold text-center text-white">Welcome Back</h2>
            <p className="text-sm text-center mt-1.5 mb-7" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Sign in to continue to Timevera
            </p>

            <LoginForm initialError={initialError} />
          </div>
        </div>
      </div>
    </div>
  )
}
