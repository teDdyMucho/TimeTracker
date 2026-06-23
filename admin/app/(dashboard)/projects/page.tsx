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

  const grouped = entities.map((e) => ({
    entity: e,
    projects: projects.filter((p: any) => p.business_entity_id === e.id),
  }))

  const activeCount = projects.filter((p: any) => p.status === 'active').length

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${activeCount} active`}
        action={<NewProjectForm entities={entities} />}
      />

      <Card>
        {projects.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No projects yet.</p>
        ) : (
          <table className="w-full text-sm table-fixed">
            {/* Fixed column widths — shared across all entity groups */}
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>

            <thead>
              <tr className="border-b border-slate-200">
                {['Name', 'Client', 'Entity', 'Code', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="pb-3 pr-4 text-left text-[10px] font-semibold text-muted uppercase tracking-widest"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {grouped.map(({ entity, projects: ps }, gi) => (
                <>
                  {/* Entity group divider row */}
                  <tr key={`hdr-${entity.id}`}>
                    <td
                      colSpan={6}
                      className={`pt-5 pb-2 text-[10px] font-bold text-muted uppercase tracking-[0.18em] ${gi > 0 ? 'border-t border-slate-200 pt-6' : ''}`}
                    >
                      {entity.name}
                    </td>
                  </tr>

                  {ps.length === 0 ? (
                    <tr key={`empty-${entity.id}`}>
                      <td colSpan={6} className="pb-4 text-muted text-xs">
                        No projects for this entity yet.
                      </td>
                    </tr>
                  ) : (
                    ps.map((p: any) => (
                      <tr
                        key={p.id}
                        className="border-t border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        <td className="py-3 pr-4 font-semibold text-ink truncate">{p.name}</td>
                        <td className="py-3 pr-4 text-muted truncate">{p.client ?? '—'}</td>
                        <td className="py-3 pr-4 text-muted text-xs truncate">{entity.name}</td>
                        <td className="py-3 pr-4 text-muted font-mono text-xs">{p.code ?? '—'}</td>
                        <td className="py-3 pr-4">
                          <Badge status={p.status} />
                        </td>
                        <td className="py-3">
                          <form action={toggleProjectStatusAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="current_status" value={p.status} />
                            <button
                              type="submit"
                              className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold active:scale-95 transition-all shadow-sm whitespace-nowrap ${
                                p.status === 'active'
                                  ? 'bg-slate-700 text-white hover:bg-slate-800'
                                  : 'bg-emerald-500 text-white hover:bg-emerald-600'
                              }`}
                            >
                              {p.status === 'active' ? 'Archive' : 'Restore'}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
