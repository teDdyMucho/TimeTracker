import { createClient } from '@/lib/server'
import Sidebar from '@/components/sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { count } = await supabase
    .from('overtime_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F0F4F8' }}>
      <Sidebar pendingOvertimeCount={count ?? 0} />
      <main className="flex-1 overflow-auto">
        {/* Subtle dot-grid background */}
        <div
          className="min-h-full"
          style={{
            backgroundImage: 'radial-gradient(circle, #D1D9E4 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        >
          <div className="p-8 animate-fade-in-up">{children}</div>
        </div>
      </main>
    </div>
  )
}
