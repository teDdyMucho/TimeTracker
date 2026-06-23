'use client'
import { useActionState } from 'react'
import { Clock } from 'lucide-react'
import { signInAction } from './actions'

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const [error, formAction, pending] = useActionState(signInAction, initialError)

  return (
    <div className="relative w-full max-w-sm animate-scale-in">
      {/* Glass card */}
      <div
        className="rounded-3xl p-8 border"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(32px)',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 32px 64px -16px rgba(0,0,0,0.5)',
        }}
      >
        {/* Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-glow-brand"
            style={{ background: 'linear-gradient(135deg, #0ABFA3 0%, #07906F 100%)' }}
          >
            <Clock size={26} className="text-white" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">Timevera</div>
          <div className="text-sm text-slate-500 mt-1 font-medium">
            Build One &amp; ARKO Joinery
          </div>
        </div>

        <form action={formAction} className="space-y-4">
          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm text-red-300"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="admin@company.com"
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                // @ts-ignore
                '--tw-ring-color': 'rgba(10,191,163,0.4)',
              }}
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Password
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50 transition-all duration-200 mt-2 hover:opacity-90 active:scale-[0.98] shadow-glow-brand"
            style={{
              background: 'linear-gradient(135deg, #0ABFA3 0%, #089E87 100%)',
            }}
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
        </form>
      </div>
    </div>
  )
}
