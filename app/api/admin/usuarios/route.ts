export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyToken } from '@/lib/auth'

async function getAdmin(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value
  if (!token) return null
  const s = await verifyToken(token)
  return s?.role === 'admin' ? s : null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function usuarios() { return getSupabaseAdmin().from('usuarios' as any) as any }

export async function GET(req: NextRequest) {
  if (!await getAdmin(req)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { data } = await usuarios()
    .select('id, username, role, dentista_id, force_password_change, active, created_at')
    .order('username')
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  if (!await getAdmin(req)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { username, role, senha, dentista_id } = await req.json()
  if (!username || !role || !senha) return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  if (senha.length < 6) return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 })

  const hash = await bcrypt.hash(senha, 10)
  const { data, error } = await usuarios()
    .insert({ username, password_hash: hash, role, dentista_id: dentista_id ?? null, force_password_change: false, active: true })
    .select('id, username, role, dentista_id, force_password_change, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ usuario: data })
}

export async function PATCH(req: NextRequest) {
  if (!await getAdmin(req)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json()
  const { id, action, dentista_id } = body

  if (action === 'reset_password') {
    const hash = await bcrypt.hash('implante', 10)
    await usuarios().update({ password_hash: hash, force_password_change: true }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'toggle_active') {
    const { data } = await usuarios().select('active').eq('id', id).single()
    await usuarios().update({ active: !data?.active }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'force_change') {
    await usuarios().update({ force_password_change: true }).eq('id', id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'set_dentista') {
    await usuarios().update({ dentista_id: dentista_id ?? null }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
