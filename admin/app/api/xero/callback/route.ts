import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Legacy OAuth2 redirect callback — no longer used.
 *
 * Timevera now uses a Xero *Custom Connection* (machine-to-machine). There is no
 * interactive "Connect Xero" redirect: an admin authorises the app once in Xero,
 * after which the app fetches tokens directly via client_credentials. This route
 * is kept only so any old bookmarked URL lands gracefully back on Entities.
 */
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/entities?xero=custom_connection', req.url))
}
