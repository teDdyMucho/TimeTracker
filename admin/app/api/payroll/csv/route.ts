import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { PAY_BANDS, PAY_BAND_LABELS } from '@/lib/payroll'
import { UNPAID_BREAK_KEY, PENDING_OVERTIME_KEY } from '@/lib/labour-cost'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v)
    // A text cell starting with = + - @ would run as a formula in Excel /
    // Sheets (names and emails are user-entered). Numbers are left alone.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

/**
 * Payroll CSV export — the fallback when Xero is unavailable (PRD task
 * "Complete CSV payroll/report fallback"). Same scoping as the PDF:
 *   ?run=<id> · ?entity=<id> · ?employee=<profileId> · ?entity=&employee= · (none)
 * One row per employee per pay run: hours per pay band, unpaid break deducted,
 * paid hours, allowances, gross pay, run status and Xero status.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'admin_only' }, { status: 403 })

  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const runId = sp.get('run')
  const entityId = sp.get('entity')
  const employeeId = sp.get('employee')

  let q = admin
    .from('payroll_runs')
    .select(
      'id, period_start, period_end, status, xero_sync_status, business_entity_id, business_entities(name), payroll_entries(profile_id, band_hours, allowances, gross_pay, profiles(name, email))',
    )
    .order('period_end', { ascending: false })
  if (runId) q = q.eq('id', runId)
  if (entityId) q = q.eq('business_entity_id', entityId)

  const { data: runs, error } = await q
  if (error) return new NextResponse(error.message, { status: 500 })

  const rows: (string | number | null)[][] = [[
    'Entity', 'Period start', 'Period end', 'Employee', 'Email',
    ...PAY_BANDS.map((b) => `${PAY_BAND_LABELS[b]} (h)`),
    'Unpaid break (h)', 'OT awaiting approval (h, unpaid)', 'Paid hours', 'Allowances ($)', 'Gross pay ($)', 'Run status', 'Xero status',
  ]]

  for (const r of (runs ?? []) as any[]) {
    const entityName = r.business_entities?.name ?? ''
    const entries = ((r.payroll_entries ?? []) as any[])
      .filter((e) => !employeeId || e.profile_id === employeeId)
      .sort((a, b) => String(a.profiles?.name ?? '').localeCompare(String(b.profiles?.name ?? '')))
    for (const e of entries) {
      const bh = (e.band_hours ?? {}) as Record<string, number>
      const paid = PAY_BANDS.reduce((s, b) => s + Number(bh[b] || 0), 0)
      rows.push([
        entityName, r.period_start, r.period_end, e.profiles?.name ?? '', e.profiles?.email ?? '',
        ...PAY_BANDS.map((b) => Number(bh[b] || 0)),
        Number(bh[UNPAID_BREAK_KEY] || 0), Number(bh[PENDING_OVERTIME_KEY] || 0), Math.round(paid * 100) / 100,
        Number(e.allowances || 0), Number(e.gross_pay || 0), r.status, r.xero_sync_status,
      ])
    }
  }

  const scope = runId ? `run-${(runs?.[0] as any)?.period_start ?? ''}-to-${(runs?.[0] as any)?.period_end ?? ''}` : entityId ? 'entity' : employeeId ? 'employee' : 'all'
  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="timevera-payroll-${scope}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
