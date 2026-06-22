'use server'
import { createAdminClient, createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

export async function generatePayrollAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const businessEntityId = formData.get('business_entity_id') as string
  const periodStart = formData.get('period_start') as string
  const periodEnd = formData.get('period_end') as string

  if (!businessEntityId || !periodStart || !periodEnd) return 'All fields are required.'

  const adminClient = createAdminClient()

  // Check for overlapping run
  const { data: existing } = await adminClient
    .from('payroll_runs')
    .select('id')
    .eq('business_entity_id', businessEntityId)
    .lte('period_start', periodEnd)
    .gte('period_end', periodStart)
    .limit(1)

  if (existing && existing.length > 0) {
    return 'A payroll run already exists for this entity and period.'
  }

  // Count timesheets in range
  const { count } = await adminClient
    .from('timesheets')
    .select('id', { count: 'exact', head: true })
    .eq('business_entity_id', businessEntityId)
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .in('status', ['submitted', 'approved'])

  if (!count || count === 0) {
    return 'No approved timesheets found for this period. Ask employees to submit their hours first.'
  }

  // Get distinct employee count
  const { data: employeeRows } = await adminClient
    .from('timesheets')
    .select('profile_id')
    .eq('business_entity_id', businessEntityId)
    .gte('work_date', periodStart)
    .lte('work_date', periodEnd)
    .in('status', ['submitted', 'approved'])

  const uniqueEmployees = new Set((employeeRows ?? []).map((r: any) => r.profile_id)).size

  // Create draft payroll run (Edge Function will compute actual costs in a future step)
  const { error } = await adminClient.from('payroll_runs').insert({
    business_entity_id: businessEntityId,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'draft',
    total_gross: 0,
    total_employees: uniqueEmployees,
    xero_sync_status: 'not_required',
  })

  if (error) return error.message

  revalidatePath('/payroll')
  return null
}

export async function updatePayrollStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const status = formData.get('status') as string
  const adminClient = createAdminClient()
  await adminClient.from('payroll_runs').update({ status }).eq('id', id)
  revalidatePath('/payroll')
}
