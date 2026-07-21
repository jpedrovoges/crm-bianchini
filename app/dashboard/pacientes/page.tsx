'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { formatarNome, formatarCpf } from '@/lib/formatarNome'

type Paciente = {
  id: string
  nome: string
  telefone: string
  email: string
  cpf: string
  data_nascimento: string
  observacoes: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
}

const AVATARES = [
  'bg-emerald-950/60 text-emerald-400',
  'bg-blue-950/60 text-blue-400',
  'bg-purple-950/60 text-purple-400',
  'bg-orange-950/60 text-orange-400',
  'bg-pink-950/60 text-pink-400',
]

function corAvatar(nome: string) { return AVATARES[nome.charCodeAt(0) % AVATARES.length] }
function iniciais(nome: string) {
  const partes = nome.trim().split(' ')
  if (partes.length === 1) return partes[0][0].toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const formVazio = {
  nome: '', telefone: '', email: '', cpf: '', data_nascimento: '', observacoes: '',
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
}

export default function PacientesPage() {
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [busca, setBusca]         = useState('')
  const [modal, setModal]         = useState(false)
  const [selecionado, setSelecionado] = useState<Paciente | null>(null)
  const [form, setForm]           = useState(formVazio)
  const [loading, setLoading]     = useState(true)
  const [salvando, setSalvando]   = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erro, setErro]           = useState<string | null>(null)

  useEffect(() => {
    supabase.from('pacientes').select('*').order('nome', { ascending: true })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setPacientes(data ?? [])
        setLoading(false)
      })
  }, [])

  function abrirNovo() {
    setErro(null); setForm(formVazio); setSelecionado(null); setModal(true)
  }

  function abrirEdicao(p: Paciente) {
    setErro(null)
    setForm({
      nome: p.nome ?? '', telefone: p.telefone ?? '', email: p.email ?? '',
      cpf: p.cpf ?? '', data_nascimento: p.data_nascimento ?? '', observacoes: p.observacoes ?? '',
      cep: p.cep ?? '', endereco: p.endereco ?? '', numero: p.numero ?? '',
      complemento: p.complemento ?? '', bairro: p.bairro ?? '', cidade: p.cidade ?? '', estado: p.estado ?? '',
    })
    setSelecionado(p); setModal(true)
  }

  async function buscarCep(cep: string) {
    const limpo = cep.replace(/\D/g, '')
    if (limpo.length !== 8) return
    setBuscandoCep(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          endereco: data.logradouro ?? f.endereco,
          bairro: data.bairro ?? f.bairro,
          cidade: data.localidade ?? f.cidade,
          estado: data.uf ?? f.estado,
        }))
      }
    } catch {}
    setBuscandoCep(false)
  }

  async function salvar() {
    if (!form.nome.trim()) return
    setSalvando(true); setErro(null)
    if (selecionado) {
      const { error } = await supabase.from('pacientes').update(form).eq('id', selecionado.id)
      if (error) { setErro(error.message); setSalvando(false); return }
      setPacientes(prev => prev.map(p => p.id === selecionado.id ? { ...p, ...form } : p))
    } else {
      const { data, error } = await supabase.from('pacientes').insert(form).select().single()
      if (error) { setErro(error.message); setSalvando(false); return }
      setPacientes(prev => [...prev, data])
    }
    setSalvando(false); setModal(false)
  }

  async function remover(id: string) {
    setSalvando(true)
    const { error } = await supabase.from('pacientes').delete().eq('id', id)
    if (error) { setErro('Erro ao excluir paciente.'); setSalvando(false); return }
    setPacientes(prev => prev.filter(p => p.id !== id))
    setSalvando(false); setModal(false)
  }

  const filtrados = pacientes
    .filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

  const porLetra = filtrados.reduce<Record<string, Paciente[]>>((acc, p) => {
    const letra = p.nome[0].toUpperCase()
    if (!acc[letra]) acc[letra] = []
    acc[letra].push(p)
    return acc
  }, {})

  const letras = Object.keys(porLetra).sort()

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Pacientes</h1>
          <p className="page-subtitle">{pacientes.length} cadastrado(s)</p>
        </div>
        <button onClick={abrirNovo} className="btn-primary px-4 py-2">+ Novo paciente</button>
      </div>

      <div className="search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="nav-icon flex-shrink-0">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar paciente..." className="search-input" />
        {busca && (
          <button onClick={() => setBusca('')} className="nav-icon hover:text-red-400 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        )}
      </div>

      {loading && <p className="page-subtitle">Carregando pacientes...</p>}
      {!loading && pacientes.length === 0 && !erro && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
              <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
            </svg>
          </div>
          <p className="page-subtitle text-sm">Nenhum paciente cadastrado</p>
          <p className="card-sub mt-1">Clique em &quot;+ Novo paciente&quot; para começar</p>
        </div>
      )}
      {erro && !modal && <p className="text-sm text-red-400">{erro}</p>}

      {letras.map(letra => (
        <div key={letra} className="mb-8">
          <p className="section-letter">{letra}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {porLetra[letra].map(p => (
              <div key={p.id} onClick={() => abrirEdicao(p)} className="patient-card">
                <div className={`patient-avatar ${corAvatar(p.nome)}`}>{iniciais(p.nome)}</div>
                <p className="patient-name">{p.nome}</p>
                {p.telefone && <p className="patient-phone">{p.telefone}</p>}
                {p.email && <p className="patient-email">{p.email}</p>}
                {p.cidade && <p className="patient-email">{p.cidade}{p.estado ? ` · ${p.estado}` : ''}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {modal && (
        <div className="modal-overlay">
          <div className="modal max-w-lg">
            <div className="modal-header">
              <h3 className="modal-title">{selecionado ? 'Editar Paciente' : 'Novo Paciente'}</h3>
              <button onClick={() => setModal(false)} className="nav-icon hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Dados pessoais */}
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Dados pessoais</p>
              <div>
                <label className="form-label">Nome completo <span className="text-red-400">*</span></label>
                <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: formatarNome(e.target.value) }))}
                  placeholder="Ex: José Silva" className="form-input" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CPF</label>
                  <input type="text" value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: formatarCpf(e.target.value) }))} maxLength={14} inputMode="numeric"
                    placeholder="000.000.000-00" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Data de Nascimento</label>
                  <input type="date" value={form.data_nascimento} onChange={e => setForm(f => ({ ...f, data_nascimento: e.target.value }))}
                    className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Telefone</label>
                  <input type="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                    placeholder="(48) 99999-9999" className="form-input" />
                </div>
                <div>
                  <label className="form-label">E-mail</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="jose@email.com" className="form-input" />
                </div>
              </div>

              {/* Endereço */}
              <p className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>Endereço</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">CEP</label>
                  <div className="relative">
                    <input type="text" value={form.cep}
                      onChange={e => { setForm(f => ({ ...f, cep: e.target.value })); buscarCep(e.target.value) }}
                      placeholder="00000-000" className="form-input" maxLength={9} />
                    {buscandoCep && (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'var(--text-3)' }}>buscando...</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="form-label">Estado</label>
                  <input type="text" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}
                    placeholder="SC" className="form-input" maxLength={2} />
                </div>
              </div>
              <div>
                <label className="form-label">Logradouro</label>
                <input type="text" value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                  placeholder="Rua, Avenida..." className="form-input" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="form-label">Número</label>
                  <input type="text" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                    placeholder="123" className="form-input" />
                </div>
                <div className="col-span-2">
                  <label className="form-label">Complemento</label>
                  <input type="text" value={form.complemento} onChange={e => setForm(f => ({ ...f, complemento: e.target.value }))}
                    placeholder="Apto, Sala..." className="form-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Bairro</label>
                  <input type="text" value={form.bairro} onChange={e => setForm(f => ({ ...f, bairro: e.target.value }))}
                    placeholder="Centro" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Cidade</label>
                  <input type="text" value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))}
                    placeholder="Florianópolis" className="form-input" />
                </div>
              </div>

              {/* Observações */}
              <p className="text-xs font-semibold uppercase tracking-widest mt-1" style={{ color: 'var(--text-3)' }}>Clínico</p>
              <div>
                <label className="form-label">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Alergias, observações clínicas..." rows={3} className="form-textarea" />
              </div>
            </div>

            {erro && <p className="text-xs text-red-400 mt-3">{erro}</p>}

            <div className="flex gap-2 mt-5">
              {selecionado && (
                <button onClick={() => remover(selecionado.id)} disabled={salvando} className="btn-danger py-2 px-3">Excluir</button>
              )}
              <button onClick={() => setModal(false)} disabled={salvando} className="btn-secondary flex-1 py-2">Cancelar</button>
              <button onClick={salvar} disabled={!form.nome.trim() || salvando} className="btn-primary flex-1 py-2">
                {salvando ? 'Salvando...' : selecionado ? 'Salvar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
