'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useSession } from '@/app/dashboard/SessionProvider'
import {
  calcularFechamentoMensal,
  laboratorioDoResultado,
  buscarFechamento,
  fecharMes,
  reabrirMes,
  type FechamentoMensalResultado,
  type FechamentoRegistro,
} from '@/lib/fechamentoMensal'
import FechamentoBreakdown from '../FechamentoBreakdown'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function fmtData(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function FechamentoMesPage() {
  const params = useParams<{ dentistaId: string }>()
  const dentistaId = params.dentistaId
  const session = useSession()
  const podeVer = session?.role === 'admin' || session?.role === 'gestor'

  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth())
  const [ano, setAno] = useState(hoje.getFullYear())
  const [resultado, setResultado] = useState<FechamentoMensalResultado | null>(null)
  const [registro, setRegistro] = useState<FechamentoRegistro | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  // Laboratório do mês, digitado aqui na hora de fechar (pago direto pelo
  // dentista — só reduz a base da comissão/rateio). `labDigitado` null =
  // ainda não mexeu: o cálculo usa o valor já gravado no fechamento (ou 0).
  const [labTexto, setLabTexto] = useState('')
  const [labDigitado, setLabDigitado] = useState<number | null>(null)

  const carregar = useCallback(() => {
    if (!podeVer) return
    setLoading(true)
    setErro(null)
    Promise.all([
      calcularFechamentoMensal(dentistaId, mes, ano, labDigitado ?? undefined),
      buscarFechamento(dentistaId, mes, ano),
    ])
      .then(([r, reg]) => {
        setResultado(r); setRegistro(reg)
        if (labDigitado === null) {
          const lab = laboratorioDoResultado(r)
          setLabTexto(lab > 0 ? String(lab) : '')
        }
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao calcular o fechamento'))
      .finally(() => setLoading(false))
  }, [dentistaId, mes, ano, podeVer, labDigitado])

  // Debounce: recalcula 400ms depois de parar de digitar o laboratório.
  useEffect(() => {
    const t = setTimeout(carregar, labDigitado === null ? 0 : 400)
    return () => clearTimeout(t)
  }, [carregar, labDigitado])

  function trocarMes() { setConfirmando(false); setLabDigitado(null); setLabTexto('') }
  function mesAnterior() { trocarMes(); if (mes === 0) { setMes(11); setAno(a => a - 1) } else setMes(m => m - 1) }
  function proximoMes()  { trocarMes(); if (mes === 11) { setMes(0); setAno(a => a + 1) } else setMes(m => m + 1) }

  function mudarLab(texto: string) {
    setLabTexto(texto)
    setConfirmando(false)
    const v = parseFloat(texto.replace(',', '.'))
    setLabDigitado(Number.isFinite(v) && v > 0 ? v : 0)
  }

  async function handleFechar() {
    if (!resultado || !session) return
    setProcessando(true)
    try {
      await fecharMes(dentistaId, mes, ano, resultado, session.username)
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao fechar o mês')
    } finally {
      setProcessando(false)
      setConfirmando(false)
    }
  }

  async function handleReabrir() {
    if (!registro || !session) return
    setProcessando(true)
    try {
      await reabrirMes(registro.id, session.username)
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao reabrir o mês')
    } finally {
      setProcessando(false)
    }
  }

  if (!podeVer) {
    return (
      <div>
        <Link href={`/dashboard/financeiro/${dentistaId}`} className="text-xs nav-icon hover:text-[var(--text-2)] transition-colors inline-flex items-center gap-1 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Voltar
        </Link>
        <div className="empty-state">
          <p className="page-subtitle text-sm">Acesso restrito a admin/gestor</p>
        </div>
      </div>
    )
  }

  const fechado = registro?.status === 'fechado'

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6">
        <Link href={`/dashboard/financeiro/${dentistaId}`} className="text-xs nav-icon hover:text-[var(--text-2)] transition-colors inline-flex items-center gap-1 mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Voltar
        </Link>
        <h1 className="page-title">Fechamento de Mês{resultado ? ` — ${resultado.dentista.nome}` : ''}</h1>
        <p className="page-subtitle">Cálculo de rateio e comissões — feche o mês pra travar o valor e avisar o dentista</p>
      </div>

      {/* ── Navegação de mês + ação de fechamento ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={mesAnterior} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="page-title text-sm">{MESES[mes]} {ano}</span>
          <button onClick={proximoMes} className="btn-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        {!loading && !erro && resultado && (
          fechado ? (
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgb(34 197 94 / 0.15)', color: 'rgb(74 222 128)' }}>
                Fechado em {fmtData(registro!.fechadoEm)}{registro!.fechadoPor ? ` por ${registro!.fechadoPor}` : ''}
              </span>
              <button onClick={handleReabrir} disabled={processando} className="btn-secondary px-3 py-1.5 text-xs">
                {processando ? '...' : 'Reabrir Mês'}
              </button>
            </div>
          ) : confirmando ? (
            <div className="flex gap-2 items-center">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Travar estes valores e avisar o dentista?</span>
              <button onClick={handleFechar} disabled={processando} className="btn-primary px-3 py-1.5 text-xs">
                {processando ? '...' : 'Confirmar'}
              </button>
              <button onClick={() => setConfirmando(false)} className="nav-icon hover:text-[var(--text-1)] transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmando(true)} className="btn-primary px-3 py-1.5 text-xs">
              Fechar Mês
            </button>
          )
        )}
      </div>

      {resultado && resultado.tipo !== 'marco' && (
        <div className="card-p5 mb-6 max-w-sm">
          <label className="form-label">Laboratório do mês (R$)</label>
          <input type="number" min="0" step="0.01" placeholder="0,00"
            value={labTexto} onChange={e => mudarLab(e.target.value)}
            disabled={fechado || processando} className="form-input" />
          <p className="card-sub mt-1.5">
            {fechado
              ? 'Mês fechado — reabra para alterar o laboratório.'
              : 'Pago direto pelo dentista.'}
          </p>
        </div>
      )}

      {loading && !resultado && <p className="page-subtitle">Calculando...</p>}
      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {!erro && resultado && (
        <div style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 150ms' }}>
          <FechamentoBreakdown resultado={resultado} />
        </div>
      )}
    </div>
  )
}
