export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { signToken, type SessionPayload } from '@/lib/auth'

const COOKIE_OPTS = {
  httpOnly: false,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 7,
  path: '/',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usuarios() { return getSupabaseAdmin().from('usuarios' as any) as any }

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Preencha usuário e senha' }, { status: 400 })
  }

  const { data: user, error } = await usuarios()
    .select('*')
    .eq('username', username.trim().toLowerCase())
    .eq('active', true)
    .single()

  if (error || !user) {
    return NextResponse.json({ error: 'Usuário não encontrado ou inativo' }, { status: 401 })
  }

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  }

  const payload: SessionPayload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    dentistaId: user.dentista_id ?? null,
    forcePasswordChange: user.force_password_change,
  }

  const token = await signToken(payload)

  let redirect = '/dashboard'
  if (user.force_password_change) redirect = '/dashboard/change-password'
  else if (user.role === 'dentista' && user.dentista_id) redirect = `/dashboard/financeiro/${user.dentista_id}`

  const res = NextResponse.json({ redirect })

  res.cookies.set('auth_token', token, { ...COOKIE_OPTS, httpOnly: true })
  res.cookies.set('session_info', encodeURIComponent(JSON.stringify({
    username: user.username,
    role: user.role,
    dentistaId: user.dentista_id ?? null,
    forcePasswordChange: user.force_password_change,
  })), COOKIE_OPTS)

  return res
}
