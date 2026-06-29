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
}

interface Props {
  entities: BusinessEntity[]
  profiles: Profile[]
  entityMap: Record<string, string>
  activeCount: number
}

// Build a readable "entities" label for a profile (e.g. "ARKO Joinery, Build One").
function entitiesLabel(p: Profile, entityMap: Record<string, string>): string {
  return p.business_access.map((id) => entityMap[id] ?? id).join(', ') || '—'
}

export default function EmployeesClient({ entities, profiles, entityMap, activeCount }: Props) {
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)

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
        <InviteEmployeeForm entities={entities} onClose={() => setShowInvite(false)} />
      )}

      {editing && (
        <EditEmployeeForm
          employee={editing}
          entities={entities}
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
                  <td className="py-3 pr-4">
                    <Badge status={p.role} />
                  </td>
                  <td className="py-3 pr-4 capitalize text-muted">
                    {p.employment_type?.replace('_', ' ')}
                  </td>
                  <td className="py-3 pr-4 font-semibold text-ink whitespace-nowrap">
                    {p.hourly_rate != null
                      ? `$${Number(p.hourly_rate).toFixed(2)}/hr`
                      : <span className="text-slate-300 font-normal">Not set</span>}
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
                  <td colSpan={8} className="py-8 text-center text-muted text-sm">
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
