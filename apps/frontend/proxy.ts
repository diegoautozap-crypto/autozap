import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Deixa passar rotas públicas e assets
  if (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Verifica se está tentando acessar rota do dashboard
  if (pathname.startsWith('/dashboard')) {
    const token = req.cookies.get('accessToken')?.value

    if (!token) {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const now = Math.floor(Date.now() / 1000)

      // Token expirado
      if (payload.exp && payload.exp < now) {
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      const role = payload?.role || 'agent'

      // Admin e owner passam sempre
      if (role === 'admin' || role === 'owner') {
        return NextResponse.next()
      }

      // Para agent e supervisor — deixa o frontend (sidebar) controlar as permissões
      // O middleware só bloqueia se não estiver autenticado
      return NextResponse.next()

    } catch {
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
