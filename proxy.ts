import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

const PUBLIC = ['/login', '/api/auth/', '/api/setup']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get('auth_token')?.value
  if (!token) return NextResponse.redirect(new URL('/login', req.url))

  const session = await verifyToken(token)
  if (!session) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('auth_token')
    res.cookies.delete('session_info')
    return res
  }

  if (session.forcePasswordChange && pathname !== '/dashboard/change-password') {
    return NextResponse.redirect(new URL('/dashboard/change-password', req.url))
  }

  if (session.role === 'dentista') {
    if (!session.dentistaId) return NextResponse.redirect(new URL('/login', req.url))
    const allowed = `/dashboard/financeiro/${session.dentistaId}`
    if (!pathname.startsWith(allowed)) {
      return NextResponse.redirect(new URL(allowed, req.url))
    }
  }

  if (session.role === 'gestor' && pathname.startsWith('/dashboard/admin')) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  if (session.role === 'recepcao') {
    const exacto = ['/dashboard', '/dashboard/change-password']
    const comSubrotas = ['/dashboard/movimento-diario', '/dashboard/pacientes', '/dashboard/fornecedores']
    const ok = exacto.includes(pathname) || comSubrotas.some(p => pathname === p || pathname.startsWith(p + '/'))
    if (!ok) return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
