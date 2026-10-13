/**
 * Labour cost engine (PRD §11) shared by the dashboard, reports, project
 * budgets and the CSV export.
 *
 * Bands each employee-day (per entity) into ordinary / overtime / weekend /
 * public-holiday hours with the entity's pay config, prices it with the
 * employee's current hourly rate, then apportions that day's cost across the
 * projects and work locations worked that day pro-rata by hours. This matches
 * how pay runs cost a day, so report totals reconcile with payroll.
 *
 * PRD §10 is honoured here: when an entity's pay config has
 * `overtimeRequiresApproval`, weekday hours past the ordinary band are paid at
 * the ordinary rate unless that day's overtime request was approved.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyDay, grossPay, PAY_BANDS, type PayBand, type PayConfig } from '@/lib/payroll'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Pay config helpers ───────────────────────────────────────────────────────

export const DEFAULT_PAY_CONFIG: PayConfig = {
  standardDailyHours: 8,
  weekdayTiers: [
    { band: 'regular', fromHour: 0, toHour: 8, multiplier: 1 },
    { band: 'overtime_t1', fromHour: 8, toHour: 10, multiplier: 1.5 },
    { band: 'overtime_t2', fromHour: 10, toHour: null, multiplier: 2 },
  ],
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2,
  publicHolidayMultiplier: 2.5,
}

/** Pay config with the PRD §10 approval flag (stored in the same jsonb). */
export interface PayConfigEx extends PayConfig {
  overtimeRequiresApproval?: boolean
}

/** Bands that carry overtime / penalty loading (everything except ordinary). */
export const LOADED_BANDS: PayBand[] = ['overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

/**
 * Defensive read of an entity's pay_config. An entity seeded with the legacy
 * shape (no weekdayTiers) or with missing multipliers falls back to the
 * defaults field-by-field instead of crashing payroll.
 */
export function normalizePayConfig(raw: unknown): PayConfigEx {
  const c = (raw ?? {}) as Partial<PayConfigEx>
  const tiers = Array.isArray(c.weekdayTiers) && c.weekdayTiers.length > 0
    ? c.weekdayTiers
        .filter((t) => t && typeof t.fromHour === 'number')
        .map((t) => ({
          band: t.band,
          fromHour: Number(t.fromHour),
          toHour: t.toHour == null ? null : Number(t.toHour),
          multiplier: Number(t.multiplier ?? 1),
        }))
    : DEFAULT_PAY_CONFIG.weekdayTiers
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    standardDailyHours: num(c.standardDailyHours, DEFAULT_PAY_CONFIG.standardDailyHours),
    weekdayTiers: tiers,
    saturdayMultiplier: num(c.saturdayMultiplier, DEFAULT_PAY_CONFIG.saturdayMultiplier),
    sundayMultiplier: num(c.sundayMultiplier, DEFAULT_PAY_CONFIG.sundayMultiplier),
    publicHolidayMultiplier: num(c.publicHolidayMultiplier, DEFAULT_PAY_CONFIG.publicHolidayMultiplier),
    overtimeRequiresApproval: c.overtimeRequiresApproval === true,
  }
}

// ─── Day banding ──────────────────────────────────────────────────────────────

/**
 * Band one employee's total hours for one day.
 *  - flat-rate workers: everything ordinary.
 *  - weekend / public holiday: everything at that day's loading.
 *  - weekday: the tier ladder; if the entity requires overtime approval and this
 *    day's overtime was NOT approved, the ladder collapses to ordinary.
 */
