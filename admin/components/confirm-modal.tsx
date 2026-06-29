'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { LogOut } from 'lucide-react'

/**
 * Branded confirm dialog (frosted glass) for destructive/confirm actions.
 * `onConfirm` typically submits a server-action form.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  destructive = false,
  icon,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  icon?: React.ReactNode
  onCancel: () => void
  onConfirm: () => void
}) {
  // Portal to body so the overlay covers the full screen even when rendered
  // inside a narrow container like the sidebar.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="glass-panel rounded-2xl p-7 w-full max-w-sm text-center animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={destructive ? { background: 'rgba(239,68,68,0.12)' } : { background: 'rgba(28,26,22,0.08)' }}
        >
          {icon ?? <LogOut size={24} style={{ color: destructive ? '#DC2626' : '#1C1A16' }} />}
        </div>
        <h3 className="text-lg font-bold text-ink mb-1.5">{title}</h3>
        {message && <p className="text-muted text-sm mb-6">{message}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-stone text-ink hover:bg-line transition-all active:scale-95"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 ${
              destructive ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
