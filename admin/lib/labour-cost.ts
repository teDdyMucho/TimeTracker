/**
 * Labour cost engine (PRD §11) shared by the dashboard, reports, project
 * budgets, payroll, the Xero push and the CSV exports.
 *
 * Bands each employee-day (per entity) into ordinary / overtime / weekend /
 * public-holiday hours with the entity's pay config, prices it with the
 * employee's current hourly rate, then apportions that day's cost across the
 * projects and work locations worked that day pro-rata by hours. This matches
 * how pay runs cost a day, so report totals reconcile with payroll.
 *
 * Rules honoured here:
 *  - PRD §10: when an entity's pay config has `overtimeRequiresApproval`,
 *    weekday hours past the ordinary band are paid at the ordinary rate unless
 *    that day's overtime request was approved.
 *  - Unpaid break: when a worker's day is longer than `afterHours`, `minutes`
 *    are deducted once per calendar day (from the entity they worked the most
 *    for that day) before banding. Configured per entity, editable in
 *    Entities → Pay settings.
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

/** Unpaid meal break deducted from a long day (PRD task "Deduct agreed unpaid lunch"). */
export interface UnpaidBreakRule {
  enabled: boolean
  /** Minutes deducted once per day. */
  minutes: number
  /** Only days longer than this many hours lose the break. */
  afterHours: number
}

/** Default until the client confirms their agreement: 30 min when a day exceeds 5 h. */
export const DEFAULT_UNPAID_BREAK: UnpaidBreakRule = { enabled: true, minutes: 30, afterHours: 5 }

/** Pay config with the PRD §10 approval flag and the break rule (same jsonb column). */
export interface PayConfigEx extends PayConfig {
  overtimeRequiresApproval?: boolean
  unpaidBreak?: UnpaidBreakRule
}

/** Bands that carry overtime / penalty loading (everything except ordinary). */
export const LOADED_BANDS: PayBand[] = ['overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

/** Key used inside payroll_entries.band_hours to record the deducted break hours. */
export const UNPAID_BREAK_KEY = 'unpaid_break'

export function normalizeUnpaidBreak(raw: unknown): UnpaidBreakRule {
  const c = (raw ?? {}) as Partial<UnpaidBreakRule>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_UNPAID_BREAK.enabled,
    minutes: num(c.minutes, DEFAULT_UNPAID_BREAK.minutes),
    afterHours: num(c.afterHours, DEFAULT_UNPAID_BREAK.afterHours),
  }
}

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
    unpaidBreak: normalizeUnpaidBreak(c.unpaidBreak),
  }
}

/** Hours to deduct from a day of `dayHours` under the rule (0 when it does not apply). */
export function unpaidBreakHours(dayHours: number, rule: UnpaidBreakRule | undefined): number {
  const r = rule ?? DEFAULT_UNPAID_BREAK
  if (!r.enabled || r.minutes <= 0) return 0
  if (dayHours <= r.afterHours) return 0
  return round2(Math.min(r.minutes / 60, dayHours))
}

// ─── Pay rates by date (PRD task "Apply pay rates effective on the worked date") ─

export interface RateRow { profile_id: string; hourly_rate: number | string; effective_from: string; created_at?: string | null }

/**
 * An employee's first rate is stored with this effective date so it counts as
 * their baseline for all earlier work and can never be mistaken for a later
 * change when a rise is back-dated (migration 0030 normalises existing rows).
 */
export const RATE_BASELINE_DATE = '2000-01-01'

/** Per employee, their rates oldest-first (same date → entry order). */
export type RateHistory = Record<string, { from: string; rate: number; created?: string }[]>

export function buildRateHistory(rows: RateRow[]): RateHistory {
  const h: RateHistory = {}
  for (const r of rows) (h[r.profile_id] ??= []).push({ from: r.effective_from, rate: Number(r.hourly_rate), created: r.created_at ?? undefined })
  for (const list of Object.values(h)) list.sort((a, b) => a.from.localeCompare(b.from) || (a.created ?? '').localeCompare(b.created ?? ''))
  return h
}

/**
 * The rate that applies to work done on `date`: the newest rate whose
 * effective_from is on or before that day. If every rate on record starts
 * after the day (the rate was entered after the work was done), the earliest
 * one is used so a back-dated run still pays rather than coming out $0.
 * null when the employee has no rate at all.
 */
