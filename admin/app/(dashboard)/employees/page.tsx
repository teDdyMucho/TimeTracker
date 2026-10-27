import { buildRateHistory, rateOn, type RateRow } from '@/lib/labour-cost'
import { createAdminClient } from '@/lib/server'
import { PageHeader } from '@/components/ui'
import EmployeesClient from './employees-client'
import type { BusinessEntity } from '@/lib/types'

export default async function EmployeesPage() {
  const adminClient = createAdminClient()

  const [profilesRes, entitiesRes, ratesRes] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, name, email, role, employment_type, business_access, status, created_at, flat_rate, supervisor_id, employer_entity_id, overtime_approver, xero_payroll, portal_admin, auto_clockout_hours, unpaid_break_exempt')
      .neq('role', 'admin')
      .order('name'),
    adminClient
      .from('business_entities')
      .select('id, name')
      .eq('status', 'active')
      .order('name'),
    adminClient
      .from('pay_rates')
      .select('profile_id, hourly_rate, effective_from, created_at'),
  ])

  const entities = (entitiesRes.data ?? []) as BusinessEntity[]
  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]))

  // The hourly rate in force today per employee (a rate dated in the future
  // is not shown until it starts).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const history = buildRateHistory((ratesRes.data ?? []) as RateRow[])
  const rateMap: Record<string, number> = {}
  for (const pid of Object.keys(history)) {
    const r = rateOn(history, pid, today)
    if (r != null) rateMap[pid] = r
  }

  const profiles = (profilesRes.data ?? []).map((p) => ({ ...p, hourly_rate: rateMap[p.id] ?? null }))
  const activeCount = profiles.filter((p) => p.status === 'active' && p.role !== 'admin').length

  // Who can be assigned as a supervisor (PRD §12 "Assign supervisor"): active
  // supervisors. Admins approve everything anyway so they are not listed.
  const supervisors = profiles
    .filter((p) => p.role === 'supervisor' && p.status === 'active')
    .map((p) => ({ id: p.id, name: p.name }))

  return (
    <EmployeesClient
      entities={entities}
      profiles={profiles as any}
      entityMap={entityMap}
      activeCount={activeCount}
      supervisors={supervisors}
    />
  )
}
