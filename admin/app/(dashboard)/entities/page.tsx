import { createAdminClient } from '@/lib/server'
import { normalizePayConfig } from '@/lib/labour-cost'
import EntitiesClient from './entities-client'

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; tenant?: string; msg?: string }>
}) {
  const params = await searchParams
  const adminClient = createAdminClient()

  const { data: entities } = await adminClient
    .from('business_entities')
    .select('id, name, status, xero_tenant_id, created_at, pay_config')
    .order('name')

  // Flatten the jsonb ladder into the fields the Pay settings form edits.
  const rows = (entities ?? []).map((e: any) => {
    const cfg = normalizePayConfig(e.pay_config)
    const t1 = cfg.weekdayTiers.find((t) => t.band === 'overtime_t1')
    const t2 = cfg.weekdayTiers.find((t) => t.band === 'overtime_t2')
    const regular = cfg.weekdayTiers.find((t) => t.band === 'regular')
    return {
      id: e.id,
      name: e.name,
      status: e.status,
      xero_tenant_id: e.xero_tenant_id,
      pay: {
        standardDailyHours: regular?.toHour ?? t1?.fromHour ?? cfg.standardDailyHours,
        t1To: t1?.toHour ?? 10,
        t1Multiplier: t1?.multiplier ?? 1.5,
        t2Multiplier: t2?.multiplier ?? 2,
        saturdayMultiplier: cfg.saturdayMultiplier,
        sundayMultiplier: cfg.sundayMultiplier,
        publicHolidayMultiplier: cfg.publicHolidayMultiplier,
        overtimeRequiresApproval: cfg.overtimeRequiresApproval === true,
      },
    }
  })
  const activeCount = rows.filter((e) => e.status === 'active').length

  let xeroNotice: { status: 'connected' | 'error'; text: string } | null = null
  if (params.xero === 'connected') {
    xeroNotice = { status: 'connected', text: `Connected to ${params.tenant ?? 'Xero'} successfully.` }
  } else if (params.xero === 'error') {
    xeroNotice = { status: 'error', text: `Xero connection failed: ${params.msg ?? 'unknown error'}.` }
  }

  return <EntitiesClient entities={rows as any} activeCount={activeCount} xeroNotice={xeroNotice} />
}
