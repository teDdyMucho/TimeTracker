import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import EmployeesClient from './employees-client'
import type { BusinessEntity } from '@/lib/types'

export default async function EmployeesPage() {
  const adminClient = createAdminClient()

  const [profilesRes, entitiesRes] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, name, email, role, employment_type, business_access, status, created_at')
      .order('name'),
    adminClient
      .from('business_entities')
      .select('id, name')
      .eq('status', 'active')
      .order('name'),
  ])

  const profiles = profilesRes.data ?? []
  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))
  const activeCount = profiles.filter((p) => p.status === 'active' && p.role !== 'admin').length

  return (
    <EmployeesClient
      entities={entities}
      profiles={profiles as any}
      entityMap={entityMap}
      activeCount={activeCount}
    />
  )
}
