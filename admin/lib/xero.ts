import { createAdminClient } from '@/lib/server'

export const XERO_AUTH_URL  = 'https://login.xero.com/identity/connect/authorize'
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
export const XERO_CONN_URL  = 'https://api.xero.com/connections'

export function xeroBasicAuth(): string {
  const id = process.env.XERO_CLIENT_ID!
  const secret = process.env.XERO_CLIENT_SECRET!
  return Buffer.from(`${id}:${secret}`).toString('base64')
}

interface XeroTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

/**
 * Custom Connection token (machine-to-machine, client_credentials grant).
 * The app is a Xero *Custom Connection*, so there is no user login / redirect:
 * once an admin (Robbie) has authorised it once in Xero, the app fetches a
 * fresh access token on demand with its client id + secret. No refresh token.
 */
export async function getCustomConnectionToken(): Promise<XeroTokenResponse> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: process.env.XERO_SCOPES ?? '',
    }),
  })
  if (!res.ok) throw new Error(`Xero token request failed (${res.status}): ${await res.text()}`)
  return res.json()
}

/** GET a Xero API endpoint with a valid token for the given tenant. */
async function xeroApiGet(url: string, token: string, tenantId: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Xero-tenant-id': tenantId, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Xero GET ${url} failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export interface XeroEmployee { id: string; name: string; email: string | null; status: string | null }
export interface XeroEarningsRate { id: string; name: string; earningsType: string | null; rateType: string | null }

/** Read the payroll employees for a tenant (payroll.employees.read). */
export async function fetchXeroEmployees(token: string, tenantId: string): Promise<XeroEmployee[]> {
  const body = await xeroApiGet('https://api.xero.com/payroll.xro/1.0/Employees', token, tenantId)
  return (body?.Employees ?? []).map((e: any) => ({
    id: e.EmployeeID,
    name: `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim(),
    email: e.Email ?? null,
    status: e.Status ?? null,
  }))
}

/** Read the payroll earnings rates for a tenant (payroll.settings.read). */
export async function fetchXeroEarningsRates(token: string, tenantId: string): Promise<XeroEarningsRate[]> {
  const body = await xeroApiGet('https://api.xero.com/payroll.xro/1.0/PayItems', token, tenantId)
  return (body?.PayItems?.EarningsRates ?? []).map((r: any) => ({
    id: r.EarningsRateID,
    name: r.Name,
    earningsType: r.EarningsType ?? null,
    rateType: r.RateType ?? null,
  }))
}

export interface XeroLeaveType { id: string; name: string; isPaidLeave: boolean; categoryCode: string | null }

/** Read the org's leave types (payroll.settings.read), for mapping leave. */
export async function fetchXeroLeaveTypes(token: string, tenantId: string): Promise<XeroLeaveType[]> {
  const body = await xeroApiGet('https://api.xero.com/payroll.xro/1.0/PayItems', token, tenantId)
  return (body?.PayItems?.LeaveTypes ?? []).map((l: any) => ({
    id: l.LeaveTypeID,
    name: l.Name,
    isPaidLeave: l.IsPaidLeave !== false,
    categoryCode: l.LeaveCategoryCode ?? null,
  }))
}

/**
 * Match a Timevera leave type (annual/sick/personal/unpaid) to a Xero LeaveType.
 * Prefers the STP Phase 2 category code, falls back to name + paid/unpaid flag.
 */
export function matchLeaveTypeId(leaveType: string, types: XeroLeaveType[]): string | null {
  const byCode = (code: string) => types.find((t) => t.categoryCode === code)
  const byName = (hint: string) => types.find((t) => t.name.toLowerCase().includes(hint))
  switch (leaveType) {
    case 'annual':   return (byCode('ANNUALLEAVE') ?? byName('annual'))?.id ?? null
    case 'sick':
    case 'personal': return (byCode('PERSONALSICKCARERSLEAVE') ?? byName('personal') ?? byName('sick') ?? byName('carer'))?.id ?? null
    case 'unpaid':   return (types.find((t) => !t.isPaidLeave && t.name.toLowerCase().includes('unpaid')) ?? byName('unpaid'))?.id ?? null
    default:         return null
  }
}

/** POST a leave application to Xero (payroll.employees write scope). */
export async function postXeroLeave(
  token: string,
  tenantId: string,
  input: { employeeId: string; leaveTypeId: string; title: string; startDate: string; endDate: string },
): Promise<{ ok: boolean; status: number; body: any }> {
  const payload = [
    {
      EmployeeID: input.employeeId,
      LeaveTypeID: input.leaveTypeId,
      Title: input.title,
      StartDate: input.startDate,
      EndDate: input.endDate,
    },
  ]
  const res = await fetch('https://api.xero.com/payroll.xro/1.0/LeaveApplications', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body }
}

/**
 * Match a Timevera pay band to a Xero earnings rate by name (rate names differ
 * per org). Returns the EarningsRateID or null if no reasonable match is found.
 * Keys are the Timevera PayBand labels; each has candidate substrings to look
 * for (case-insensitive) in the Xero rate names.
 */
const BAND_RATE_HINTS: Record<string, string[]> = {
  regular: ['ordinary'],
  overtime_t1: ['overtime first', 'overtime 1.5', 'overtime x1.5', 'overtime first 2'],
  overtime_t2: ['overtime after', 'overtime 2.0', 'overtime x2', 'double'],
  saturday: ['saturday'],
  sunday: ['sunday'],
  public_holiday: ['public holiday'],
}

export function matchEarningsRateId(band: string, rates: XeroEarningsRate[]): string | null {
  const hints = BAND_RATE_HINTS[band] ?? []
  for (const hint of hints) {
    const found = rates.find((r) => r.name.toLowerCase().includes(hint))
    if (found) return found.id
  }
  return null
}

/**
 * POST an APPROVED timesheet to Xero (payroll.timesheets scope).
 * Once approved, Xero auto-populates the matching draft pay run's payslips.
 */
export interface XeroTimesheetLine { earningsRateId: string; numberOfUnits: number[] }
export async function postXeroTimesheet(
  token: string,
  tenantId: string,
  input: { employeeId: string; startDate: string; endDate: string; lines: XeroTimesheetLine[] },
): Promise<{ ok: boolean; status: number; body: any }> {
  const payload = {
    Timesheets: [
      {
        EmployeeID: input.employeeId,
        StartDate: input.startDate,
        EndDate: input.endDate,
        Status: 'APPROVED',
        TimesheetLines: input.lines.map((l) => ({
          EarningsRateID: l.earningsRateId,
          NumberOfUnits: l.numberOfUnits,
        })),
      },
    ],
  }
  const res = await fetch('https://api.xero.com/payroll.xro/1.0/Timesheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let body: any = text
  try { body = JSON.parse(text) } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body }
}

/** Get the list of orgs (tenants) this token can access. */
export async function fetchXeroConnections(accessToken: string) {
  const res = await fetch(XERO_CONN_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Xero connections failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<Array<{ id: string; tenantId: string; tenantType: string; tenantName: string }>>
}

/**
 * Returns a valid Xero access token. For a Custom Connection there is nothing to
 * refresh — we just request a fresh short-lived token via client_credentials.
 * (Tokens last ~30 min; fetching a new one per operation is fine and simplest.)
 */
export async function getValidXeroToken(_tenantId?: string): Promise<string> {
  const token = await getCustomConnectionToken()
  return token.access_token
}

/**
 * The tenant (organisation) id for the Custom Connection. A Custom Connection is
 * bound to exactly one org, so we read it from /connections with a fresh token.
 * Cached lookups can store this, but it's cheap to fetch on demand.
 */
export async function getCustomConnectionTenantId(): Promise<string> {
  const { access_token } = await getCustomConnectionToken()
  const conns = await fetchXeroConnections(access_token)
  if (!conns.length) throw new Error('Xero Custom Connection has no authorised organisation yet.')
  return conns[0].tenantId
}
