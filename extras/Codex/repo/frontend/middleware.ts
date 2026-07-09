import { NextRequest, NextResponse } from 'next/server'

// HTTP Basic Auth gate for hosted deployments (e.g. htxpunk.com/mvgen).
// Only active when both AUTH_USERNAME/AUTH_PASSWORD are set — local/desktop
// use (Electron, `npm run dev`) is unaffected. Mirrors the same gate in
// backend/main.py so both surfaces are self-defending regardless of how
// they end up proxied/routed in front.
export function middleware(request: NextRequest) {
  const username = process.env.AUTH_USERNAME
  const password = process.env.AUTH_PASSWORD
  if (!username || !password) {
    return NextResponse.next()
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const separatorIndex = decoded.indexOf(':')
    const user = decoded.slice(0, separatorIndex)
    const pass = decoded.slice(separatorIndex + 1)
    if (user === username && pass === password) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="HTXpunk MV Generator"' },
  })
}

export const config = {
  // Run on every route except Next's own internals/static assets, which
  // don't need gating and gating them would break page loads.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
