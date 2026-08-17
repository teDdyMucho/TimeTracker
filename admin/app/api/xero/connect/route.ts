import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { getCustomConnectionTenantId } from '@/lib/xero'

export const runtime = 'nodejs'

/**
 * "Connect Xero" for a Custom Connection.
 *
 * There is no interactive login/redirect: once an admin has authorised the
 * Custom Connection in Xero, this route fetches the authorised organisation's
 * tenant id (via client_credentials) and links it to the chosen entity.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const entityId = req.nextUrl.searchParams.get('entity') ?? ''
  const back = (params: string) => NextResponse.redirect(new URL(`/entities?${params}`, req.url))

  if (!entityId) return back('xero=error&msg=missing_entity')

  try {
    const tenantId = await getCustomConnectionTenantId()

    const admin = createAdminClient()
    await admin.from('business_entities').update({ xero_tenant_id: tenantId }).eq('id', entityId)

    return back('xero=connected')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'connect_failed'
    // Most likely the Custom Connection hasn't been authorised in Xero yet.
    return back(`xero=error&msg=${encodeURIComponent(msg.slice(0, 140))}`)
  }
}
