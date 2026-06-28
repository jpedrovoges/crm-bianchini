'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ImportarCelos from './ImportarCelos'
import { useSession } from '@/app/dashboard/SessionProvider'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const FORMAS = ['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Convênio', 'Rateio', 'Desconto']

type Periodo = 'mes' | 'ano'

type Pagamento = {
  id: string
  dentista_id: string
  valor: number
  data: string
  forma: string
  descricao: string | null
  created_at: string
}

type Lancamento = {
  id: string
  data: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  forma: string
  nota_fiscal: boolean
  numero_nf: string | null
  categoria: string | null
  observacao: string | null
  pacientes: { nome: string } | null
}

// Repasse saindo deste dentista (origem)
type Repasse = {
  id: string
  lancamento_id: string
  dentista_destino_id: string
  percentual: number
  valor: number
}

// Repasse chegando para este dentista (destino)
type RepasseRecebido = {
  id: string
  lancamento_id: string
  dentista_origem_id: string
  percentual: number
  valor: number
  lancamento: { data: string; descricao: string } | null
  origem: { nome: string } | null
}

type DespesaResponsavel = {
  id: string
  data: string
  descricao: string
  valor: number
  forma: string
}

type ConfigRateio = {
  id: string
  percentual_dentista: number
  percentual_marco: number
  percentual_outros: number
  marco_dentista_id: string | null
  dentistas_rateio: string[]
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const AVATARES = [
  'bg-cyan-950/60 text-cyan-400',
  'bg-violet-950/60 text-violet-400',
  'bg-teal-950/60 text-teal-400',
  'bg-indigo-950/60 text-indigo-400',
  'bg-sky-950/60 text-sky-400',
]
function corAvatar(nome: string) { return AVATARES[nome.charCodeAt(0) % AVATARES.length] }
function iniciais(nome: string) {
  const p = nome.trim().split(' ')
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

export default function DentistaFinanceiroPage() {
  const params = useParams<{ dentistaId: string }>()
  const dentistaId = params.dentistaId

  const hoje = new Date()
  const [dentistaNome, setDentistaNome] = useState<string | null>(null)
  const [periodo, setPeriodo]   = useState<Periodo>('mes')
  const [mes, setMes]           = useState(hoje.getMonth())
  const [ano, setAno]           = useState(hoje.getFullYear())
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading]   = useState(true)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [confirmarLimparData, setConfirmarLimparData] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const session    = useSession()
  const soLeitura  = session?.role === 'dentista'
  const podeEditar = session?.role === 'admin' || session?.role === 'gestor'

  const [pagamentos, setPagamentos]   = useState<Pagamento[]>([])
  const [modalPagamento, setModalPagamento] = useState(false)
  const [formPag, setFormPag]         = useState({ valor: '', forma: 'Pix', descricao: '', data: '' })
  const [salvandoPag, setSalvandoPag] = useState(false)
  const [confirmandoPagId, setConfirmandoPagId] = useState<string | null>(null)

  // Repasses saindo (origem = este dentista)
  const [repasses, setRepasses]           = useState<Record<string, Repasse[]>>({})
  const [expandidoLancId, setExpandidoLancId] = useState<string | null>(null)
  const [listaDentistas, setListaDentistas]   = useState<{ id: string; nome: string }[]>([])
  const [formRepasse, setFormRepasse]     = useState<{ lancId: string; percentual: string; destinoId: string } | null>(null)
  const [salvandoRepasse, setSalvandoRepasse] = useState(false)

  // Repasses chegando (destino = este dentista)
  const [repassesRecebidos, setRepassesRecebidos] = useState<RepasseRecebido[]>([])

  // Despesas do movimento diário atribuídas a este dentista
  const [despesasResponsavel, setDespesasResponsavel] = useState<DespesaResponsavel[]>([])

  // Fechar mês
  const [modalFecharMes, setModalFecharMes] = useState(false)
  const [modoFechamento, setModoFechamento] = useState<'rateio' | 'simples'>('rateio')
  const [configRateio, setConfigRateio] = useState<ConfigRateio | null>(null)
  const [selecionadosRateio, setSelecionadosRateio] = useState<string[]>([])
  const [fechandoMes, setFechandoMes] = useState(false)
  const [erroFechamento, setErroFechamento] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('dentistas').select('nome').eq('id', dentistaId).single()
      .then(({ data }) => { if (data) setDentistaNome(data.nome) })
    supabase.from('pagamentos_dentistas').select('*').eq('dentista_id', dentistaId)
      .order('data', { ascending: false })
      .then(({ data }) => { if (data) setPagamentos(data as Pagamento[]) })
  }, [dentistaId])

  useEffect(() => {
    supabase.from('dentistas').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setListaDentistas(data) })
  }, [])

  useEffect(() => {
    setLoading(true)
    const inicio = periodo === 'mes' ? toISO(ano, mes, 1) : `${ano}-01-01`
    const fim    = periodo === 'mes' ? toISO(ano, mes, new Date(ano, mes + 1, 0).getDate()) : `${ano}-12-31`
    supabase.from('lancamentos')
      .select('*, pacientes(nome)')
      .eq('dentista_id', dentistaId)
      .gte('data', inicio).lte('data', fim)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setLancamentos(data as Lancamento[])
        setLoading(false)
      })
  }, [dentistaId, mes, ano, periodo, refreshKey])

  // Repasses saindo: carrega para os lançamentos do período
  useEffect(() => {
    if (lancamentos.length === 0) { setRepasses({}); return }
    const ids = lancamentos.map(l => l.id)
    supabase.from('repasses').select('*').in('lancamento_id', ids)
      .then(({ data }) => {
        if (!data) return
        const grouped: Record<string, Repasse[]> = {}
        data.forEach(r => {
          if (!grouped[r.lancamento_id]) grouped[r.lancamento_id] = []
          grouped[r.lancamento_id].push(r as Repasse)
        })
        setRepasses(grouped)
      })
  }, [lancamentos])

  // Repasses chegando: todos onde este dentista é destino, filtrados pelo período
  useEffect(() => {
    const inicio = periodo === 'mes' ? toISO(ano, mes, 1) : `${ano}-01-01`
    const fim    = periodo === 'mes' ? toISO(ano, mes, new Date(ano, mes + 1, 0).getDate()) : `${ano}-12-31`
    supabase
      .from('repasses')
      .select('*, lancamento:lancamentos!lancamento_id(data, descricao), origem:dentistas!dentista_origem_id(nome)')
      .eq('dentista_destino_id', dentistaId)
      .then(({ data }) => {
        if (!data) return
        const filtrado = (data as RepasseRecebido[]).filter(r =>
          r.lancamento?.data && r.lancamento.data >= inicio && r.lancamento.data <= fim
        )
        setRepassesRecebidos(filtrado)
      })
  }, [dentistaId, mes, ano, periodo, refreshKey])

  // Despesas do movimento diário onde este dentista é o responsável
  useEffect(() => {
    const inicio = periodo === 'mes' ? toISO(ano, mes, 1) : `${ano}-01-01`
    const fim    = periodo === 'mes' ? toISO(ano, mes, new Date(ano, mes + 1, 0).getDate()) : `${ano}-12-31`
    supabase.from('lancamentos')
      .select('id, data, descricao, valor, forma')
      .eq('dentista_responsavel_id', dentistaId)
      .eq('tipo', 'despesa')
      .gte('data', inicio).lte('data', fim)
      .then(({ data }) => { if (data) setDespesasResponsavel(data as DespesaResponsavel[]) })
  }, [dentistaId, mes, ano, periodo, refreshKey])

  function mesAnterior() { if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1) }
  function proximoMes()  { if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1) }

  async function salvarPagamento() {
    if (!formPag.valor || !formPag.data) return
    setSalvandoPag(true)
    const { data, error } = await supabase.from('pagamentos_dentistas').insert({
      dentista_id: dentistaId,
      valor: parseFloat(formPag.valor),
      forma: formPag.forma,
      descricao: formPag.descricao.trim() || null,
      data: formPag.data,
    }).select('*').single()
    if (!error && data) setPagamentos(prev => [data as Pagamento, ...prev])
    setFormPag({ valor: '', forma: 'Pix', descricao: '', data: '' })
    setModalPagamento(false)
    setSalvandoPag(false)
  }

  async function excluirPagamento(id: string) {
    await supabase.from('pagamentos_dentistas').delete().eq('id', id)
    setPagamentos(prev => prev.filter(p => p.id !== id))
    setConfirmandoPagId(null)
  }

  async function adicionarRepasse(lancId: string) {
    if (!formRepasse?.percentual || !formRepasse?.destinoId) return
    const lanc = lancamentos.find(l => l.id === lancId)
    if (!lanc) return
    const pct = parseFloat(formRepasse.percentual)
    if (isNaN(pct) || pct <= 0 || pct > 100) return
    const valor = Math.round((lanc.valor * pct / 100) * 100) / 100
    setSalvandoRepasse(true)
    const { data, error } = await supabase.from('repasses').insert({
      lancamento_id: lancId,
      dentista_origem_id: dentistaId,
      dentista_destino_id: formRepasse.destinoId,
      percentual: pct,
      valor,
    }).select('*').single()
    if (!error && data) {
      setRepasses(prev => ({ ...prev, [lancId]: [...(prev[lancId] ?? []), data as Repasse] }))
    }
    setFormRepasse(null)
    setSalvandoRepasse(false)
  }

  async function removerRepasse(lancId: string, repasseId: string) {
    await supabase.from('repasses').delete().eq('id', repasseId)
    setRepasses(prev => ({ ...prev, [lancId]: (prev[lancId] ?? []).filter(r => r.id !== repasseId) }))
  }

  async function abrirFecharMes() {
    setErroFechamento(null)
    const { data } = await supabase.from('configuracoes_rateio').select('*').limit(1).single()
    if (data) {
      const cfg = { ...data, dentistas_rateio: (data.dentistas_rateio as string[]) ?? [] } as ConfigRateio
      setConfigRateio(cfg)
      setSelecionadosRateio(cfg.dentistas_rateio.filter(id => id !== dentistaId))
    }
    setModoFechamento('rateio')
    setModalFecharMes(true)
  }

  async function confirmarFechamento() {
    if (!configRateio || !dentistaNome) return
    setFechandoMes(true)
    setErroFechamento(null)

    const base = saldoLiquido
    if (base <= 0) { setErroFechamento('Saldo líquido é zero ou negativo.'); setFechandoMes(false); return }

    const marcoShare  = Math.round(base * (configRateio.percentual_marco / 100) * 100) / 100
    const outrosTotal = Math.round(base * (configRateio.percentual_outros / 100) * 100) / 100
    const numOutros   = selecionadosRateio.length
    const perOutros   = numOutros > 0 ? Math.round((outrosTotal / numOutros) * 100) / 100 : 0

    const ultimoDia = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
    const mesLabel  = `${MESES[mes]}/${ano}`
    const inserts   = []

    // Marco Bianchini
    if (marcoShare > 0 && configRateio.marco_dentista_id && configRateio.marco_dentista_id !== dentistaId) {
      inserts.push({
        data: ultimoDia, tipo: 'despesa', descricao: `Rateio Marco – ${mesLabel}`,
        valor: marcoShare, forma: 'Rateio', dentista_id: dentistaId, nota_fiscal: false,
      })
      inserts.push({
        data: ultimoDia, tipo: 'receita', descricao: `Rateio de ${dentistaNome} – ${mesLabel}`,
        valor: marcoShare, forma: 'Rateio', dentista_id: configRateio.marco_dentista_id, nota_fiscal: false,
      })
    }

    // Outros dentistas selecionados
    for (const outroId of selecionadosRateio) {
      if (outroId === dentistaId || perOutros <= 0) continue
      const outroNome = listaDentistas.find(d => d.id === outroId)?.nome ?? outroId
      inserts.push({
        data: ultimoDia, tipo: 'despesa', descricao: `Rateio ${outroNome} – ${mesLabel}`,
        valor: perOutros, forma: 'Rateio', dentista_id: dentistaId, nota_fiscal: false,
      })
      inserts.push({
        data: ultimoDia, tipo: 'receita', descricao: `Rateio de ${dentistaNome} – ${mesLabel}`,
        valor: perOutros, forma: 'Rateio', dentista_id: outroId, nota_fiscal: false,
      })
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from('lancamentos').insert(inserts)
      if (error) { setErroFechamento(error.message); setFechandoMes(false); return }
    }

    setFechandoMes(false)
    setModalFecharMes(false)
    setRefreshKey(k => k + 1)
  }

  const totalPago       = pagamentos.reduce((s, p) => s + p.valor, 0)
  const receitas        = lancamentos.filter(l => l.tipo === 'receita')
  const despesas        = lancamentos.filter(l => l.tipo === 'despesa')
  const totalRec        = receitas.reduce((s, l) => s + l.valor, 0)
  const totalDesp       = despesas.reduce((s, l) => s + l.valor, 0)
  const totalRepasses   = Object.values(repasses).flat().reduce((s, r) => s + r.valor, 0)
  const totalRecebidos  = repassesRecebidos.reduce((s, r) => s + r.valor, 0)
  const totalDespResp   = despesasResponsavel.reduce((s, l) => s + l.valor, 0)
  const saldoLiquido    = totalRec + totalRecebidos - totalDesp - totalRepasses - totalDespResp

  const porForma = FORMAS.map(forma => {
    const movs = receitas.filter(l => l.forma === forma)
    return { forma, total: movs.reduce((s, l) => s + l.valor, 0), count: movs.length }
  }).filter(f => f.count > 0)

  const porData = lancamentos.reduce<Record<string, Lancamento[]>>((acc, l) => {
    acc[l.data] = acc[l.data] ? [...acc[l.data], l] : [l]; return acc
  }, {})
  const datas = Object.keys(porData).sort((a, b) => b.localeCompare(a))

  const porMes = Array.from({ length: 12 }, (_, i) => {
    const mesStr = String(i + 1).padStart(2, '0')
    const movs   = lancamentos.filter(l => l.data.startsWith(`${ano}-${mesStr}`))
    const rec    = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
    const desp   = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
    const rep    = movs.flatMap(l => repasses[l.id] ?? []).reduce((s, r) => s + r.valor, 0)
    const receb  = repassesRecebidos
      .filter(r => r.lancamento?.data?.startsWith(`${ano}-${mesStr}`))
      .reduce((s, r) => s + r.valor, 0)
    return { mes: i, rec, desp, rep, receb, saldo: rec + receb - desp - rep }
  })

  const titulo = periodo === 'mes' ? `${MESES[mes]} ${ano}` : String(ano)

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link href="/dashboard/financeiro?aba=dentistas" className="text-xs nav-icon hover:text-[var(--text-2)] transition-colors inline-flex items-center gap-1 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Financeiro
        </Link>
        <div className="flex items-center gap-3">
          {dentistaNome && (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${corAvatar(dentistaNome)}`}>
              {iniciais(dentistaNome)}
            </div>
          )}
          <div>
            <h1 className="page-title">{dentistaNome ?? '...'}</h1>
            <p className="page-subtitle">Movimento financeiro</p>
          </div>
        </div>
      </div>

      {/* ── Controles de período ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={periodo === 'mes' ? mesAnterior : () => setAno(a => a - 1)} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="page-title text-sm">{titulo}</span>
          <button onClick={periodo === 'mes' ? proximoMes : () => setAno(a => a + 1)} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {podeEditar && periodo === 'mes' && (
            <button onClick={abrirFecharMes}
              className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Fechar Mês
            </button>
          )}
          <div className="flex gap-1 rounded-lg p-1 border border-[var(--border)]" style={{ backgroundColor: 'var(--surface-muted)' }}>
            {(['mes', 'ano'] as Periodo[]).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${periodo === p ? 'bg-[var(--surface)] text-[var(--text-1)] font-medium' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
                {p === 'mes' ? 'Mensal' : 'Anual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <p className="page-subtitle">Carregando...</p> : (
        <>
          {/* ── Cards resumo ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="card-p5">
              <p className="card-label">Receitas</p>
              <p className="card-value text-receita">R$ {fmt(totalRec)}</p>
              <p className="card-sub">{receitas.length} lançamento(s)</p>
            </div>
            <div className="card-p5">
              <p className="card-label">Repasses recebidos</p>
              <p className="card-value text-receita">R$ {fmt(totalRecebidos)}</p>
              <p className="card-sub">{repassesRecebidos.length} repasse(s)</p>
            </div>
            <div className="card-p5">
              <p className="card-label">Saídas</p>
              <p className="card-value text-despesa">R$ {fmt(totalDesp + totalRepasses + totalDespResp)}</p>
              <p className="card-sub">
                {totalDespResp > 0 ? `R$ ${fmt(totalDespResp)} atribuídas` : totalRepasses > 0 ? `R$ ${fmt(totalRepasses)} em repasses` : `${despesas.length} despesa(s)`}
              </p>
            </div>
            <div className="card-p5">
              <p className="card-label">Saldo líquido</p>
              <p className={`card-value ${saldoLiquido >= 0 ? 'text-receita' : 'text-despesa'}`}>
                R$ {fmt(saldoLiquido)}
              </p>
              <p className="card-sub">{lancamentos.length} lançamento(s)</p>
            </div>
          </div>

          {/* ── Visão anual: cards por mês ── */}
          {periodo === 'ano' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {porMes.map(({ mes: m, rec, desp, rep, receb, saldo }) => (
                <div key={m} className="card-p5">
                  <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-1)' }}>{MESES[m]}</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Entrada</span>
                      <span className="text-sm font-medium text-receita">R$ {fmt(rec)}</span>
                    </div>
                    {receb > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>Rep. recebido</span>
                        <span className="text-sm font-medium text-receita">+R$ {fmt(receb)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Saída</span>
                      <span className="text-sm font-medium text-despesa">R$ {fmt(desp)}</span>
                    </div>
                    {rep > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>Rep. pago</span>
                        <span className="text-sm font-medium text-despesa">-R$ {fmt(rep)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>Saldo</span>
                      <span className={`text-sm font-semibold ${saldo >= 0 ? 'text-receita' : 'text-despesa'}`}>
                        R$ {fmt(saldo)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (

          /* ── Visão mensal ── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Receitas por forma */}
            <div className="card-p5">
              <h2 className="widget-title">Receitas por Forma</h2>
              {porForma.length === 0 ? (
                <p className="empty-text">Sem receitas no período</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {porForma.sort((a, b) => b.total - a.total).map(f => (
                    <div key={f.forma}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--text-2)]">{f.forma}</span>
                        <span className="text-xs font-medium text-receita">R$ {fmt(f.total)}</span>
                      </div>
                      <div className="w-full h-1 rounded-full" style={{ backgroundColor: 'var(--surface-muted)' }}>
                        <div className="h-1 rounded-full bg-emerald-400"
                          style={{ width: `${totalRec > 0 ? (f.total / totalRec) * 100 : 0}%` }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{f.count} lançamento(s)</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Repasses recebidos no período */}
              {repassesRecebidos.length > 0 && (
                <div className="mt-5">
                  <h3 className="widget-title">Repasses Recebidos</h3>
                  <div className="flex flex-col gap-2">
                    {repassesRecebidos.map(r => (
                      <div key={r.id} className="flex items-center justify-between py-1.5 px-2 rounded"
                        style={{ backgroundColor: 'var(--surface-muted)' }}>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>
                            {r.lancamento?.descricao ?? '—'}
                          </p>
                          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                            {r.percentual}% de {r.origem?.nome ?? '?'} · {r.lancamento?.data?.split('-').reverse().join('/') ?? ''}
                          </p>
                        </div>
                        <span className="text-sm font-medium text-receita ml-3 flex-shrink-0">+R$ {fmt(r.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Despesas atribuídas (movimento diário) */}
              {despesasResponsavel.length > 0 && (
                <div className="mt-5">
                  <h3 className="widget-title">Despesas Atribuídas</h3>
                  <div className="flex flex-col gap-2">
                    {despesasResponsavel.map(d => {
                      const [a, m, dia] = d.data.split('-')
                      return (
                        <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded"
                          style={{ backgroundColor: 'var(--surface-muted)' }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{d.descricao}</p>
                            <p className="text-xs" style={{ color: 'var(--text-3)' }}>{dia}/{m}/{a}</p>
                          </div>
                          <span className="text-sm font-medium text-despesa ml-3 flex-shrink-0">-R$ {fmt(d.valor)}</span>
                        </div>
                      )
                    })}
                    <div className="flex justify-between items-center pt-1 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total atribuído</span>
                      <span className="text-xs font-semibold text-despesa">-R$ {fmt(totalDespResp)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Lançamentos por data */}
            <div className="lg:col-span-2 card-p5 flex flex-col" style={{ maxHeight: '32rem' }}>
              <h2 className="widget-title flex-shrink-0">Lançamentos do Período</h2>
              {lancamentos.length === 0 ? (
                <p className="empty-text">Nenhum lançamento em {titulo}</p>
              ) : (
                <div className="flex flex-col gap-5 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  {datas.map(data => {
                    const movs = porData[data]
                    const [a, m, d] = data.split('-')
                    const r  = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
                    const dp = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
                    return (
                      <div key={data}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-1)' }}>{d}/{m}/{a}</p>
                          <div className="flex items-center gap-3">
                            {r  > 0 && <span className="text-xs text-receita">+R$ {fmt(r)}</span>}
                            {dp > 0 && <span className="text-xs text-despesa">-R$ {fmt(dp)}</span>}
                            {!soLeitura && (confirmarLimparData !== data ? (
                              <button
                                onClick={() => { setConfirmarLimparData(data); setConfirmandoId(null) }}
                                className="nav-icon hover:text-red-400 transition-colors"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                </svg>
                              </button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={async () => {
                                    const ids = movs.map(l => l.id)
                                    await supabase.from('lancamentos').delete().in('id', ids)
                                    setLancamentos(prev => prev.filter(l => !ids.includes(l.id)))
                                    setConfirmarLimparData(null)
                                  }}
                                  className="text-xs px-2 py-0.5 rounded font-medium"
                                  style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.3)' }}
                                >
                                  Excluir tudo
                                </button>
                                <button onClick={() => setConfirmarLimparData(null)} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {movs.map(l => {
                            const catLabel     = l.categoria === 'venda' ? 'Venda' : l.categoria === 'procedimento' ? 'Procedimento' : null
                            const confirmando  = confirmandoId === l.id
                            const expandido    = expandidoLancId === l.id
                            const repassesLanc = repasses[l.id] ?? []
                            return (
                              <div key={l.id} className="rounded-lg border transition-colors"
                                style={{ borderColor: expandido ? 'var(--border-hover)' : 'var(--border)', backgroundColor: 'var(--surface)' }}>

                                {/* Cabeçalho clicável */}
                                <div
                                  className="flex items-center gap-3 p-3 cursor-pointer select-none"
                                  onClick={() => { setExpandidoLancId(expandido ? null : l.id); setFormRepasse(null) }}
                                >
                                  <div className={l.tipo === 'receita' ? 'dot-receita' : 'dot-despesa'} />
                                  <div className="flex-1 min-w-0">
                                    <p className="mov-desc">{l.descricao}</p>
                                    <p className="mov-meta">
                                      {l.forma}
                                      {catLabel ? ` · ${catLabel}` : ''}
                                      {l.pacientes ? ` · ${l.pacientes.nome}` : ''}
                                      {l.observacao ? ` · ${l.observacao}` : ''}
                                      {l.nota_fiscal ? ` · NF${l.numero_nf ? ` ${l.numero_nf}` : ' a emitir'}` : ''}
                                    </p>
                                  </div>
                                  <p className={`text-sm font-medium flex-shrink-0 ${l.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}>
                                    {l.tipo === 'receita' ? '+' : '-'} R$ {fmt(l.valor)}
                                  </p>
                                  {!soLeitura && !confirmando && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setConfirmandoId(l.id) }}
                                      className="nav-icon hover:text-red-400 transition-colors flex-shrink-0"
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                                      </svg>
                                    </button>
                                  )}
                                  {confirmando && (
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                      <button
                                        onClick={async e => {
                                          e.stopPropagation()
                                          await supabase.from('lancamentos').delete().eq('id', l.id)
                                          setLancamentos(prev => prev.filter(x => x.id !== l.id))
                                          setConfirmandoId(null)
                                        }}
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.3)' }}>
                                        Excluir
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); setConfirmandoId(null) }} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                      </button>
                                    </div>
                                  )}
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                    className={`nav-icon flex-shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`}>
                                    <path d="M6 9l6 6 6-6"/>
                                  </svg>
                                </div>

                                {/* Área expandida */}
                                {expandido && (
                                  <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                                    {repassesLanc.length > 0 && (
                                      <div className="mb-3">
                                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>Repasses</p>
                                        <div className="flex flex-col gap-1.5">
                                          {repassesLanc.map(rp => (
                                            <div key={rp.id} className="flex items-center justify-between py-1 rounded px-2"
                                              style={{ backgroundColor: 'var(--surface-muted)' }}>
                                              <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                {rp.percentual}% →{' '}
                                                <strong>{listaDentistas.find(dd => dd.id === rp.dentista_destino_id)?.nome ?? '...'}</strong>
                                              </span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-despesa">-R$ {fmt(rp.valor)}</span>
                                                {podeEditar && (
                                                  <button onClick={() => removerRepasse(l.id, rp.id)}
                                                    className="nav-icon hover:text-red-400 transition-colors">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {podeEditar && (
                                      formRepasse?.lancId === l.id ? (
                                        <div className="flex flex-wrap gap-2 items-center">
                                          <div className="flex items-center gap-1.5">
                                            <input
                                              type="number" min="0.1" max="100" step="0.1"
                                              placeholder="%"
                                              value={formRepasse.percentual}
                                              onChange={e => setFormRepasse(prev => prev ? { ...prev, percentual: e.target.value } : null)}
                                              className="form-input text-center"
                                              style={{ width: '4.5rem' }}
                                              autoFocus
                                            />
                                            <span className="text-xs" style={{ color: 'var(--text-3)' }}>%</span>
                                          </div>
                                          <select
                                            value={formRepasse.destinoId}
                                            onChange={e => setFormRepasse(prev => prev ? { ...prev, destinoId: e.target.value } : null)}
                                            className="form-select flex-1"
                                            style={{ minWidth: '9rem' }}
                                          >
                                            <option value="">Selecionar dentista...</option>
                                            {listaDentistas.filter(dd => dd.id !== dentistaId).map(dd => (
                                              <option key={dd.id} value={dd.id}>{dd.nome}</option>
                                            ))}
                                          </select>
                                          <div className="flex gap-1.5">
                                            <button
                                              onClick={() => adicionarRepasse(l.id)}
                                              disabled={!formRepasse.percentual || !formRepasse.destinoId || salvandoRepasse}
                                              className="btn-primary px-3 py-1.5 text-xs"
                                            >
                                              {salvandoRepasse ? '...' : 'Salvar'}
                                            </button>
                                            <button onClick={() => setFormRepasse(null)} className="btn-secondary px-2 py-1.5">
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => setFormRepasse({ lancId: l.id, percentual: '', destinoId: '' })}
                                          className="text-xs flex items-center gap-1 transition-colors"
                                          style={{ color: 'var(--text-3)' }}
                                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
                                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                                        >
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                                          Adicionar repasse
                                        </button>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          )}
        </>
      )}

      {/* ── Pagamentos ao Dentista ── */}
      <div className="mt-8">
        <div className="card-p5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="widget-title">Pagamentos</h2>
              <p className="card-sub">Acerto de comissões e repasses</p>
            </div>
            {!soLeitura && (
              <button onClick={() => { setFormPag({ valor: '', forma: 'Pix', descricao: '', data: new Date().toISOString().slice(0, 10) }); setModalPagamento(true) }}
                className="btn-primary px-3 py-1.5 text-xs">
                + Novo Pagamento
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="card-p5">
              <p className="card-label">Receitas no período</p>
              <p className="card-value text-receita">R$ {fmt(totalRec)}</p>
            </div>
            <div className="card-p5">
              <p className="card-label">Total pago</p>
              <p className="card-value text-despesa">R$ {fmt(totalPago)}</p>
              <p className="card-sub">{pagamentos.length} pagamento(s)</p>
            </div>
            <div className="card-p5">
              <p className="card-label">Saldo a pagar</p>
              <p className={`card-value ${totalRec - totalPago >= 0 ? 'text-receita' : 'text-despesa'}`}>
                R$ {fmt(totalRec - totalPago)}
              </p>
            </div>
          </div>

          {pagamentos.length === 0 ? (
            <p className="empty-text">Nenhum pagamento registrado</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pagamentos.map(p => {
                const [a, m, d] = p.data.split('-')
                const confirmando = confirmandoPagId === p.id
                return (
                  <div key={p.id} className="movimento-item">
                    <div className="dot-despesa" />
                    <div className="flex-1 min-w-0">
                      <p className="mov-desc">{p.descricao || 'Pagamento'}</p>
                      <p className="mov-meta">{d}/{m}/{a} · {p.forma}</p>
                    </div>
                    <p className="text-sm font-medium text-despesa flex-shrink-0">R$ {fmt(p.valor)}</p>
                    {!soLeitura && (!confirmando ? (
                      <button onClick={() => setConfirmandoPagId(p.id)}
                        className="nav-icon hover:text-red-400 transition-colors flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => excluirPagamento(p.id)}
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.3)' }}>
                          Excluir
                        </button>
                        <button onClick={() => setConfirmandoPagId(null)} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {modalPagamento && (
          <div className="modal-overlay">
            <div className="modal max-w-sm">
              <div className="modal-header">
                <h3 className="modal-title">Novo Pagamento</h3>
                <button onClick={() => setModalPagamento(false)} className="nav-icon hover:text-red-400 transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="form-label">Descrição</label>
                  <input type="text" value={formPag.descricao}
                    onChange={e => setFormPag(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Comissão Junho/2025" className="form-input" autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Valor (R$) <span className="text-red-400">*</span></label>
                    <input type="number" value={formPag.valor}
                      onChange={e => setFormPag(f => ({ ...f, valor: e.target.value }))}
                      placeholder="0,00" className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">Data <span className="text-red-400">*</span></label>
                    <input type="date" value={formPag.data}
                      onChange={e => setFormPag(f => ({ ...f, data: e.target.value }))}
                      className="form-input" />
                  </div>
                </div>
                <div>
                  <label className="form-label">Forma</label>
                  <select value={formPag.forma}
                    onChange={e => setFormPag(f => ({ ...f, forma: e.target.value }))}
                    className="form-select">
                    {FORMAS.map(fo => <option key={fo}>{fo}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setModalPagamento(false)} className="btn-secondary flex-1 py-2">Cancelar</button>
                <button onClick={salvarPagamento}
                  disabled={!formPag.valor || !formPag.data || salvandoPag}
                  className="btn-primary flex-1 py-2">
                  {salvandoPag ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Consultas Celos ── */}
      {!soLeitura && (
        <div className="mt-8">
          <ImportarCelos
            dentistaId={dentistaId}
            dentistaNome={dentistaNome ?? ''}
            mes={mes}
            ano={ano}
            onImportado={() => setRefreshKey(k => k + 1)}
          />
        </div>
      )}

      {/* ── Modal: Fechar Mês ── */}
      {modalFecharMes && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '32rem' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                Fechar Mês — {dentistaNome} — {MESES[mes]}/{ano}
              </h3>
              <button onClick={() => setModalFecharMes(false)} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Modo */}
            <div className="flex gap-2 mb-5">
              {([
                { key: 'rateio' as const, label: 'Com Rateio' },
                { key: 'simples' as const, label: 'Pagamento Simples' },
              ]).map(m => (
                <button key={m.key} onClick={() => setModoFechamento(m.key)}
                  className={`tipo-btn flex-1 ${modoFechamento === m.key ? 'bg-[var(--surface-muted)] border-[var(--border-hover)] text-[var(--text-1)] font-medium' : ''}`}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Resumo base */}
            <div className="rounded-xl p-4 mb-4 flex flex-col gap-2" style={{ backgroundColor: 'var(--surface-muted)' }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-3)' }}>Receitas</span>
                <span className="text-receita">+ R$ {fmt(totalRec)}</span>
              </div>
              {totalRecebidos > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-3)' }}>Rep. recebidos</span>
                  <span className="text-receita">+ R$ {fmt(totalRecebidos)}</span>
                </div>
              )}
              {totalDesp > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-3)' }}>Despesas</span>
                  <span className="text-despesa">- R$ {fmt(totalDesp)}</span>
                </div>
              )}
              {totalRepasses > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-3)' }}>Rep. pagos</span>
                  <span className="text-despesa">- R$ {fmt(totalRepasses)}</span>
                </div>
              )}
              {totalDespResp > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-3)' }}>Desp. atribuídas</span>
                  <span className="text-despesa">- R$ {fmt(totalDespResp)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-2)' }}>Base de cálculo</span>
                <span className={saldoLiquido >= 0 ? 'text-receita' : 'text-despesa'}>R$ {fmt(saldoLiquido)}</span>
              </div>
            </div>

            {/* Modo: Rateio */}
            {modoFechamento === 'rateio' && configRateio && (
              <div className="flex flex-col gap-4">
                <div className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>Distribuição</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                        {dentistaNome} retém ({configRateio.percentual_dentista}%)
                      </span>
                      <span className="text-sm font-semibold text-receita">
                        R$ {fmt(Math.max(0, saldoLiquido * configRateio.percentual_dentista / 100))}
                      </span>
                    </div>
                    {configRateio.marco_dentista_id && configRateio.marco_dentista_id !== dentistaId && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                          Marco Bianchini ({configRateio.percentual_marco}%)
                        </span>
                        <span className="text-sm font-medium text-despesa">
                          R$ {fmt(Math.max(0, saldoLiquido * configRateio.percentual_marco / 100))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Outros dentistas */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
                    Outros dentistas — {configRateio.percentual_outros}% = R$ {fmt(Math.max(0, saldoLiquido * configRateio.percentual_outros / 100))}
                    {selecionadosRateio.length > 0 && ` (R$ ${fmt(Math.max(0, saldoLiquido * configRateio.percentual_outros / 100) / selecionadosRateio.length)} cada)`}
                  </p>
                  <div className="flex flex-col gap-2">
                    {listaDentistas.filter(d => d.id !== dentistaId).map(d => (
                      <label key={d.id} className="flex items-center gap-3 cursor-pointer select-none py-1.5 px-3 rounded-lg transition-colors"
                        style={{ backgroundColor: selecionadosRateio.includes(d.id) ? 'var(--accent-soft)' : 'transparent' }}>
                        <input
                          type="checkbox"
                          checked={selecionadosRateio.includes(d.id)}
                          onChange={() => setSelecionadosRateio(prev =>
                            prev.includes(d.id) ? prev.filter(id => id !== d.id) : [...prev, d.id]
                          )}
                          className="w-4 h-4 accent-emerald-500"
                        />
                        <span className="text-sm flex-1" style={{ color: 'var(--text-1)' }}>{d.nome}</span>
                        {selecionadosRateio.includes(d.id) && selecionadosRateio.length > 0 && (
                          <span className="text-xs text-despesa">
                            -R$ {fmt(Math.max(0, saldoLiquido * configRateio.percentual_outros / 100) / selecionadosRateio.length)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                {!configRateio.marco_dentista_id && (
                  <p className="text-xs text-amber-400">
                    Marco Bianchini não está configurado em Administração → Configurações.
                  </p>
                )}
              </div>
            )}

            {/* Modo: Simples */}
            {modoFechamento === 'simples' && (
              <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--surface-muted)' }}>
                <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-1)' }}>
                  Valor a pagar ao dentista
                </p>
                <p className="text-2xl font-bold text-receita mb-2">R$ {fmt(Math.max(saldoLiquido, 0))}</p>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  No modo simples o pagamento é registrado diretamente sem distribuição de rateio.
                  Utilize o botão "Novo Pagamento" na seção de pagamentos abaixo.
                </p>
              </div>
            )}

            {erroFechamento && <p className="text-xs text-red-400 mt-3">{erroFechamento}</p>}

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalFecharMes(false)} className="btn-secondary flex-1 py-2">Cancelar</button>
              {modoFechamento === 'rateio' ? (
                <button
                  onClick={confirmarFechamento}
                  disabled={fechandoMes || saldoLiquido <= 0}
                  className="btn-primary flex-1 py-2">
                  {fechandoMes ? 'Processando...' : 'Confirmar Fechamento'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setModalFecharMes(false)
                    setFormPag({ valor: String(Math.max(saldoLiquido, 0).toFixed(2)), forma: 'Pix', descricao: `Pagamento ${MESES[mes]}/${ano}`, data: new Date().toISOString().slice(0, 10) })
                    setModalPagamento(true)
                  }}
                  className="btn-primary flex-1 py-2">
                  Registrar Pagamento
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
