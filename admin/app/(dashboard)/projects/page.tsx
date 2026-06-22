import { createClient, createAdminClient } from '@/lib/server'
import { Card, PageHeader, Badge } from '@/components/ui'
import { toggleProjectStatusAction } from './actions'
import NewProjectForm from './new-project-form'
import type { BusinessEntity } from '@/lib/types'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const [projectsRes, entitiesRes] = await Promise.all([
    adminClient
      .from('projects')
      .select('id, name, client, code, business_entity_id, status, created_at')
      .order('name'),
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])

  const projects = projectsRes.data ?? []
  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))

  const grouped = entities.map((e) => ({
    entity: e,
    projects: projects.filter((p: any) => p.business_entity_id === e.id),
  }))

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.filter((p: any) => p.status === 'active').length} active`}
        action={<NewProjectForm entities={entities} />}
      />

      <div className="space-y-6">
        {grouped.map(({ entity, projects: ps }) => (
          <div key={entity.id}>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">
              {entity.name}
            </h2>
            <Card>
              {ps.length === 0 ? (
                <p className="text-muted text-sm py-4">No projects for this entity yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-slate-100">
                      {['Name', 'Client', 'Code', 'Status', ''].map((h) => (
                        <th key={h} className="pb-3 pr-4 font-medium text-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ps.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4 font-medium">{p.name}</td>
                        <td className="py-3 pr-4 text-muted">{p.client ?? '—'}</td>
                        <td className="py-3 pr-4 text-muted font-mono text-xs">{p.code ?? '—'}</td>
                        <td className="py-3 pr-4"><Badge status={p.status} /></td>
                        <td className="py-3">
                          <form action={toggleProjectStatusAction}>
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
                              {p.status === 'active' ? 'Archive' : 'Restore'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  )
}
