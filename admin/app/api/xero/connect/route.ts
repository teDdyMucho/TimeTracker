import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/server'
import { listXeroConnections, matchOrgForEntity } from '@/lib/xero'

export const runtime = 'nodejs'

/**
 * "Connect Xero" for a Custom Connection.
 *
 * There is no interactive login/redirect: once an admin has authorised a
 * Custom Connection in Xero, this route finds the authorised organisation whose
 * name matches the entity (across every configured Xero app — one per company)
 * and links its tenant id to the entity.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const entityId = req.nextUrl.searchParams.get('entity') ?? ''
  const back = (params: string) => NextResponse.redirect(new URL(`/entities?${params}`, req.url))

  if (!entityId) return back('xero=error&msg=missing_entity')

  try {
    const admin = createAdminClient()
    const { data: entity } = await admin.from('business_entities').select('name').eq('id', entityId).maybeSingle()
    if (!entity) return back('xero=error&msg=entity_not_found')

    const org = matchOrgForEntity(entity.name, await listXeroConnections())
    const { error } = await admin.from('business_entities').update({ xero_tenant_id: org.tenantId }).eq('id', entityId)
    if (error) throw error

    return back('xero=connected')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'connect_failed'
    // Most likely the Custom Connection hasn't been authorised in Xero yet.
    return back(`xero=error&msg=${encodeURIComponent(msg.slice(0, 140))}`)
  }
}
