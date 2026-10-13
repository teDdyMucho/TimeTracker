'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Supabase Realtime (PRD §5 "live dashboard updates"). Subscribes to row
 * changes on the given tables and re-renders the server page, debounced so a
 * burst of inserts (e.g. a pay run) triggers one refresh. Falls back to a slow
 * poll if the socket never connects.
 */
export default function LiveRefresh({
  tables,
  fallbackSeconds = 120,
}: {
  tables: string[]
  fallbackSeconds?: number
}) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const bump = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => router.refresh(), 800)
    }

    let channel = supabase.channel(`live-${tables.join('-')}`)
    for (const table of tables) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump)
    }
    channel.subscribe()

    const poll = setInterval(() => router.refresh(), fallbackSeconds * 1000)

    return () => {
      if (timer.current) clearTimeout(timer.current)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, tables.join(','), fallbackSeconds])

  return null
}
