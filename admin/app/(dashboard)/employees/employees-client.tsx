'use client'
import { useMemo, useState } from 'react'
import { Button, Badge, Card, PageHeader } from '@/components/ui'
import Dropdown from '@/components/dropdown'
import InviteEmployeeForm from './invite-form'
import EditEmployeeForm from './edit-employee-form'
import { toggleEmployeeStatusAction } from './actions'
import type { BusinessEntity } from '@/lib/types'

interface Profile {
  id: string
  name: string
  email: string
  role: string
  employment_type: string
  business_access: string[]
  status: string
  hourly_rate?: number | null
  employer_entity_id?: string | null
  overtime_approver?: boolean
  flat_rate?: boolean
  supervisor_id?: string | null
  /** false = not on any Xero payroll; the Xero push skips them. */
  xero_payroll?: boolean
  /** Full dashboard (admin) access while staying an employee / supervisor. */
  portal_admin?: boolean
}

interface Props {
  entities: BusinessEntity[]
  profiles: Profile[]
  entityMap: Record<string, string>
  activeCount: number
  supervisors?: { id: string; name: string }[]
}

// Build a readable "entities" label for a profile (e.g. "ARKO Joinery, Build One").
function entitiesLabel(p: Profile, entityMap: Record<string, string>): string {
  return p.business_access.map((id) => entityMap[id] ?? id).join(', ') || '—'
}

export default function EmployeesClient({ entities, profiles, entityMap, activeCount, supervisors = [] }: Props) {
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const supervisorName = useMemo(() => Object.fromEntries(supervisors.map((s) => [s.id, s.name])), [supervisors])

  // Filter by the distinct entity-combination label (e.g. "ARKO Joinery, Build One")
  const [entityFilter, setEntityFilter] = useState<string>('')

  // Distinct entity-combos present in the data, for the filter dropdown
  const entityOptions = useMemo(() => {
    const set = new Set(profiles.map((p) => entitiesLabel(p, entityMap)))
    return Array.from(set).filter((s) => s && s !== '—').sort()
  }, [profiles, entityMap])

  const visible = useMemo(() => {
    if (!entityFilter) return profiles
    return profiles.filter((p) => entitiesLabel(p, entityMap) === entityFilter)
  }, [profiles, entityMap, entityFilter])

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${activeCount} active`}
        action={<Button label="+ Invite employee" onClick={() => setShowInvite(true)} />}
      />

      {showInvite && (
        <InviteEmployeeForm entities={entities} supervisors={supervisors} onClose={() => setShowInvite(false)} />
      )}

      {editing && (
        <EditEmployeeForm
          employee={editing}
          entities={entities}
          supervisors={supervisors.filter((s) => s.id !== editing.id)}
          onClose={() => setEditing(null)}
        />
      )}

      <Card className="!border-line">
        {profiles.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            No employees yet. Use "Invite employee" to add one.
          </p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left border-b border-slate-100">
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Name</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Email</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Role</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Type</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Rate</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Supervisor</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap" title="Whose payroll pays this person (TV6)">Employer</th>
                {/* Entities — click to filter by combo (grey-highlight dropdown) */}
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                  <Dropdown
                    triggerAsHeader
                    value={entityFilter}
                    onChange={setEntityFilter}
                    placeholder="Entities"
                    options={[{ value: '', label: 'All entities' }, ...entityOptions.map((o) => ({ value: o, label: o }))]}
                  />
                </th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">Status</th>
                <th className="pb-3 pr-4 font-medium text-muted whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visible.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4 text-muted">{p.email}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <Badge status={p.role} />
                    {p.portal_admin && (
                      <span title="Full administrator access to this dashboard, while keeping their employee profile" className="ml-2 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 align-middle">
                        Dashboard admin
                      </span>
                    )}
                    {p.overtime_approver && (
                      <span title="Can approve or reject overtime requests" className="ml-2 inline-block rounded-full bg-stone px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink align-middle">
                        OT approver
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 capitalize text-muted">
                    {p.employment_type?.replace('_', ' ')}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-ink whitespace-nowrap">
                    {p.hourly_rate != null
                      ? `$${Number(p.hourly_rate).toFixed(2)}/hr`
                      : <span className="text-slate-300 font-normal">Not set</span>}
                    {p.flat_rate && (
                      <span
                        title="Flat rate — no overtime, weekend or public-holiday loading"
                        className="ml-2 inline-block rounded-full bg-stone px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted align-middle"
                      >
                        Flat
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted text-xs whitespace-nowrap">
                    {p.supervisor_id && supervisorName[p.supervisor_id]
                      ? supervisorName[p.supervisor_id]
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-3 pr-4 text-xs whitespace-nowrap">
                    {p.employer_entity_id && entityMap[p.employer_entity_id]
                      ? <span className="font-semibold text-ink">{entityMap[p.employer_entity_id]}</span>
                      : <span className="text-amber-600 font-semibold">No employer</span>}
                    {p.xero_payroll === false && (
                      <span title="Not on any Xero payroll — the Xero push skips this person" className="ml-2 inline-block rounded-full bg-stone px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted align-middle">
                        Not via Xero
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-muted text-xs">
                    {entitiesLabel(p, entityMap)}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={p.status} />
                  </td>
                  <td className="py-3">
                    {p.role !== 'admin' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditing(p)}
                          className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
                        >
                          Edit
                        </button>
                        <form action={toggleEmployeeStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="current_status" value={p.status} />
                          <button
                            type="submit"
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm ${
                              p.status === 'active'
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-brand text-white hover:bg-brand-dark'
                            }`}
                          >
                            {p.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-muted text-sm">
                    No employees match this filter.{' '}
                    <button onClick={() => setEntityFilter('')} className="font-semibold text-ink hover:underline">Clear</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  )
}
