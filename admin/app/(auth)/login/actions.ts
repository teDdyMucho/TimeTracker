'use server'
import { createClient } from '@/lib/server'

export interface SignInState {
  error?: string
  ok?: boolean
  /** Password accepted; a 6-digit authenticator code is still needed. */
  mfa?: boolean
}

export async function signInAction(
  _prevState: SignInState | null,
  formData: FormData,
): Promise<SignInState> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: (formData.get('email') as string).trim(),
    password: formData.get('password') as string,
  })
  if (error) return { error: 'Incorrect email or password. Please try again.' }

  // Admins with an authenticator app must enter a code before the session is
  // usable (middleware enforces AAL2); tell the form to ask for it.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return { mfa: true }

  // Don't redirect here — let the client play a success animation, then navigate.
  return { ok: true }
}

export interface MfaState {
  error?: string
  ok?: boolean
}

/** Second step of sign-in: verify the authenticator code and upgrade the session to AAL2. */
export async function verifyMfaAction(
  _prevState: MfaState | null,
  formData: FormData,
): Promise<MfaState> {
  const code = ((formData.get('code') as string | null) ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(code)) return { error: 'Enter the 6-digit code from your authenticator app.' }

  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = factors?.totp?.[0]
  if (!factor) return { error: 'No authenticator app is set up for this account.' }

  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
  if (cErr || !challenge) return { error: cErr?.message ?? 'Could not start verification.' }
  const { error: vErr } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code })
  if (vErr) return { error: 'That code was not accepted. Wait for the next code and try again.' }
  return { ok: true }
}
