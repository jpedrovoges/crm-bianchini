'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DespesasComuns from './DespesasComuns'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

type AbaFinanceiro = 'lancamentos' | 'despesas-comuns' | 'nf-a-fazer' | 'notas-fiscais' | 'dentistas'

type Dentista = { id: string; nome: string; ativo: boolean }
type Periodo = 'mes' | 'ano'

type Lancamento = {
  id: string
  data: string
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  forma: string
  nota_fiscal: boolean
  numero_nf: string | null
  pacientes: { nome: string } | null
  destinatarios: { nome: string; tipo: string } | null
  categoria: string | null
  observacao: string | null
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const ABAS: { key: AbaFinanceiro; label: string }[] = [
  { key: 'lancamentos',    label: 'Lançamentos'     },
  { key: 'despesas-comuns', label: 'Despesas Comuns' },
  { key: 'dentistas',      label: 'Por Dentista'    },
  { key: 'nf-a-fazer',    label: 'NF a Fazer'      },
  { key: 'notas-fiscais', label: 'Notas Fiscais'    },
]

const AVATARES_D = [
  'bg-cyan-950/60 text-cyan-400','bg-violet-950/60 text-violet-400',
  'bg-teal-950/60 text-teal-400','bg-indigo-950/60 text-indigo-400',
  'bg-sky-950/60 text-sky-400',
]
function corAvatarD(nome: string) { return AVATARES_D[nome.charCodeAt(0) % AVATARES_D.length] }
function iniciaisD(nome: string) {
  const p = nome.trim().split(' ')
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

const FORMAS = ['Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Convênio', 'Boleto']

export default function FinanceiroPage() {
  const hoje = new Date()
  const [aba, setAba] = useState<AbaFinanceiro>('lancamentos')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const abaParam = params.get('aba') as AbaFinanceiro | null
    if (abaParam) setAba(abaParam)
  }, [])
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())

  // lançamentos gerais
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

  // NF a fazer
  const [pendentesNF, setPendentesNF] = useState<Lancamento[]>([])
  const [loadingNF, setLoadingNF] = useState(false)
  const [editandoNF, setEditandoNF] = useState<string | null>(null)
  const [expandidoNF, setExpandidoNF] = useState<string | null>(null)
  const [numeroNFEdit, setNumeroNFEdit] = useState('')
  const [salvandoNF, setSalvandoNF] = useState(false)

  // notas fiscais emitidas
  const [emitidasNF, setEmitidasNF] = useState<Lancamento[]>([])
  const [loadingEmitidas, setLoadingEmitidas] = useState(false)

  // dentistas
  const [dentistas, setDentistas] = useState<Dentista[]>([])

  // ── Lançamentos ──
  useEffect(() => {
    if (aba !== 'lancamentos') return
    setLoading(true)
    const inicio = periodo === 'mes' ? toISO(ano, mes, 1) : `${ano}-01-01`
    const fim    = periodo === 'mes' ? toISO(ano, mes, new Date(ano, mes + 1, 0).getDate()) : `${ano}-12-31`
    supabase
      .from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo)')
      .is('dentista_id', null)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setLancamentos(data as Lancamento[])
        setLoading(false)
      })
  }, [mes, ano, periodo, aba])

  // ── NF a Fazer ──
  useEffect(() => {
    if (aba !== 'nf-a-fazer') return
    setLoadingNF(true)
    supabase
      .from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo)')
      .eq('nota_fiscal', true)
      .is('numero_nf', null)
      .order('data', { ascending: false })
      .then(({ data }) => {
        if (data) setPendentesNF(data as Lancamento[])
        setLoadingNF(false)
      })
  }, [aba])

  // ── Dentistas ──
  useEffect(() => {
    if (aba !== 'dentistas') return
    supabase.from('dentistas').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setDentistas(data) })
  }, [aba])

  // ── Notas Fiscais emitidas ──
  useEffect(() => {
    if (aba !== 'notas-fiscais') return
    setLoadingEmitidas(true)
    supabase
      .from('lancamentos')
      .select('*, pacientes(nome), destinatarios(nome, tipo)')
      .eq('nota_fiscal', true)
      .not('numero_nf', 'is', null)
      .order('data', { ascending: false })
      .then(({ data }) => {
        if (data) setEmitidasNF(data as Lancamento[])
        setLoadingEmitidas(false)
      })
  }, [aba])

  function mesAnterior() {
    if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1)
  }
  function proximoMes() {
    if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1)
  }

  async function emitirNF(id: string) {
    if (!numeroNFEdit.trim()) return
    setSalvandoNF(true)
    const { error } = await supabase
      .from('lancamentos')
      .update({ numero_nf: numeroNFEdit.trim() })
      .eq('id', id)
    if (error) { setSalvandoNF(false); return }
    const item = pendentesNF.find(l => l.id === id)
    if (item) {
      setPendentesNF(prev => prev.filter(l => l.id !== id))
      setEmitidasNF(prev => [{ ...item, numero_nf: numeroNFEdit.trim() }, ...prev])
    }
    setEditandoNF(null)
    setNumeroNFEdit('')
    setSalvandoNF(false)
  }

  // ── Computed — lançamentos ──
  const receitas = lancamentos.filter(l => l.tipo === 'receita')
  const despesas = lancamentos.filter(l => l.tipo === 'despesa')
  const totalRec  = receitas.reduce((s, l) => s + l.valor, 0)
  const totalDesp = despesas.reduce((s, l) => s + l.valor, 0)

  const porForma = FORMAS.map(forma => {
    const movs = receitas.filter(l => l.forma === forma)
    return { forma, total: movs.reduce((s, l) => s + l.valor, 0), count: movs.length }
  }).filter(f => f.count > 0)

  const porData = lancamentos.reduce<Record<string, Lancamento[]>>((acc, l) => {
    acc[l.data] = acc[l.data] ? [...acc[l.data], l] : [l]
    return acc
  }, {})
  const datas = Object.keys(porData).sort((a, b) => b.localeCompare(a))

  const porMes = Array.from({ length: 12 }, (_, i) => {
    const mesStr = String(i + 1).padStart(2, '0')
    const movs = lancamentos.filter(l => l.data.startsWith(`${ano}-${mesStr}`))
    const rec  = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
    const desp = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
    return { mes: i, rec, desp, saldo: rec - desp }
  })

  const titulo = periodo === 'mes' ? `${MESES[mes]} ${ano}` : String(ano)

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header-row mb-6">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="page-subtitle">Receitas, despesas e notas fiscais</p>
        </div>
        <div
          className="flex gap-1 rounded-lg p-1 border border-[var(--border)]"
          style={{ backgroundColor: 'var(--surface-muted)' }}
        >
          {ABAS.map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                aba === a.key
                  ? 'bg-[var(--surface)] text-[var(--text-1)] font-medium'
                  : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
              }`}
            >
              {a.label}
              {a.key === 'nf-a-fazer' && pendentesNF.length > 0 && (
                <span className="ml-1.5 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
                  {pendentesNF.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════ LANÇAMENTOS ═══════════════ */}
      {aba === 'lancamentos' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button onClick={periodo === 'mes' ? mesAnterior : () => setAno(a => a - 1)} className="btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span className="page-title text-sm">{titulo}</span>
              <button onClick={periodo === 'mes' ? proximoMes : () => setAno(a => a + 1)} className="btn-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            <div
              className="flex gap-1 rounded-lg p-1 border border-[var(--border)]"
              style={{ backgroundColor: 'var(--surface-muted)' }}
            >
              {(['mes', 'ano'] as Periodo[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    periodo === p
                      ? 'bg-[var(--surface)] text-[var(--text-1)] font-medium'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                  }`}
                >
                  {p === 'mes' ? 'Mensal' : 'Anual'}
                </button>
              ))}
            </div>
          </div>

          {loading ? <p className="page-subtitle">Carregando...</p> : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="card-p5">
                  <p className="card-label">Receitas</p>
                  <p className="card-value text-receita">R$ {fmt(totalRec)}</p>
                  <p className="card-sub">{receitas.length} lançamento(s)</p>
                </div>
                <div className="card-p5">
                  <p className="card-label">Despesas</p>
                  <p className="card-value text-despesa">R$ {fmt(totalDesp)}</p>
                  <p className="card-sub">{despesas.length} lançamento(s)</p>
                </div>
                <div className="card-p5">
                  <p className="card-label">Saldo</p>
                  <p className={`card-value ${totalRec - totalDesp >= 0 ? 'text-receita' : 'text-despesa'}`}>
                    R$ {fmt(totalRec - totalDesp)}
                  </p>
                  <p className="card-sub">{lancamentos.length} no total</p>
                </div>
              </div>

              {/* ── Visão anual: cards por mês ── */}
              {periodo === 'ano' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {porMes.map(({ mes: m, rec, desp, saldo }) => (
                    <div key={m} className="card-p5">
                      <p className="text-sm font-medium mb-3" style={{ color: 'var(--text-1)' }}>{MESES[m]}</p>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Entrada</span>
                          <span className="text-sm font-medium text-receita">R$ {fmt(rec)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Saída</span>
                          <span className="text-sm font-medium text-despesa">R$ {fmt(desp)}</span>
                        </div>
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
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                            <div
                              className="h-1 rounded-full bg-emerald-400"
                              style={{ width: `${totalRec > 0 ? (f.total / totalRec) * 100 : 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-[var(--text-3)] mt-0.5">{f.count} lançamento(s)</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 card-p5">
                  <h2 className="widget-title">Lançamentos do Período</h2>
                  {lancamentos.length === 0 ? (
                    <p className="empty-text">Nenhum lançamento em {titulo}</p>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {datas.map(data => {
                        const movs = porData[data]
                        const [a, m, d] = data.split('-')
                        const r  = movs.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
                        const dp = movs.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
                        return (
                          <div key={data}>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-[var(--text-3)] uppercase tracking-widest">{d}/{m}/{a}</p>
                              <div className="flex gap-3">
                                {r  > 0 && <span className="text-xs text-receita">+R$ {fmt(r)}</span>}
                                {dp > 0 && <span className="text-xs text-despesa">-R$ {fmt(dp)}</span>}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              {movs.map(l => {
                                const vinculo = l.tipo === 'receita'
                                  ? (l.pacientes?.nome ?? null)
                                  : (l.destinatarios?.nome ?? null)
                                const catLabel = l.categoria === 'venda' ? 'Venda' : l.categoria === 'procedimento' ? 'Procedimento' : null
                                return (
                                  <div key={l.id} className="movimento-item">
                                    <div className={l.tipo === 'receita' ? 'dot-receita' : 'dot-despesa'} />
                                    <div className="flex-1 min-w-0">
                                      <p className="mov-desc">{l.descricao}</p>
                                      <p className="mov-meta">
                                        {l.forma}
                                        {catLabel ? ` · ${catLabel}` : ''}
                                        {vinculo ? ` · ${vinculo}` : ''}
                                        {l.observacao ? ` · ${l.observacao}` : ''}
                                        {l.nota_fiscal ? ` · NF${l.numero_nf ? ` ${l.numero_nf}` : ' a emitir'}` : ''}
                                      </p>
                                    </div>
                                    <p className={`text-sm font-medium flex-shrink-0 ${l.tipo === 'receita' ? 'text-receita' : 'text-despesa'}`}>
                                      {l.tipo === 'receita' ? '+' : '-'} R$ {fmt(l.valor)}
                                    </p>
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
        </>
      )}

      {/* ═══════════════ DESPESAS COMUNS ═══════════════ */}
      {aba === 'despesas-comuns' && <DespesasComuns />}

      {/* ═══════════════ POR DENTISTA ═══════════════ */}
      {aba === 'dentistas' && (
        <div>
          <p className="page-subtitle mb-6">
            Selecione um dentista para ver o movimento financeiro individual.
          </p>
          {dentistas.length === 0 ? (
            <div className="empty-state">
              <p className="page-subtitle text-sm">Nenhum dentista ativo</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {dentistas.map(d => (
                <Link key={d.id} href={`/dashboard/financeiro/${d.id}`}
                  className="card-p5 block hover:border-[var(--border-hover)] transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${corAvatarD(d.nome)}`}>
                      {iniciaisD(d.nome)}
                    </div>
                    <p className="patient-name">{d.nome}</p>
                  </div>
                  <p className="card-sub text-xs">Ver movimento →</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ NF A FAZER ═══════════════ */}
      {aba === 'nf-a-fazer' && (
        <div>
          <p className="page-subtitle mb-6">
            Lançamentos que precisam de nota fiscal — emita e registre o número abaixo.
          </p>

          {loadingNF ? (
            <p className="page-subtitle">Carregando...</p>
          ) : pendentesNF.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
                  <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z"/>
                </svg>
              </div>
              <p className="page-subtitle text-sm">Nenhuma NF pendente</p>
              <p className="card-sub mt-1">Todas as notas fiscais foram emitidas</p>
            </div>
          ) : (
            <div className="card-p5 flex flex-col gap-2">
              {pendentesNF.map(l => {
                const expandido = expandidoNF === l.id
                const emitindo  = editandoNF === l.id
                const catLabel  = l.categoria === 'venda' ? 'Venda' : l.categoria === 'procedimento' ? 'Procedimento' : null
                return (
                  <div key={l.id} className="flex flex-col gap-2">
                    <div
                      className="movimento-item cursor-pointer"
                      onClick={() => { if (!emitindo) setExpandidoNF(expandido ? null : l.id) }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="mov-desc">{l.descricao}</p>
                        <p className="mov-meta">
                          {l.data.split('-').reverse().join('/')}
                          {l.pacientes ? ` · ${l.pacientes.nome}` : ''}
                          {` · ${l.forma}`}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-receita flex-shrink-0">R$ {fmt(l.valor)}</p>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`nav-icon flex-shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </div>

                    {expandido && (
                      <div className="pl-4 flex flex-col gap-3 pb-2" style={{ borderLeft: '2px solid var(--border)' }}>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                          {catLabel && (
                            <><span style={{ color: 'var(--text-3)' }}>Categoria</span><span style={{ color: 'var(--text-1)' }}>{catLabel}</span></>
                          )}
                          {l.pacientes && (
                            <><span style={{ color: 'var(--text-3)' }}>Paciente</span><span style={{ color: 'var(--text-1)' }}>{l.pacientes.nome}</span></>
                          )}
                          <><span style={{ color: 'var(--text-3)' }}>Forma</span><span style={{ color: 'var(--text-1)' }}>{l.forma}</span></>
                          <><span style={{ color: 'var(--text-3)' }}>Valor</span><span className="text-receita font-medium">R$ {fmt(l.valor)}</span></>
                          {l.observacao && (
                            <><span style={{ color: 'var(--text-3)' }}>Procedimento</span><span style={{ color: 'var(--text-1)' }}>{l.observacao}</span></>
                          )}
                        </div>

                        {emitindo ? (
                          <div className="flex gap-2">
                            <input type="text" value={numeroNFEdit} onChange={e => setNumeroNFEdit(e.target.value)}
                              placeholder="Número da NF" className="form-input flex-1" autoFocus />
                            <button onClick={() => emitirNF(l.id)} disabled={!numeroNFEdit.trim() || salvandoNF}
                              className="btn-primary px-4 py-2 flex-shrink-0">
                              {salvandoNF ? '...' : 'Confirmar'}
                            </button>
                            <button onClick={() => { setEditandoNF(null); setNumeroNFEdit('') }}
                              className="btn-secondary px-3 py-2 flex-shrink-0">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditandoNF(l.id); setNumeroNFEdit('') }}
                            className="btn-primary px-3 py-1.5 text-xs self-start">
                            Emitir NF
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ NOTAS FISCAIS ═══════════════ */}
      {aba === 'notas-fiscais' && (
        <div>
          <p className="page-subtitle mb-6">
            Notas fiscais já emitidas.
          </p>

          {loadingEmitidas ? (
            <p className="page-subtitle">Carregando...</p>
          ) : emitidasNF.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <p className="page-subtitle text-sm">Nenhuma nota fiscal emitida</p>
            </div>
          ) : (
            <div className="card-p5 flex flex-col gap-2">
              {emitidasNF.map(l => (
                <div key={l.id} className="movimento-item">
                  <div className="flex-shrink-0 px-2 py-1 rounded text-xs font-mono font-semibold"
                    style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    NF {l.numero_nf}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="mov-desc">{l.descricao}</p>
                    <p className="mov-meta">
                      {l.data.split('-').reverse().join('/')}
                      {l.pacientes ? ` · ${l.pacientes.nome}` : ''}
                      {` · ${l.forma}`}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-receita flex-shrink-0">
                    R$ {fmt(l.valor)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
