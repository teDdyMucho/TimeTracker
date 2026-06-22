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
            <tbody className="divide-y divide-slate-50">
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
                    {p.business_access.map((id) => entityMap[id] ?? id).join(', ') || '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge status={p.status} />
                  </td>
                  <td className="py-3">
                    {p.role !== 'admin' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditing(p)}
                          className="text-xs px-2.5 py-1 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          Edit
                        </button>
                        <form action={toggleEmployeeStatusAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="current_status" value={p.status} />
                          <button
                            type="submit"
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                              p.status === 'active'
                                ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
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
