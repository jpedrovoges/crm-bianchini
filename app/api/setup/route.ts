export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const SENHA_PADRAO = 'implante'

const USUARIOS = [
  { username: 'admin',               role: 'admin',     nomes: [] as string[] },
  { username: 'neia.andrade',        role: 'gestor',    nomes: ['neia', 'andrade'] },
  { username: 'recepcao',            role: 'recepcao',  nomes: [] as string[] },
  { username: 'marco.bianchini',     role: 'dentista',  nomes: ['marco', 'bianchini'] },
  { username: 'raissa.curtarelli',   role: 'dentista',  nomes: ['raissa', 'curtarelli'] },
  { username: 'nicole.lucca',        role: 'dentista',  nomes: ['nicole', 'lucca'] },
  { username: 'guilherme.biezus',    role: 'dentista',  nomes: ['guilherme', 'biezus'] },
  { username: 'jose.moises',         role: 'dentista',  nomes: ['jose', 'moises', 'moisés'] },
  { username: 'bruna.mueller',       role: 'dentista',  nomes: ['bruna', 'mueller', 'müller'] },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db() { return getSupabaseAdmin() as any }

export async function GET() {
  const { count } = await db().from('usuarios').select('*', { count: 'exact', head: true })
  if (count && count > 0) {
    return NextResponse.json({ error: 'Setup já foi executado. Usuários já existem.' }, { status: 400 })
  }

  const { data: dentistas } = await db().from('dentistas').select('id, nome')
  const hash = await bcrypt.hash(SENHA_PADRAO, 10)

  function matchDentista(nomes: string[]): string | null {
    if (!nomes.length || !dentistas) return null
    const d = dentistas.find((d: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
      nomes.every(n => d.nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(
        n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      ))
    )
    return d?.id ?? null
  }

  const rows = USUARIOS.map(u => ({
    username: u.username,
    password_hash: hash,
    role: u.role,
    dentista_id: matchDentista(u.nomes),
    force_password_change: false,
    active: true,
  }))

  const { error } = await db().from('usuarios').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, criados: rows.map((r: any) => r.username) }) // eslint-disable-line @typescript-eslint/no-explicit-any
}
