// @ts-nocheck  — This file runs on the Deno runtime (Supabase Edge Functions),
// not Node. VS Code's Node TypeScript checker flags the `Deno` global and the
// https:// URL imports as errors, but they are valid in Deno and deploy fine.
//
// Supabase Edge Function: send-employee-invite
//
// Sends an employee their Timevera login details via Outlook (Microsoft 365)
// using the Microsoft Graph API with the OAuth2 *client credentials* flow
// (app-only, no interactive login — works even with MFA on the mailbox).
//
// Required Edge Function secrets (set with `supabase secrets set ...`):
//   MS_TENANT_ID       — Azure AD tenant (directory) ID
//   MS_CLIENT_ID       — Azure app registration Application (client) ID
//   MS_CLIENT_SECRET   — Azure app client secret VALUE
//   MS_SENDER_EMAIL    — mailbox the email is sent FROM (admin@buildonedesignconstruction.com.au)
//   INVITE_SHARED_SECRET — random string; the admin app sends it in `x-invite-secret`
//
// Azure setup (done): app "Timevera" registered, Microsoft Graph *Application*
// permission `Mail.Send` added. REQUIRED: a Global Admin must click
// "Grant admin consent" (or open the adminconsent URL) before this will work.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-invite-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface InvitePayload {
  to: string
  name: string
  email: string
  password: string
  loginUrl?: string
}

async function getGraphToken(): Promise<string> {
  const tenant = Deno.env.get('MS_TENANT_ID')!
  const body = new URLSearchParams({
    client_id: Deno.env.get('MS_CLIENT_ID')!,
    client_secret: Deno.env.get('MS_CLIENT_SECRET')!,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`)
  const json = await res.json()
  return json.access_token as string
}

function buildHtml(p: InvitePayload): string {
  const link = p.loginUrl ?? 'https://timevera.netlify.app/install'
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1C1A16">
    <h2 style="color:#1C1A16">Welcome to Timevera, ${p.name}!</h2>
    <p>Your Timevera account has been created. Use the details below to sign in on the app.</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 12px;color:#71717A">Email</td><td style="padding:6px 12px;font-weight:bold">${p.email}</td></tr>
      <tr><td style="padding:6px 12px;color:#71717A">Password</td><td style="padding:6px 12px;font-weight:bold">${p.password}</td></tr>
    </table>
    <p><a href="${link}" style="display:inline-block;background:#1C1A16;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Get the App</a></p>
    <p style="color:#71717A;font-size:13px">For your security, please change your password after your first sign-in. If you didn't expect this email, contact your administrator.</p>
  </div>`
}

async function sendMail(token: string, p: InvitePayload): Promise<void> {
  const sender = Deno.env.get('MS_SENDER_EMAIL')!
  const message = {
    message: {
      subject: 'Your Timevera account details',
      body: { contentType: 'HTML', content: buildHtml(p) },
      toRecipients: [{ emailAddress: { address: p.to } }],
    },
    saveToSentItems: true,
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!res.ok) throw new Error(`sendMail failed (${res.status}): ${await res.text()}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  // Shared-secret guard so only our admin app can trigger emails.
  const expected = Deno.env.get('INVITE_SHARED_SECRET')
  if (expected && req.headers.get('x-invite-secret') !== expected) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  try {
    const p = (await req.json()) as InvitePayload
    if (!p?.to || !p?.name || !p?.password) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    const token = await getGraphToken()
    await sendMail(token, p)
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[send-employee-invite]', e)
    return new Response(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
