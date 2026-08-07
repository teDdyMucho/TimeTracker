'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

export async function createProjectAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('projects').insert({
    name: (formData.get('name') as string).trim(),
    client: (formData.get('client') as string)?.trim() || null,
    code: (formData.get('code') as string)?.trim() || null,
    business_entity_id: formData.get('business_entity_id') as string,
    status: 'active',
  })
  if (error) return error.message
  revalidatePath('/projects')
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
