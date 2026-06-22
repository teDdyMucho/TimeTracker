import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-center text-white">
        <div className="text-2xl font-bold text-brand mb-6">Timevera</div>
        <div className="text-5xl font-bold text-brand mb-4">403</div>
        <div className="text-xl font-semibold mb-2">Admin access only</div>
        <p className="text-slate-400 mb-6">Your account does not have permission to access this portal.</p>
        <Link
          href="/auth/signout?reason=not_admin"
          className="inline-block bg-brand text-white font-semibold rounded-xl px-6 py-3 hover:bg-teal-500 transition-colors"
        >
          Sign out &amp; try again
        </Link>
      </div>
    </div>
  )
}
