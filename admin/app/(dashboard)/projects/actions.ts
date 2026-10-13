'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/** Parse the optional budget / date fields shared by create and update (PRD §13). */
function readProjectFields(formData: FormData): { fields: Record<string, unknown>; budgetCost: number | null; error?: string } {
  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return { fields: {}, budgetCost: null, error: 'Project name is required.' }

  const optNum = (key: string): number | null | 'bad' => {
    const raw = (formData.get(key) as string | null)?.trim()
    if (!raw) return null
    const n = Number(raw)
    return Number.isNaN(n) || n < 0 ? 'bad' : n
  }
  const optDate = (key: string): string | null => {
    const raw = (formData.get(key) as string | null)?.trim()
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
  }

  const budgetHours = optNum('budget_hours')
  const budgetCost = optNum('budget_labour_cost')
  if (budgetHours === 'bad') return { fields: {}, budgetCost: null, error: 'Budget hours must be a positive number.' }
  if (budgetCost === 'bad') return { fields: {}, budgetCost: null, error: 'Budget labour cost must be a positive amount.' }

  const start = optDate('start_date')
  const end = optDate('end_date')
  if (start && end && end < start) return { fields: {}, budgetCost: null, error: 'End date must be on or after the start date.' }

  return {
    fields: {
      name,
      client: (formData.get('client') as string | null)?.trim() || null,
      code: (formData.get('code') as string | null)?.trim() || null,
      business_entity_id: formData.get('business_entity_id') as string,
      budget_hours: budgetHours,
      start_date: start,
      end_date: end,
    },
    budgetCost,
  }
}

export async function createProjectAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const adminClient = createAdminClient()
  const parsed = readProjectFields(formData)
  if (parsed.error) return parsed.error

  const { data: project, error } = await adminClient
    .from('projects')
    .insert({ ...parsed.fields, status: 'active' })
    .select('id')
    .single()
  if (error || !project) return error?.message ?? 'Failed to create project.'

  // Budget labour cost is money, so it lives in the admin-only
  // project_financials table (PRD §20), never on projects.
  if (parsed.budgetCost != null) {
    const { error: finErr } = await adminClient
      .from('project_financials')
      .upsert({ project_id: project.id, budget_labour_cost: parsed.budgetCost }, { onConflict: 'project_id' })
    if (finErr) return finErr.message
  }

  revalidatePath('/projects')
  revalidatePath('/reports')
  return null
}

export async function updateProjectAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  if (!id) return 'Missing project.'
  const adminClient = createAdminClient()
  const parsed = readProjectFields(formData)
  if (parsed.error) return parsed.error

  const { error } = await adminClient.from('projects').update(parsed.fields).eq('id', id)
  if (error) return error.message

  const { error: finErr } = await adminClient
    .from('project_financials')
    .upsert({ project_id: id, budget_labour_cost: parsed.budgetCost }, { onConflict: 'project_id' })
  if (finErr) return finErr.message

  revalidatePath('/projects')
  revalidatePath('/reports')
  return null
}

export async function toggleProjectStatusAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const current = formData.get('current_status') as string
  const adminClient = createAdminClient()
  // entity_status enum is ('active', 'archived') — 'inactive' is NOT valid and
  // silently failed the update, so Archive/Restore appeared to do nothing.
  const { error } = await adminClient
    .from('projects')
    .update({ status: current === 'active' ? 'archived' : 'active' })
    .eq('id', id)
  if (error) console.error('[toggleProjectStatus]', error.message)
  revalidatePath('/projects')
}
