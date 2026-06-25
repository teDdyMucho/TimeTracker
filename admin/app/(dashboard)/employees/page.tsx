import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import EmployeesClient from './employees-client'
import type { BusinessEntity } from '@/lib/types'

export default async function EmployeesPage() {
  const adminClient = createAdminClient()

  const [profilesRes, entitiesRes, ratesRes] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, name, email, role, employment_type, business_access, status, created_at')
      .neq('role', 'admin')
      .order('name'),
    adminClient
      .from('business_entities')
      .select('id, name')
      .eq('status', 'active')
      .order('name'),
    adminClient
      .from('pay_rates')
      .select('profile_id, hourly_rate, effective_from')
      .order('effective_from', { ascending: false }),
  ])

  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))

  // Latest (current) hourly rate per employee — rates are ordered newest-first
  const rateMap: Record<string, number> = {}
  for (const r of ratesRes.data ?? []) {
    if (!(r.profile_id in rateMap)) rateMap[r.profile_id] = Number(r.hourly_rate)
  }

  const profiles = (profilesRes.data ?? []).map((p) => ({ ...p, hourly_rate: rateMap[p.id] ?? null }))
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
