import { createAdminClient } from '@/lib/server'

export const XERO_AUTH_URL  = 'https://login.xero.com/identity/connect/authorize'
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
export const XERO_CONN_URL  = 'https://api.xero.com/connections'

/**
 * A Xero Custom Connection is bound to ONE organisation, so each company that
 * pushes to Xero needs its own Xero app. Apps are read from env:
 *   XERO_CLIENT_ID / XERO_CLIENT_SECRET                 → the default app (Build One)
 *   XERO_CLIENT_ID_<NAME> / XERO_CLIENT_SECRET_<NAME>   → any further app, e.g. _ARKO
 */
export interface XeroApp { key: string; clientId: string; clientSecret: string }

export function xeroApps(env: Record<string, string | undefined> = process.env): XeroApp[] {
  const apps: XeroApp[] = []
  for (const [k, v] of Object.entries(env)) {
    const m = k.match(/^XERO_CLIENT_ID(?:_([A-Z0-9_]+))?$/)
    if (!m || !v) continue
    const suffix = m[1] ? `_${m[1]}` : ''
    const secret = env[`XERO_CLIENT_SECRET${suffix}`]
    if (secret) apps.push({ key: m[1] ?? 'DEFAULT', clientId: v.trim(), clientSecret: secret.trim() })
  }
  return apps
}

