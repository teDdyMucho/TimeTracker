'use server'
import { buildRateHistory, rateOn, RATE_BASELINE_DATE, type RateRow } from '@/lib/labour-cost'
import { createAdminClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

// Webhook that emails the new employee their login details (LeadConnector /
// GoHighLevel). Overridable via env; falls back to the configured hook.
const INVITE_WEBHOOK_URL =
  process.env.INVITE_WEBHOOK_URL ??
  'https://services.leadconnectorhq.com/hooks/UINzfFP22ldM8Tg7KjAy/webhook-trigger/40236970-a1b1-4974-8f5d-86f5b89cf04d'

/**
 * Send the new employee their login details to the invite webhook, which emails
 * them. Best-effort: never throws — a webhook hiccup must not fail account
 * creation. Posts exactly Name / Email / password (the fields the automation
 * expects), plus the app install link.
 */
async function sendInviteEmail(input: { name: string; email: string; password: string }): Promise<boolean> {
  try {
    const res = await fetch(INVITE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: input.name,
        Email: input.email,
        password: input.password,
        loginUrl: 'https://timevera.netlify.app/install',
      }),
    })
    if (!res.ok) {
      console.error('[sendInviteEmail]', res.status, await res.text())
      return false
    }
    return true
  } catch (e) {
    console.error('[sendInviteEmail]', e)
    return false
  }
}

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
  const supervisor_id = ((formData.get('supervisor_id') as string | null) ?? '').trim() || null

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
    supervisor_id,
    status: 'active',
    // Unchecked checkboxes are absent from FormData, so absence means false.
    flat_rate: formData.get('flat_rate') === 'on',
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(userId)
    return profileError.message
  }

  // Optional initial pay rate — the first rate is the employee's baseline
  // (applies to all their work, however far back).
  const rateRaw = (formData.get('hourly_rate') as string | null)?.trim()
  if (rateRaw) {
    const rate = Number(rateRaw)
    if (!Number.isNaN(rate) && rate >= 0) {
      await adminClient.from('pay_rates').insert({ profile_id: userId, hourly_rate: rate, effective_from: RATE_BASELINE_DATE })
    }
  }

  // Send the employee their login details via the invite webhook (best-effort).
  await sendInviteEmail({ name, email, password })

  revalidatePath('/employees')
  return null
}

export async function toggleEmployeeStatusAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const currentStatus = formData.get('current_status') as string
  const adminClient = createAdminClient()
  // profiles.status uses the entity_status enum ('active', 'archived') — 'inactive'
  // is NOT valid and silently failed, so Deactivate/Activate did nothing.
  const newStatus = currentStatus === 'active' ? 'archived' : 'active'
  const { error } = await adminClient.from('profiles').update({ status: newStatus }).eq('id', id)
  if (error) console.error('[toggleEmployeeStatus]', error.message)
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
  // Unchecked checkboxes are absent from FormData, so absence means false.
  const flat_rate = formData.get('flat_rate') === 'on'
  const newPassword = (formData.get('new_password') as string | null)?.trim() ?? ''
  const supervisor_id = ((formData.get('supervisor_id') as string | null) ?? '').trim() || null
  if (supervisor_id === id) return 'An employee cannot be their own supervisor.'

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
    .update({ role, employment_type, business_access: entityIds, flat_rate, supervisor_id })
    .eq('id', id)

  if (error) return error.message

  // Pay rate: insert a new row, effective from the chosen date (default today),
  // only if a valid rate was given and it differs from the rate already in
  // force on that date. Payroll and reports price each worked day with the
  // rate in force that day (PRD task "Apply pay rates effective on the worked date").
  if (rateRaw) {
    const rate = Number(rateRaw)
    if (Number.isNaN(rate) || rate < 0) return 'Hourly rate must be a positive number.'
    const fromRaw = ((formData.get('rate_effective_from') as string | null) ?? '').trim()
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })
    const effectiveFrom = fromRaw || today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) return 'Rate effective date must be a valid date.'
    const { data: history } = await adminClient
      .from('pay_rates')
      .select('id, profile_id, hourly_rate, effective_from, created_at')
      .eq('profile_id', id)
    const rows = (history ?? []) as (RateRow & { id: string })[]
    if (rows.length === 0) {
      // First rate ever: the baseline, applying to all of their work.
      const { error: rateErr } = await adminClient.from('pay_rates').insert({ profile_id: id, hourly_rate: rate, effective_from: RATE_BASELINE_DATE })
      if (rateErr) return rateErr.message
    } else {
      const current = rateOn(buildRateHistory(rows), id, effectiveFrom)
      const sameDay = rows.filter((r) => r.effective_from === effectiveFrom)
      if (sameDay.length > 0) {
        // Correcting a rate entered for the same date: replace it rather than
        // leaving two rows that start on the same day.
        if (sameDay.some((r) => Number(r.hourly_rate) !== rate)) {
          const { error: rateErr } = await adminClient.from('pay_rates').update({ hourly_rate: rate }).in('id', sameDay.map((r) => r.id))
          if (rateErr) return rateErr.message
        }
      } else if (current !== rate) {
        const { error: rateErr } = await adminClient.from('pay_rates').insert({ profile_id: id, hourly_rate: rate, effective_from: effectiveFrom })
        if (rateErr) return rateErr.message
      }
    }
  }

  revalidatePath('/employees')
  revalidatePath('/reports')
  return null
}
