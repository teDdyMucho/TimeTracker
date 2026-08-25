import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import {
  getValidXeroToken,
  fetchXeroEmployees,
  fetchXeroLeaveTypes,
  matchLeaveTypeId,
  postXeroLeave,
} from '@/lib/xero'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LEAVE_TITLES: Record<string, string> = {
  annual: 'Annual Leave',
  sick: 'Sick / Personal Leave',
  personal: 'Personal Leave',
  unpaid: 'Unpaid Leave',
}

/**
 * Push approved leave to Xero as leave applications.
 *   POST /api/xero/push-leave?entity=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * One leave application per approved leave request in range. Xero auto-computes
 * the units and flows the leave into the matching pay run. Scope: payroll.employees.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const entityId = sp.get('entity') ?? ''
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  if (!entityId || !from || !to) {
    return NextResponse.json({ error: 'missing_params', hint: 'Provide ?entity=&from=&to=' }, { status: 400 })
  }

  const { data: entity } = await admin
    .from('business_entities')
    .select('id, name, xero_tenant_id, business_access')
    .eq('id', entityId).maybeSingle()
  if (!entity?.xero_tenant_id) {
    return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  }

  // Approved leave that overlaps the period, for employees with access to this entity.
  const { data: leaves } = await admin
    .from('leave_requests')
    .select('id, profile_id, leave_type, start_date, end_date, profiles(name, email, business_access)')
    .eq('status', 'approved')
    .lte('start_date', to)
    .gte('end_date', from)

  const rows = (leaves ?? []).filter((l: any) =>
    (l.profiles?.business_access ?? []).includes(entity.id),
  )
  if (rows.length === 0) {
    return NextResponse.json({ entity: entity.name, pushed: 0, total: 0, note: 'No approved leave in this period.', results: [] })
  }

  const token = await getValidXeroToken(entity.xero_tenant_id)
  const [xeroEmployees, leaveTypes] = await Promise.all([
    fetchXeroEmployees(token, entity.xero_tenant_id),
    fetchXeroLeaveTypes(token, entity.xero_tenant_id),
  ])
  const byEmail = new Map(xeroEmployees.filter((e) => e.email).map((e) => [e.email!.toLowerCase(), e]))
  const byName = new Map(xeroEmployees.map((e) => [e.name.toLowerCase(), e]))

  const results: any[] = []
  for (const l of rows as any[]) {
    const name = l.profiles?.name ?? 'Employee'
    const xe = (l.profiles?.email && byEmail.get(l.profiles.email.toLowerCase())) || byName.get(name.toLowerCase())
    if (!xe) { results.push({ employee: name, ok: false, reason: 'No matching Xero employee.' }); continue }

    const leaveTypeId = matchLeaveTypeId(l.leave_type, leaveTypes)
    if (!leaveTypeId) { results.push({ employee: name, ok: false, reason: `No Xero leave type for "${l.leave_type}".` }); continue }

    const res = await postXeroLeave(token, entity.xero_tenant_id, {
      employeeId: xe.id,
      leaveTypeId,
      title: LEAVE_TITLES[l.leave_type] ?? 'Leave',
      startDate: l.start_date,
      endDate: l.end_date,
    })
    results.push({
      employee: name,
      leaveType: l.leave_type,
      dates: l.start_date === l.end_date ? l.start_date : `${l.start_date} – ${l.end_date}`,
      ok: res.ok,
      error: res.ok ? undefined : (res.body?.Elements?.[0]?.ValidationErrors ?? res.body?.Message ?? res.body),
    })
  }

  const pushed = results.filter((r) => r.ok).length
  return NextResponse.json({
    entity: entity.name,
    period: { from, to },
    pushed,
    total: results.length,
    note: pushed > 0
      ? 'Approved leave sent to Xero. It will appear on the payslips when payroll is run for this period.'
      : 'Nothing pushed. See per-employee reasons below.',
    results,
  })
}
