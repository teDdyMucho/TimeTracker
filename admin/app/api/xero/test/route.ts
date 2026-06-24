import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { getValidXeroToken } from '@/lib/xero'

export const runtime = 'nodejs'

async function xeroGet(url: string, token: string, tenantId: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
    },
  })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body }
}

/**
 * Read-only connection test. Visit /api/xero/test (optionally ?entity=<id> or ?tenant=<id>).
 * Verifies token refresh + API access, and surfaces payroll employees & earnings rates.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const entityId = req.nextUrl.searchParams.get('entity')
  let tenantId = req.nextUrl.searchParams.get('tenant') ?? ''
  let entityName: string | undefined

  if (!tenantId && entityId) {
    const { data: ent } = await admin
      .from('business_entities')
      .select('name, xero_tenant_id')
      .eq('id', entityId)
      .maybeSingle()
    tenantId = ent?.xero_tenant_id ?? ''
    entityName = ent?.name
  }
  if (!tenantId) {
    const { data: conn } = await admin
      .from('xero_connections')
      .select('tenant_id, tenant_name')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    tenantId = conn?.tenant_id ?? ''
    entityName = entityName ?? conn?.tenant_name
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'no_tenant', hint: 'Connect an entity to Xero first.' }, { status: 400 })
  }

  let token: string
  try {
    token = await getValidXeroToken(tenantId)
  } catch (e) {
    return NextResponse.json(
      { error: 'token_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    )
  }

  const org       = await xeroGet('https://api.xero.com/api.xro/2.0/Organisations', token, tenantId)
  const employees = await xeroGet('https://api.xero.com/payroll.xro/1.0/Employees', token, tenantId)
  const payItems  = await xeroGet('https://api.xero.com/payroll.xro/1.0/PayItems', token, tenantId)

  const orgBody = org.body as any
  const empBody = employees.body as any
  const piBody  = payItems.body as any

  const emps = employees.ok
    ? (empBody?.Employees ?? []).map((e: any) => ({
        name: `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim(),
        email: e.Email ?? null,
        status: e.Status ?? null,
      }))
    : null

  const earningsRates = payItems.ok
    ? (piBody?.PayItems?.EarningsRates ?? []).map((r: any) => ({
        name: r.Name,
        earningsType: r.EarningsType,
        rateType: r.RateType,
        multiplier: r.Multiplier ?? null,
      }))
    : null

  return NextResponse.json(
    {
      ok: org.ok && employees.ok && payItems.ok,
      tenantId,
      connectedOrg: entityName,
      tokenRefresh: 'ok — token valid / refreshed successfully',
      organisation: {
        status: org.status,
        name: org.ok ? orgBody?.Organisations?.[0]?.Name : undefined,
        error: org.ok ? undefined : orgBody,
      },
      payrollEmployees: {
        status: employees.status,
        count: emps?.length,
        employees: emps,
        error: employees.ok ? undefined : empBody,
      },
      payrollEarningsRates: {
        status: payItems.status,
        count: earningsRates?.length,
        rates: earningsRates,
        error: payItems.ok ? undefined : piBody,
      },
    },
    { status: 200 },
  )
}
