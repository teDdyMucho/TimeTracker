'use server'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

export async function createEmployeeAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const adminClient = createAdminClient()

  const name = (formData.get('name') as string).trim()
  const email = (formData.get('email') as string).trim()
  const password = formData.get('password') as string
  const role = formData.get('role') as string
  const employment_type = formData.get('employment_type') as string
  const entityIds = formData.getAll('entity_ids') as string[]

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  })

  if (authError) return authError.message

  const userId = authData.user.id

  const { error: profileError } = await adminClient.from('profiles').insert({
    id: userId,
    name,
    email,
    role,
    employment_type,
    business_access: entityIds,
    status: 'active',
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId)
    return profileError.message
  }

  revalidatePath('/employees')
  return null
}

export async function toggleEmployeeStatusAction(formData: FormData) {
  const id = formData.get('id') as string
  const currentStatus = formData.get('current_status') as string
  const adminClient = createAdminClient()
  const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
  await adminClient.from('profiles').update({ status: newStatus }).eq('id', id)
  revalidatePath('/employees')
}

export async function updateEmployeeRoleAction(formData: FormData) {
  const id = formData.get('id') as string
  const role = formData.get('role') as string
  const adminClient = createAdminClient()
  await adminClient.from('profiles').update({ role }).eq('id', id)
  revalidatePath('/employees')
}

export async function updateEmployeeAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const id = formData.get('id') as string
  const role = formData.get('role') as string
  const employment_type = formData.get('employment_type') as string
  const entityIds = formData.getAll('entity_ids') as string[]

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('profiles')
    .update({ role, employment_type, business_access: entityIds })
    .eq('id', id)

  if (error) return error.message
  revalidatePath('/employees')
  return null
}
