'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/app/dashboard/SessionProvider'

type UltimoLancamento = {
  id: string
  data: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  forma: string
  pacientes: { nome: string } | null
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DashboardPage() {
  const session = useSession()
  const router  = useRouter()
  const hoje = new Date()

  useEffect(() => {
    if (session?.role === 'recepcao') router.replace('/dashboard/movimento-diario')
  }, [session?.role])
  const iniciomes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const fimMes = toISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))

  const [totalPacientes, setTotalPacientes]   = useState<number | null>(null)
  const [movHoje, setMovHoje]                 = useState<number | null>(null)
  const [receitaMes, setReceitaMes]           = useState<number | null>(null)
  const [despesaMes, setDespesaMes]           = useState<number | null>(null)
  const [ultimos, setUltimos]                 = useState<UltimoLancamento[]>([])

  useEffect(() => {
    const dataHoje = toISO(hoje)

    Promise.all([
      supabase.from('pacientes').select('id', { count: 'exact', head: true }),
      supabase.from('lancamentos').select('id', { count: 'exact', head: true }).eq('data', dataHoje),
      supabase.from('lancamentos').select('valor').eq('tipo', 'receita').gte('data', iniciomes).lte('data', fimMes),
      supabase.from('lancamentos').select('valor').eq('tipo', 'despesa').gte('data', iniciomes).lte('data', fimMes),
      supabase.from('lancamentos').select('*, pacientes(nome)').order('data', { ascending: false }).order('created_at', { ascending: false }).limit(6),
    ]).then(([pac, mov, rec, desp, ult]) => {
      if (pac.count !== null) setTotalPacientes(pac.count)
      if (mov.count !== null) setMovHoje(mov.count)
      if (rec.data) setReceitaMes(rec.data.reduce((s, l) => s + l.valor, 0))
      if (desp.data) setDespesaMes(desp.data.reduce((s, l) => s + l.valor, 0))
      if (ult.data) setUltimos(ult.data as UltimoLancamento[])
    })
  }, [])

  const saldoMes = (receitaMes ?? 0) - (despesaMes ?? 0)

  const cards = [
    { label: 'Total de Pacientes', value: totalPacientes !== null ? String(totalPacientes) : '—', sub: 'cadastrados',     href: '/dashboard/pacientes' },
    { label: 'Movimentos Hoje',    value: movHoje       !== null ? String(movHoje)       : '—', sub: 'lançamentos hoje', href: '/dashboard/movimento-diario' },
    { label: 'Receita do Mês',     value: receitaMes    !== null ? `R$ ${fmt(receitaMes)}`    : '—', sub: 'em pagamentos', href: '/dashboard/financeiro' },
    { label: 'Saldo do Mês',       value: receitaMes    !== null ? `R$ ${fmt(saldoMes)}`      : '—', sub: saldoMes >= 0 ? 'positivo' : 'negativo', href: '/dashboard/financeiro' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Visão geral da clínica</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card-p5 block">
            <p className="card-label">{card.label}</p>
            <p className={`card-value ${card.label === 'Saldo do Mês' && saldoMes < 0 && receitaMes !== null ? 'text-despesa' : ''}`}>
              {card.value}
            </p>
            <p className="card-sub">{card.sub}</p>
          </Link>
        ))}
      </div>

      <div className="card-p6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="widget-title mb-0">Últimos Lançamentos</h2>
          <Link href="/dashboard/movimento-diario" className="text-xs text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors">
            ver todos →
          </Link>
        </div>

        {ultimos.length === 0 ? (
          <p className="empty-text">Nenhum lançamento registrado ainda</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ultimos.map(l => (
              <div key={l.id} className="movimento-item">
                <div className={l.tipo === 'receita' ? 'dot-receita' : 'dot-despesa'} />
                <div className="flex-1 min-w-0">
                  <p className="mov-desc">{l.descricao}</p>
                  <p className="mov-meta">
                    {l.data.split('-').reverse().join('/')} · {l.forma}
                    {l.pacientes ? ` · ${l.pacientes.nome}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-medium flex-shrink-0 ${l.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}>
                  {l.tipo === 'receita' ? '+' : '-'} R$ {fmt(l.valor)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
