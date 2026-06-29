'use server'
import { createClient } from '@/lib/server'

export interface SignInState {
  error?: string
  ok?: boolean
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
  // Don't redirect here — let the client play a success animation, then navigate.
  return { ok: true }
}
