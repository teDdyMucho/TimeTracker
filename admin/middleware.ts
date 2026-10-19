import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: { name: string; value: string; options?: object }[]) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options as never),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Allow the sign-out route through without any checks
  if (pathname.startsWith('/auth/signout')) return response

  // The period-end cron (pg_cron → pg_net) calls this with a shared secret and
  // no cookies; the route checks the secret itself. Browser calls from the
  // Settings "Run now" button carry no header and go through the normal gates.
  if (pathname === '/api/payroll/auto-run' && request.headers.has('x-cron-secret')) return response

  // Public routes that never require login (workers use these to install the app).
  const PUBLIC_PATHS = ['/login', '/install']
  const isPublic =
    PUBLIC_PATHS.includes(pathname) || pathname === '/Timevera.apk'
  if (isPublic) {
    // Still bounce a logged-in admin off the login screen, but let everyone
    // (signed in or not) reach /install and the APK download. Only for page
    // loads (GET): the login page's server actions (password step, then the
    // 2FA code step while the session is still first-factor) POST to /login
    // and must reach the action, not a redirect.
    if (user && pathname === '/login' && request.method === 'GET') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single()

  // A deactivated account must not keep a live dashboard session either.
  if (profile && profile.status !== 'active') {
    return NextResponse.redirect(
      new URL('/auth/signout?reason=deactivated', request.url),
    )
  }

  const role = profile?.role
  if (!profile || (role !== 'admin' && role !== 'supervisor')) {
    // No readable profile, or not a portal role: sign out with a clear message
    return NextResponse.redirect(
      new URL('/auth/signout?reason=not_admin', request.url),
    )
  }

  // ── Two-factor authentication (PRD task "Verify admin 2FA") ─────────────────
  // A user with a verified authenticator app must have passed the second step
  // (AAL2) before anything but the verify page is served. "Has a factor" comes
  // from the server-validated user (getUser), never from the cookie's cached
  // user object, which the browser can edit; the current level comes from the
  // signed JWT that getUser just validated.
  const hasVerifiedFactor = (user.factors ?? []).some((f) => f.status === 'verified')
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const needsSecondFactor = hasVerifiedFactor && aal?.currentLevel !== 'aal2'
  if (needsSecondFactor && pathname !== '/login/verify') {
    return NextResponse.redirect(new URL('/login/verify', request.url))
  }
  if (!needsSecondFactor && pathname === '/login/verify' && request.method === 'GET') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Supervisors (PRD §4) may review their team's overtime, attendance and
  // leave. Anything else sends them to the overtime queue. Pages and actions
  // scope their data to the supervisor's team (lib/viewer.ts).
  if (profile && role === 'supervisor') {
    const allowed = ['/overtime', '/attendance', '/leave', '/login/verify']
    const ok = allowed.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (!ok) return NextResponse.redirect(new URL('/overtime', request.url))
    return response
  }

  // Optional admin-wide rule: every admin must have an authenticator app.
  // Admins without one can only reach Settings until they set it up. The
  // extra settings read only happens for admins who have no factor yet.
  if (role === 'admin' && !hasVerifiedFactor && !pathname.startsWith('/settings') && !pathname.startsWith('/api/')) {
    const { data: security } = await supabase.from('settings').select('value').eq('key', 'security').maybeSingle()
    const required = (security?.value as { requireAdmin2fa?: boolean } | null)?.requireAdmin2fa === true
    if (required) return NextResponse.redirect(new URL('/settings?setup2fa=1', request.url))
  }

  return response
}

export const config = {
  // Skip Next internals AND static asset files (images/fonts) so public/ assets
  // like login_bg.png aren't caught by the auth redirect.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif|woff2?)$).*)'],
}
