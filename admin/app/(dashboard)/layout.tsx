import { createClient } from '@/lib/server'
import AppShell from '@/components/app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const [{ count }, { data: { user } }] = await Promise.all([
    supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.auth.getUser(),
  ])

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user?.id ?? '')
    .maybeSingle()

  return (
    <AppShell
      pendingOvertimeCount={count ?? 0}
      userName={profile?.name ?? 'Admin'}
      userEmail={user?.email ?? ''}
    >
      {children}
    </AppShell>
  )
}
