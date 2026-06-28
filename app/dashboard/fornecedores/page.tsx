'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Fornecedor = { id: string; nome: string; ativo: boolean }

const AVATARES = [
  'bg-amber-950/60 text-amber-400',
  'bg-rose-950/60 text-rose-400',
  'bg-lime-950/60 text-lime-400',
  'bg-fuchsia-950/60 text-fuchsia-400',
  'bg-orange-950/60 text-orange-400',
]

function corAvatar(nome: string) { return AVATARES[nome.charCodeAt(0) % AVATARES.length] }
function iniciais(nome: string) {
  const p = nome.trim().split(' ')
  return p.length === 1 ? p[0][0].toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

export default function FornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [busca, setBusca]               = useState('')
  const [modal, setModal]               = useState(false)
  const [selecionado, setSelecionado]   = useState<Fornecedor | null>(null)
  const [nome, setNome]                 = useState('')
  const [loading, setLoading]           = useState(true)
  const [salvando, setSalvando]         = useState(false)
  const [erro, setErro]                 = useState<string | null>(null)

  useEffect(() => {
    supabase.from('destinatarios').select('id, nome, ativo').eq('tipo', 'empresa').order('nome')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setFornecedores(data ?? [])
        setLoading(false)
      })
  }, [])

  function abrirNovo() { setErro(null); setNome(''); setSelecionado(null); setModal(true) }
  function abrirEdicao(f: Fornecedor) { setErro(null); setNome(f.nome); setSelecionado(f); setModal(true) }

  async function salvar() {
    if (!nome.trim()) return
    setSalvando(true); setErro(null)
    if (selecionado) {
      const { error } = await supabase.from('destinatarios').update({ nome: nome.trim() }).eq('id', selecionado.id)
      if (error) { setErro(error.message); setSalvando(false); return }
      setFornecedores(prev => prev.map(f => f.id === selecionado.id ? { ...f, nome: nome.trim() } : f))
    } else {
      const { data, error } = await supabase.from('destinatarios')
        .insert({ nome: nome.trim(), tipo: 'empresa' }).select('id, nome, ativo').single()
      if (error) { setErro(error.message); setSalvando(false); return }
      setFornecedores(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    }
    setSalvando(false); setModal(false)
  }

  async function toggleAtivo(f: Fornecedor) {
    const novo = !f.ativo
    await supabase.from('destinatarios').update({ ativo: novo }).eq('id', f.id)
    setFornecedores(prev => prev.map(x => x.id === f.id ? { ...x, ativo: novo } : x))
  }

  const filtrados = fornecedores.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase()))
  const ativos    = filtrados.filter(f => f.ativo)
  const inativos  = filtrados.filter(f => !f.ativo)

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Fornecedores</h1>
          <p className="page-subtitle">{fornecedores.filter(f => f.ativo).length} ativo(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary px-4 py-2">+ Novo fornecedor</button>
      </div>

      <div className="search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon flex-shrink-0">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar fornecedor..." className="search-input" />
        {busca && (
          <button onClick={() => setBusca('')} className="nav-icon hover:text-red-400 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {loading && <p className="page-subtitle">Carregando...</p>}
      {erro && !modal && <p className="text-sm text-red-400">{erro}</p>}

      {!loading && fornecedores.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <p className="page-subtitle text-sm">Nenhum fornecedor cadastrado</p>
          <p className="card-sub mt-1">Clique em &quot;+ Novo fornecedor&quot; para começar</p>
        </div>
      )}

      {ativos.length > 0 && (
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {ativos.map(f => (
              <div key={f.id} onClick={() => abrirEdicao(f)} className="patient-card">
                <div className={`patient-avatar ${corAvatar(f.nome)}`}>{iniciais(f.nome)}</div>
                <p className="patient-name">{f.nome}</p>
                <p className="patient-email">Fornecedor ativo</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {inativos.length > 0 && (
        <div className="mb-8">
          <p className="section-letter" style={{ color: 'var(--text-3)' }}>Inativos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {inativos.map(f => (
              <div key={f.id} onClick={() => abrirEdicao(f)} className="patient-card opacity-50">
                <div className={`patient-avatar ${corAvatar(f.nome)}`}>{iniciais(f.nome)}</div>
                <p className="patient-name">{f.nome}</p>
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
              <h3 className="modal-title">{selecionado ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setModal(false)} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="form-label">Nome da empresa <span className="text-red-400">*</span></label>
                <input type="text" value={nome} onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Prodent Materiais Dentários" className="form-input" autoFocus />
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
