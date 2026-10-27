/**
 * Labour cost engine (PRD §11) shared by the dashboard, reports, project
 * budgets, payroll, the Xero push and the CSV / Excel exports.
 *
 * Bands each employee-day into ordinary / overtime / weekend / public-holiday
 * hours, prices it with the rate in force that day, then apportions the day's
 * hours and cost across the projects and work locations worked that day
 * pro-rata by hours. Payroll uses the same grouping, so reports reconcile.
 *
 * Build One rules (Robbie's list, 20 Oct 2026) — fixed, no settings screen:
 *  - TV1  30 minutes unpaid break on any day of 5 hours or more.
 *  - TV2  Regular hours capped at 7.6 a day; anything over is overtime.
 *  - TV3  Overtime is pending and UNPAID until an approver approves it; once
 *         approved it is paid at the overtime rates (first 2 h at tier 1, then
 *         tier 2). Weekend and public-holiday hours are paid at their loading
 *         without approval (they are never "regular").
 *  - TV6  Hours are costed against the project's company; wages go to the
 *         employee's own employer (profiles.employer_entity_id) — payroll
 *         aggregation groups by employer, cost reports by project.
 *  - PAY-04 Each worked day is priced with the pay rate in force that day.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyDay, grossPay, PAY_BANDS, type PayBand, type PayConfig } from '@/lib/payroll'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Fixed rules ──────────────────────────────────────────────────────────────

/** TV1: minutes deducted once a day on any day of UNPAID_BREAK_MIN_HOURS or more. */
export const UNPAID_BREAK_MINUTES = 30
export const UNPAID_BREAK_MIN_HOURS = 5
/** TV2: regular (ordinary) hours per day; everything over is overtime. */
export const REGULAR_HOURS_CAP = 7.6
/** First this many overtime hours are tier 1 (1.5× by default), the rest tier 2 (2×). */
export const OVERTIME_TIER1_HOURS = 2

export interface UnpaidBreakRule {
  enabled: boolean
  minutes: number
  afterHours: number
}

/** The one rule in force (kept as an object so older callers keep working). */
export const DEFAULT_UNPAID_BREAK: UnpaidBreakRule = { enabled: true, minutes: UNPAID_BREAK_MINUTES, afterHours: UNPAID_BREAK_MIN_HOURS }

/** Pay config with the approval flag and the break rule (same jsonb column). */
export interface PayConfigEx extends PayConfig {
  overtimeRequiresApproval?: boolean
  unpaidBreak?: UnpaidBreakRule
}

export const DEFAULT_PAY_CONFIG: PayConfig = {
  standardDailyHours: REGULAR_HOURS_CAP,
  weekdayTiers: [
    { band: 'regular', fromHour: 0, toHour: REGULAR_HOURS_CAP, multiplier: 1 },
    { band: 'overtime_t1', fromHour: REGULAR_HOURS_CAP, toHour: round2(REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS), multiplier: 1.5 },
    { band: 'overtime_t2', fromHour: round2(REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS), toHour: null, multiplier: 2 },
  ],
  saturdayMultiplier: 1.5,
  sundayMultiplier: 2,
  publicHolidayMultiplier: 2.5,
}

/** Bands that carry overtime / penalty loading (everything except ordinary). */
export const LOADED_BANDS: PayBand[] = ['overtime_t1', 'overtime_t2', 'saturday', 'sunday', 'public_holiday']

/** Keys stored inside payroll_entries.band_hours beside the pay bands. */
export const UNPAID_BREAK_KEY = 'unpaid_break'
export const PENDING_OVERTIME_KEY = 'pending_overtime'

/** The break rule is fixed; any stored value is ignored. */
export function normalizeUnpaidBreak(_raw: unknown): UnpaidBreakRule {
  return { ...DEFAULT_UNPAID_BREAK }
}

/**
 * Read an entity's pay_config. The weekday ladder boundaries and the break are
 * fixed by the Build One rules; only the multipliers (overtime tiers, Saturday,
 * Sunday, public holiday) come from the stored config (Entities → Pay settings).
 */
