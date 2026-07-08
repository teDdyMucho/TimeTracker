import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/server'
import { ArrowLeft } from 'lucide-react'
import MessageComposer from './composer'

export const dynamic = 'force-dynamic'

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: emp } = await admin
    .from('profiles').select('id, name, email, avatar_url').eq('id', id).maybeSingle()
  if (!emp) return notFound()

  const { data: messages } = await admin
    .from('messages')
    .select('id, body, sender_role, created_at')
    .eq('profile_id', id)
    .order('created_at', { ascending: true })

  // Opening the thread marks the employee's messages as read (inline — no
  // revalidatePath during render, which Next.js forbids).
  await admin.from('messages').update({ read: true })
    .eq('profile_id', id).eq('sender_role', 'employee').eq('read', false)

  const msgs = (messages ?? []) as { id: string; body: string; sender_role: string; created_at: string }[]

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-line">
        <Link href="/messages" className="p-1.5 rounded-lg hover:bg-stone transition-colors" style={{ color: '#1C1A16' }}>
          <ArrowLeft size={18} />
        </Link>
        {emp.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={emp.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-stone flex items-center justify-center text-ink font-bold">
            {(emp.name?.[0] ?? 'E').toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-bold text-ink leading-tight">{emp.name}</div>
          <div className="text-xs text-muted">{emp.email}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-5 space-y-3">
        {msgs.length === 0 ? (
          <p className="text-center text-muted text-sm py-10">No messages yet. Send the first one below.</p>
        ) : (
          msgs.map((m) => {
            const fromAdmin = m.sender_role === 'admin'
            return (
              <div key={m.id} className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${fromAdmin ? 'text-white' : 'bg-white border border-line text-ink'}`}
                  style={fromAdmin ? { background: '#1C1A16' } : {}}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`text-[10px] mt-1 ${fromAdmin ? 'text-white/50' : 'text-faint'}`}>{timeLabel(m.created_at)}</p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Composer */}
      <MessageComposer profileId={id} />
    </div>
  )
}
