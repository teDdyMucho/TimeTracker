'use client'
import { useActionState, useEffect, useRef } from 'react'
import { ShieldCheck } from 'lucide-react'
import { verifyMfaAction } from './actions'

const fieldClass =
  'w-full rounded-xl px-4 py-3 text-lg text-white text-center tracking-[0.4em] tabular-nums placeholder-white/30 border focus:outline-none focus:ring-2 transition-all duration-200'
const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  borderColor: 'rgba(255,255,255,0.16)',
  ['--tw-ring-color' as string]: 'rgba(28,26,22,0.55)',
}

/** Second sign-in step: the 6-digit code from the admin's authenticator app. */
export default function MfaForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(verifyMfaAction, null)
  const done = useRef(false)

  useEffect(() => {
    if (state?.ok && !done.current) {
      done.current = true
      onDone()
    }
  }, [state, onDone])

  return (
    <form action={formAction} className="space-y-4 glass-form">
      <div className="flex items-center gap-3 text-white">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ShieldCheck size={20} />
        </div>
        <div>
          <div className="font-semibold">Two-factor authentication</div>
          <div className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>Enter the 6-digit code from your authenticator app.</div>
        </div>
      </div>

      {state?.error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.30)' }}
        >
          {state.error}
        </div>
      )}

      <input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        placeholder="000000"
        required
        autoFocus
        className={fieldClass}
        style={fieldStyle}
      />

      <button
        type="submit"
        disabled={pending}
        className="w-full text-white font-semibold rounded-xl py-3 text-sm mt-1 transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-[0.98] disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #1C1A16, #000000)', boxShadow: '0 8px 24px -8px rgba(28,26,22,0.6)' }}
      >
        {pending ? 'Checking…' : 'Verify'}
      </button>

      <a href="/auth/signout" className="block text-center text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
        Use a different account
      </a>
    </form>
  )
}
