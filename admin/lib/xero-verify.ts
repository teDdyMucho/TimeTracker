/**
 * Read-only Xero lookups used to validate a pay run against what Xero holds
 * (PRD task "Validate matching, bands and Xero pay result"). Nothing here
 * writes to Xero.
 */
import { xeroApiGet, parseXeroDate } from '@/lib/xero'

export interface XeroTimesheetLineRead { earningsRateId: string; units: number[] }
export interface XeroTimesheetRead {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  status: string
  lines: XeroTimesheetLineRead[]
}

const PAGE = 100

/** Timesheets whose period overlaps [from, to]. Paged; lines fetched per timesheet when the list omits them. */
export async function fetchXeroTimesheets(token: string, tenantId: string, from: string, to: string): Promise<XeroTimesheetRead[]> {
  const out: XeroTimesheetRead[] = []
  for (let page = 1; page <= 20; page++) {
    const body = await xeroApiGet(`https://api.xero.com/payroll.xro/1.0/Timesheets?page=${page}`, token, tenantId)
    const list: any[] = body?.Timesheets ?? []
    for (const t of list) {
      const s = parseXeroDate(t.StartDate)
      const e = parseXeroDate(t.EndDate)
      if (!s || !e) continue
      if (s > to || e < from) continue
      let lines: any[] = t.TimesheetLines ?? []
      if (!Array.isArray(t.TimesheetLines)) {
        const detail = await xeroApiGet(`https://api.xero.com/payroll.xro/1.0/Timesheets/${t.TimesheetID}`, token, tenantId)
        lines = detail?.Timesheets?.[0]?.TimesheetLines ?? []
      }
      out.push({
        id: t.TimesheetID,
        employeeId: t.EmployeeID,
        startDate: s,
        endDate: e,
        status: t.Status ?? '',
        lines: lines.map((l: any) => ({ earningsRateId: l.EarningsRateID, units: (l.NumberOfUnits ?? []).map((u: any) => Number(u) || 0) })),
      })
    }
    if (list.length < PAGE) break
  }
  return out
}

export interface XeroPayRunRead {
  id: string
  calendarId: string | null
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  status: string
}

/** Pay runs whose period overlaps [from, to]. */
export async function fetchXeroPayRuns(token: string, tenantId: string, from: string, to: string): Promise<XeroPayRunRead[]> {
  const out: XeroPayRunRead[] = []
  for (let page = 1; page <= 10; page++) {
    const body = await xeroApiGet(`https://api.xero.com/payroll.xro/1.0/PayRuns?page=${page}`, token, tenantId)
    const list: any[] = body?.PayRuns ?? []
    for (const p of list) {
      const s = parseXeroDate(p.PayRunPeriodStartDate)
      const e = parseXeroDate(p.PayRunPeriodEndDate)
      if (!s || !e) continue
      if (s > to || e < from) continue
      out.push({
        id: p.PayRunID,
        calendarId: p.PayrollCalendarID ?? null,
        periodStart: s,
        periodEnd: e,
        paymentDate: parseXeroDate(p.PaymentDate),
        status: p.PayRunStatus ?? '',
      })
    }
    if (list.length < PAGE) break
  }
  return out
}

export interface XeroPayslipRead {
  employeeId: string
  name: string
  wages: number
  deductions: number
  tax: number
  superannuation: number
  netPay: number
}

/** Payslip summaries for one pay run. */
export async function fetchXeroPayRunPayslips(token: string, tenantId: string, payRunId: string): Promise<XeroPayslipRead[]> {
  const body = await xeroApiGet(`https://api.xero.com/payroll.xro/1.0/PayRuns/${payRunId}`, token, tenantId)
  const run = body?.PayRuns?.[0]
  return ((run?.Payslips ?? []) as any[]).map((p) => ({
    employeeId: p.EmployeeID,
    name: `${p.FirstName ?? ''} ${p.LastName ?? ''}`.trim(),
    wages: Number(p.Wages ?? 0),
    deductions: Number(p.Deductions ?? 0),
    tax: Number(p.Tax ?? 0),
    superannuation: Number(p.Super ?? 0),
    netPay: Number(p.NetPay ?? 0),
  }))
}