export function xeroBasicAuth(app: XeroApp = xeroApps()[0]): string {
  return Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')
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
export async function getCustomConnectionToken(app: XeroApp = xeroApps()[0]): Promise<XeroTokenResponse> {
  if (!app) throw new Error('No Xero app configured (set XERO_CLIENT_ID / XERO_CLIENT_SECRET).')
  // For a Xero Custom Connection the granted scopes are fixed at authorisation
  // time and come back with the token automatically. Passing an explicit `scope`
  // param makes Xero reject it ("invalid_scope") unless it matches exactly — so
  // we deliberately do NOT send one.
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${xeroBasicAuth(app)}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
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

export interface XeroEmployee {
  id: string
  name: string
  email: string | null
  status: string | null
  payrollCalendarId: string | null   // which pay calendar this employee is on
}
export interface XeroEarningsRate { id: string; name: string; earningsType: string | null; rateType: string | null }

/** Read the payroll employees for a tenant (payroll.employees.read). */
export async function fetchXeroEmployees(token: string, tenantId: string): Promise<XeroEmployee[]> {
  const body = await xeroApiGet('https://api.xero.com/payroll.xro/1.0/Employees', token, tenantId)
  return (body?.Employees ?? []).map((e: any) => ({
    id: e.EmployeeID,
    name: `${e.FirstName ?? ''} ${e.LastName ?? ''}`.trim(),
    email: e.Email ?? null,
    status: e.Status ?? null,
    // The list endpoint may omit PayrollCalendarID; callers can fall back to the
    // single active calendar. Present on the detail endpoint if needed.
    payrollCalendarId: e.PayrollCalendarID ?? null,
  }))
}

/** Read one employee's full record (includes PayrollCalendarID). */
export async function fetchXeroEmployeeCalendarId(token: string, tenantId: string, employeeId: string): Promise<string | null> {
  try {
    const body = await xeroApiGet(`https://api.xero.com/payroll.xro/1.0/Employees/${employeeId}`, token, tenantId)
    return body?.Employees?.[0]?.PayrollCalendarID ?? null
  } catch {
    return null
  }
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

export interface XeroTrackingOption { id: string; name: string }
export interface XeroTimesheetTracking {
  categoryId: string | null           // the payroll timesheet tracking category (null = no tracking required)
  options: XeroTrackingOption[]        // available "Job" options
}

/**
 * Find out whether payroll timesheets require a tracking item ("Job"), and get
 * the available options.
 *
 * NOTE: Payroll `Settings.TimesheetCategories` is unreliable — Build One's org
 * returns no category there yet still rejects timesheet lines without a
 * TrackingItemID ("TrackingItemID is required for each timesheet line"), because
 * individual employees have a tracking category on their pay template. So we
 * read the ACTIVE tracking categories straight from the Accounting API
 * (accounting.settings.read) and treat the first one (the "Job" category) as the
 * required timesheet tracking. Returns categoryId=null only when the org has no
 * active tracking category at all.
 */
export async function fetchTimesheetTracking(token: string, tenantId: string): Promise<XeroTimesheetTracking> {
  try {
    const acct = await xeroApiGet('https://api.xero.com/api.xro/2.0/TrackingCategories', token, tenantId)
    const cat = (acct?.TrackingCategories ?? []).find((c: any) => c.Status === 'ACTIVE')
    if (!cat) return { categoryId: null, options: [] }
    const options = (cat.Options ?? [])
      .filter((o: any) => o.Status === 'ACTIVE')
      .map((o: any) => ({ id: o.TrackingOptionID, name: o.Name }))
    return { categoryId: cat.TrackingCategoryID, options }
  } catch {
    // accounting.settings.read not granted, or lookup failed — assume no tracking.
    return { categoryId: null, options: [] }
  }
}

export interface XeroPayCalendar {
  id: string
  name: string
  type: string          // e.g. "FORTNIGHTLY", "WEEKLY", "MONTHLY"
  startDate: string     // ISO date of a period start (anchor)
}

const DAY_MS = 86_400_000
function periodLengthDays(type: string): number | null {
  switch (type) {
    case 'WEEKLY': return 7
    case 'FORTNIGHTLY': return 14
    default: return null   // monthly/quarterly handled separately (not aligned here)
  }
}

/** Align a date range to ONE known calendar's fixed-length period. */
export function alignToOneCalendar(
  from: string,
  to: string,
  cal: XeroPayCalendar,
): { from: string; to: string } | null {
  const len = periodLengthDays(cal.type)
  if (!len) return null
  const anchor = new Date(cal.startDate + 'T00:00:00Z').getTime()
  const fromMs = new Date(from + 'T00:00:00Z').getTime()
  const periodsBefore = Math.floor((fromMs - anchor) / (len * DAY_MS))
  const startMs = anchor + periodsBefore * len * DAY_MS
  const endMs = startMs + (len - 1) * DAY_MS
  return { from: new Date(startMs).toISOString().slice(0, 10), to: new Date(endMs).toISOString().slice(0, 10) }
}

/** Parse a Xero "/Date(1234567890000+0000)/" string to an ISO date (YYYY-MM-DD). */
function parseXeroDate(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.match(/\/Date\((\d+)/)
  if (!m) return null
  return new Date(parseInt(m[1], 10)).toISOString().slice(0, 10)
}

/** Read the org's pay calendars (payroll.settings.read) — used to align periods. */
export async function fetchXeroPayCalendars(token: string, tenantId: string): Promise<XeroPayCalendar[]> {
  const body = await xeroApiGet('https://api.xero.com/payroll.xro/1.0/PayrollCalendars', token, tenantId)
  return (body?.PayrollCalendars ?? []).map((c: any) => ({
    id: c.PayrollCalendarID,
    name: c.Name,
    type: c.CalendarType,
    startDate: parseXeroDate(c.StartDate) ?? '',
  })).filter((c: XeroPayCalendar) => c.startDate)
}

/**
 * Snap a payroll period to the Xero pay calendar it best matches, so Xero
 * accepts the timesheet. Xero rejects a timesheet ("validation exception" /
 * "Provided period doesn't correspond with a pay period") unless its dates line
 * up exactly with one of the org's pay-calendar periods.
 *
 * We take the calendar whose fixed-length period (weekly/fortnightly) contains
 * the given `from` date and return that period's exact start/end. If no
 * fixed-length calendar matches, we return the original dates unchanged.
 */
export function alignPeriodToCalendar(
  from: string,
  to: string,
  calendars: XeroPayCalendar[],
): { from: string; to: string; calendar: XeroPayCalendar | null } {
  const fromMs = new Date(from + 'T00:00:00Z').getTime()
  let best: { from: string; to: string; calendar: XeroPayCalendar; overlap: number } | null = null

  for (const cal of calendars) {
    const len = periodLengthDays(cal.type)
    if (!len) continue
    const anchor = new Date(cal.startDate + 'T00:00:00Z').getTime()
    // Find the period start on/just before `from`.
    const periodsBefore = Math.floor((fromMs - anchor) / (len * DAY_MS))
    const startMs = anchor + periodsBefore * len * DAY_MS
    const endMs = startMs + (len - 1) * DAY_MS
    const pStart = new Date(startMs).toISOString().slice(0, 10)
    const pEnd = new Date(endMs).toISOString().slice(0, 10)
    // Prefer the calendar whose period overlaps the requested [from,to] the most.
    const toMs = new Date(to + 'T00:00:00Z').getTime()
    const overlap = Math.min(endMs, toMs) - Math.max(startMs, fromMs)
    if (!best || overlap > best.overlap) best = { from: pStart, to: pEnd, calendar: cal, overlap }
  }

  if (!best) return { from, to, calendar: null }
  return { from: best.from, to: best.to, calendar: best.calendar }
}

/** Match a Timevera project name to a Xero tracking option ("Job") by name. */
export function matchTrackingOptionId(projectName: string, options: XeroTrackingOption[]): string | null {
  if (options.length === 0) return null
  const n = projectName.trim().toLowerCase()
  const exact = options.find((o) => o.name.trim().toLowerCase() === n)
  if (exact) return exact.id
  const partial = options.find((o) => o.name.toLowerCase().includes(n) || n.includes(o.name.toLowerCase()))
  return partial?.id ?? null
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
 * POST a DRAFT timesheet to Xero (payroll.timesheets scope).
 * It appears in Xero as a draft for the client to review & approve; once THEY
 * approve it there, Xero auto-populates the matching pay run's payslips.
 */
export interface XeroTimesheetLine { earningsRateId: string; numberOfUnits: number[]; trackingItemId?: string | null }
export async function postXeroTimesheet(
  token: string,
  tenantId: string,
  input: { employeeId: string; startDate: string; endDate: string; lines: XeroTimesheetLine[] },
): Promise<{ ok: boolean; status: number; body: any }> {
  // Xero AU Timesheets expects a JSON ARRAY at the top level, not an object.
  const payload = [
    {
      EmployeeID: input.employeeId,
      StartDate: input.startDate,
      EndDate: input.endDate,
      // DRAFT so the client reviews & approves the timesheet in Xero before it
      // flows into a pay run (they explicitly wanted the approval step in Xero).
      Status: 'DRAFT',
      TimesheetLines: input.lines.map((l) => ({
        EarningsRateID: l.earningsRateId,
        NumberOfUnits: l.numberOfUnits,
        // Only include TrackingItemID when the org's payroll requires job tracking.
        ...(l.trackingItemId ? { TrackingItemID: l.trackingItemId } : {}),
      })),
    },
  ]
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

export interface XeroOrgConnection { app: XeroApp; tenantId: string; tenantName: string; token: string }

/** Every organisation authorised on any configured Xero app, with a fresh token for it. */
export async function listXeroConnections(apps: XeroApp[] = xeroApps()): Promise<XeroOrgConnection[]> {
  const out: XeroOrgConnection[] = []
  for (const app of apps) {
    try {
      const { access_token } = await getCustomConnectionToken(app)
      const conns = await fetchXeroConnections(access_token)
      for (const c of conns) out.push({ app, tenantId: c.tenantId, tenantName: c.tenantName, token: access_token })
    } catch (e) {
      console.warn(`[xero] app ${app.key} unavailable:`, e instanceof Error ? e.message : e)
    }
  }
  return out
}

/**
 * A valid access token for the given organisation, from whichever Xero app is
 * authorised on it. Tokens last ~30 min; fetching per operation is fine.
 */
export async function getValidXeroToken(tenantId: string): Promise<string> {
  const conns = await listXeroConnections()
  const hit = conns.find((c) => c.tenantId === tenantId)
  if (hit) return hit.token
  const available = conns.map((c) => c.tenantName).join(', ') || 'none'
  throw new Error(
    `No authorised Xero app is connected to this organisation (tenant ${tenantId}). ` +
    `Organisations currently authorised: ${available}. Re-authorise the app in Xero, then Reconnect this entity.`,
  )
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Pick the authorised Xero organisation that belongs to a company, by name
 * ("ARKO Joinery" ↔ "ARKO Joinery Pty Ltd", "Build One" ↔ "Build One Design and
 * Construction"). Refuses to guess: no match or several matches is an error,
 * because linking a company to the wrong org would push its payroll there.
 */
export function matchOrgForEntity(entityName: string, conns: XeroOrgConnection[]): XeroOrgConnection {
  const e = norm(entityName)
  const hits = conns.filter((c) => {
    const t = norm(c.tenantName)
    return t === e || t.startsWith(e + ' ') || e.startsWith(t + ' ')
  })
  const unique = [...new Map(hits.map((h) => [h.tenantId, h])).values()]
  if (unique.length === 1) return unique[0]
  const available = conns.map((c) => c.tenantName).join(', ') || 'none'
  if (unique.length === 0) {
    throw new Error(`No authorised Xero organisation matches "${entityName}". Authorised: ${available}.`)
  }
  throw new Error(`Several Xero organisations match "${entityName}": ${unique.map((u) => u.tenantName).join(', ')}.`)
}
