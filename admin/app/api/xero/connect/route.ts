import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/server'
import { XERO_AUTH_URL } from '@/lib/xero'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Must be a signed-in admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const entityId = req.nextUrl.searchParams.get('entity') ?? ''

  // CSRF protection: random nonce, stored in an httpOnly cookie + echoed in `state`.
  // We also pack the target entity id into the state so the callback knows where to attach.
  const nonce = randomUUID()
  const state = `${nonce}.${entityId}`

  const authUrl = new URL(XERO_AUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', process.env.XERO_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', process.env.XERO_REDIRECT_URI!)
  authUrl.searchParams.set('scope', process.env.XERO_SCOPES!)
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl.toString())
  res.cookies.set('xero_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
