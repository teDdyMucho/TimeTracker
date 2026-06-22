'use client'
import { useActionState } from 'react'
import { signInAction } from './actions'

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const [error, formAction, pending] = useActionState(signInAction, initialError)

  return (
    <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-xl">
      <div className="text-center mb-8">
        <div className="text-3xl font-bold text-brand">Timevera</div>
        <div className="text-xl font-semibold text-ink mt-1">Admin Portal</div>
        <div className="text-muted text-sm mt-0.5">Build One &amp; ARKO Joinery</div>
      </div>

      <form action={formAction} className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Email</label>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-brand text-white font-semibold rounded-xl py-3 text-sm hover:bg-teal-500 disabled:opacity-50 transition-colors mt-2"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
