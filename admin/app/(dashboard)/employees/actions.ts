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

  // Optional initial pay rate
  const rateRaw = (formData.get('hourly_rate') as string | null)?.trim()
  if (rateRaw) {
    const rate = Number(rateRaw)
    if (!Number.isNaN(rate) && rate >= 0) {
      await adminClient.from('pay_rates').insert({ profile_id: userId, hourly_rate: rate })
    }
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
  const rateRaw = (formData.get('hourly_rate') as string | null)?.trim()
  const newPassword = (formData.get('new_password') as string | null)?.trim() ?? ''

  const adminClient = createAdminClient()

  // Optional admin password reset — no current password required. The service-role
  // admin client can set any user's password directly via the Auth admin API.
  if (newPassword) {
    if (newPassword.length < 6) return 'New password must be at least 6 characters.'
    const { error: pwErr } = await adminClient.auth.admin.updateUserById(id, {
      password: newPassword,
    })
    if (pwErr) return pwErr.message
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ role, employment_type, business_access: entityIds })
    .eq('id', id)

  if (error) return error.message

  // Pay rate: insert a new effective row only if a valid rate was given and it changed.
  if (rateRaw) {
    const rate = Number(rateRaw)
    if (Number.isNaN(rate) || rate < 0) return 'Hourly rate must be a positive number.'
    const { data: latest } = await adminClient
      .from('pay_rates')
      .select('hourly_rate')
      .eq('profile_id', id)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest || Number(latest.hourly_rate) !== rate) {
      const { error: rateErr } = await adminClient.from('pay_rates').insert({ profile_id: id, hourly_rate: rate })
      if (rateErr) return rateErr.message
    }
  }

  revalidatePath('/employees')
  revalidatePath('/reports')
  return null
}
