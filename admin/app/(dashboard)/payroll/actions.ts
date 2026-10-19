'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'
import { computePayrollEntries, checkLabourCostThresholds, createPayRun } from '@/lib/payroll-run'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export async function generatePayrollAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const businessEntityId = formData.get('business_entity_id') as string
  const periodStart = formData.get('period_start') as string
  const periodEnd = formData.get('period_end') as string

  if (!businessEntityId || !periodStart || !periodEnd) return 'All fields are required.'
  if (periodStart > periodEnd) return 'Period start must be on or before period end.'

  const admin = createAdminClient()
  const result = await createPayRun(admin, businessEntityId, periodStart, periodEnd, 'manual')
  if ('error' in result) return result.error

  revalidatePath('/payroll')
  revalidatePath('/')
  return null
}

/**
 * Recalculate an existing pay run from the current approved attendance. A pay
 * run is a snapshot, so attendance approved AFTER it was generated is not in
 * it until this is run. Keeps the run (same id/links), replaces its entries,
 * and drops the status back to draft because the figures changed.
 * Returns an error message, or null on success.
 */
export async function recalculatePayrollRunAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  if (!id) return 'Missing pay run.'
  const admin = createAdminClient()

  const { data: run } = await admin
    .from('payroll_runs')
    .select('id, business_entity_id, period_start, period_end, status, xero_sync_status')
    .eq('id', id)
    .maybeSingle()
  if (!run) return 'Pay run not found.'
  if (run.xero_sync_status === 'success' || run.status === 'exported') {
    return 'This run has already been pushed to Xero. Delete it and create a new pay run instead.'
  }

  // Keep allowances typed on the run detail page.
  const { data: existingEntries } = await admin
    .from('payroll_entries')
    .select('profile_id, allowances')
    .eq('payroll_run_id', run.id)
  const allowances: Record<string, number> = {}
  for (const e of existingEntries ?? []) allowances[e.profile_id] = Number(e.allowances || 0)

  const computed = await computePayrollEntries(admin, run.business_entity_id, run.period_start, run.period_end, allowances)
  if ('error' in computed) return computed.error

  // Replace the snapshot in place: upsert on (run, employee) so existing rows are
  // overwritten rather than deleted first (a failure leaves the old figures,
  // never an empty run), then drop employees who no longer have approved hours.
  const entries = computed.entries.map((e) => ({ ...e, payroll_run_id: run.id }))
  const { error: entErr } = await admin
    .from('payroll_entries')
    .upsert(entries, { onConflict: 'payroll_run_id,profile_id' })
  if (entErr) return entErr.message
  const keep = entries.map((e) => e.profile_id)
  const { error: delErr } = await admin
    .from('payroll_entries')
    .delete()
    .eq('payroll_run_id', run.id)
    .not('profile_id', 'in', `(${keep.join(',')})`)
  if (delErr) return delErr.message
  if (run.status !== 'draft') {
    await admin.from('payroll_runs').update({ status: 'draft' }).eq('id', run.id)
  }

  await checkLabourCostThresholds(admin, run.period_end)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${run.id}`)
  revalidatePath('/')
  return null
}

/**
 * PRD §15 approval flow: Draft → Reviewed → Approved → Exported.
 * "Exported" is set by the Xero push, not by hand.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['reviewed', 'approved'],
  reviewed: ['approved', 'draft'],
  approved: ['reviewed', 'draft'],
  exported: [],
}

export async function updatePayrollStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const status = formData.get('status') as string // draft | reviewed | approved
  const admin = createAdminClient()
  const { data: run } = await admin.from('payroll_runs').select('status').eq('id', id).maybeSingle()
  if (!run) return
  if (!(ALLOWED_TRANSITIONS[run.status] ?? []).includes(status)) return
  await admin.from('payroll_runs').update({ status }).eq('id', id)
  revalidatePath('/payroll')
  revalidatePath(`/payroll/${id}`)
  revalidatePath('/')
}

/** Set a per-employee allowance on a pay run (PRD §15 "Allowances"). */
export async function setAllowanceAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const runId = formData.get('run_id') as string
  const profileId = formData.get('profile_id') as string
  const raw = (formData.get('allowances') as string | null)?.trim() ?? ''
  const amount = raw === '' ? 0 : Number(raw)
  if (!runId || !profileId) return 'Missing entry.'
  if (Number.isNaN(amount) || amount < 0) return 'Allowance must be a positive amount.'

  const admin = createAdminClient()
  const { data: run } = await admin.from('payroll_runs').select('status, xero_sync_status').eq('id', runId).maybeSingle()
  if (!run) return 'Pay run not found.'
  if (run.status === 'exported' || run.xero_sync_status === 'success') return 'This run has been exported to Xero and can no longer be changed.'

  const { data: entry } = await admin
    .from('payroll_entries')
    .select('band_cost')
    .eq('payroll_run_id', runId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (!entry) return 'Entry not found.'

  const bandTotal = Object.values((entry.band_cost ?? {}) as Record<string, number>).reduce((s, v) => s + Number(v || 0), 0)
  const { error } = await admin
    .from('payroll_entries')
    .update({ allowances: round2(amount), gross_pay: round2(bandTotal + amount) })
    .eq('payroll_run_id', runId)
    .eq('profile_id', profileId)
  if (error) return error.message

  // Figures changed → back to draft for re-review.
  if (run.status !== 'draft') await admin.from('payroll_runs').update({ status: 'draft' }).eq('id', runId)

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${runId}`)
  return null
}

export async function deletePayrollRunAction(formData: FormData) {
  const id = formData.get('id') as string
  const admin = createAdminClient()
  await admin.from('payroll_runs').delete().eq('id', id) // entries cascade
  revalidatePath('/payroll')
  revalidatePath('/')
}
