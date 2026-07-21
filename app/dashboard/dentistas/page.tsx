'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatarNome } from '@/lib/formatarNome'

type Dentista = { id: string; nome: string; ativo: boolean }

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

export default function DentistasPage() {
  const [dentistas, setDentistas] = useState<Dentista[]>([])
  const [busca, setBusca]         = useState('')
  const [modal, setModal]         = useState(false)
  const [selecionado, setSelecionado] = useState<Dentista | null>(null)
  const [nome, setNome]           = useState('')
  const [loading, setLoading]     = useState(true)
  const [salvando, setSalvando]   = useState(false)
  const [erro, setErro]           = useState<string | null>(null)

  useEffect(() => {
    supabase.from('dentistas').select('*').order('nome')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setDentistas(data ?? [])
        setLoading(false)
      })
  }, [])

  function abrirNovo() {
    setErro(null); setNome(''); setSelecionado(null); setModal(true)
  }

  function abrirEdicao(d: Dentista) {
    setErro(null); setNome(d.nome); setSelecionado(d); setModal(true)
  }

  async function salvar() {
    if (!nome.trim()) return
    setSalvando(true); setErro(null)
    if (selecionado) {
      const { error } = await supabase.from('dentistas').update({ nome: nome.trim() }).eq('id', selecionado.id)
      if (error) { setErro(error.message); setSalvando(false); return }
      setDentistas(prev => prev.map(d => d.id === selecionado.id ? { ...d, nome: nome.trim() } : d))
    } else {
      const { data, error } = await supabase.from('dentistas').insert({ nome: nome.trim() }).select().single()
      if (error) { setErro(error.message); setSalvando(false); return }
      setDentistas(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    }
    setSalvando(false); setModal(false)
  }

  async function toggleAtivo(d: Dentista) {
    const novo = !d.ativo
    await supabase.from('dentistas').update({ ativo: novo }).eq('id', d.id)
    setDentistas(prev => prev.map(x => x.id === d.id ? { ...x, ativo: novo } : x))
  }

  const filtrados = dentistas.filter(d => d.nome.toLowerCase().includes(busca.toLowerCase()))
  const ativos    = filtrados.filter(d => d.ativo)
  const inativos  = filtrados.filter(d => !d.ativo)

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Dentistas</h1>
          <p className="page-subtitle">{dentistas.filter(d => d.ativo).length} ativo(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary px-4 py-2">+ Novo dentista</button>
      </div>

      <div className="search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon flex-shrink-0">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar dentista..." className="search-input" />
        {busca && (
          <button onClick={() => setBusca('')} className="nav-icon hover:text-red-400 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {loading && <p className="page-subtitle">Carregando...</p>}
      {erro && !modal && <p className="text-sm text-red-400">{erro}</p>}

      {!loading && dentistas.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <p className="page-subtitle text-sm">Nenhum dentista cadastrado</p>
        </div>
      )}

      {ativos.length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {ativos.map(d => (
              <div key={d.id} onClick={() => abrirEdicao(d)} className="patient-card">
                <div className={`patient-avatar ${corAvatar(d.nome)}`}>{iniciais(d.nome)}</div>
                <p className="patient-name">{d.nome}</p>
                <p className="patient-email">Dentista ativo</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {inativos.length > 0 && (
        <div className="mb-8">
          <p className="section-letter" style={{ color: 'var(--text-3)' }}>Inativos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {inativos.map(d => (
              <div key={d.id} onClick={() => abrirEdicao(d)} className="patient-card opacity-50">
                <div className={`patient-avatar ${corAvatar(d.nome)}`}>{iniciais(d.nome)}</div>
                <p className="patient-name">{d.nome}</p>
                <p className="patient-email">Inativo</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal max-w-sm">
            <div className="modal-header">
              <h3 className="modal-title">{selecionado ? 'Editar Dentista' : 'Novo Dentista'}</h3>
              <button onClick={() => setModal(false)} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="form-label">Nome completo <span className="text-red-400">*</span></label>
                <input type="text" value={nome} onChange={e => setNome(formatarNome(e.target.value))}
                  placeholder="Ex: Dr. Carlos" className="form-input" autoFocus />
              </div>
            </div>

            {erro && <p className="text-xs text-red-400 mt-3">{erro}</p>}

            <div className="flex gap-2 mt-5">
              {selecionado && (
                <button
                  onClick={() => { toggleAtivo(selecionado); setModal(false) }}
                  className="btn-secondary py-2 px-3 text-xs"
                >
                  {selecionado.ativo ? 'Desativar' : 'Ativar'}
                </button>
              )}
              <button onClick={() => setModal(false)} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvar} disabled={!nome.trim() || salvando} className="btn-primary flex-1 py-2">
                {salvando ? 'Salvando...' : selecionado ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
