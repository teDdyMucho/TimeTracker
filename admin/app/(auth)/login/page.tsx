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
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <LoginForm initialError={initialError} />
    </div>
  )
}
