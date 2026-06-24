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
      .order('name'),
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
  ])

  const projects = projectsRes.data ?? []
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
