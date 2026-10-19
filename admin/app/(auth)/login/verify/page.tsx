import VerifyClient from './verify-client'

/**
 * Shown by the middleware when a signed-in admin with an authenticator app
 * has a session that has not yet passed the second factor (e.g. a restored
 * session). Same look as the login page.
 */
export default function VerifyPage() {
  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: '#000000',
        backgroundImage: 'url(/login_bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(105deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.72) 50%, rgba(0,0,0,0.9) 100%)' }}
      />
      <div className="relative w-full max-w-md px-6">
        <div className="rounded-3xl p-8" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(14px)' }}>
          <VerifyClient />
        </div>
      </div>
    </div>
  )
}
