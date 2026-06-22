import { createClient } from '@/lib/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const url = new URL('/login', request.url)
  const reason = new URL(request.url).searchParams.get('reason')
  if (reason) url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}