export function bandEmployeeDay(
  totalHours: number,
  dateISO: string,
  holidays: Set<string>,
  cfg: PayConfigEx,
  isFlatRate: boolean,
  overtimeApproved: boolean,
): Partial<Record<PayBand, number>> {
  if (totalHours <= 0) return {}
  if (isFlatRate) return { regular: round2(totalHours) }
  const dayType = classifyDay(dateISO, holidays.has(dateISO))
  if (dayType !== 'weekday') return { [dayType]: round2(totalHours) }
  if (cfg.overtimeRequiresApproval && !overtimeApproved) return { regular: round2(totalHours) }
  const out: Partial<Record<PayBand, number>> = {}
  for (const t of cfg.weekdayTiers) {
    const upper = t.toHour ?? Infinity
    const h = Math.max(0, Math.min(totalHours, upper) - t.fromHour)
    if (h > 0) out[t.band] = round2((out[t.band] ?? 0) + h)
  }
  return out
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface CostRow {
  profile_id: string
  project_id: string | null
  business_entity_id: string
  work_location: 'site' | 'workshop'
  work_date: string
  hours: number
  overtime_status: string | null
  status: string
}

export interface CostInputs {
  rows: CostRow[]
  holidays: Set<string>
  configs: Record<string, PayConfigEx>
  rates: Record<string, number>
  flatRateIds: Set<string>
  employeeNames: Record<string, string>
  projectNames: Record<string, string>
  projectEntity: Record<string, string>
  entityNames: Record<string, string>
}

export interface CostScope {
  from: string
  to: string
  entityId?: string
  employeeId?: string
  projectId?: string
  /** Timesheet statuses to include. Default: approved only (client rule). */
  statuses?: string[]
}

/** Load everything the engine needs for a date range (service-role client). */
export async function loadCostInputs(admin: SupabaseClient, scope: CostScope): Promise<CostInputs> {
  const statuses = scope.statuses ?? ['approved']
  let q = admin
    .from('timesheets')
    .select('profile_id, project_id, business_entity_id, work_location, work_date, hours, overtime_status, status, profiles!inner(status)')
    .eq('profiles.status', 'active')
    .gte('work_date', scope.from)
    .lte('work_date', scope.to)
    .in('status', statuses)
  if (scope.entityId) q = q.eq('business_entity_id', scope.entityId)
  if (scope.employeeId) q = q.eq('profile_id', scope.employeeId)
  if (scope.projectId) q = q.eq('project_id', scope.projectId)

  const [tsRes, holRes, entRes, rateRes, profRes, projRes] = await Promise.all([
    q,
    admin.from('public_holidays').select('date').gte('date', scope.from).lte('date', scope.to),
    admin.from('business_entities').select('id, name, pay_config'),
    admin.from('pay_rates').select('profile_id, hourly_rate, effective_from').order('effective_from', { ascending: false }),
    admin.from('profiles').select('id, name, flat_rate'),
    admin.from('projects').select('id, name, business_entity_id'),
  ])

  const rows = ((tsRes.data ?? []) as any[]).map((r) => ({
    profile_id: r.profile_id,
    project_id: r.project_id ?? null,
    business_entity_id: r.business_entity_id,
    work_location: r.work_location === 'workshop' ? 'workshop' : 'site',
    work_date: r.work_date,
    hours: Number(r.hours),
    overtime_status: r.overtime_status ?? null,
    status: r.status,
  })) as CostRow[]

  const rates: Record<string, number> = {}
  for (const r of (rateRes.data ?? []) as any[]) {
    if (!(r.profile_id in rates)) rates[r.profile_id] = Number(r.hourly_rate)
  }

  const employeeNames: Record<string, string> = {}
  const flatRateIds = new Set<string>()
  for (const p of (profRes.data ?? []) as any[]) {
    employeeNames[p.id] = p.name
    if (p.flat_rate) flatRateIds.add(p.id)
  }

  const projectNames: Record<string, string> = {}
  const projectEntity: Record<string, string> = {}
  for (const p of (projRes.data ?? []) as any[]) {
    projectNames[p.id] = p.name
    projectEntity[p.id] = p.business_entity_id
  }

  const configs: Record<string, PayConfigEx> = {}
  const entityNames: Record<string, string> = {}
  for (const e of (entRes.data ?? []) as any[]) {
    configs[e.id] = normalizePayConfig(e.pay_config)
    entityNames[e.id] = e.name
  }

  return {
    rows,
    holidays: new Set((holRes.data ?? []).map((h: any) => h.date as string)),
    configs,
    rates,
    flatRateIds,
    employeeNames,
    projectNames,
    projectEntity,
    entityNames,
  }
}

// ─── Breakdown ────────────────────────────────────────────────────────────────

export interface CostBucket {
  id: string
  name: string
  hours: number
  cost: number
  /** Hours on loaded bands (OT 1.5×/2×, Sat, Sun, PH). */
  overtimeHours: number
  /** Cost of those loaded-band hours. */
  overtimeCost: number
}

export interface ProjectBucket extends CostBucket { entityId: string }
export interface EmployeeBucket extends CostBucket { projects: string[]; hasRate: boolean }

export interface EmployeeDayCost {
  profileId: string
  name: string
  date: string
  entityId: string
  projectIds: string[]
  hours: number
  bandHours: Record<PayBand, number>
  cost: number
  overtimeHours: number
  overtimeCost: number
  overtimeStatus: string
}

export interface CostBreakdown {
  totalHours: number
  totalCost: number
  ordinaryCost: number
  overtimeHours: number
  overtimeCost: number
  /** Employees with hours but no pay rate — their cost shows as $0. */
  unratedEmployees: string[]
  byBand: Record<PayBand, { hours: number; cost: number }>
  byProject: ProjectBucket[]
  byEmployee: EmployeeBucket[]
  byEntity: CostBucket[]
  byLocation: { site: { hours: number; cost: number }; workshop: { hours: number; cost: number } }
  days: EmployeeDayCost[]
}

function bucket<T extends CostBucket>(map: Map<string, T>, id: string, make: () => T): T {
  let b = map.get(id)
  if (!b) { b = make(); map.set(id, b) }
  return b
}

export function computeLabourCost(inputs: CostInputs): CostBreakdown {
  const { rows, holidays, configs, rates, flatRateIds } = inputs

  // Group rows by employee + entity + day (the unit the pay ladder applies to).
  const groups = new Map<string, { profileId: string; entityId: string; date: string; rows: CostRow[]; total: number; otApproved: boolean; otStatus: string }>()
  for (const r of rows) {
    if (!r.profile_id || !r.business_entity_id) continue
    const key = `${r.profile_id}|${r.business_entity_id}|${r.work_date}`
    const g = groups.get(key) ?? { profileId: r.profile_id, entityId: r.business_entity_id, date: r.work_date, rows: [], total: 0, otApproved: false, otStatus: 'none' }
    g.rows.push(r)
    g.total = round2(g.total + r.hours)
    if (r.overtime_status === 'approved') { g.otApproved = true; g.otStatus = 'approved' }
    else if (r.overtime_status === 'pending' && g.otStatus === 'none') g.otStatus = 'pending'
    else if (r.overtime_status === 'rejected' && g.otStatus === 'none') g.otStatus = 'rejected'
    groups.set(key, g)
  }

  const byBand = Object.fromEntries(PAY_BANDS.map((b) => [b, { hours: 0, cost: 0 }])) as Record<PayBand, { hours: number; cost: number }>
  const byProject = new Map<string, ProjectBucket>()
  const byEmployee = new Map<string, EmployeeBucket>()
  const byEntity = new Map<string, CostBucket>()
  const byLocation = { site: { hours: 0, cost: 0 }, workshop: { hours: 0, cost: 0 } }
  const empProjects = new Map<string, Set<string>>()
  const unrated = new Set<string>()
  const days: EmployeeDayCost[] = []

  let totalHours = 0, totalCost = 0, ordinaryCost = 0, overtimeHours = 0, overtimeCost = 0

  for (const g of groups.values()) {
    const cfg = configs[g.entityId] ?? normalizePayConfig(null)
    const rate = rates[g.profileId] ?? 0
    if (!(g.profileId in rates)) unrated.add(g.profileId)
    const split = bandEmployeeDay(g.total, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    for (const [band, h] of Object.entries(split)) bandHours[band as PayBand] = h as number
    const { gross, bandCost } = grossPay(bandHours, rate, cfg)
    const dayOtHours = round2(LOADED_BANDS.reduce((s, b) => s + bandHours[b], 0))
    const dayOtCost = round2(LOADED_BANDS.reduce((s, b) => s + bandCost[b], 0))

    for (const b of PAY_BANDS) {
      byBand[b].hours = round2(byBand[b].hours + bandHours[b])
      byBand[b].cost = round2(byBand[b].cost + bandCost[b])
    }
    totalHours = round2(totalHours + g.total)
    totalCost = round2(totalCost + gross)
    ordinaryCost = round2(ordinaryCost + bandCost.regular)
    overtimeHours = round2(overtimeHours + dayOtHours)
    overtimeCost = round2(overtimeCost + dayOtCost)

    const emp = bucket(byEmployee, g.profileId, () => ({
      id: g.profileId, name: inputs.employeeNames[g.profileId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, projects: [], hasRate: g.profileId in rates,
    }))
    emp.hours = round2(emp.hours + g.total)
    emp.cost = round2(emp.cost + gross)
    emp.overtimeHours = round2(emp.overtimeHours + dayOtHours)
    emp.overtimeCost = round2(emp.overtimeCost + dayOtCost)

    const ent = bucket(byEntity, g.entityId, () => ({
      id: g.entityId, name: inputs.entityNames[g.entityId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0,
    }))
    ent.hours = round2(ent.hours + g.total)
    ent.cost = round2(ent.cost + gross)
    ent.overtimeHours = round2(ent.overtimeHours + dayOtHours)
    ent.overtimeCost = round2(ent.overtimeCost + dayOtCost)

    // Apportion the day's cost across the rows (projects / locations) by hours.
    const projectIds = new Set<string>()
    for (const r of g.rows) {
      const share = g.total > 0 ? r.hours / g.total : 0
      const rowCost = round2(gross * share)
      const rowOtHours = round2(dayOtHours * share)
      const rowOtCost = round2(dayOtCost * share)

      if (r.project_id) {
        projectIds.add(r.project_id)
        const pr = bucket(byProject, r.project_id, () => ({
          id: r.project_id!, name: inputs.projectNames[r.project_id!] ?? 'Unknown', entityId: inputs.projectEntity[r.project_id!] ?? g.entityId,
          hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0,
        }))
        pr.hours = round2(pr.hours + r.hours)
        pr.cost = round2(pr.cost + rowCost)
        pr.overtimeHours = round2(pr.overtimeHours + rowOtHours)
        pr.overtimeCost = round2(pr.overtimeCost + rowOtCost)
        const set = empProjects.get(g.profileId) ?? new Set<string>()
        set.add(r.project_id)
        empProjects.set(g.profileId, set)
      }

      const loc = byLocation[r.work_location]
      loc.hours = round2(loc.hours + r.hours)
      loc.cost = round2(loc.cost + rowCost)
    }

    days.push({
      profileId: g.profileId,
      name: inputs.employeeNames[g.profileId] ?? 'Unknown',
      date: g.date,
      entityId: g.entityId,
      projectIds: [...projectIds],
      hours: g.total,
      bandHours,
      cost: gross,
      overtimeHours: dayOtHours,
      overtimeCost: dayOtCost,
      overtimeStatus: g.otStatus,
    })
  }

  for (const [pid, set] of empProjects) {
    const e = byEmployee.get(pid)
    if (e) e.projects = [...set].map((id) => inputs.projectNames[id] ?? 'Unknown').sort()
  }

  const byCost = (a: CostBucket, b: CostBucket) => b.cost - a.cost || b.hours - a.hours

  return {
    totalHours,
    totalCost,
    ordinaryCost,
    overtimeHours,
    overtimeCost,
    unratedEmployees: [...unrated].map((id) => inputs.employeeNames[id] ?? id).sort(),
    byBand,
    byProject: [...byProject.values()].sort(byCost),
    byEmployee: [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name)),
    byEntity: [...byEntity.values()].sort(byCost),
    byLocation,
    days: days.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
  }
}

/** Convenience: load + compute in one call. */
export async function labourCost(admin: SupabaseClient, scope: CostScope): Promise<CostBreakdown> {
  return computeLabourCost(await loadCostInputs(admin, scope))
}

// ─── Payroll aggregation (approval-aware drop-ins for lib/payroll.ts) ────────

export interface PayrollRow {
  profile_id: string
  work_date: string
  hours: number | string
  overtime_status?: string | null
  profiles?: { name?: string; email?: string } | null
}

export interface EmployeeBandTotals {
  profileId: string
  name: string
  email: string | null
  bandHours: Record<PayBand, number>
  totalHours: number
}

export interface EmployeeBandsByDay {
  profileId: string
  name: string
  email: string | null
  /** band → (work_date → hours on that date). Only bands/dates with hours appear. */
  byBand: Record<PayBand, Record<string, number>>
  totalHours: number
}

function groupEmployeeDays(rows: PayrollRow[]) {
  const byEmpDay = new Map<string, Map<string, { hours: number; otApproved: boolean }>>()
  const meta = new Map<string, { name: string; email: string | null }>()
  for (const r of rows) {
    if (!r.profile_id) continue
    meta.set(r.profile_id, { name: r.profiles?.name ?? 'Unknown', email: r.profiles?.email ?? null })
    const days = byEmpDay.get(r.profile_id) ?? new Map<string, { hours: number; otApproved: boolean }>()
    const d = days.get(r.work_date) ?? { hours: 0, otApproved: false }
    d.hours = round2(d.hours + Number(r.hours))
    if (r.overtime_status === 'approved') d.otApproved = true
    days.set(r.work_date, d)
    byEmpDay.set(r.profile_id, days)
  }
  return { byEmpDay, meta }
}

/**
 * Per-employee band hours for a pay run. Same output as
 * `aggregatePayroll` in lib/payroll.ts, but honours the entity's
 * `overtimeRequiresApproval` rule (PRD §10).
 */
export function aggregateEmployeeBands(
  rows: PayrollRow[],
  holidays: Set<string>,
  cfg: PayConfigEx,
  flatRateIds: Set<string> = new Set(),
): EmployeeBandTotals[] {
  const { byEmpDay, meta } = groupEmployeeDays(rows)
  const result: EmployeeBandTotals[] = []
  for (const [pid, days] of byEmpDay) {
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    let total = 0
    for (const [date, d] of days) {
      const split = bandEmployeeDay(d.hours, date, holidays, cfg, flatRateIds.has(pid), d.otApproved)
      for (const [band, h] of Object.entries(split)) bandHours[band as PayBand] = round2(bandHours[band as PayBand] + (h as number))
      total = round2(total + d.hours)
    }
    const m = meta.get(pid)!
    result.push({ profileId: pid, name: m.name, email: m.email, bandHours, totalHours: total })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/** Like aggregateEmployeeBands but split by date, for the Xero timesheet push. */
export function aggregateEmployeeBandsByDay(
  rows: PayrollRow[],
  holidays: Set<string>,
  cfg: PayConfigEx,
  flatRateIds: Set<string> = new Set(),
): EmployeeBandsByDay[] {
  const { byEmpDay, meta } = groupEmployeeDays(rows)
  const result: EmployeeBandsByDay[] = []
  for (const [pid, days] of byEmpDay) {
    const byBand = Object.fromEntries(PAY_BANDS.map((b) => [b, {} as Record<string, number>])) as Record<PayBand, Record<string, number>>
    let total = 0
    for (const [date, d] of days) {
      const split = bandEmployeeDay(d.hours, date, holidays, cfg, flatRateIds.has(pid), d.otApproved)
      for (const [band, h] of Object.entries(split)) {
        byBand[band as PayBand][date] = round2((byBand[band as PayBand][date] ?? 0) + (h as number))
      }
      total = round2(total + d.hours)
    }
    const m = meta.get(pid)!
    result.push({ profileId: pid, name: m.name, email: m.email, byBand, totalHours: total })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

export function money(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
