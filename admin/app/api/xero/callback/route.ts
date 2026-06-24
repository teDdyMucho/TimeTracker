import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { exchangeCodeForTokens, fetchXeroConnections } from '@/lib/xero'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  const back = (params: string) => NextResponse.redirect(new URL(`/entities?${params}`, req.url))

  if (oauthError) return back(`xero=error&msg=${encodeURIComponent(oauthError)}`)
  if (!code || !state) return back('xero=error&msg=missing_code')

  // Verify CSRF state against the cookie we set in /connect
  const cookieState = req.cookies.get('xero_oauth_state')?.value
  if (!cookieState || cookieState !== state) return back('xero=error&msg=state_mismatch')

  const entityId = state.split('.')[1] ?? ''

  // Must still be a signed-in admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  try {
    // 1. Code → tokens
    const token = await exchangeCodeForTokens(code)

    // 2. Which Xero org(s) did they authorise?
    const connections = await fetchXeroConnections(token.access_token)
    if (!connections.length) return back('xero=error&msg=no_tenant')

    // Use the first org. (Multi-org selection can come later.)
    const tenant = connections[0]
    const expiresAt = new Date(Date.now() + (token.expires_in - 60) * 1000).toISOString()

    const admin = createAdminClient()

    // 3. Store / refresh the token row for this tenant
    const { error: upsertErr } = await admin.from('xero_connections').upsert(
      {
        tenant_id: tenant.tenantId,
        tenant_name: tenant.tenantName,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: expiresAt,
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' },
    )
    if (upsertErr) return back(`xero=error&msg=${encodeURIComponent('save_failed')}`)

    // 4. Attach this tenant to the chosen business entity
    if (entityId) {
      await admin.from('business_entities').update({ xero_tenant_id: tenant.tenantId }).eq('id', entityId)
    }

    const res = back(`xero=connected&tenant=${encodeURIComponent(tenant.tenantName ?? 'Xero')}`)
    res.cookies.delete('xero_oauth_state')
    return res
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'connect_failed'
    return back(`xero=error&msg=${encodeURIComponent(msg.slice(0, 120))}`)
  }
}
