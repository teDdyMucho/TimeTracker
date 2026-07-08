import Link from 'next/link'
import { createAdminClient } from '@/lib/server'
import { Card, PageHeader } from '@/components/ui'
import { MessageSquare } from 'lucide-react'

export const dynamic = 'force-dynamic'

function relative(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1d' : `${d}d`
}

export default async function MessagesPage() {
  const admin = createAdminClient()

  // All active non-admin employees.
  const { data: employees } = await admin
    .from('profiles')
    .select('id, name, email, avatar_url')
    .eq('status', 'active')
    .neq('role', 'admin')
    .order('name')

  const emps = (employees ?? []) as { id: string; name: string; email: string; avatar_url: string | null }[]

  // Latest message + unread count per employee thread.
  const { data: msgs } = await admin
    .from('messages')
    .select('profile_id, body, sender_role, read, created_at')
    .order('created_at', { ascending: false })

  const lastByThread = new Map<string, { body: string; sender_role: string; created_at: string }>()
  const unreadByThread = new Map<string, number>()
  for (const m of (msgs ?? []) as any[]) {
    if (!lastByThread.has(m.profile_id)) {
      lastByThread.set(m.profile_id, { body: m.body, sender_role: m.sender_role, created_at: m.created_at })
    }
    if (m.sender_role === 'employee' && !m.read) {
      unreadByThread.set(m.profile_id, (unreadByThread.get(m.profile_id) ?? 0) + 1)
    }
  }

  // Sort: threads with activity first (most recent), then the rest alphabetical.
  const sorted = [...emps].sort((a, b) => {
    const la = lastByThread.get(a.id)?.created_at ?? ''
    const lb = lastByThread.get(b.id)?.created_at ?? ''
    if (la && lb) return lb.localeCompare(la)
    if (la) return -1
    if (lb) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div>
      <PageHeader title="Messages" subtitle="Chat with your team — one conversation per employee" />

      <Card className="!border-line !p-0 overflow-hidden">
        {sorted.length === 0 ? (
          <p className="text-muted text-sm py-10 text-center">No employees yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((e) => {
              const last = lastByThread.get(e.id)
              const unread = unreadByThread.get(e.id) ?? 0
              return (
                <li key={e.id}>
                  <Link href={`/messages/${e.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-stone transition-colors">
                    {e.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={e.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-stone flex items-center justify-center text-ink font-bold shrink-0">
                        {(e.name?.[0] ?? 'E').toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink truncate">{e.name}</span>
                        <span className="text-[11px] text-muted shrink-0">{relative(last?.created_at ?? null)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${unread > 0 ? 'text-ink font-medium' : 'text-muted'}`}>
                          {last
                            ? `${last.sender_role === 'admin' ? 'You: ' : ''}${last.body}`
                            : <span className="italic text-faint">No messages yet — say hello</span>}
                        </span>
                        {unread > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#1C1A16] text-white text-[10px] font-bold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted mt-4 flex items-center gap-1.5">
        <MessageSquare size={13} /> Messages are private, one-to-one between you and each employee. They also get a phone notification.
      </p>
    </div>
  )
}
