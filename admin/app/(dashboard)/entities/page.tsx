import { createAdminClient } from '@/lib/server'
import EntitiesClient from './entities-client'

export default async function EntitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ xero?: string; tenant?: string; msg?: string }>
}) {
  const params = await searchParams
  const adminClient = createAdminClient()

  const { data: entities } = await adminClient
    .from('business_entities')
    .select('id, name, status, xero_tenant_id, created_at')
    .order('name')

  const rows = entities ?? []
  const activeCount = rows.filter((e) => e.status === 'active').length

  let xeroNotice: { status: 'connected' | 'error'; text: string } | null = null
  if (params.xero === 'connected') {
    xeroNotice = { status: 'connected', text: `Connected to ${params.tenant ?? 'Xero'} successfully.` }
  } else if (params.xero === 'error') {
    xeroNotice = { status: 'error', text: `Xero connection failed: ${params.msg ?? 'unknown error'}.` }
  }

  return <EntitiesClient entities={rows as any} activeCount={activeCount} xeroNotice={xeroNotice} />
}
