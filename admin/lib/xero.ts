import { createAdminClient } from '@/lib/server'

export const XERO_AUTH_URL  = 'https://login.xero.com/identity/connect/authorize'
export const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token'
export const XERO_CONN_URL  = 'https://api.xero.com/connections'

export function xeroBasicAuth(): string {
  const id = process.env.XERO_CLIENT_ID!
  const secret = process.env.XERO_CLIENT_SECRET!
  return Buffer.from(`${id}:${secret}`).toString('base64')
}

interface XeroTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

/** Exchange an authorization code for tokens. */
export async function exchangeCodeForTokens(code: string): Promise<XeroTokenResponse> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.XERO_REDIRECT_URI!,
    }),
  })
  if (!res.ok) throw new Error(`Xero token exchange failed (${res.status}): ${await res.text()}`)
  return res.json()
}

/** Get the list of orgs (tenants) this token can access. */
export async function fetchXeroConnections(accessToken: string) {
  const res = await fetch(XERO_CONN_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`Xero connections failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<Array<{ id: string; tenantId: string; tenantType: string; tenantName: string }>>
}

/**
 * Returns a valid access token for a tenant, refreshing it if it's within ~2 min of expiry.
 * Updates the stored tokens on refresh. Use this for all Xero API calls (e.g. payroll export).
 */
export async function getValidXeroToken(tenantId: string): Promise<string> {
  const admin = createAdminClient()
  const { data: conn, error } = await admin
    .from('xero_connections')
    .select('access_token, refresh_token, expires_at')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error || !conn) throw new Error('This Xero organisation is not connected.')

  const expiresAt = new Date(conn.expires_at).getTime()
  if (Date.now() < expiresAt - 120_000) return conn.access_token

  // Refresh
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${xeroBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Xero token refresh failed (${res.status}). Reconnect the organisation.`)
  const token: XeroTokenResponse = await res.json()

  await admin
    .from('xero_connections')
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(Date.now() + (token.expires_in - 60) * 1000).toISOString(),
    })
    .eq('tenant_id', tenantId)

  return token.access_token
}
