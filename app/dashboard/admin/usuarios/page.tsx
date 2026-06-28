'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Usuario = {
  id: string
  username: string
  role: string
  dentista_id: string | null
  force_password_change: boolean
  active: boolean
}

type Dentista = { id: string; nome: string }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  gestor: 'Gestor',
  recepcao: 'Recepção',
  dentista: 'Dentista',
}

const FORM_VAZIO = { username: '', role: 'recepcao', dentista_id: '', senha: '' }

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios]       = useState<Usuario[]>([])
  const [dentistas, setDentistas]     = useState<Dentista[]>([])
  const [loading, setLoading]         = useState(true)
  const [atualizando, setAtualizando] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [form, setForm]               = useState(FORM_VAZIO)
  const [salvando, setSalvando]       = useState(false)
  const [erro, setErro]               = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/usuarios').then(r => r.json()),
      supabase.from('dentistas').select('id, nome').order('nome'),
    ]).then(([users, { data: dents }]) => {
      if (Array.isArray(users)) setUsuarios(users)
      if (dents) setDentistas(dents)
      setLoading(false)
    })
  }, [])

  async function acao(id: string, action: string, extra?: object) {
    setAtualizando(id + action)
    const res = await fetch('/api/admin/usuarios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, ...extra }),
    })
    if (res.ok) {
      if (action === 'toggle_active') {
        setUsuarios(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u))
      }
      if (action === 'reset_password' || action === 'force_change') {
        setUsuarios(prev => prev.map(u => u.id === id ? { ...u, force_password_change: true } : u))
      }
      if (action === 'set_dentista' && extra && 'dentista_id' in extra) {
        setUsuarios(prev => prev.map(u => u.id === id ? { ...u, dentista_id: (extra as { dentista_id: string | null }).dentista_id } : u))
      }
    }
    setAtualizando(null)
  }

  async function criarUsuario() {
    setErro('')
    if (!form.username.trim()) { setErro('Informe o nome de usuário'); return }
    if (form.senha.length < 6) { setErro('A senha deve ter no mínimo 6 caracteres'); return }
    setSalvando(true)
    const res = await fetch('/api/admin/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username.trim().toLowerCase(),
        role: form.role,
        senha: form.senha,
        dentista_id: form.role === 'dentista' && form.dentista_id ? form.dentista_id : null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setErro(data.error ?? 'Erro ao criar usuário'); setSalvando(false); return }
    setUsuarios(prev => [...prev, data.usuario])
    setModalAberto(false)
    setForm(FORM_VAZIO)
    setSalvando(false)
  }

  if (loading) return <p className="page-subtitle">Carregando...</p>

  return (
    <div>
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Gerenciar Usuários</h1>
          <p className="page-subtitle">{usuarios.length} usuário(s) cadastrado(s)</p>
        </div>
        <button onClick={() => { setModalAberto(true); setErro(''); setForm(FORM_VAZIO) }} className="btn-primary">
          + Novo usuário
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {usuarios.map(u => (
          <div key={u.id} className={`card-p5 ${!u.active ? 'opacity-50' : ''}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{u.username}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-2)' }}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                  {u.force_password_change && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(251,191,36,0.15)', color: 'rgb(251,191,36)' }}>
                      Troca de senha pendente
                    </span>
                  )}
                  {!u.active && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(248,113,113,0.15)', color: 'rgb(248,113,113)' }}>
                      Inativo
                    </span>
                  )}
                </div>

                {u.role === 'dentista' && (
                  <div className="flex items-center gap-2 mt-2">
                    <label className="form-label mb-0">Dentista vinculado:</label>
                    <select
                      value={u.dentista_id ?? ''}
                      onChange={e => acao(u.id, 'set_dentista', { dentista_id: e.target.value || null })}
                      className="form-select text-xs py-1" style={{ maxWidth: 200 }}
                    >
                      <option value="">— Não vinculado —</option>
                      {dentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                <button
                  onClick={() => acao(u.id, 'reset_password')}
                  disabled={atualizando === u.id + 'reset_password'}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Resetar senha
                </button>
                <button
                  onClick={() => acao(u.id, 'force_change')}
                  disabled={atualizando === u.id + 'force_change' || u.force_password_change}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Forçar troca
                </button>
                <button
                  onClick={() => acao(u.id, 'toggle_active')}
                  disabled={atualizando === u.id + 'toggle_active'}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {u.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Novo Usuário</h2>
              <button className="modal-close" onClick={() => setModalAberto(false)}>✕</button>
            </div>

            <div className="flex flex-col gap-3 mt-4">
              <div>
                <label className="form-label">Usuário</label>
                <input
                  className="form-input"
                  placeholder="ex: joao.silva"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Senha inicial</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label">Perfil</label>
                <select
                  className="form-select"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value, dentista_id: '' }))}
                >
                  <option value="admin">Admin</option>
                  <option value="gestor">Gestor</option>
                  <option value="recepcao">Recepção</option>
                  <option value="dentista">Dentista</option>
                </select>
              </div>

              {form.role === 'dentista' && (
                <div>
                  <label className="form-label">Dentista vinculado</label>
                  <select
                    className="form-select"
                    value={form.dentista_id}
                    onChange={e => setForm(f => ({ ...f, dentista_id: e.target.value }))}
                  >
                    <option value="">— Selecione —</option>
                    {dentistas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              )}

              {erro && <p className="text-xs" style={{ color: 'var(--despesa)' }}>{erro}</p>}

              <button onClick={criarUsuario} disabled={salvando} className="btn-primary mt-2">
                {salvando ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
