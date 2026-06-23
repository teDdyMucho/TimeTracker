'use client'
import { useState } from 'react'
import { Button, Badge, Card, PageHeader } from '@/components/ui'
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
}

interface Props {
  entities: BusinessEntity[]
  profiles: Profile[]
  entityMap: Record<string, string>
  activeCount: number
}

export default function EmployeesClient({ entities, profiles, entityMap, activeCount }: Props) {
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)

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

      <Card>
        {profiles.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">
            No employees yet. Use "Invite employee" to add one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-slate-100">
                {['Name', 'Email', 'Role', 'Type', 'Entities', 'Status', ''].map((h) => (
                  <th key={h} className="pb-3 pr-4 font-medium text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className="py-3 pr-4 text-muted">{p.email}</td>
                  <td className="py-3 pr-4">
                    <Badge status={p.role} />
                  </td>
                  <td className="py-3 pr-4 capitalize text-muted">
                    {p.employment_type?.replace('_', ' ')}
                  </td>
                  <td className="py-3 pr-4 text-muted text-xs">
                    {p.business_access.map((id) => entityMap[id] ?? id).join(', ') || 'â€”'}
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
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
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
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