export function normalizePayConfig(raw: unknown): PayConfigEx {
  const c = (raw ?? {}) as Partial<PayConfigEx>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d)
  const storedMult = (band: string, d: number) => {
    const t = Array.isArray(c.weekdayTiers) ? c.weekdayTiers.find((x) => x && x.band === band) : undefined
    return num(t?.multiplier, d)
  }
  return {
    standardDailyHours: REGULAR_HOURS_CAP,
    weekdayTiers: [
      { band: 'regular', fromHour: 0, toHour: REGULAR_HOURS_CAP, multiplier: 1 },
      { band: 'overtime_t1', fromHour: REGULAR_HOURS_CAP, toHour: round2(REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS), multiplier: storedMult('overtime_t1', 1.5) },
      { band: 'overtime_t2', fromHour: round2(REGULAR_HOURS_CAP + OVERTIME_TIER1_HOURS), toHour: null, multiplier: storedMult('overtime_t2', 2) },
    ],
    saturdayMultiplier: num(c.saturdayMultiplier, DEFAULT_PAY_CONFIG.saturdayMultiplier),
    sundayMultiplier: num(c.sundayMultiplier, DEFAULT_PAY_CONFIG.sundayMultiplier),
    publicHolidayMultiplier: num(c.publicHolidayMultiplier, DEFAULT_PAY_CONFIG.publicHolidayMultiplier),
    overtimeRequiresApproval: true,
    unpaidBreak: { ...DEFAULT_UNPAID_BREAK },
  }
}

/** Hours deducted from a day of `dayHours` (0 when the day is under the threshold). */
export function unpaidBreakHours(dayHours: number, _rule?: UnpaidBreakRule): number {
  if (dayHours + 1e-9 < UNPAID_BREAK_MIN_HOURS) return 0
  return round2(Math.min(UNPAID_BREAK_MINUTES / 60, dayHours))
}

// ─── Pay rates by date (PAY-04) ───────────────────────────────────────────────

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

export interface DayBanding {
  /** Paid hours per band. */
  bands: Partial<Record<PayBand, number>>
  /** Weekday hours over the cap whose overtime is not approved: unpaid for now. */
  pendingOvertime: number
}

/**
 * Band one employee's PAID hours (after the break) for one day.
 *  - flat-rate workers: everything ordinary (no cap, no loading).
 *  - weekend / public holiday: everything at that day's loading.
 *  - weekday: up to 7.6 h ordinary; the rest is overtime — paid on the tier
 *    ladder when approved, otherwise held as pending (unpaid).
 */
export function bandEmployeeDay(
  paidHours: number,
  dateISO: string,
  holidays: Set<string>,
  cfg: PayConfigEx,
  isFlatRate: boolean,
  overtimeApproved: boolean,
): DayBanding {
  if (paidHours <= 0) return { bands: {}, pendingOvertime: 0 }
  if (isFlatRate) return { bands: { regular: round2(paidHours) }, pendingOvertime: 0 }
  const dayType = classifyDay(dateISO, holidays.has(dateISO))
  if (dayType !== 'weekday') return { bands: { [dayType]: round2(paidHours) }, pendingOvertime: 0 }
  const regular = round2(Math.min(paidHours, REGULAR_HOURS_CAP))
  const over = round2(paidHours - regular)
  const bands: Partial<Record<PayBand, number>> = { regular }
  if (over <= 0) return { bands, pendingOvertime: 0 }
  if (!overtimeApproved) return { bands, pendingOvertime: over }
  for (const t of cfg.weekdayTiers) {
    if (t.band === 'regular') continue
    const upper = t.toHour ?? Infinity
    const h = round2(Math.max(0, Math.min(paidHours, upper) - t.fromHour))
    if (h > 0) bands[t.band] = round2((bands[t.band] ?? 0) + h)
  }
  return { bands, pendingOvertime: 0 }
}

/**
 * Which company "owns" an employee's day for COST purposes when they worked
 * for more than one: the one with the most hours (ties → first by id). The
 * unpaid break is costed against that company only.
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

export interface OvertimeDecision {
  status: 'pending' | 'approved' | 'rejected'
  /** The approver the worker chose (or who decided). */
  approverId: string | null
  approverName: string | null
  decidedAt: string | null
}

