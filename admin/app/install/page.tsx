import type { Metadata } from 'next'
import InstallLinks from '../(dashboard)/downloads/install-links'

export const metadata: Metadata = {
  title: 'Install Timevera',
  description: 'Download and install the Timevera app on your phone.',
}

export const dynamic = 'force-dynamic'

/**
 * PUBLIC install page — no login required. Admins share this link with workers
 * so they can grab the iOS / Android install links themselves.
 * Exempted from the auth middleware (see admin/middleware.ts).
 */
export default function InstallPage() {
  return (
    <main className="min-h-screen bg-paper flex flex-col items-center px-4 py-12">
      {/* Brand */}
      <div className="mb-8 flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Timevera-Web-logo.png" alt="Timevera" className="h-12 w-auto object-contain mb-5" />
        <h1 className="text-2xl font-bold text-ink tracking-tight">Install Timevera</h1>
        <p className="text-muted text-sm mt-1.5 max-w-md">
          Choose your phone below to download and install the Timevera time-tracking app.
          Ask your administrator if you need help signing in.
        </p>
      </div>

      <div className="w-full flex justify-center">
        <InstallLinks />
      </div>

      <p className="text-faint text-xs mt-10 text-center">
        © {new Date().getFullYear()} Timevera · For authorised workers only
      </p>
    </main>
  )
}
