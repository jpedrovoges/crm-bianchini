'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/hooks/useSession'

export default function ChangePasswordPage() {
  const router  = useRouter()
  const session = useSession()
  const [atual, setAtual]       = useState('')
  const [nova, setNova]         = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro]         = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const forceChange = session?.forcePasswordChange ?? false

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova !== confirma) { setErro('As senhas não coincidem'); return }
    if (nova.length < 6)   { setErro('Mínimo 6 caracteres'); return }
    setLoading(true); setErro(null)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: atual, newPassword: nova }),
    })
    const data = await res.json()
    if (!res.ok) { setErro(data.error); setLoading(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="max-w-sm">
      <h1 className="page-title mb-1">Alterar Senha</h1>
      {forceChange && (
        <p className="text-xs mb-6" style={{ color: 'var(--text-despesa)' }}>
          Você precisa definir uma nova senha antes de continuar.
        </p>
      )}
      {!forceChange && <p className="page-subtitle mb-6">Troca voluntária de senha</p>}

      <div className="card-p6">
        <form onSubmit={salvar} className="flex flex-col gap-4">
          {!forceChange && (
            <div>
              <label className="form-label">Senha atual</label>
              <input type="password" value={atual} onChange={e => setAtual(e.target.value)}
                placeholder="••••••••" className="form-input" autoFocus />
            </div>
          )}
          <div>
            <label className="form-label">Nova senha</label>
            <input type="password" value={nova} onChange={e => setNova(e.target.value)}
              placeholder="Mínimo 6 caracteres" className="form-input" autoFocus={forceChange} />
          </div>
          <div>
            <label className="form-label">Confirmar nova senha</label>
            <input type="password" value={confirma} onChange={e => setConfirma(e.target.value)}
              placeholder="Repita a nova senha" className="form-input" />
          </div>
          {erro && <p className="text-xs text-red-400">{erro}</p>}
          <button type="submit" disabled={!nova || !confirma || loading} className="btn-primary py-2.5">
            {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
