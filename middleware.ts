import { type NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  // Catch OAuth code at ANY path and forward to auth callback
  if (code && !pathname.startsWith('/auth/callback') && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
    const url = new URL('/auth/callback', request.url)
    url.search = searchParams.toString()
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
