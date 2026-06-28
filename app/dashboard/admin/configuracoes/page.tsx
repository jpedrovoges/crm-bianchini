'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/app/dashboard/SessionProvider'

type Aba = 'rateio' | 'impostos' | 'dentistas'
type Dentista = { id: string; nome: string }

type ConfigRateio = {
  id: string
  percentual_dentista: number
  percentual_marco: number
  percentual_outros: number
  marco_dentista_id: string | null
  dentistas_rateio: string[]
}

type ConfigImposto = {
  id: string
  forma_pagamento: string
  tem_imposto: boolean
  percentual_imposto: number
}

type ConfigDentista = {
  id?: string
  dentista_id: string
  tipo_conta: 'pessoal' | 'empresa'
  valor_minimo: number
  repasse_marco: number
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ConfiguracoesPage() {
  const session = useSession()
  const [aba, setAba] = useState<Aba>('rateio')
  const [dentistas, setDentistas] = useState<Dentista[]>([])

  const [rateio, setRateio] = useState<ConfigRateio>({
    id: '',
    percentual_dentista: 50,
    percentual_marco: 20,
    percentual_outros: 30,
    marco_dentista_id: null,
    dentistas_rateio: [],
  })
  const [salvandoRateio, setSalvandoRateio] = useState(false)
  const [okRateio, setOkRateio] = useState(false)

  const [impostos, setImpostos] = useState<ConfigImposto[]>([])
  const [salvandoImpId, setSalvandoImpId] = useState<string | null>(null)

  const [configsDent, setConfigsDent] = useState<Record<string, ConfigDentista>>({})
  const [salvandoDentId, setSalvandoDentId] = useState<string | null>(null)
  const [okDentId, setOkDentId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('dentistas').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => { if (data) setDentistas(data) })
    supabase.from('configuracoes_rateio').select('*').limit(1).single()
      .then(({ data }) => {
        if (data) setRateio({ ...data, dentistas_rateio: (data.dentistas_rateio as string[]) ?? [] })
      })
    supabase.from('configuracoes_impostos').select('*').order('forma_pagamento')
      .then(({ data }) => { if (data) setImpostos(data as ConfigImposto[]) })
    supabase.from('configuracoes_dentistas').select('*')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, ConfigDentista> = {}
        ;(data as ConfigDentista[]).forEach(d => { map[d.dentista_id] = d })
        setConfigsDent(map)
      })
  }, [])

  if (session?.role !== 'admin') {
    return <p className="page-subtitle mt-8">Acesso restrito ao administrador.</p>
  }

  async function salvarRateio() {
    setSalvandoRateio(true)
    if (rateio.id) {
      await supabase.from('configuracoes_rateio').update({
        percentual_dentista: rateio.percentual_dentista,
        percentual_marco: rateio.percentual_marco,
        percentual_outros: rateio.percentual_outros,
        marco_dentista_id: rateio.marco_dentista_id,
        dentistas_rateio: rateio.dentistas_rateio,
      }).eq('id', rateio.id)
    } else {
      const { data } = await supabase.from('configuracoes_rateio').insert({
        percentual_dentista: rateio.percentual_dentista,
        percentual_marco: rateio.percentual_marco,
        percentual_outros: rateio.percentual_outros,
        marco_dentista_id: rateio.marco_dentista_id,
        dentistas_rateio: rateio.dentistas_rateio,
      }).select('id').single()
      if (data) setRateio(r => ({ ...r, id: data.id }))
    }
    setSalvandoRateio(false)
    setOkRateio(true)
    setTimeout(() => setOkRateio(false), 2000)
  }

  async function salvarImposto(imp: ConfigImposto) {
    setSalvandoImpId(imp.id)
    await supabase.from('configuracoes_impostos').update({
      tem_imposto: imp.tem_imposto,
      percentual_imposto: imp.percentual_imposto,
    }).eq('id', imp.id)
    setSalvandoImpId(null)
  }

  function getConfDentista(dentistaId: string): ConfigDentista {
    return configsDent[dentistaId] ?? {
      dentista_id: dentistaId,
      tipo_conta: 'pessoal',
      valor_minimo: 4000,
      repasse_marco: 0,
    }
  }

  async function salvarConfDentista(dentistaId: string) {
    const conf = getConfDentista(dentistaId)
    setSalvandoDentId(dentistaId)
    await supabase.from('configuracoes_dentistas').upsert({
      dentista_id: dentistaId,
      tipo_conta: conf.tipo_conta,
      valor_minimo: conf.valor_minimo,
      repasse_marco: conf.repasse_marco,
    })
    setSalvandoDentId(null)
    setOkDentId(dentistaId)
    setTimeout(() => setOkDentId(null), 2000)
  }

  function updateConfDentista(dentistaId: string, patch: Partial<ConfigDentista>) {
    setConfigsDent(prev => ({ ...prev, [dentistaId]: { ...getConfDentista(dentistaId), ...patch } }))
  }

  function toggleDentistaRateio(id: string) {
    setRateio(prev => ({
      ...prev,
      dentistas_rateio: prev.dentistas_rateio.includes(id)
        ? prev.dentistas_rateio.filter(d => d !== id)
        : [...prev.dentistas_rateio, id],
    }))
  }

  const somaPerc = rateio.percentual_dentista + rateio.percentual_marco + rateio.percentual_outros
  const percOk = Math.abs(somaPerc - 100) < 0.01

  return (
    <div>
      <div className="mb-8">
        <h1 className="page-title">Configurações</h1>
        <p className="page-subtitle">Fechamento de mês, tributação e configurações por dentista</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 rounded-lg p-1 border border-[var(--border)] w-fit" style={{ backgroundColor: 'var(--surface-muted)' }}>
        {([
          { key: 'rateio' as Aba, label: 'Rateio' },
          { key: 'impostos' as Aba, label: 'Impostos' },
          { key: 'dentistas' as Aba, label: 'Dentistas' },
        ]).map(t => (
          <button key={t.key} onClick={() => setAba(t.key)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${aba === t.key ? 'bg-[var(--surface)] text-[var(--text-1)] font-medium' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA RATEIO ── */}
      {aba === 'rateio' && (
        <div className="max-w-xl flex flex-col gap-5">
          <div className="card-p6">
            <h2 className="widget-title">Marco Bianchini (responsável da clínica)</h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              Selecione qual dentista cadastrado corresponde a Marco Bianchini
            </p>
            <select
              value={rateio.marco_dentista_id ?? ''}
              onChange={e => setRateio(r => ({ ...r, marco_dentista_id: e.target.value || null }))}
              className="form-select">
              <option value="">— Nenhum selecionado —</option>
              {dentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>

          <div className="card-p6">
            <h2 className="widget-title">Distribuição do fechamento de mês</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              A soma dos três percentuais deve ser exatamente 100%
            </p>
            {!percOk && (
              <p className="text-xs text-red-400 mb-3">
                Soma atual: {somaPerc.toFixed(1)}% — deve ser 100%
              </p>
            )}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="form-label">Dentista (%)</label>
                <input type="number" min={0} max={100} step={0.1}
                  value={rateio.percentual_dentista}
                  onChange={e => setRateio(r => ({ ...r, percentual_dentista: parseFloat(e.target.value) || 0 }))}
                  className="form-input text-center" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>O dentista retém</p>
              </div>
              <div>
                <label className="form-label">Marco (%)</label>
                <input type="number" min={0} max={100} step={0.1}
                  value={rateio.percentual_marco}
                  onChange={e => setRateio(r => ({ ...r, percentual_marco: parseFloat(e.target.value) || 0 }))}
                  className="form-input text-center" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Para Marco</p>
              </div>
              <div>
                <label className="form-label">Outros (%)</label>
                <input type="number" min={0} max={100} step={0.1}
                  value={rateio.percentual_outros}
                  onChange={e => setRateio(r => ({ ...r, percentual_outros: parseFloat(e.target.value) || 0 }))}
                  className="form-input text-center" />
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>Dividido entre outros</p>
              </div>
            </div>
            {percOk && (
              <div className="flex gap-3 p-3 rounded-lg mb-4 text-xs" style={{ backgroundColor: 'var(--surface-muted)' }}>
                <span style={{ color: 'var(--text-2)' }}>Exemplo — dentista ganha R$ 10.000:</span>
                <span className="text-receita">Retém R$ {fmt(10000 * rateio.percentual_dentista / 100)}</span>
                <span style={{ color: 'var(--text-3)' }}>Marco R$ {fmt(10000 * rateio.percentual_marco / 100)}</span>
                <span style={{ color: 'var(--text-3)' }}>Outros R$ {fmt(10000 * rateio.percentual_outros / 100)}</span>
              </div>
            )}
          </div>

          <div className="card-p6">
            <h2 className="widget-title">Dentistas que participam do rateio (recebem parte dos "Outros")</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              O valor de "Outros" é dividido igualmente entre os dentistas selecionados aqui.
              No Fechar Mês você poderá ajustar para cada caso.
            </p>
            {dentistas.length === 0 ? (
              <p className="empty-text">Nenhum dentista cadastrado</p>
            ) : (
              <div className="flex flex-col gap-3">
                {dentistas.map(d => (
                  <label key={d.id} className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rateio.dentistas_rateio.includes(d.id)}
                      onChange={() => toggleDentistaRateio(d.id)}
                      className="w-4 h-4 accent-emerald-500"
                    />
                    <span className="text-sm" style={{ color: 'var(--text-1)' }}>{d.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={salvarRateio} disabled={!percOk || salvandoRateio}
              className="btn-primary px-5 py-2">
              {salvandoRateio ? 'Salvando...' : 'Salvar configurações de rateio'}
            </button>
            {okRateio && <span className="text-xs text-receita">Salvo com sucesso!</span>}
          </div>
        </div>
      )}

      {/* ── ABA IMPOSTOS ── */}
      {aba === 'impostos' && (
        <div className="max-w-2xl">
          <div className="card-p6">
            <h2 className="widget-title">Tributação por Forma de Pagamento</h2>
            <p className="text-xs mb-6" style={{ color: 'var(--text-3)' }}>
              Formas marcadas como "Com imposto" exigem emissão de nota fiscal.
              Dinheiro normalmente não tem NF; Pix, Cartão Débito e Crédito normalmente têm.
            </p>
            <div className="flex flex-col divide-y" style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              {impostos.map(imp => (
                <div key={imp.id} className="flex items-center justify-between gap-4 py-4">
                  <span className="text-sm font-medium w-36 flex-shrink-0" style={{ color: 'var(--text-1)' }}>
                    {imp.forma_pagamento}
                  </span>
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex gap-1">
                      {([false, true] as const).map(v => (
                        <button key={String(v)}
                          onClick={() => setImpostos(prev => prev.map(i => i.id === imp.id ? { ...i, tem_imposto: v } : i))}
                          className={`px-3 py-1 text-xs rounded-lg border transition-colors ${imp.tem_imposto === v
                            ? (v
                              ? 'bg-red-950/40 border-red-900/60 text-red-400 font-medium'
                              : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 font-medium')
                            : 'border-[var(--border)] text-[var(--text-3)]'}`}>
                          {v ? 'Com imposto' : 'Sem imposto'}
                        </button>
                      ))}
                    </div>
                    {imp.tem_imposto && (
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} step={0.1}
                          value={imp.percentual_imposto}
                          onChange={e => setImpostos(prev => prev.map(i => i.id === imp.id ? { ...i, percentual_imposto: parseFloat(e.target.value) || 0 } : i))}
                          className="form-input text-center"
                          style={{ width: '5rem' }}
                          placeholder="0.0"
                        />
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>%</span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => salvarImposto(imp)} disabled={salvandoImpId === imp.id}
                    className="btn-primary px-3 py-1.5 text-xs flex-shrink-0">
                    {salvandoImpId === imp.id ? '...' : 'Salvar'}
                  </button>
                </div>
              ))}
            </div>
            {impostos.length === 0 && <p className="empty-text">Nenhuma forma de pagamento configurada</p>}
          </div>
        </div>
      )}

      {/* ── ABA DENTISTAS ── */}
      {aba === 'dentistas' && (
        <div className="max-w-2xl">
          <div className="card-p6">
            <h2 className="widget-title">Configurações por Dentista</h2>
            <p className="text-xs mb-6" style={{ color: 'var(--text-3)' }}>
              Tipo de conta define onde o pagamento é depositado.
              O valor mínimo é garantido mesmo que o cálculo de rateio seja menor.
            </p>
            {dentistas.length === 0 ? (
              <p className="empty-text">Nenhum dentista cadastrado</p>
            ) : (
              <div className="flex flex-col gap-4">
                {dentistas.map(d => {
                  const conf = getConfDentista(d.id)
                  return (
                    <div key={d.id} className="rounded-xl p-4" style={{ border: '1px solid var(--border)' }}>
                      <p className="text-sm font-semibold mb-4" style={{ color: 'var(--text-1)' }}>{d.nome}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="form-label">Conta de recebimento</label>
                          <select
                            value={conf.tipo_conta}
                            onChange={e => updateConfDentista(d.id, { tipo_conta: e.target.value as 'pessoal' | 'empresa' })}
                            className="form-select">
                            <option value="pessoal">Conta Pessoal (PF)</option>
                            <option value="empresa">Conta Empresa (PJ)</option>
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Comissão Marco Bianchini (%)</label>
                          <input type="number" min={0} max={100} step={0.1}
                            value={conf.repasse_marco}
                            onChange={e => updateConfDentista(d.id, { repasse_marco: parseFloat(e.target.value) || 0 })}
                            className="form-input"
                            placeholder="13.0"
                          />
                          <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                            Calculado sobre (Valor − Impostos) por lançamento
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => salvarConfDentista(d.id)} disabled={salvandoDentId === d.id}
                          className="btn-primary px-4 py-1.5 text-xs">
                          {salvandoDentId === d.id ? 'Salvando...' : 'Salvar'}
                        </button>
                        {okDentId === d.id && <span className="text-xs text-receita">Salvo!</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
