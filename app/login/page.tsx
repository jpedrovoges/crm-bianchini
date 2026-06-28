'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [erro, setErro]         = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErro(null)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    })
    const data = await res.json()
    if (!res.ok) { setErro(data.error ?? 'Credenciais inválidas'); setLoading(false); return }
    router.push(data.redirect ?? '/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>Bianchini Odontologia</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Acesse sua conta</p>
        </div>

        <div className="card-p6">
          <form onSubmit={entrar} className="flex flex-col gap-4">
            <div>
              <label className="form-label">Usuário</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="seu.usuario"
                className="form-input"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label className="form-label">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                autoComplete="current-password"
              />
            </div>

            {erro && (
              <p className="text-xs text-red-400 text-center">{erro}</p>
            )}

            <button
              type="submit"
              disabled={!username || !password || loading}
              className="btn-primary py-2.5 w-full mt-1"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
