'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/server'

export async function createEntityAction(_prevState: string | null, formData: FormData) {
  const name = (formData.get('name') as string).trim()
  if (!name) return 'Entity name is required.'

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('business_entities').insert({ name, status: 'active' })
  if (error) return error.message

  revalidatePath('/entities')
  revalidatePath('/projects')
  return null
}

export async function toggleEntityStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const current = formData.get('current_status') as string
  const next = current === 'active' ? 'archived' : 'active'

  const adminClient = createAdminClient()
  await adminClient.from('business_entities').update({ status: next }).eq('id', id)

  revalidatePath('/entities')
  revalidatePath('/projects')
}
