'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { createEmployeeAction } from './actions'
import { Input, Select, Button } from '@/components/ui'
import type { BusinessEntity } from '@/lib/types'

export default function InviteEmployeeForm({
  entities,
  onClose,
}: {
  entities: BusinessEntity[]
  onClose: () => void
}) {
  const [serverError, formAction, pending] = useActionState(createEmployeeAction, null)
  const [selectedEntities, setSelectedEntities] = useState<string[]>([entities[0]?.id ?? ''])
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [createdName, setCreatedName] = useState('')
  const prevPendingRef = useRef(false)

  const passwordMismatch = confirm.length > 0 && password !== confirm

  // Detect successful submission
  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  const toggleEntity = (id: string) => {
    setSelectedEntities((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">Employee created!</h2>
          <p className="text-muted text-sm mb-6">
            {createdName ? (
              <><strong className="text-ink">{createdName}</strong> has been added and can now sign in on the mobile app.</>
            ) : (
              'The employee has been added and can now sign in on the mobile app.'
            )}
          </p>
          <Button label="Done" className="w-full" onClick={onClose} />
        </div>
      </div>
    )
  }

  // ── Form state ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl my-auto">
        <h2 className="text-lg font-bold text-ink mb-5">Invite Employee</h2>

        <form
          action={(fd) => {
            setCreatedName((fd.get('name') as string) ?? '')
            return formAction(fd)
          }}
          className="space-y-4"
        >
          {/* Server error */}
          {serverError && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          {/* Password mismatch */}
          {passwordMismatch && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              Passwords do not match.
            </div>
          )}

          <Input
            label="Full name"
            name="name"
            required
            placeholder="John Smith"
            disabled={pending}
          />
          <Input
            label="Email"
            name="email"
            type="email"
            required
            placeholder="john@example.com"
            disabled={pending}
          />

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                disabled={pending}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 pr-11 text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">Confirm password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                disabled={pending}
                className={`w-full border rounded-xl px-4 py-2.5 pr-11 text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50 ${
                  passwordMismatch ? 'border-red-400 bg-red-50' : 'border-slate-200'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
              >
                {showConfirm ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <Select label="Role" name="role" required disabled={pending}>
            <option value="employee">Employee</option>
            <option value="supervisor">Supervisor</option>
          </Select>

          <Select label="Employment type" name="employment_type" required disabled={pending}>
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="casual">Casual</option>
            <option value="contractor">Contractor</option>
          </Select>

          <Input
            label="Hourly pay rate ($) — optional"
            name="hourly_rate"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="e.g. 45.00"
            disabled={pending}
          />

          <div>
            <span className="block text-sm font-medium text-ink mb-2">Entity access</span>
            <div className="flex flex-wrap gap-3">
              {entities.map((e) => (
                <label key={e.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="entity_ids"
                    value={e.id}
                    checked={selectedEntities.includes(e.id)}
                    onChange={() => toggleEntity(e.id)}
                    disabled={pending}
                    className="rounded accent-brand w-4 h-4"
                  />
                  <span className="text-sm text-ink">{e.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={pending || passwordMismatch || password.length < 8}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating…
                </>
              ) : (
                'Create employee'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={onClose}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
