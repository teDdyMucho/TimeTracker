'use client'
import { useEffect, useState } from 'react'
import { Copy, Check, ExternalLink, Share2 } from 'lucide-react'

/**
 * The one link an admin sends to workers: the PUBLIC /install page (no login).
 * Workers open it on their phone and pick iOS or Android.
 */
export default function ShareInstallLink() {
  const [url, setUrl] = useState('/install')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setUrl(`${window.location.origin}/install`)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — link is shown for manual copy */
    }
  }

  return (
    <div className="rounded-2xl border p-5 mb-6 shadow-card" style={{ background: 'rgba(28,26,22,0.05)', borderColor: 'rgba(28,26,22,0.15)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <Share2 size={17} className="text-ink" />
        <h3 className="font-bold text-ink">Share this link with your workers</h3>
      </div>
      <p className="text-xs text-muted mb-4 max-w-xl">
        Send this one link to any worker. When they open it on their phone, they can install the app —
        <strong className="text-ink"> no admin login required</strong>. It shows both the iPhone and Android options.
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex-1 min-w-[240px] bg-white rounded-xl border border-line px-4 py-3 break-all text-sm text-ink font-mono">
          {url}
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap"
          style={{ background: copied ? '#16A34A' : '#1C1A16' }}
        >
          {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy link</>}
        </button>
        <a
          href="/install"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-sm font-semibold border hover:bg-white transition-colors whitespace-nowrap"
          style={{ borderColor: '#ECEAE4', color: '#1C1A16' }}
        >
          <ExternalLink size={15} /> Preview
        </a>
      </div>
    </div>
  )
}
