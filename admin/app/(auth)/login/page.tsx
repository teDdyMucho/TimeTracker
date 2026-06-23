import LoginForm from './login-form'

const ERROR_MESSAGES: Record<string, string> = {
  not_admin: 'This portal is for admin accounts only. Please sign in with an admin account.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const initialError = params.error ? (ERROR_MESSAGES[params.error] ?? null) : null

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden p-4"
      style={{ background: 'linear-gradient(135deg, #040B14 0%, #071020 50%, #060E1C 100%)' }}
    >
      {/* Glow orbs */}
      <div
        className="absolute -top-48 -right-48 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(10,191,163,0.12) 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-48 -left-48 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(10,191,163,0.04) 0%, transparent 60%)' }}
      />

      <LoginForm initialError={initialError} />
    </div>
  )
}
