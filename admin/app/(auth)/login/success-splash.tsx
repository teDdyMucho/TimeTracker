'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2 } from 'lucide-react'
import buildoneLogo from '../../../lib/buildone-logo.png'

/**
 * Post-login success animation. A full-screen branded takeover (portaled to
 * <body> so it isn't clipped by the login card), then calls onDone to navigate.
 */
export default function SuccessSplash({ onDone }: { onDone: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const t = setTimeout(onDone, 1600)
    return () => clearTimeout(t)
  }, [onDone])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center animate-fade-in" style={{ background: '#000000' }}>
      {/* soft radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(120% 100% at 50% 40%, rgba(255,255,255,0.06) 0%, transparent 60%)' }}
      />
      <div className="flex flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildoneLogo.src}
          alt="BuildOne"
          className="h-20 sm:h-24 w-auto object-contain animate-splash-rise"
          style={{ filter: 'brightness(0) invert(1)' }}
        />
        {/* underline sweep */}
        <div className="mt-3 h-[3px] rounded-full animate-splash-line" style={{ background: '#ffffff' }} />

        <div className="mt-7 flex items-center gap-2 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          <CheckCircle2 size={18} className="text-white" />
          <span className="text-white/90 text-sm font-medium">Signed in — taking you in…</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
