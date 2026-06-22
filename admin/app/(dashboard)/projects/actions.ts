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

export async function toggleProjectStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('current_status') as string
  const adminClient = createAdminClient()
  await adminClient
    .from('projects')
    .update({ status: current === 'active' ? 'inactive' : 'active' })
    .eq('id', id)
  revalidatePath('/projects')
}