export function rateOn(history: RateHistory, profileId: string, date: string): number | null {
  const list = history[profileId]
  if (!list || list.length === 0) return null
  let rate: number | null = null
  for (const r of list) {
    if (r.from <= date) rate = r.rate
    else break
  }
  return rate ?? list[0].rate
}

// ─── Day banding ──────────────────────────────────────────────────────────────

/**
 * Band one employee's (paid) hours for one day.
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

/**
 * Which entity "owns" an employee's day when they worked for more than one:
 * the one with the most hours (ties → first by id). The unpaid break is taken
 * from that entity's hours only, so it is never deducted twice in a day.
 */
export function primaryEntityForDay(hoursByEntity: Map<string, number>): string | null {
  let best: string | null = null
  let bestHours = -1
  for (const [eid, h] of [...hoursByEntity.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (h > bestHours) { best = eid; bestHours = h }
  }
  return best
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
  /**
   * What to report. Rows outside the scope are still loaded (and grouped) so
   * the unpaid break and the primary entity are decided on the whole day;
   * only the figures are filtered. Employee scope is applied in the query
   * because the break is per employee.
   */
  scope?: { entityId?: string; projectId?: string }
  holidays: Set<string>
  configs: Record<string, PayConfigEx>
  /** Every rate on record per employee; resolved per worked day with rateOn(). */
  rateHistory: RateHistory
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
  // Entity / project filters are NOT applied here (see CostInputs.scope).
  if (scope.employeeId) q = q.eq('profile_id', scope.employeeId)

  const [tsRes, holRes, entRes, rateRes, profRes, projRes] = await Promise.all([
    q,
    admin.from('public_holidays').select('date').gte('date', scope.from).lte('date', scope.to),
    admin.from('business_entities').select('id, name, pay_config'),
    admin.from('pay_rates').select('profile_id, hourly_rate, effective_from, created_at'),
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

  const rateHistory = buildRateHistory((rateRes.data ?? []) as RateRow[])

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
    scope: { entityId: scope.entityId || undefined, projectId: scope.projectId || undefined },
    holidays: new Set((holRes.data ?? []).map((h: any) => h.date as string)),
    configs,
    rateHistory,
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
  /** Hours worked (before any unpaid break). */
  hours: number
  cost: number
  /** Hours on loaded bands (OT 1.5×/2×, Sat, Sun, PH). */
  overtimeHours: number
  /** Cost of those loaded-band hours. */
  overtimeCost: number
  /** Unpaid break hours deducted before pay. */
  breakHours: number
}

export interface ProjectBucket extends CostBucket { entityId: string }
export interface EmployeeBucket extends CostBucket { projects: string[]; hasRate: boolean }

export interface EmployeeDayCost {
  profileId: string
  name: string
  date: string
  entityId: string
  projectIds: string[]
  /** Hours worked that day for this entity. */
  hours: number
  /** Hours paid after the unpaid break. */
  paidHours: number
  breakHours: number
  bandHours: Record<PayBand, number>
  cost: number
  overtimeHours: number
  overtimeCost: number
  overtimeStatus: string
}

export interface CostBreakdown {
  /** Hours worked (clock-in to clock-out), before breaks. */
  totalHours: number
  /** Hours paid, after unpaid breaks. */
  paidHours: number
  breakHours: number
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

interface DayGroup {
  profileId: string
  entityId: string
  date: string
  rows: CostRow[]
  total: number
  paid: number
  breakHours: number
  otApproved: boolean
  otStatus: string
}

/**
 * Group rows by employee + entity + day and apply the unpaid-break rule once
 * per employee-day (to the primary entity). Shared by the cost breakdown and
 * the payroll aggregators so they can never disagree.
 */
function groupDays(rows: CostRow[], configs: Record<string, PayConfigEx>): Map<string, DayGroup> {
  const groups = new Map<string, DayGroup>()
  for (const r of rows) {
    if (!r.profile_id || !r.business_entity_id) continue
    const key = `${r.profile_id}|${r.business_entity_id}|${r.work_date}`
    const g = groups.get(key) ?? {
      profileId: r.profile_id, entityId: r.business_entity_id, date: r.work_date,
      rows: [], total: 0, paid: 0, breakHours: 0, otApproved: false, otStatus: 'none',
    }
    g.rows.push(r)
    g.total = round2(g.total + r.hours)
    if (r.overtime_status === 'approved') { g.otApproved = true; g.otStatus = 'approved' }
    else if (r.overtime_status === 'pending' && g.otStatus === 'none') g.otStatus = 'pending'
    else if (r.overtime_status === 'rejected' && g.otStatus === 'none') g.otStatus = 'rejected'
    groups.set(key, g)
  }

  // Unpaid break: once per employee calendar day, from the primary entity.
  const byEmpDate = new Map<string, DayGroup[]>()
  for (const g of groups.values()) {
    const k = `${g.profileId}|${g.date}`
    byEmpDate.set(k, [...(byEmpDate.get(k) ?? []), g])
  }
  for (const list of byEmpDate.values()) {
    const hoursByEntity = new Map(list.map((g) => [g.entityId, g.total]))
    const dayTotal = round2(list.reduce((s, g) => s + g.total, 0))
    const primaryId = primaryEntityForDay(hoursByEntity)
    for (const g of list) {
      const rule = (configs[g.entityId] ?? normalizePayConfig(null)).unpaidBreak
      g.breakHours = g.entityId === primaryId ? Math.min(unpaidBreakHours(dayTotal, rule), g.total) : 0
      g.paid = round2(g.total - g.breakHours)
    }
  }
  return groups
}

export function computeLabourCost(inputs: CostInputs): CostBreakdown {
  const { rows, holidays, configs, rateHistory, flatRateIds } = inputs
  const entityScope = inputs.scope?.entityId
  const projectScope = inputs.scope?.projectId
  // Break and primary entity are decided on the FULL day (every entity and
  // project the employee worked); the scope only selects what is reported, so
  // a filtered report always reconciles with the unfiltered one and payroll.
  const groups = groupDays(rows, configs)

  const byBand = Object.fromEntries(PAY_BANDS.map((b) => [b, { hours: 0, cost: 0 }])) as Record<PayBand, { hours: number; cost: number }>
  const byProject = new Map<string, ProjectBucket>()
  const byEmployee = new Map<string, EmployeeBucket>()
  const byEntity = new Map<string, CostBucket>()
  const byLocation = { site: { hours: 0, cost: 0 }, workshop: { hours: 0, cost: 0 } }
  const empProjects = new Map<string, Set<string>>()
  const unrated = new Set<string>()
  const days: EmployeeDayCost[] = []

  let totalHours = 0, paidHours = 0, breakHours = 0, totalCost = 0, ordinaryCost = 0, overtimeHours = 0, overtimeCost = 0

  for (const g of groups.values()) {
    if (entityScope && g.entityId !== entityScope) continue
    const scopedRows = projectScope ? g.rows.filter((r) => r.project_id === projectScope) : g.rows
    if (scopedRows.length === 0) continue
    // Fraction of this employee-day that is in scope (1 unless a project
    // filter is on). The day's cost is apportioned to projects by hours, so
    // the in-scope share of every figure is this fraction of the day's figure.
    const scopedHours = projectScope ? round2(scopedRows.reduce((s, r) => s + r.hours, 0)) : g.total
    const f = g.total > 0 && scopedHours < g.total ? scopedHours / g.total : 1
    const sc = (v: number) => (f === 1 ? v : round2(v * f))

    const cfg = configs[g.entityId] ?? normalizePayConfig(null)
    // The rate in force on the day the work was done (a pay rise part-way
    // through a period only applies from its effective date).
    const rate = rateOn(rateHistory, g.profileId, g.date) ?? 0
    if (!(g.profileId in rateHistory)) unrated.add(g.profileId)
    const split = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    for (const [band, h] of Object.entries(split)) bandHours[band as PayBand] = h as number
    const { gross, bandCost } = grossPay(bandHours, rate, cfg)
    const dayOtHours = round2(LOADED_BANDS.reduce((s, b) => s + bandHours[b], 0))
    const dayOtCost = round2(LOADED_BANDS.reduce((s, b) => s + bandCost[b], 0))

    for (const b of PAY_BANDS) {
      byBand[b].hours = round2(byBand[b].hours + sc(bandHours[b]))
      byBand[b].cost = round2(byBand[b].cost + sc(bandCost[b]))
    }
    totalHours = round2(totalHours + sc(g.total))
    paidHours = round2(paidHours + sc(g.paid))
    breakHours = round2(breakHours + sc(g.breakHours))
    totalCost = round2(totalCost + sc(gross))
    ordinaryCost = round2(ordinaryCost + sc(bandCost.regular))
    overtimeHours = round2(overtimeHours + sc(dayOtHours))
    overtimeCost = round2(overtimeCost + sc(dayOtCost))

    const emp = bucket(byEmployee, g.profileId, () => ({
      id: g.profileId, name: inputs.employeeNames[g.profileId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0, projects: [], hasRate: g.profileId in rateHistory,
    }))
    emp.hours = round2(emp.hours + sc(g.total))
    emp.cost = round2(emp.cost + sc(gross))
    emp.overtimeHours = round2(emp.overtimeHours + sc(dayOtHours))
    emp.overtimeCost = round2(emp.overtimeCost + sc(dayOtCost))
    emp.breakHours = round2(emp.breakHours + sc(g.breakHours))

    const ent = bucket(byEntity, g.entityId, () => ({
      id: g.entityId, name: inputs.entityNames[g.entityId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0,
    }))
    ent.hours = round2(ent.hours + sc(g.total))
    ent.cost = round2(ent.cost + sc(gross))
    ent.overtimeHours = round2(ent.overtimeHours + sc(dayOtHours))
    ent.overtimeCost = round2(ent.overtimeCost + sc(dayOtCost))
    ent.breakHours = round2(ent.breakHours + sc(g.breakHours))

    // Apportion the day's cost across the rows (projects / locations) by hours.
    // Shares are always against the WHOLE day so a project filter never inflates
    // a project's slice.
    const projectIds = new Set<string>()
    for (const r of scopedRows) {
      const share = g.total > 0 ? r.hours / g.total : 0
      const rowCost = round2(gross * share)
      const rowOtHours = round2(dayOtHours * share)
      const rowOtCost = round2(dayOtCost * share)
      const rowBreak = round2(g.breakHours * share)

      if (r.project_id) {
        projectIds.add(r.project_id)
        const pr = bucket(byProject, r.project_id, () => ({
          id: r.project_id!, name: inputs.projectNames[r.project_id!] ?? 'Unknown', entityId: inputs.projectEntity[r.project_id!] ?? g.entityId,
          hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0,
        }))
        pr.hours = round2(pr.hours + r.hours)
        pr.cost = round2(pr.cost + rowCost)
        pr.overtimeHours = round2(pr.overtimeHours + rowOtHours)
        pr.overtimeCost = round2(pr.overtimeCost + rowOtCost)
        pr.breakHours = round2(pr.breakHours + rowBreak)
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
      hours: sc(g.total),
      paidHours: sc(g.paid),
      breakHours: sc(g.breakHours),
      bandHours: f === 1 ? bandHours : (Object.fromEntries(PAY_BANDS.map((b) => [b, sc(bandHours[b])])) as Record<PayBand, number>),
      cost: sc(gross),
      overtimeHours: sc(dayOtHours),
      overtimeCost: sc(dayOtCost),
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
    paidHours,
    breakHours,
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

// ─── Payroll aggregation (approval- and break-aware drop-ins for lib/payroll.ts) ─

export interface PayrollRow {
  profile_id: string
  work_date: string
  hours: number | string
  overtime_status?: string | null
  /** Needed so the unpaid break is taken once per day across entities. */
  business_entity_id?: string | null
  profiles?: { name?: string; email?: string } | null
}

export interface EmployeeBandTotals {
  profileId: string
  name: string
  email: string | null
  bandHours: Record<PayBand, number>
  /** Hours worked for this entity (before breaks). */
  totalHours: number
  /** Unpaid break hours deducted for this entity. */
  breakHours: number
}

export interface EmployeeBandsByDay {
  profileId: string
  name: string
  email: string | null
  /** band → (work_date → hours on that date). Only bands/dates with hours appear. */
  byBand: Record<PayBand, Record<string, number>>
  totalHours: number
  breakHours: number
}

export interface AggregateOptions {
  /**
   * The entity this pay run is for. Rows from other entities are used only to
   * decide the unpaid break for the day; they never contribute hours.
   * When omitted, every row is treated as one entity.
   */
  entityId?: string
}

function payrollGroups(rows: PayrollRow[], cfg: PayConfigEx, opts: AggregateOptions) {
  const entityId = opts.entityId ?? '__all__'
  const costRows: CostRow[] = rows
    .filter((r) => r.profile_id)
    .map((r) => ({
      profile_id: r.profile_id,
      project_id: null,
      business_entity_id: opts.entityId ? (r.business_entity_id ?? entityId) : entityId,
      work_location: 'site',
      work_date: r.work_date,
      hours: Number(r.hours),
      overtime_status: r.overtime_status ?? null,
      status: 'approved',
    }))
  const meta = new Map<string, { name: string; email: string | null }>()
  for (const r of rows) {
    if (!r.profile_id) continue
    if (!opts.entityId || (r.business_entity_id ?? entityId) === entityId) {
      meta.set(r.profile_id, { name: r.profiles?.name ?? 'Unknown', email: r.profiles?.email ?? null })
    }
  }
  // Every entity gets this run's config for the break rule; only this entity's
  // groups are banded, so other entities' multipliers never matter here.
  const configs = Object.fromEntries(
    [...new Set(costRows.map((r) => r.business_entity_id))].map((id) => [id, cfg]),
  ) as Record<string, PayConfigEx>
  const groups = [...groupDays(costRows, configs).values()].filter((g) => g.entityId === entityId)
  return { groups, meta }
}

/**
 * Per-employee band hours for a pay run. Same output shape as
 * `aggregatePayroll` in lib/payroll.ts, but honours the entity's
 * `overtimeRequiresApproval` rule (PRD §10) and the unpaid-break rule.
 */
export function aggregateEmployeeBands(
  rows: PayrollRow[],
  holidays: Set<string>,
  cfg: PayConfigEx,
  flatRateIds: Set<string> = new Set(),
  opts: AggregateOptions = {},
): EmployeeBandTotals[] {
  const { groups, meta } = payrollGroups(rows, cfg, opts)
  const byEmp = new Map<string, EmployeeBandTotals>()
  for (const g of groups) {
    const m = meta.get(g.profileId)
    if (!m) continue
    const e = byEmp.get(g.profileId) ?? {
      profileId: g.profileId, name: m.name, email: m.email,
      bandHours: Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>,
      totalHours: 0, breakHours: 0,
    }
    const split = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    for (const [band, h] of Object.entries(split)) e.bandHours[band as PayBand] = round2(e.bandHours[band as PayBand] + (h as number))
    e.totalHours = round2(e.totalHours + g.total)
    e.breakHours = round2(e.breakHours + g.breakHours)
    byEmp.set(g.profileId, e)
  }
  return [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Like aggregateEmployeeBands but split by date, for the Xero timesheet push. */
export function aggregateEmployeeBandsByDay(
  rows: PayrollRow[],
  holidays: Set<string>,
  cfg: PayConfigEx,
  flatRateIds: Set<string> = new Set(),
  opts: AggregateOptions = {},
): EmployeeBandsByDay[] {
  const { groups, meta } = payrollGroups(rows, cfg, opts)
  const byEmp = new Map<string, EmployeeBandsByDay>()
  for (const g of groups) {
    const m = meta.get(g.profileId)
    if (!m) continue
    const e = byEmp.get(g.profileId) ?? {
      profileId: g.profileId, name: m.name, email: m.email,
      byBand: Object.fromEntries(PAY_BANDS.map((b) => [b, {} as Record<string, number>])) as Record<PayBand, Record<string, number>>,
      totalHours: 0, breakHours: 0,
    }
    const split = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    for (const [band, h] of Object.entries(split)) {
      e.byBand[band as PayBand][g.date] = round2((e.byBand[band as PayBand][g.date] ?? 0) + (h as number))
    }
    e.totalHours = round2(e.totalHours + g.total)
    e.breakHours = round2(e.breakHours + g.breakHours)
    byEmp.set(g.profileId, e)
  }
  return [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function money(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
