import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient, createAdminClient } from '@/lib/server'
import { createPayRun, checkLabourCostThresholds } from '@/lib/payroll-run'
import { normalizePayCycle, lastCompletedPeriod } from '@/lib/pay-cycle'
import { notifyAdmins } from '@/lib/notify-admins'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Automatic pay run at period end (default on; Settings → Pay cycle).
 *
 *   POST /api/payroll/auto-run            header x-cron-secret: <settings.cron_secret>
 *   POST /api/payroll/auto-run            signed-in admin ("Run now" in Settings)
 *   body (optional): { periodStart, periodEnd, entityId }
 *
 * Finds the last completed pay period (or uses the body override) and creates
 * a draft run for every active entity that has none yet. Idempotent: entities
 * that already have an overlapping run are skipped; entities with no approved
 * attendance get an admin reminder instead of a run. The cron handles each
 * period once (settings.auto_pay_run.lastPeriodEnd), so a run an admin
 * deleted on purpose is not re-created the next night.
 */
export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  // Auth: cron secret (constant-time compare) OR an admin session that has
  // passed its second factor if it has one (the middleware only lets the
  // header-less browser call through once AAL2 is satisfied).
  const { data: secretRow } = await admin.from('settings').select('value').eq('key', 'cron_secret').maybeSingle()
  const secret = (secretRow?.value as any)?.secret as string | undefined
  const sent = req.headers.get('x-cron-secret')
  const secretOk = !!secret && !!sent && sent.length === secret.length
    && timingSafeEqual(Buffer.from(sent), Buffer.from(secret))
  let authorised = secretOk
  let manual = false
  if (!authorised && !sent) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await supabase.from('profiles').select('role, status').eq('id', user.id).maybeSingle()
      const hasFactor = (user.factors ?? []).some((f) => f.status === 'verified')
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      authorised = me?.role === 'admin' && me?.status === 'active' && (!hasFactor || aal?.currentLevel === 'aal2')
      manual = authorised
    }
  }
  if (!authorised) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { periodStart?: string; periodEnd?: string; entityId?: string }
  if (body.entityId !== undefined && !UUID.test(String(body.entityId))) {
    return NextResponse.json({ error: 'entityId must be a UUID' }, { status: 400 })
  }
  const hasOverride = body.periodStart !== undefined || body.periodEnd !== undefined
  if (hasOverride) {
    if (!ISO_DAY.test(String(body.periodStart)) || !ISO_DAY.test(String(body.periodEnd)) || String(body.periodStart) > String(body.periodEnd)) {
      return NextResponse.json({ error: 'periodStart and periodEnd must be YYYY-MM-DD with start on or before end' }, { status: 400 })
    }
  }

  const { data: settingRows } = await admin.from('settings').select('key, value').in('key', ['auto_pay_run', 'pay_cycle'])
  const byKey = Object.fromEntries((settingRows ?? []).map((r: any) => [r.key, r.value]))
  const autoCfg = ((byKey.auto_pay_run as Record<string, unknown> | null) ?? {}) as { enabled?: boolean; lastPeriodEnd?: string }
  const enabled = autoCfg.enabled !== false
  if (!enabled && !manual) return NextResponse.json({ skipped: 'auto_pay_run disabled' })

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
  const cycle = normalizePayCycle(byKey.pay_cycle)
  const period = hasOverride
    ? { start: String(body.periodStart), end: String(body.periodEnd) }
    : lastCompletedPeriod(cycle, today)
  if (period.end > today) return NextResponse.json({ skipped: 'period not finished', period })

  // The scheduled run handles each period once. "Run now" and body overrides
  // always go through (the overlap guard in createPayRun still applies).
  if (!manual && !hasOverride && autoCfg.lastPeriodEnd === period.end) {
    return NextResponse.json({ skipped: 'period already handled', period })
  }

  let entQ = admin.from('business_entities').select('id, name').eq('status', 'active').order('name')
  if (body.entityId) entQ = entQ.eq('id', body.entityId)
  const { data: entities, error: entErr } = await entQ
  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  const results: any[] = []
  let created = 0
  for (const e of (entities ?? []) as { id: string; name: string }[]) {
    const r = await createPayRun(admin, e.id, period.start, period.end, manual ? 'manual' : 'auto', { checkThresholds: false })
    if ('error' in r) {
      if (r.code === 'no_attendance') {
        // Nothing approved yet: remind admins once per entity per period.
        const title = `Pay period ended — ${e.name}`
        const { data: already } = await admin
          .from('notifications')
          .select('id')
          .eq('type', 'pay_period_ended')
          .eq('title', title)
          .gte('created_at', `${period.end}T00:00:00Z`)
          .limit(1)
        if (!already?.length) {
          await notifyAdmins(
            'pay_period_ended',
            title,
            `${e.name} ${period.start} – ${period.end}: no approved attendance yet, so no pay run was created. Approve attendance on the Attendance page, then create the run from the Payroll page (or Settings → Run now).`,
          )
        }
      }
      results.push({ entity: e.name, created: false, reason: r.code ?? 'error', message: r.error })
    } else {
      created++
      results.push({ entity: e.name, created: true, runId: r.id, employees: r.entries, gross: r.gross })
    }
  }

  // PRD §18 budget alerts: once per call, not once per entity.
  if (created > 0) await checkLabourCostThresholds(admin, period.end)

  // Remember the period so the nightly job does not re-create a deleted run.
  if (!hasOverride && !body.entityId) {
    await admin
      .from('settings')
      .upsert({ key: 'auto_pay_run', value: { ...autoCfg, enabled, lastPeriodEnd: period.end } }, { onConflict: 'key' })
  }

  return NextResponse.json({ period, results, source: manual ? 'manual' : 'cron' })
}
