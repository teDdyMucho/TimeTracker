import { createClient } from '@/lib/server'
import Sidebar from '@/components/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('overtime_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar pendingOvertimeCount={count ?? 0} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  )
}