export interface CostInputs {
  rows: CostRow[]
  /**
   * What to report. Rows outside the scope are still loaded (and grouped) so
   * the unpaid break and the primary company are decided on the whole day;
   * only the figures are filtered. Employee scope is applied in the query
   * because the break is per employee.
   */
  scope?: { entityId?: string; projectId?: string }
  holidays: Set<string>
  configs: Record<string, PayConfigEx>
  /** Every rate on record per employee; resolved per worked day with rateOn(). */
  rateHistory: RateHistory
  flatRateIds: Set<string>
  /** People with no automatic unpaid break (profiles.unpaid_break_exempt, 0037). */
  breakExemptIds?: Set<string>
  employeeNames: Record<string, string>
  projectNames: Record<string, string>
  projectEntity: Record<string, string>
  entityNames: Record<string, string>
  /** `${profileId}|${date}` → the overtime request's approver / decision. */
  otDecisions?: Record<string, OvertimeDecision>
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
    .select('id, profile_id, project_id, business_entity_id, work_location, work_date, hours, overtime_status, status, profiles!inner(status)')
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
    admin.from('profiles').select('id, name, flat_rate, unpaid_break_exempt'),
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
  const breakExemptIds = new Set<string>()
  for (const p of (profRes.data ?? []) as any[]) {
    employeeNames[p.id] = p.name
    if (p.flat_rate) flatRateIds.add(p.id)
    if (p.unpaid_break_exempt) breakExemptIds.add(p.id)
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

  // Overtime requests for these timesheets → who approved, and when (TV3 / TV4).
  const otDecisions: Record<string, OvertimeDecision> = {}
  const tsIds = ((tsRes.data ?? []) as any[]).filter((r) => r.overtime_status && r.overtime_status !== 'none').map((r) => r.id as string)
  if (tsIds.length) {
    const { data: ots } = await admin
      .from('overtime_requests')
      .select('timesheet_id, status, supervisor_id, decided_by, decided_at')
      .in('timesheet_id', tsIds)
    const byTs = new Map(((tsRes.data ?? []) as any[]).map((r) => [r.id as string, r]))
    for (const o of (ots ?? []) as any[]) {
      const t = byTs.get(o.timesheet_id)
      if (!t) continue
      const approverId = (o.decided_by ?? o.supervisor_id ?? null) as string | null
      otDecisions[`${t.profile_id}|${t.work_date}`] = {
        status: o.status,
        approverId,
        approverName: approverId ? (employeeNames[approverId] ?? null) : null,
        decidedAt: o.decided_at ?? null,
      }
    }
  }

  return {
    rows,
    scope: { entityId: scope.entityId || undefined, projectId: scope.projectId || undefined },
    holidays: new Set((holRes.data ?? []).map((h: any) => h.date as string)),
    configs,
    rateHistory,
    flatRateIds,
    breakExemptIds,
    employeeNames,
    projectNames,
    projectEntity,
    entityNames,
    otDecisions,
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
  /** Overtime hours awaiting approval (unpaid until approved). */
  pendingOvertimeHours: number
}

export interface ProjectBucket extends CostBucket { entityId: string }
export interface EmployeeBucket extends CostBucket { projects: string[]; hasRate: boolean }

/** TV7: hours per project per employee — no dollar figures. */
export interface ProjectEmployeeHours {
  projectId: string
  projectName: string
  entityId: string
  entityName: string
  profileId: string
  employeeName: string
  regularHours: number
  overtimeHours: number
  pendingOvertimeHours: number
  breakHours: number
  /** Hours worked on the project (before the break). */
  workedHours: number
  /** Paid hours on the project (regular + overtime). */
  paidHours: number
}

export interface EmployeeDayCost {
  profileId: string
  name: string
  date: string
  entityId: string
  projectIds: string[]
  /** Hours worked that day for this entity. */
  hours: number
  /** Hours paid after the unpaid break (and excluding pending overtime). */
  paidHours: number
  breakHours: number
  pendingOvertimeHours: number
  bandHours: Record<PayBand, number>
  cost: number
  overtimeHours: number
  overtimeCost: number
  overtimeStatus: string
  approverName: string | null
  decidedAt: string | null
}

export interface CostBreakdown {
  /** Hours worked (clock-in to clock-out), before breaks. */
  totalHours: number
  /** Hours paid, after unpaid breaks and excluding pending overtime. */
  paidHours: number
  breakHours: number
  pendingOvertimeHours: number
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
  byProjectEmployee: ProjectEmployeeHours[]
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
function groupDays(rows: CostRow[], configs: Record<string, PayConfigEx>, breakExemptIds?: Set<string>): Map<string, DayGroup> {
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
    const rule = (configs[primaryId ?? ''] ?? normalizePayConfig(null)).unpaidBreak
    // Per-person exception (0037): no automatic break for this employee.
    const exempt = breakExemptIds?.has(list[0].profileId) === true
    for (const g of list) {
      g.breakHours = !exempt && g.entityId === primaryId ? Math.min(unpaidBreakHours(dayTotal, rule), g.total) : 0
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
  const groups = groupDays(rows, configs, inputs.breakExemptIds)

  const byBand = Object.fromEntries(PAY_BANDS.map((b) => [b, { hours: 0, cost: 0 }])) as Record<PayBand, { hours: number; cost: number }>
  const byProject = new Map<string, ProjectBucket>()
  const byEmployee = new Map<string, EmployeeBucket>()
  const byEntity = new Map<string, CostBucket>()
  const byProjectEmployee = new Map<string, ProjectEmployeeHours>()
  const byLocation = { site: { hours: 0, cost: 0 }, workshop: { hours: 0, cost: 0 } }
  const empProjects = new Map<string, Set<string>>()
  const unrated = new Set<string>()
  const days: EmployeeDayCost[] = []

  let totalHours = 0, paidHours = 0, breakHours = 0, pendingOvertimeHours = 0
  let totalCost = 0, ordinaryCost = 0, overtimeHours = 0, overtimeCost = 0

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
    const banding = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    const bandHours = Object.fromEntries(PAY_BANDS.map((b) => [b, 0])) as Record<PayBand, number>
    for (const [band, h] of Object.entries(banding.bands)) bandHours[band as PayBand] = h as number
    const { gross, bandCost } = grossPay(bandHours, rate, cfg)
    const dayOtHours = round2(LOADED_BANDS.reduce((s, b) => s + bandHours[b], 0))
    const dayOtCost = round2(LOADED_BANDS.reduce((s, b) => s + bandCost[b], 0))
    const dayPaid = round2(g.paid - banding.pendingOvertime)
    const decision = inputs.otDecisions?.[`${g.profileId}|${g.date}`]

    for (const b of PAY_BANDS) {
      byBand[b].hours = round2(byBand[b].hours + sc(bandHours[b]))
      byBand[b].cost = round2(byBand[b].cost + sc(bandCost[b]))
    }
    totalHours = round2(totalHours + sc(g.total))
    paidHours = round2(paidHours + sc(dayPaid))
    breakHours = round2(breakHours + sc(g.breakHours))
    pendingOvertimeHours = round2(pendingOvertimeHours + sc(banding.pendingOvertime))
    totalCost = round2(totalCost + sc(gross))
    ordinaryCost = round2(ordinaryCost + sc(bandCost.regular))
    overtimeHours = round2(overtimeHours + sc(dayOtHours))
    overtimeCost = round2(overtimeCost + sc(dayOtCost))

    const emp = bucket(byEmployee, g.profileId, () => ({
      id: g.profileId, name: inputs.employeeNames[g.profileId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0, pendingOvertimeHours: 0, projects: [], hasRate: g.profileId in rateHistory,
    }))
    emp.hours = round2(emp.hours + sc(g.total))
    emp.cost = round2(emp.cost + sc(gross))
    emp.overtimeHours = round2(emp.overtimeHours + sc(dayOtHours))
    emp.overtimeCost = round2(emp.overtimeCost + sc(dayOtCost))
    emp.breakHours = round2(emp.breakHours + sc(g.breakHours))
    emp.pendingOvertimeHours = round2(emp.pendingOvertimeHours + sc(banding.pendingOvertime))

    const ent = bucket(byEntity, g.entityId, () => ({
      id: g.entityId, name: inputs.entityNames[g.entityId] ?? 'Unknown', hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0, pendingOvertimeHours: 0,
    }))
    ent.hours = round2(ent.hours + sc(g.total))
    ent.cost = round2(ent.cost + sc(gross))
    ent.overtimeHours = round2(ent.overtimeHours + sc(dayOtHours))
    ent.overtimeCost = round2(ent.overtimeCost + sc(dayOtCost))
    ent.breakHours = round2(ent.breakHours + sc(g.breakHours))
    ent.pendingOvertimeHours = round2(ent.pendingOvertimeHours + sc(banding.pendingOvertime))

    // Apportion the day's hours and cost across the rows (projects / locations)
    // by hours. Shares are always against the WHOLE day so a project filter
    // never inflates a project's slice.
    const projectIds = new Set<string>()
    for (const r of scopedRows) {
      const share = g.total > 0 ? r.hours / g.total : 0
      const rowCost = round2(gross * share)
      const rowOtHours = round2(dayOtHours * share)
      const rowOtCost = round2(dayOtCost * share)
      const rowBreak = round2(g.breakHours * share)
      const rowPending = round2(banding.pendingOvertime * share)
      const rowRegular = round2(bandHours.regular * share)

      if (r.project_id) {
        projectIds.add(r.project_id)
        const pr = bucket(byProject, r.project_id, () => ({
          id: r.project_id!, name: inputs.projectNames[r.project_id!] ?? 'Unknown', entityId: inputs.projectEntity[r.project_id!] ?? g.entityId,
          hours: 0, cost: 0, overtimeHours: 0, overtimeCost: 0, breakHours: 0, pendingOvertimeHours: 0,
        }))
        pr.hours = round2(pr.hours + r.hours)
        pr.cost = round2(pr.cost + rowCost)
        pr.overtimeHours = round2(pr.overtimeHours + rowOtHours)
        pr.overtimeCost = round2(pr.overtimeCost + rowOtCost)
        pr.breakHours = round2(pr.breakHours + rowBreak)
        pr.pendingOvertimeHours = round2(pr.pendingOvertimeHours + rowPending)
        const set = empProjects.get(g.profileId) ?? new Set<string>()
        set.add(r.project_id)
        empProjects.set(g.profileId, set)

        const peKey = `${r.project_id}|${g.profileId}`
        const pe = byProjectEmployee.get(peKey) ?? {
          projectId: r.project_id, projectName: inputs.projectNames[r.project_id] ?? 'Unknown',
          entityId: inputs.projectEntity[r.project_id] ?? g.entityId,
          entityName: inputs.entityNames[inputs.projectEntity[r.project_id] ?? g.entityId] ?? 'Unknown',
          profileId: g.profileId, employeeName: inputs.employeeNames[g.profileId] ?? 'Unknown',
          regularHours: 0, overtimeHours: 0, pendingOvertimeHours: 0, breakHours: 0, workedHours: 0, paidHours: 0,
        }
        pe.regularHours = round2(pe.regularHours + rowRegular)
        pe.overtimeHours = round2(pe.overtimeHours + rowOtHours)
        pe.pendingOvertimeHours = round2(pe.pendingOvertimeHours + rowPending)
        pe.breakHours = round2(pe.breakHours + rowBreak)
        pe.workedHours = round2(pe.workedHours + r.hours)
        pe.paidHours = round2(pe.paidHours + rowRegular + rowOtHours)
        byProjectEmployee.set(peKey, pe)
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
      paidHours: sc(dayPaid),
      breakHours: sc(g.breakHours),
      pendingOvertimeHours: sc(banding.pendingOvertime),
      bandHours: f === 1 ? bandHours : (Object.fromEntries(PAY_BANDS.map((b) => [b, sc(bandHours[b])])) as Record<PayBand, number>),
      cost: sc(gross),
      overtimeHours: sc(dayOtHours),
      overtimeCost: sc(dayOtCost),
      overtimeStatus: g.otStatus,
      approverName: decision?.approverName ?? null,
      decidedAt: decision?.decidedAt ?? null,
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
    pendingOvertimeHours,
    totalCost,
    ordinaryCost,
    overtimeHours,
    overtimeCost,
    unratedEmployees: [...unrated].map((id) => inputs.employeeNames[id] ?? id).sort(),
    byBand,
    byProject: [...byProject.values()].sort(byCost),
    byEmployee: [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name)),
    byEntity: [...byEntity.values()].sort(byCost),
    byProjectEmployee: [...byProjectEmployee.values()].sort((a, b) =>
      a.entityName.localeCompare(b.entityName) || a.projectName.localeCompare(b.projectName) || a.employeeName.localeCompare(b.employeeName)),
    byLocation,
    days: days.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
  }
}

/** Convenience: load + compute in one call. */
export async function labourCost(admin: SupabaseClient, scope: CostScope): Promise<CostBreakdown> {
  return computeLabourCost(await loadCostInputs(admin, scope))
}

// ─── Payroll aggregation (approval- and break-aware; grouped by EMPLOYER) ─────

export interface PayrollRow {
  profile_id: string
  work_date: string
  hours: number | string
  overtime_status?: string | null
  /** The company whose project the hours were worked on. */
  business_entity_id?: string | null
  profiles?: { name?: string; email?: string; employer_entity_id?: string | null; unpaid_break_exempt?: boolean | null } | null
}

export interface EmployeeBandTotals {
  profileId: string
  name: string
  email: string | null
  bandHours: Record<PayBand, number>
  /** Hours worked (before breaks), all projects / companies. */
  totalHours: number
  /** Unpaid break hours deducted. */
  breakHours: number
  /** Overtime awaiting approval — not paid in this run. */
  pendingOvertimeHours: number
}

export interface EmployeeBandsByDay {
  profileId: string
  name: string
  email: string | null
  /** band → (work_date → hours on that date). Only bands/dates with hours appear. */
  byBand: Record<PayBand, Record<string, number>>
  totalHours: number
  breakHours: number
  pendingOvertimeHours: number
}

export interface AggregateOptions {
  /**
   * The company this pay run is for. With `employerOf`, every employee whose
   * EMPLOYER is this company is included with all their hours (whichever
   * company's project they worked on — TV6). Without it, rows are matched
   * on the company they were worked for (legacy behaviour).
   */
  entityId?: string
  /** profile id → employer company id (profiles.employer_entity_id). */
  employerOf?: Record<string, string | null | undefined>
  /** People with no automatic unpaid break (0037). Rows whose `profiles.unpaid_break_exempt` is true are added automatically. */
  breakExemptIds?: Set<string>
}

function payrollGroups(rows: PayrollRow[], cfg: PayConfigEx, opts: AggregateOptions) {
  const entityId = opts.entityId ?? '__all__'
  const payCompany = (r: PayrollRow): string => {
    if (!opts.entityId) return entityId
    const employer = opts.employerOf?.[r.profile_id] ?? r.profiles?.employer_entity_id ?? null
    return employer ?? r.business_entity_id ?? entityId
  }
  const costRows: CostRow[] = rows
    .filter((r) => r.profile_id)
    .map((r) => ({
      profile_id: r.profile_id,
      project_id: null,
      business_entity_id: payCompany(r),
      work_location: 'site',
      work_date: r.work_date,
      hours: Number(r.hours),
      overtime_status: r.overtime_status ?? null,
      status: 'approved',
    }))
  const meta = new Map<string, { name: string; email: string | null }>()
  for (const r of rows) {
    if (!r.profile_id) continue
    if (!opts.entityId || payCompany(r) === entityId) {
      meta.set(r.profile_id, { name: r.profiles?.name ?? 'Unknown', email: r.profiles?.email ?? null })
    }
  }
  // Every company gets this run's config for the break rule; only this
  // company's groups are banded, so other companies' multipliers never matter.
  const configs = Object.fromEntries(
    [...new Set(costRows.map((r) => r.business_entity_id))].map((id) => [id, cfg]),
  ) as Record<string, PayConfigEx>
  const breakExemptIds = new Set<string>(opts.breakExemptIds ?? [])
  for (const r of rows) if (r.profile_id && r.profiles?.unpaid_break_exempt) breakExemptIds.add(r.profile_id)
  const groups = [...groupDays(costRows, configs, breakExemptIds).values()].filter((g) => g.entityId === entityId)
  return { groups, meta }
}

/**
 * Per-employee band hours for a pay run. Honours the fixed rules (break, 7.6 h
 * cap, overtime pending until approved) and groups by employer (TV6).
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
      totalHours: 0, breakHours: 0, pendingOvertimeHours: 0,
    }
    const banding = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    for (const [band, h] of Object.entries(banding.bands)) e.bandHours[band as PayBand] = round2(e.bandHours[band as PayBand] + (h as number))
    e.totalHours = round2(e.totalHours + g.total)
    e.breakHours = round2(e.breakHours + g.breakHours)
    e.pendingOvertimeHours = round2(e.pendingOvertimeHours + banding.pendingOvertime)
    byEmp.set(g.profileId, e)
  }
  return [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Like aggregateEmployeeBands but split by date, for the Xero timesheet push and per-day pricing. */
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
      totalHours: 0, breakHours: 0, pendingOvertimeHours: 0,
    }
    const banding = bandEmployeeDay(g.paid, g.date, holidays, cfg, flatRateIds.has(g.profileId), g.otApproved)
    for (const [band, h] of Object.entries(banding.bands)) {
      e.byBand[band as PayBand][g.date] = round2((e.byBand[band as PayBand][g.date] ?? 0) + (h as number))
    }
    e.totalHours = round2(e.totalHours + g.total)
    e.breakHours = round2(e.breakHours + g.breakHours)
    e.pendingOvertimeHours = round2(e.pendingOvertimeHours + banding.pendingOvertime)
    byEmp.set(g.profileId, e)
  }
  return [...byEmp.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** profile id → employer company id, from rows that carry the profile join. */
export function employerMap(rows: PayrollRow[]): Record<string, string | null | undefined> {
  const m: Record<string, string | null | undefined> = {}
  for (const r of rows) if (r.profile_id && !(r.profile_id in m)) m[r.profile_id] = r.profiles?.employer_entity_id ?? null
  return m
}

export function money(n: number): string {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
