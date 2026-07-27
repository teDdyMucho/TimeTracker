'use client'
import { useState } from 'react'
import { Apple, Smartphone, Copy, Check, ExternalLink, Download } from 'lucide-react'

/**
 * The Android APK is hosted externally (Google Drive) because it's too large
 * for git/Netlify. Paste the Google Drive DIRECT-download link below.
 * How to make one: upload the .apk to Drive → Share → "Anyone with the link" →
 * copy the file ID from the share URL → use:
 *   https://drive.google.com/uc?export=download&id=FILE_ID
 */
const IOS_APP_URL = 'https://apps.apple.com/ph/app/timevera/id6787161301'
// Google Drive direct-download for the APK. Large files (>25 MB) need the
// `confirm=t` form to skip Drive's virus-scan interstitial and download directly.
const ANDROID_APK_FILE_ID = '1MjKveSdaU-4UzDfaITyhadigzcpE-NpE'
const ANDROID_APK_URL = `https://drive.usercontent.google.com/download?id=${ANDROID_APK_FILE_ID}&export=download&confirm=t`

const ANDROID_IS_PLACEHOLDER = ANDROID_APK_URL.includes('REPLACE_WITH')

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    // Resolve a relative link (e.g. /Timevera.apk) to a full shareable URL.
    const absolute = value.startsWith('/')
      ? `${window.location.origin}${value}`
      : value
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard may be blocked — the link is still shown for manual copy */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap"
      style={{ background: copied ? '#16A34A' : '#1C1A16' }}
    >
      {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy link</>}
    </button>
  )
}

function LinkCard({
  platform, icon, title, subtitle, url, isPlaceholder,
}: {
  platform: 'ios' | 'android'
  icon: React.ReactNode
  title: string
  subtitle: string
  url: string
  isPlaceholder?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-line p-6 shadow-card flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(28,26,22,0.08)' }}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-ink leading-tight">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>

      {isPlaceholder ? (
        <div className="rounded-xl px-4 py-3 text-sm mb-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
          <strong>Link not set yet.</strong> Paste the Android APK link from your Expo build
          into <code className="text-xs">downloads/install-links.tsx</code> to activate this.
        </div>
      ) : (
        <div className="bg-stone/60 rounded-xl border border-line px-4 py-3 mb-4 break-all text-sm text-ink font-mono">
          {platform === 'android' ? 'Copy link → shares a direct download URL to this app' : url}
        </div>
      )}

      <div className="flex flex-wrap gap-2.5 mt-auto">
        <CopyButton value={url} />
        <a
          href={isPlaceholder ? undefined : url}
          target="_blank"
          rel="noreferrer"
          aria-disabled={isPlaceholder}
          className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border transition-colors whitespace-nowrap ${
            isPlaceholder ? 'opacity-40 pointer-events-none' : 'hover:bg-stone'
          }`}
          style={{ borderColor: '#ECEAE4', color: '#1C1A16' }}
        >
          {platform === 'android' ? <Download size={15} /> : <ExternalLink size={15} />}
          {platform === 'android' ? 'Download APK' : 'Open in App Store'}
        </a>
      </div>

      <p className="text-[11px] text-muted mt-4 leading-snug">
        {platform === 'ios'
          ? 'Open this link on an iPhone. The app is unlisted (private) — it won’t appear in App Store search, only via this link.'
          : 'Send this APK to Android phones. The user taps the file to install (allow “Install from unknown sources” if prompted). No Play Store needed.'}
      </p>
    </div>
  )
}

export default function InstallLinks() {
  return (
    <div className="grid gap-5 md:grid-cols-2 max-w-3xl">
      <LinkCard
        platform="ios"
        icon={<Apple size={22} color="#1C1A16" />}
        title="iPhone / iPad (iOS)"
        subtitle="Unlisted App Store link"
        url={IOS_APP_URL}
      />
      <LinkCard
        platform="android"
        icon={<Smartphone size={22} color="#1C1A16" />}
        title="Android"
        subtitle="Direct APK download"
        url={ANDROID_APK_URL}
        isPlaceholder={ANDROID_IS_PLACEHOLDER}
      />
    </div>
  )
}
