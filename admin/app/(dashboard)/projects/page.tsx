import { createClient, createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import NewProjectForm from './new-project-form'
import ProjectsClient from './projects-client'
import type { BusinessEntity } from '@/lib/types'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const [projectsRes, entitiesRes] = await Promise.all([
    adminClient
      .from('projects')
      .select('id, name, client, code, business_entity_id, status, created_at')
      // Active projects first, then by name (secondary sort applied below too).
      .order('status', { ascending: true })
      .order('name'),
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])

  // Ensure active projects sort ahead of everything else regardless of the raw
  // status string ordering ('active' < 'archived' happens to hold, but be explicit).
  const projects = (projectsRes.data ?? []).slice().sort((a: any, b: any) => {
    const rank = (s: string) => (s === 'active' ? 0 : 1)
    return rank(a.status) - rank(b.status) || String(a.name).localeCompare(String(b.name))
  })
  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const activeCount = projects.filter((p: any) => p.status === 'active').length

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${activeCount} active`}
        action={<NewProjectForm entities={entities} />}
      />

      <ProjectsClient entities={entities} projects={projects as any} />
    </div>
  )
}
