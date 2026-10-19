'use server'
import { createClient } from '@/lib/server'
import { revalidatePath } from 'next/cache'

/**
 * Authenticator-app (TOTP) two-factor authentication for the signed-in admin,
 * on Supabase Auth MFA. Enrol → scan QR → verify a code; from then on every
 * sign-in asks for a code (middleware enforces AAL2).
 */

export interface EnrolState {
  factorId?: string
  qrSvg?: string
  secret?: string
  error?: string
}

export async function enrollTotpAction(): Promise<EnrolState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Clear any half-finished enrolments so the new one does not clash on name.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  for (const f of factors?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Timevera admin ${new Date().toISOString().slice(0, 16)}`,
    issuer: 'Timevera',
  })
  if (error || !data) return { error: error?.message ?? 'Could not start enrolment.' }
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyTotpEnrolAction(
  _prev: { ok?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const factorId = (formData.get('factor_id') as string | null) ?? ''
  const code = ((formData.get('code') as string | null) ?? '').replace(/\s+/g, '')
  if (!factorId) return { error: 'Start the setup again.' }
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' }

  const supabase = await createClient()
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
  if (cErr || !challenge) return { error: cErr?.message ?? 'Could not start verification.' }
  const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
  if (vErr) return { error: 'That code was not accepted. Check the time on your phone and try the next code.' }

  revalidatePath('/settings')
  return { ok: true }
}

export async function unenrollTotpAction(
  _prev: { ok?: boolean; error?: string } | null,
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const factorId = (formData.get('factor_id') as string | null) ?? ''
  if (!factorId) return { error: 'Missing factor.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    // Supabase requires an AAL2 session to remove a verified factor.
    return { error: /aal2/i.test(error.message) ? 'Sign out and sign in again with your code, then remove the authenticator.' : error.message }
  }
  revalidatePath('/settings')
  return { ok: true }
}
