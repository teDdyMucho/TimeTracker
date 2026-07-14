'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import { addAttendanceAction, editAttendanceAction } from './actions'

export interface EmployeeOption { id: string; name: string }
export interface ProjectOption { id: string; name: string; business_entity_id: string }
export interface CompanyOption { id: string; name: string }

export interface EditSession {
  id: string
  profileName: string
  project_id: string | null
  work_location: string
  clocked_in_at: string
  clocked_out_at: string | null
  review_status: string
}

/**
 * Convert an ISO timestamp (UTC) to the `YYYY-MM-DDTHH:mm` string a
 * <input type="datetime-local"> expects, in the browser's LOCAL timezone.
 */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Local wall-clock input value → ISO (UTC) string for the DB. Empty → ''. */
function localInputToIso(local: string): string {
  if (!local) return ''
  return new Date(local).toISOString()
}

/** Calendar day (local) of a datetime-local value → 'YYYY-MM-DD'. */
function localInputToDate(local: string): string {
  if (!local) return ''
  return local.slice(0, 10)
}

const REVIEW_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
]
const TYPE_OPTIONS = [
  { value: 'site', label: 'Site' },
  { value: 'factory', label: 'Factory' },
]

export default function AttendanceForm({
  employees,
  projects,
  companies,
  edit,
  onClose,
}: {
  employees: EmployeeOption[]
  projects: ProjectOption[]
  companies: CompanyOption[]
  /** When provided, the form opens in edit mode for this session. */
  edit?: EditSession
  /** Called to dismiss the modal (edit mode is controlled by the parent). */
  onClose?: () => void
}) {
  const isEdit = !!edit
  // In add mode the button toggles its own modal; in edit mode the parent controls it.
  const [open, setOpen] = useState(isEdit)
  const action = isEdit ? editAttendanceAction : addAttendanceAction
  const [serverError, formAction, pending] = useActionState(action, null)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const prevPendingRef = useRef(false)

  // Form fields
  const [employeeId, setEmployeeId] = useState(edit ? '' : '')
  // Company is chosen first; the project list is then filtered to it. In edit
  // mode we seed the company from the session's existing project.
  const [companyId, setCompanyId] = useState(
    edit?.project_id
      ? projects.find((p) => p.id === edit.project_id)?.business_entity_id ?? ''
      : '',
  )
  const [projectId, setProjectId] = useState(edit?.project_id ?? '')
  const [workType, setWorkType] = useState(edit?.work_location ?? 'site')
  const [review, setReview] = useState(edit?.review_status ?? 'approved')
  const [clockIn, setClockIn] = useState(edit ? isoToLocalInput(edit.clocked_in_at) : '')
  const [clockOut, setClockOut] = useState(
    edit?.clocked_out_at ? isoToLocalInput(edit.clocked_out_at) : '',
  )

  useEffect(() => {
    if (prevPendingRef.current && !pending && !serverError) {
      setStatus('success')
    }
    prevPendingRef.current = pending
  }, [pending, serverError])

  const handleClose = () => {
    setOpen(false)
    setStatus('idle')
    onClose?.()
  }

  // Projects belonging to the chosen company (choose company first).
  const companyProjects = companyId
    ? projects.filter((p) => p.business_entity_id === companyId)
    : []

  // If the company changes and the current project no longer belongs to it, clear it.
  const onCompanyChange = (id: string) => {
    setCompanyId(id)
    if (projectId && projects.find((p) => p.id === projectId)?.business_entity_id !== id) {
      setProjectId('')
    }
  }

  // ── Add-mode trigger button ────────────────────────────────────────────────
  if (!isEdit && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-brand text-white font-semibold rounded-xl px-4 py-2.5 text-sm hover:bg-brand-dark transition-colors"
      >
        <Plus size={16} />
        Add attendance
      </button>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="glass-panel rounded-2xl p-8 w-full max-w-sm text-center">
          <CheckCircle size={56} className="text-brand mx-auto mb-4" />
          <h2 className="text-xl font-bold text-ink mb-2">
            {isEdit ? 'Attendance updated!' : 'Attendance added!'}
          </h2>
          <p className="text-muted text-sm mb-6">
            The record has been saved successfully.
          </p>
          <Button label="Done" className="w-full" onClick={handleClose} />
        </div>
      </div>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const inputCls =
    'w-full border border-line rounded-xl px-4 py-2.5 text-ink text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand/50 transition-all'
  const labelCls = 'block text-xs font-semibold text-muted uppercase tracking-widest mb-1.5'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="glass-panel rounded-2xl p-6 w-full max-w-md my-auto">
        <div className="flex items-center gap-2 mb-5">
          {isEdit ? <Pencil size={18} className="text-ink" /> : <Plus size={18} className="text-ink" />}
          <h2 className="text-lg font-bold text-ink">
            {isEdit ? 'Edit attendance' : 'Add attendance'}
          </h2>
        </div>

        <form
          action={(fd) => {
            // Convert the local wall-clock inputs to ISO + derive the work date
            // before the values reach the server action.
            fd.set('clocked_in_at', localInputToIso(clockIn))
            fd.set('clocked_out_at', localInputToIso(clockOut))
            fd.set('work_date', localInputToDate(clockIn))
            return formAction(fd)
          }}
          className="space-y-4"
        >
          {serverError && (
            <div className="flex items-start gap-2 bg-red-500/10 text-[#F87171] rounded-xl px-4 py-3 text-sm border border-red-500/20">
              <XCircle size={16} className="shrink-0 mt-0.5" />
              {serverError}
            </div>
          )}

          {isEdit ? (
            <>
              <input type="hidden" name="id" value={edit!.id} />
              <div>
                <span className={labelCls}>Employee</span>
                <p className="text-sm font-semibold text-ink px-1 py-1">{edit!.profileName}</p>
              </div>
            </>
          ) : (
            <div>
              <span className={labelCls}>Employee</span>
              <Dropdown
                name="profile_id"
                value={employeeId}
                onChange={setEmployeeId}
                placeholder="Choose employee…"
                options={employees.map((e) => ({ value: e.id, label: e.name }))}
              />
            </div>
          )}

          <div>
            <span className={labelCls}>Company</span>
            <Dropdown
              value={companyId}
              onChange={onCompanyChange}
              placeholder="Choose company…"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>

          <div>
            <span className={labelCls}>Project</span>
            <Dropdown
              name="project_id"
              value={projectId}
              onChange={setProjectId}
              placeholder={companyId ? 'Choose project…' : 'Choose a company first'}
              options={companyProjects.map((p) => ({ value: p.id, label: p.name }))}
            />
            {companyId && companyProjects.length === 0 && (
              <p className="text-xs text-muted mt-1.5">No projects for this company.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Clock in</label>
              <input
                type="datetime-local"
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                required
                disabled={pending}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Clock out</label>
              <input
                type="datetime-local"
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                disabled={pending}
                className={inputCls}
              />
              <p className="text-[10px] text-muted mt-1">Leave blank if still on the clock.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Work type</span>
              <Dropdown name="work_location" value={workType} onChange={setWorkType} options={TYPE_OPTIONS} />
            </div>
            <div>
              <span className={labelCls}>Status</span>
              <Dropdown name="review_status" value={review} onChange={setReview} options={REVIEW_OPTIONS} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 bg-brand text-white font-semibold rounded-xl py-2.5 text-sm hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                'Save changes'
              ) : (
                'Add attendance'
              )}
            </button>
            <Button
              type="button"
              label="Cancel"
              variant="ghost"
              className="flex-1"
              onClick={handleClose}
              disabled={pending}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
