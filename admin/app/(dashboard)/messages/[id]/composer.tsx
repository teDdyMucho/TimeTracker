'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { sendMessageAction } from '../actions'

export default function MessageComposer({ profileId }: { profileId: string }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  async function send() {
    const body = ref.current?.value.trim()
    if (!body || sending) return
    setSending(true)
    const fd = new FormData()
    fd.append('profile_id', profileId)
    fd.append('body', body)
    try {
      await sendMessageAction(fd)
      if (ref.current) ref.current.value = ''
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-3 border-t border-line flex items-end gap-2">
      <textarea
        ref={ref}
        rows={1}
        placeholder="Type a message…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
        }}
        className="flex-1 resize-none rounded-2xl border border-line px-4 py-3 text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-brand/25 max-h-32"
      />
      <button
        type="button"
        onClick={send}
        disabled={sending}
        className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white disabled:opacity-50 active:scale-95 transition-all"
        style={{ background: '#1C1A16' }}
        aria-label="Send"
      >
        <Send size={17} />
      </button>
    </div>
  )
}
