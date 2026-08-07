import { createClient } from '@/lib/server'
import AppShell from '@/components/app-shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const [{ count }, { count: unreadMessages }, { count: pendingLeave }, { data: { user } }] = await Promise.all([
    supabase.from('overtime_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    // Unread = messages sent by employees that the admin hasn't read yet.
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('sender_role', 'employee').eq('read', false),
    supabase.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
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
      unreadMessages={unreadMessages ?? 0}
      pendingLeaveCount={pendingLeave ?? 0}
      userName={profile?.name ?? 'Admin'}
      userEmail={user?.email ?? ''}
    >
      {children}
    </AppShell>
  )
}
