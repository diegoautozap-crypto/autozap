import { NextRequest, NextResponse } from 'next/server'

// Páginas que não precisam de autenticação
const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email']

// Páginas exclusivas de owner/admin
const ADMIN_ONLY = [
  '/dashboard/campaigns',
  '/dashboard/templates',
  '/dashboard/channels',
  '/dashboard/flows',
  '/dashboard/team',
  '/dashboard/settings',
  '/dashboard/errors',
]

// Páginas de owner apenas
const OWNER_ONLY = [
  '/dashboard/settings/billing',
  '/dashboard/plan',
]

export function middleware(req: NextRequest) {
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
    // Busca o token do cookie
    const token = req.cookies.get('accessToken')?.value

    if (!token) {
      // Não autenticado — redireciona para login
      const url = req.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    // Decodifica o payload do JWT sem verificar assinatura (verificação real é no backend)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const role = payload?.role || 'agent'
      const now = Math.floor(Date.now() / 1000)

      // Token expirado
      if (payload.exp && payload.exp < now) {
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }

      // Atendente tentando acessar página restrita
      if (role === 'agent') {
        const isRestricted = ADMIN_ONLY.some(p => pathname.startsWith(p)) ||
          OWNER_ONLY.some(p => pathname.startsWith(p)) ||
          pathname === '/dashboard' ||
          pathname.startsWith('/dashboard/crm') ||
          pathname.startsWith('/dashboard/pipeline') ||
          pathname.startsWith('/dashboard/contacts')

        if (isRestricted) {
          const url = req.nextUrl.clone()
          url.pathname = '/dashboard/inbox'
          return NextResponse.redirect(url)
        }
      }

      // Supervisor tentando acessar página de admin
      if (role === 'supervisor') {
        const isAdminOnly = ADMIN_ONLY.some(p => pathname.startsWith(p)) ||
          OWNER_ONLY.some(p => pathname.startsWith(p))

        if (isAdminOnly) {
          const url = req.nextUrl.clone()
          url.pathname = '/dashboard/inbox'
          return NextResponse.redirect(url)
        }
      }

      // Owner only pages
      if (role !== 'owner' && OWNER_ONLY.some(p => pathname.startsWith(p))) {
        const url = req.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

    } catch {
      // Token inválido — redireciona para login
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