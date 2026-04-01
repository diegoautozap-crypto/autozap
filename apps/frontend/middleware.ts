import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Só protege rotas do dashboard
  if (!pathname.startsWith('/dashboard')) return NextResponse.next()

  // Checa se tem cookie/header de auth
  // Como usamos localStorage (client-side), não temos cookie no server
  // Mas podemos checar se a página de login deve ser mostrada primeiro
  // via um cookie que setamos no login

  const authCookie = request.cookies.get('accessToken')
  if (!authCookie?.value) {
    // Sem cookie de auth → redireciona pro login
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
