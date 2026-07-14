'use client'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import AttendanceForm, {
  type EditSession, type EmployeeOption, type ProjectOption, type CompanyOption,
} from './attendance-form'

/**
 * Per-row "Edit" pencil. Opens the shared AttendanceForm in edit mode,
 * pre-filled with this session's clock in/out times.
 */
export default function EditAttendanceButton({
  session,
  employees,
  projects,
  companies,
}: {
  session: EditSession
  employees: EmployeeOption[]
  projects: ProjectOption[]
  companies: CompanyOption[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit clock in / out"
        className="inline-flex items-center justify-center h-7 w-7 rounded-lg border text-muted hover:bg-slate-50 hover:text-ink transition-colors"
        style={{ borderColor: '#ECEAE4' }}
      >
        <Pencil size={13} />
      </button>
      {open && (
        <AttendanceForm
          edit={session}
          employees={employees}
          projects={projects}
          companies={companies}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
