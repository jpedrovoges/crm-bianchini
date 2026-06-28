'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const FORMAS = ['Boleto', 'Pix', 'Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Débito Automático']

type Dentista  = { id: string; nome: string; ativo: boolean; participa_despesas_comuns: boolean }
type Categoria = { id: string; nome: string; ordem: number }

type DespesaComum = {
  id: string
  descricao: string
  valor: number | null
  dia_vencimento: number | null
  categoria_id: string | null
  ativo: boolean
}

type LancRef = { id: string; data: string; valor: number; despesa_comum_id: string }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toISO(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

const formVazio = { descricao: '', valor: '', dia_vencimento: '', categoria_id: '' }
const lancVazio = { valor: '', forma: 'Boleto', data: '' }

export default function DespesasComuns() {
  const hoje = new Date()
  const [mes, setMes]   = useState(hoje.getMonth())
  const [ano, setAno]   = useState(hoje.getFullYear())
  const [modo, setModo] = useState<'mensal' | 'config'>('mensal')

  const [dentistas, setDentistas]   = useState<Dentista[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [despesas, setDespesas]     = useState<DespesaComum[]>([])
  const [lancamentos, setLancamentos] = useState<LancRef[]>([])
  const [loading, setLoading]       = useState(true)

  const [modal, setModal]           = useState(false)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState(formVazio)
  const [salvando, setSalvando]     = useState(false)

  const [lancandoId, setLancandoId]     = useState<string | null>(null)
  const [formLanc, setFormLanc]         = useState(lancVazio)
  const [salvandoLanc, setSalvandoLanc] = useState(false)

  const [confirmandoFechamento, setConfirmandoFechamento] = useState(false)
  const [fechando, setFechando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('dentistas').select('*').order('nome'),
      supabase.from('categorias_despesa_comum').select('*').order('ordem'),
      supabase.from('despesas_comuns').select('*').order('descricao'),
    ]).then(([{ data: dent }, { data: cat }, { data: desp }]) => {
      if (dent) setDentistas(dent)
      if (cat) setCategorias(cat)
      if (desp) setDespesas(desp)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const inicio = toISO(ano, mes, 1)
    const fim    = toISO(ano, mes, new Date(ano, mes + 1, 0).getDate())
    supabase.from('lancamentos')
      .select('id, data, valor, despesa_comum_id')
      .not('despesa_comum_id', 'is', null)
      .gte('data', inicio).lte('data', fim)
      .then(({ data }) => { if (data) setLancamentos(data as LancRef[]) })
  }, [mes, ano])

  function mesAnterior() { if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1) }
  function proximoMes()  { if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1) }

  async function toggleParticipacao(d: Dentista) {
    const novo = !d.participa_despesas_comuns
    await supabase.from('dentistas').update({ participa_despesas_comuns: novo }).eq('id', d.id)
    setDentistas(prev => prev.map(x => x.id === d.id ? { ...x, participa_despesas_comuns: novo } : x))
  }

  const ativas       = despesas.filter(d => d.ativo)
  const lancados     = new Set(lancamentos.map(l => l.despesa_comum_id))
  const participantes = dentistas.filter(d => d.ativo && d.participa_despesas_comuns)
  const nPart        = participantes.length

  const porCategoria = categorias.map(cat => ({
    ...cat,
    itens: ativas.filter(d => d.categoria_id === cat.id),
  })).filter(c => c.itens.length > 0)

  const totalPorDentista = participantes.map(d => {
    const previsto = ativas
      .filter(dep => dep.valor)
      .reduce((sum, dep) => sum + dep.valor! / nPart, 0)
    const lancado = lancamentos
      .reduce((sum, l) => {
        const dep = despesas.find(x => x.id === l.despesa_comum_id)
        return dep ? sum + l.valor / nPart : sum
      }, 0)
    return { dentista: d, previsto, lancado }
  })

  function abrirLancar(d: DespesaComum) {
    setLancandoId(d.id)
    const diaVenc = d.dia_vencimento
      ? Math.min(d.dia_vencimento, new Date(ano, mes + 1, 0).getDate())
      : hoje.getDate()
    setFormLanc({ valor: d.valor ? String(d.valor) : '', forma: 'Boleto', data: toISO(ano, mes, diaVenc) })
  }

  async function lancar(d: DespesaComum) {
    if (!formLanc.valor || !formLanc.data) return
    setSalvandoLanc(true)
    const { data, error } = await supabase.from('lancamentos').insert({
      tipo: 'despesa', descricao: d.descricao,
      valor: parseFloat(formLanc.valor), forma: formLanc.forma,
      data: formLanc.data, despesa_comum_id: d.id,
    }).select('id, data, valor, despesa_comum_id').single()
    if (!error && data) setLancamentos(prev => [...prev, data as LancRef])
    setLancandoId(null); setFormLanc(lancVazio); setSalvandoLanc(false)
  }

  function abrirEditar(d: DespesaComum) {
    setEditId(d.id)
    setForm({
      descricao: d.descricao,
      valor: d.valor ? String(d.valor) : '',
      dia_vencimento: d.dia_vencimento ? String(d.dia_vencimento) : '',
      categoria_id: d.categoria_id ?? '',
    })
    setModal(true)
  }

  async function salvar() {
    if (!form.descricao.trim()) return
    setSalvando(true)
    const payload = {
      descricao: form.descricao.trim(),
      valor: form.valor ? parseFloat(form.valor) : null,
      dia_vencimento: form.dia_vencimento ? parseInt(form.dia_vencimento) : null,
      categoria_id: form.categoria_id || null,
    }
    if (editId) {
      await supabase.from('despesas_comuns').update(payload).eq('id', editId)
      setDespesas(prev => prev.map(d => d.id === editId ? { ...d, ...payload } : d))
    } else {
      const { data, error } = await supabase.from('despesas_comuns').insert(payload).select('*').single()
      if (!error && data) setDespesas(prev => [...prev, data])
    }
    setForm(formVazio); setEditId(null); setModal(false); setSalvando(false)
  }

  async function fecharMes() {
    if (participantes.length === 0 || lancamentos.length === 0) return
    setFechando(true)
    const totalMes = lancamentos.reduce((s, l) => s + l.valor, 0)
    const share    = totalMes / nPart
    const ultimoDia = new Date(ano, mes + 1, 0).getDate()
    const data = toISO(ano, mes, ultimoDia)
    const descricao = `Despesas Comuns - ${MESES[mes]}/${ano}`
    await Promise.all(
      participantes.map(d =>
        supabase.from('lancamentos').insert({
          tipo: 'despesa', descricao, valor: share,
          forma: 'Interno', data, dentista_id: d.id,
        })
      )
    )
    setConfirmandoFechamento(false)
    setFechando(false)
  }

  async function toggleAtivo(d: DespesaComum) {
    const novo = !d.ativo
    await supabase.from('despesas_comuns').update({ ativo: novo }).eq('id', d.id)
    setDespesas(prev => prev.map(x => x.id === d.id ? { ...x, ativo: novo } : x))
  }

  if (loading) return <p className="page-subtitle">Carregando...</p>

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={mesAnterior} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="page-title text-sm">{MESES[mes]} {ano}</span>
          <button onClick={proximoMes} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div className="flex gap-2">
          {modo === 'config' && (
            <button onClick={() => { setEditId(null); setForm(formVazio); setModal(true) }} className="btn-primary px-3 py-1.5 text-xs">
              + Nova Despesa
            </button>
          )}
          {modo === 'mensal' && lancamentos.length > 0 && nPart > 0 && (
            confirmandoFechamento ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>Distribuir para {nPart} dentista(s)?</span>
                <button onClick={fecharMes} disabled={fechando}
                  className="px-3 py-1.5 text-xs rounded-lg font-semibold"
                  style={{ backgroundColor: 'rgb(239 68 68 / 0.15)', color: 'rgb(248 113 113)', border: '1px solid rgb(239 68 68 / 0.4)' }}>
                  {fechando ? '...' : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmandoFechamento(false)} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmandoFechamento(true)} className="btn-secondary px-3 py-1.5 text-xs">
                Fechar Mês
              </button>
            )
          )}
          <button
            onClick={() => setModo(m => m === 'mensal' ? 'config' : 'mensal')}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {modo === 'config' ? '← Mensal' : 'Configurar'}
          </button>
        </div>
      </div>

      {/* ═══ VISTA MENSAL ═══ */}
      {modo === 'mensal' && (
        <>
          {nPart === 0 ? (
            <div className="empty-state mb-6">
              <p className="page-subtitle text-sm">Nenhum dentista participando das despesas comuns</p>
              <button onClick={() => setModo('config')} className="btn-secondary px-3 py-1.5 text-xs mt-3">Configurar</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {totalPorDentista.map(({ dentista, lancado }) => (
                <div key={dentista.id} className="card-p5">
                  <p className="card-label">{dentista.nome}</p>
                  <p className="card-value text-despesa">R$ {fmt(lancado)}</p>
                </div>
              ))}
            </div>
          )}

          {porCategoria.length === 0 ? (
            <div className="empty-state">
              <p className="page-subtitle text-sm">Nenhuma despesa comum configurada</p>
              <button onClick={() => setModo('config')} className="btn-secondary px-3 py-1.5 text-xs mt-3">Configurar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {porCategoria.map(cat => (
                <div key={cat.id} className="card-p5">
                  <h2 className="widget-title">{cat.nome}</h2>
                  <div className="flex flex-col gap-3">
                    {cat.itens.map(d => {
                      const share     = d.valor && nPart > 0 ? d.valor / nPart : null
                      const foiLancado = lancados.has(d.id)
                      const expandido  = lancandoId === d.id

                      return (
                        <div key={d.id} className="flex flex-col gap-2">
                          <div className="movimento-item">
                            <div className="dot-despesa" />
                            <div className="flex-1 min-w-0">
                              <p className="mov-desc">{d.descricao}</p>
                              <p className="mov-meta">
                                {d.dia_vencimento ? `Vence dia ${d.dia_vencimento}` : ''}
                                {share ? `${d.dia_vencimento ? ' · ' : ''}R$ ${fmt(share)} por dentista` : ''}
                              </p>
                            </div>
                            <p className="text-sm font-medium text-despesa flex-shrink-0">
                              {d.valor ? `R$ ${fmt(d.valor)}` : '—'}
                            </p>
                            {foiLancado ? (
                              <span className="text-xs px-2 py-1 rounded-full flex-shrink-0"
                                style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-3)' }}>
                                Lançado ✓
                              </span>
                            ) : (
                              <button
                                onClick={() => expandido ? setLancandoId(null) : abrirLancar(d)}
                                className={`px-3 py-1.5 text-xs flex-shrink-0 ${expandido ? 'btn-secondary' : 'btn-primary'}`}
                              >
                                {expandido ? 'Cancelar' : 'Lançar'}
                              </button>
                            )}
                          </div>

                          {expandido && (
                            <div className="flex gap-2 flex-wrap pl-4">
                              <input type="number" value={formLanc.valor}
                                onChange={e => setFormLanc(f => ({ ...f, valor: e.target.value }))}
                                placeholder="Valor (R$)" className="form-input text-sm" style={{ maxWidth: 130 }} />
                              <select value={formLanc.forma}
                                onChange={e => setFormLanc(f => ({ ...f, forma: e.target.value }))}
                                className="form-select text-sm flex-1">
                                {FORMAS.map(f => <option key={f}>{f}</option>)}
                              </select>
                              <input type="date" value={formLanc.data}
                                onChange={e => setFormLanc(f => ({ ...f, data: e.target.value }))}
                                className="form-input text-sm flex-1" />
                              <button onClick={() => lancar(d)}
                                disabled={!formLanc.valor || !formLanc.data || salvandoLanc}
                                className="btn-primary px-4 py-1.5 text-xs flex-shrink-0">
                                {salvandoLanc ? '...' : 'Confirmar'}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ CONFIGURAÇÃO ═══ */}
      {modo === 'config' && (
        <div className="flex flex-col gap-5">
          {/* Participantes */}
          <div className="card-p5">
            <h2 className="widget-title mb-3">Dentistas participantes</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Os dentistas marcados como ON dividem todas as despesas comuns igualmente.
            </p>
            <div className="flex flex-col gap-2">
              {dentistas.filter(d => d.ativo).map(d => (
                <div key={d.id} className="movimento-item">
                  <div className="flex-1 min-w-0">
                    <p className="mov-desc">{d.nome}</p>
                  </div>
                  <button
                    onClick={() => toggleParticipacao(d)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${d.participa_despesas_comuns ? 'bg-emerald-500' : 'bg-[var(--surface-muted)]'}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${d.participa_despesas_comuns ? 'translate-x-4' : 'translate-x-0.5'}`}
                    />
                  </button>
                </div>
              ))}
            </div>
            {nPart > 0 && (
              <p className="text-xs mt-3" style={{ color: 'var(--text-3)' }}>
                {nPart} dentista(s) participando — cada um paga 1/{nPart} de cada despesa.
              </p>
            )}
          </div>

          {/* Lista de despesas por categoria */}
          {categorias.map(cat => {
            const itens = despesas.filter(d => d.categoria_id === cat.id)
            return (
              <div key={cat.id} className="card-p5">
                <h2 className="widget-title">{cat.nome}</h2>
                {itens.length === 0 ? (
                  <p className="empty-text">Nenhuma despesa nesta categoria</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {itens.map(d => (
                      <div key={d.id} className={`movimento-item ${!d.ativo ? 'opacity-40' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="mov-desc">{d.descricao}</p>
                          <p className="mov-meta">
                            {d.dia_vencimento ? `Dia ${d.dia_vencimento}` : '—'}
                          </p>
                        </div>
                        <p className="text-sm font-medium text-[var(--text-2)] flex-shrink-0">
                          {d.valor ? `R$ ${fmt(d.valor)}` : '—'}
                        </p>
                        <button onClick={() => abrirEditar(d)}
                          className="nav-icon hover:text-[var(--text-1)] transition-colors flex-shrink-0">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button onClick={() => toggleAtivo(d)}
                          className="text-xs nav-icon hover:text-[var(--text-1)] transition-colors flex-shrink-0 whitespace-nowrap">
                          {d.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal: Nova / Editar Despesa ── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal max-w-md">
            <div className="modal-header">
              <h3 className="modal-title">{editId ? 'Editar Despesa' : 'Nova Despesa Comum'}</h3>
              <button onClick={() => { setModal(false); setEditId(null); setForm(formVazio) }}
                className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="form-label">Descrição <span className="text-red-400">*</span></label>
                <input type="text" value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Aluguel" className="form-input" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Valor estimado (R$)</label>
                  <input type="number" value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder="0,00" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Dia de vencimento</label>
                  <input type="number" min="1" max="31" value={form.dia_vencimento}
                    onChange={e => setForm(f => ({ ...f, dia_vencimento: e.target.value }))}
                    placeholder="Ex: 10" className="form-input" />
                </div>
              </div>
              <div>
                <label className="form-label">Categoria</label>
                <select value={form.categoria_id}
                  onChange={e => setForm(f => ({ ...f, categoria_id: e.target.value }))}
                  className="form-select">
                  <option value="">— Sem categoria —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => { setModal(false); setEditId(null); setForm(formVazio) }}
                className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvar}
                disabled={!form.descricao.trim() || salvando}
                className="btn-primary flex-1 py-2">
                {salvando ? 'Salvando...' : editId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
