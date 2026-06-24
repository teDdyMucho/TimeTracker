import { createAdminClient } from '@/lib/server'
import EntitiesClient from './entities-client'

export default async function EntitiesPage() {
  const adminClient = createAdminClient()

  const { data: entities } = await adminClient
    .from('business_entities')
    .select('id, name, status, xero_tenant_id, created_at')
    .order('name')

  const rows = entities ?? []
  const activeCount = rows.filter((e) => e.status === 'active').length

  return <EntitiesClient entities={rows as any} activeCount={activeCount} />
}
