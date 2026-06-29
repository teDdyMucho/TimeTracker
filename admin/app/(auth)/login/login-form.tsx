'use client'
import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { signInAction } from './actions'
import SuccessSplash from './success-splash'

const fieldClass =
  'w-full rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-white/40 border focus:outline-none focus:ring-2 transition-all duration-200'

const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  borderColor: 'rgba(255,255,255,0.16)',
  ['--tw-ring-color' as string]: 'rgba(28,26,22,0.55)',
}
//
export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(signInAction, initialError ? { error: initialError } : null)
  const [showPw, setShowPw] = useState(false)
  const [success, setSuccess] = useState(false)

  const error = state?.error ?? null

  // On successful sign-in, play the splash then go to the dashboard.
  useEffect(() => {
    if (state?.ok) setSuccess(true)
  }, [state])

  if (success) {
    return <SuccessSplash onDone={() => router.replace('/')} />
  }

  return (
    <form action={formAction} className="space-y-4 glass-form">
      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.30)' }}
        >
          {error}
        </div>
      )}

      {/* Email */}
      <div>
        <label className="block text-sm font-semibold mb-1.5 text-white/85">Email</label>
        <div className="relative">
          <Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.45)' }} />
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Enter your email"
            className={fieldClass}
            style={fieldStyle}
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-semibold mb-1.5 text-white/85">Password</label>
        <div className="relative">
          <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'rgba(255,255,255,0.45)' }} />
          <input
            type={showPw ? 'text' : 'password'}
            name="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className={`${fieldClass} !pr-11`}
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
            style={{ color: 'rgba(255,255,255,0.55)' }}
          >
            {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full text-white font-semibold rounded-xl py-3 text-sm mt-1 transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #1C1A16, #000000)', boxShadow: '0 8px 24px -8px rgba(28,26,22,0.6)' }}
      >
        {pending ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            Signing in…
          </span>
        ) : (
          'Sign in'
        )}
      </button>

      {/* Help note */}
      <div
        className="rounded-xl px-4 py-3 text-xs text-center leading-relaxed"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
      >
        <span className="font-semibold text-white">Need access?</span>{' '}
        Contact your administrator to set up an account.
      </div>
    </form>
  )
}
