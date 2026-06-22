'use server'
import { createClient } from '@/lib/server'
import { redirect } from 'next/navigation'

export async function signInAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: (formData.get('email') as string).trim(),
    password: formData.get('password') as string,
  })
  if (error) return 'Incorrect email or password. Please try again.'
  redirect('/')
}
