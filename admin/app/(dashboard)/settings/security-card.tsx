'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { ShieldCheck, ShieldOff, Loader2, XCircle, CheckCircle } from 'lucide-react'
import { enrollTotpAction, verifyTotpEnrolAction, unenrollTotpAction, type EnrolState } from './security-actions'
import { saveSecurityAction } from './actions'

export interface FactorView { id: string; friendlyName: string | null; /** Pre-formatted on the server (avoids a server/client locale mismatch). */ added: string }

/**
 * Settings → Security: the signed-in admin's authenticator app, and the
 * admin-wide "require 2FA" switch.
 */
export default function SecurityCard({
  factors,
  requireAdmin2fa,
  setupRequested,
}: {
  factors: FactorView[]
  requireAdmin2fa: boolean
  /** True when the middleware sent the admin here to finish setup. */
  setupRequested: boolean
}) {
  const [enrol, setEnrol] = useState<EnrolState | null>(null)
  const [starting, startEnrol] = useTransition()
  const [verifyState, verifyAction, verifying] = useActionState(verifyTotpEnrolAction, null)
  const [removeState, removeAction, removing] = useActionState(unenrollTotpAction, null)
  const [reqState, reqAction, reqPending] = useActionState(saveSecurityAction, null)
  const [requireOn, setRequireOn] = useState(requireAdmin2fa)

  useEffect(() => {
    if (verifyState?.ok) setEnrol(null)
  }, [verifyState])

  const begin = () => startEnrol(async () => {
    try {
      setEnrol(await enrollTotpAction())
    } catch (e) {
      setEnrol({ error: e instanceof Error ? e.message : 'Could not start enrolment.' })
    }
  })
  const enrolled = factors.length > 0

  return (
    <div className="space-y-5">
      {setupRequested && !enrolled && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          Two-factor authentication is required for admins. Set up your authenticator app below to continue.
        </div>
      )}

      {/* ── This admin's authenticator ─────────────────────────────── */}
      <div className="rounded-xl border border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {enrolled ? <ShieldCheck size={20} style={{ color: '#15803D' }} /> : <ShieldOff size={20} style={{ color: '#A1A1AA' }} />}
            <div>
              <div className="font-semibold text-ink">Authenticator app {enrolled ? 'is on' : 'is off'}</div>
              <div className="text-xs text-muted mt-0.5">
                {enrolled
                  ? 'Every sign-in asks for a 6-digit code from your app as well as your password.'
                  : 'Add a second step to your sign-in with Google Authenticator, Microsoft Authenticator, 1Password or similar.'}
              </div>
            </div>
          </div>
          {!enrolled && !enrol && (
            <button
              type="button"
              onClick={begin}
              disabled={starting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: '#1C1A16' }}
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Set up
            </button>
          )}
        </div>

        {enrolled && (
          <div className="mt-3 space-y-2">
            {removeState?.error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm">
                <XCircle size={16} className="shrink-0 mt-0.5" /> {removeState.error}
              </div>
            )}
            {factors.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2" style={{ background: '#FAF9F6' }}>
                <span className="text-muted">{f.friendlyName ?? 'Authenticator'} · added {f.added}</span>
                <form action={removeAction}>
                  <input type="hidden" name="factor_id" value={f.id} />
                  <button type="submit" disabled={removing} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {enrol?.error && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm mt-3">
            <XCircle size={16} className="shrink-0 mt-0.5" /> {enrol.error}
          </div>
        )}

        {enrol?.factorId && (
          <div className="mt-4 grid sm:grid-cols-[auto,1fr] gap-4 items-start">
            <div className="rounded-xl border border-line bg-white p-2 w-[170px] h-[170px]">
              {/* Supabase returns the QR as a data:image/svg+xml URL */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrol.qrSvg} alt="Authenticator QR code" className="w-full h-full" />
            </div>
            <form action={verifyAction} className="space-y-3">
              <input type="hidden" name="factor_id" value={enrol.factorId} />
              <p className="text-sm text-ink">
                1. Scan the QR code with your authenticator app.<br />
                2. Enter the 6-digit code it shows.
              </p>
              <p className="text-[11px] text-muted break-all">Can&rsquo;t scan? Enter this key manually: <code>{enrol.secret}</code></p>
              {verifyState?.error && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm">
                  <XCircle size={16} className="shrink-0 mt-0.5" /> {verifyState.error}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  placeholder="123 456"
                  required
                  autoFocus
                  className="w-32 border border-line rounded-xl px-3 py-2 text-lg tracking-[0.3em] text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
                <button type="submit" disabled={verifying} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1C1A16' }}>
                  {verifying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} Turn on
                </button>
                <button type="button" onClick={() => setEnrol(null)} className="text-sm text-muted hover:text-ink">Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Admin-wide requirement ─────────────────────────────────── */}
      <form action={reqAction} className="rounded-xl border border-line p-4 space-y-3">
        {reqState && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-2 text-sm">
            <XCircle size={16} className="shrink-0 mt-0.5" /> {reqState}
          </div>
        )}
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="require_admin_2fa"
            checked={requireOn}
            onChange={(e) => setRequireOn(e.target.checked)}
            disabled={reqPending}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
          />
          <span>
            <span className="block text-sm font-medium text-ink">Require an authenticator app for every admin</span>
            <span className="block text-xs text-muted mt-0.5">
              Admins without one are sent here to set it up the next time they sign in. Pay rates, payroll and labour costs stay admin-only either way.
            </span>
          </span>
        </label>
        <button type="submit" disabled={reqPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#1C1A16' }}>
          {reqPending ? <Loader2 size={14} className="animate-spin" /> : null} Save
        </button>
      </form>
    </div>
  )
}
