export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyToken, signToken } from '@/lib/auth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usuarios() { return getSupabaseAdmin().from('usuarios' as any) as any }

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const session = await verifyToken(token)
  if (!session) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()
  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json({ error: 'A nova senha deve ter no mínimo 6 caracteres' }, { status: 400 })
  }

  const { data: user } = await usuarios().select('password_hash').eq('id', session.userId).single()
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

  if (!session.forcePasswordChange) {
    const ok = await bcrypt.compare(currentPassword, user.password_hash)
    if (!ok) return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 401 })
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await usuarios().update({ password_hash: hash, force_password_change: false }).eq('id', session.userId)

  const newSession = { ...session, forcePasswordChange: false }
  const newToken = await signToken(newSession)

  const OPTS = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 7, path: '/' }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('auth_token', newToken, { ...OPTS, httpOnly: true })
  res.cookies.set('session_info', encodeURIComponent(JSON.stringify({
    username: newSession.username, role: newSession.role,
    dentistaId: newSession.dentistaId, forcePasswordChange: false,
  })), { ...OPTS, httpOnly: false })

  return res
}
