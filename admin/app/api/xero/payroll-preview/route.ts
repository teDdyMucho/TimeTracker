import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { aggregatePayroll, PAY_BANDS, PAY_BAND_LABELS, type PayConfig } from '@/lib/payroll'

export const runtime = 'nodejs'

/**
 * Read-only payroll export preview — shows the per-employee, per-band hours that
 * WOULD be sent to Xero for a pay run. No writes. Useful to validate the
 * computation before the actual Xero push is wired.
 *
 * Usage:
 *   /api/xero/payroll-preview?run=<payrollRunId>
 *   /api/xero/payroll-preview?entity=<entityId>&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const runId = sp.get('run')

  let businessEntityId = sp.get('entity') ?? ''
  let periodStart = sp.get('from') ?? ''
  let periodEnd = sp.get('to') ?? ''

  if (runId) {
    const { data: run } = await admin
      .from('payroll_runs')
      .select('business_entity_id, period_start, period_end')
      .eq('id', runId)
      .maybeSingle()
    if (!run) return NextResponse.json({ error: 'run_not_found' }, { status: 404 })
    businessEntityId = run.business_entity_id
    periodStart = run.period_start
    periodEnd = run.period_end
  }

  if (!businessEntityId || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: 'missing_params', hint: 'Provide ?run=<id> OR ?entity=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD' },
      { status: 400 },
    )
  }

  // Resolve the entity by its id, or fall back to its Xero tenant id (convenience).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessEntityId)
  let entity: { id: string; name: string; pay_config: PayConfig } | null = null
  if (isUuid) {
    const r = await admin.from('business_entities').select('id, name, pay_config').eq('id', businessEntityId).maybeSingle()
    entity = (r.data as any) ?? null
  }
  if (!entity) {
    const r = await admin.from('business_entities').select('id, name, pay_config').eq('xero_tenant_id', businessEntityId).maybeSingle()
    entity = (r.data as any) ?? null
  }
  if (!entity) {
    return NextResponse.json({ error: 'entity_not_found', hint: 'Pass the entity id or its Xero tenant id.' }, { status: 404 })
  }

  const { data: tsRows } = await admin
    .from('timesheets')
    .select('profile_id, work_date, hours, profiles(name, email)')
    .eq('business_entity_id', entity.id)
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .in('status', ['submitted', 'approved'])

  const { data: holRows } = await admin
    .from('public_holidays')
    .select('date')
    .gte('date', periodStart)
    .lte('date', periodEnd)

  const holidays = new Set((holRows ?? []).map((h: any) => h.date as string))
  const employees = aggregatePayroll((tsRows ?? []) as any, holidays, entity.pay_config as PayConfig)

  return NextResponse.json({
    entity: entity.name,
    period: { from: periodStart, to: periodEnd },
    timesheetRows: tsRows?.length ?? 0,
    employeeCount: employees.length,
    totalHours: Math.round(employees.reduce((s, e) => s + e.totalHours, 0) * 100) / 100,
    note: 'These hours map 1:1 to Xero earnings rates. This is a preview — nothing was sent to Xero.',
    employees: employees.map((e) => ({
      name: e.name,
      email: e.email,
      totalHours: e.totalHours,
      bands: Object.fromEntries(
        PAY_BANDS.filter((b) => e.bandHours[b] > 0).map((b) => [PAY_BAND_LABELS[b], e.bandHours[b]]),
      ),
    })),
  })
}
