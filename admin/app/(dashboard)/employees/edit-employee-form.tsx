'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { updateEmployeeAction } from './actions'
import { Button, Input } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import type { BusinessEntity } from '@/lib/types'

interface Props {
  employee: {
    id: string
    name: string
    role: string
    employment_type: string
    business_access: string[]
    hourly_rate?: number | null
    flat_rate?: boolean
    supervisor_id?: string | null
    employer_entity_id?: string | null
    overtime_approver?: boolean
    xero_payroll?: boolean
    portal_admin?: boolean
    /** null = standard 3:06 pm rule; 0 = never; a number = closed that many hours after clock-in. */
    auto_clockout_hours?: number | null
    /** true = no automatic 30-minute unpaid break for this person. */
    unpaid_break_exempt?: boolean
  }
  entities: BusinessEntity[]
  supervisors?: { id: string; name: string }[]
  onClose: () => void
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })

export default function EditEmployeeForm({ employee, entities, supervisors = [], onClose }: Props) {
  const [serverError, formAction, pending] = useActionState(updateEmployeeAction, null)
  const [selectedEntities, setSelectedEntities] = useState<string[]>(employee.business_access)
  const [role, setRole] = useState(employee.role)
  const [supervisorId, setSupervisorId] = useState(employee.supervisor_id ?? '')
  const [employmentType, setEmploymentType] = useState(employee.employment_type)
  const [flatRate, setFlatRate] = useState(employee.flat_rate ?? false)
  const [employer, setEmployer] = useState(employee.employer_entity_id ?? '')
  const [approver, setApprover] = useState(employee.overtime_approver ?? false)
  const [xeroPayroll, setXeroPayroll] = useState(employee.xero_payroll !== false)
  // Auto clock-out: 'standard' (3:06 pm rule), 'hours' (N h after clock-in), 'off' (never).
  const [autoMode, setAutoMode] = useState<'standard' | 'hours' | 'off'>(
    employee.auto_clockout_hours == null ? 'standard' : Number(employee.auto_clockout_hours) === 0 ? 'off' : 'hours',
  )
  const [autoBreak, setAutoBreak] = useState(employee.unpaid_break_exempt !== true)
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const prevPendingRef = useRef(false)

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  const toggleEntity = (id: string) =>
    setSelectedEntities((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    )

  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">Employee updated!</h2>
          <p className="text-muted text-sm mb-6">
            <strong className="text-ink">{employee.name}</strong> has been updated successfully.
          </p>
          <Button label="Done" className="w-full" onClick={onClose} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* The whole dialog always fits the screen: fixed title and buttons, the
          fields scroll inside. (It used to run off the bottom on laptops.) */}
      <div className="glass-panel rounded-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink mb-1">Edit Employee</h2>
          <p className="text-muted text-sm">{employee.name}</p>
        </div>

        <form action={formAction} className="flex flex-col flex-1 min-h-0">
          <input type="hidden" name="id" value={employee.id} />
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">

          {serverError && (
            <div className="flex items-start gap-2 bg-[rgba(239,68,68,0.12)] text-[#F87171] rounded-xl px-4 py-3 text-sm">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Role</span>
            <Dropdown
              name="role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'supervisor', label: 'Supervisor' },
                { value: 'admin', label: 'Admin' },
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Employment type</span>
            <Dropdown
              name="employment_type"
              value={employmentType}
              onChange={setEmploymentType}
              options={[
                { value: 'full_time', label: 'Full time' },
                { value: 'part_time', label: 'Part time' },
                { value: 'casual', label: 'Casual' },
                { value: 'contractor', label: 'Contractor' },
                { value: 'labour_hire', label: 'Labour Hire' },
              ]}
            />
          </div>

          {/* Supervisor (PRD §12): who reviews this person's overtime & attendance. */}
          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Supervisor</span>
            <Dropdown
              name="supervisor_id"
              value={supervisorId}
              onChange={setSupervisorId}
              options={[
                { value: '', label: 'No supervisor (admins review)' },
                ...supervisors.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>

          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Employer (payroll)</span>
            <Dropdown
              name="employer_entity_id"
              value={employer}
              onChange={setEmployer}
              options={[
                { value: '', label: 'First company below' },
                ...entities.filter((e) => selectedEntities.includes(e.id)).map((e) => ({ value: e.id, label: e.name })),
              ]}
            />
            <p className="text-[11px] text-muted mt-1.5 leading-snug">
              Wages always go to this company&rsquo;s Xero payroll, whichever company&rsquo;s project the hours were worked on. Hours still count against the project.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="overtime_approver"
              checked={approver}
              onChange={(e) => setApprover(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Can approve overtime</span>
              <span className="block text-xs text-muted mt-0.5">Workers can send their overtime request to this person; they get a push with Approve / Reject.</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3 items-end">
            <Input
              label="Hourly pay rate ($)"
              name="hourly_rate"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="e.g. 45.00"
              defaultValue={employee.hourly_rate != null ? String(employee.hourly_rate) : ''}
              disabled={pending}
            />
            <Input
              label="Rate applies from"
              name="rate_effective_from"
              type="date"
              defaultValue={today}
              disabled={pending}
            />
          </div>
          <p className="text-[11px] text-muted -mt-2 leading-snug">
            Days worked before this date keep the old rate; a pay run covering both prices each day with the rate in force that day.
          </p>

          {/* Flat rate: paid the same rate for every hour — no overtime, weekend
              or public-holiday loading anywhere in payroll or the Xero push. */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="flat_rate"
              checked={flatRate}
              onChange={(e) => setFlatRate(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Flat rate — no overtime</span>
              <span className="block text-xs text-muted mt-0.5">
                Every hour is paid at the rate above. Overtime, weekend and public-holiday
                rates are not applied.
              </span>
            </span>
          </label>

          {/* TV9 exception (Build One, 24 Oct 2026): a personal auto clock-out
              threshold instead of the 3:06 pm rule, e.g. 14 h for Robbie and Chris. */}
          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">Auto clock-out</span>
            <Dropdown
              name="auto_clockout_mode"
              value={autoMode}
              onChange={(v) => setAutoMode(v as 'standard' | 'hours' | 'off')}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'hours', label: 'After a number of hours' },
                { value: 'off', label: 'Never (auto clock-out off)' },
              ]}
            />
            {autoMode === 'hours' && (
              <div className="mt-2">
                <Input
                  label="Hours after clock-in"
                  name="auto_clockout_hours"
                  type="number"
                  step="0.5"
                  min="1"
                  max="24"
                  inputMode="decimal"
                  placeholder="e.g. 14"
                  defaultValue={employee.auto_clockout_hours ? String(employee.auto_clockout_hours) : ''}
                  disabled={pending}
                />
              </div>
            )}
            <p className="text-[11px] text-muted mt-1.5 leading-snug">
              {autoMode === 'standard'
                ? 'Still clocked in at 3:06 pm with no overtime request = recorded as 7:00 am – 3:06 pm.'
                : autoMode === 'hours'
                  ? 'Closed that many hours after the real clock-in instead of at 3:06 pm (marked “auto” on Attendance).'
                  : 'Never clocked out automatically — not at 3:06 pm, not overnight. A forgotten clock-out stays open until this person or the office closes it.'}
            </p>
          </div>

          {/* Per-person exception to the fixed TV1 rule (30 min on days of 5 h+). */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="unpaid_break"
              checked={autoBreak}
              onChange={(e) => setAutoBreak(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Automatic unpaid break</span>
              <span className="block text-xs text-muted mt-0.5">
                30 minutes deducted on any day of 5 hours or more. Untick to deduct nothing for this person (pay runs, reports and the Xero push all follow it).
              </span>
            </span>
          </label>

          {/* Xero: directors and anyone paid outside Xero must not block the
              payroll push ("Not in Xero payroll" used to fail the whole run). */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              name="xero_payroll"
              checked={xeroPayroll}
              onChange={(e) => setXeroPayroll(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-brand cursor-pointer"
            />
            <span>
              <span className="block text-sm font-medium text-ink">Paid through Xero payroll</span>
              <span className="block text-xs text-muted mt-0.5">
                Untick for a director or anyone not on a Xero payroll: the Xero push then skips them instead of failing. Their hours still count against projects.
              </span>
            </span>
          </label>

          {/* Admin password reset — no current password needed. Leave blank to keep unchanged. */}
          <div>
            <span className="block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5">
              Reset password (optional)
            </span>
            <div className="relative">
              <input
                name="new_password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Leave blank to keep current password"
                minLength={6}
                disabled={pending}
                className="w-full h-11 border border-line rounded-xl pl-4 pr-11 text-ink text-sm placeholder-faint bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 transition-all duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1.5 leading-snug">
              Sets a new sign-in password for {employee.name} immediately — the employee&rsquo;s current password is not required. Minimum 6 characters.
            </p>
          </div>

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
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-line bg-white/70">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 h-11 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1 h-11"
              onClick={onClose}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
