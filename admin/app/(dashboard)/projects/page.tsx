import { createClient, createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import { labourCost } from '@/lib/labour-cost'
import NewProjectForm from './new-project-form'
import ProjectsClient from './projects-client'
import type { BusinessEntity } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })

  const [projectsRes, entitiesRes, finRes, cost] = await Promise.all([
    adminClient
      .from('projects')
      .select('id, name, client, code, business_entity_id, status, created_at, budget_hours, start_date, end_date')
      // Active projects first, then by name (secondary sort applied below too).
      .order('status', { ascending: true })
      .order('name'),
    supabase.from('business_entities').select('id, name').eq('status', 'active').order('name'),
    adminClient.from('project_financials').select('project_id, budget_labour_cost'),
    // Actual hours + loaded labour cost per project from approved timesheets
    // (PRD §13 "Actual Labour Cost / Actual Hours"), computed live so it always
    // matches payroll.
    labourCost(adminClient, { from: '2000-01-01', to: today }),
  ])

  const budgetCost = new Map((finRes.data ?? []).map((f: any) => [f.project_id, f.budget_labour_cost == null ? null : Number(f.budget_labour_cost)]))
  const actual = new Map(cost.byProject.map((p) => [p.id, p]))

  // Ensure active projects sort ahead of everything else regardless of the raw
  // status string ordering ('active' < 'archived' happens to hold, but be explicit).
  const projects = (projectsRes.data ?? [])
    .map((p: any) => ({
      ...p,
      budget_hours: p.budget_hours == null ? null : Number(p.budget_hours),
      budget_labour_cost: budgetCost.get(p.id) ?? null,
      actual_hours: actual.get(p.id)?.hours ?? 0,
      actual_labour_cost: actual.get(p.id)?.cost ?? 0,
    }))
    .sort((a: any, b: any) => {
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
