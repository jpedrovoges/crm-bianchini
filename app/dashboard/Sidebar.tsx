'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { Role } from '@/lib/auth'

type SessionInfo = {
  username: string
  role: Role
  dentistaId?: string | null
}

const navItems = [
  {
    href: '/dashboard', label: 'Dashboard', roles: ['admin', 'gestor', 'recepcao'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  },
  {
    href: '/dashboard/movimento-diario', label: 'Movimento Diário', roles: ['admin', 'gestor', 'recepcao'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>,
  },
  {
    href: '/dashboard/financeiro', label: 'Financeiro', roles: ['admin', 'gestor'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
]

const cadastrosItems = [
  {
    href: '/dashboard/pacientes', label: 'Pacientes', roles: ['admin', 'gestor', 'recepcao'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87"/></svg>,
  },
  {
    href: '/dashboard/dentistas', label: 'Dentistas', roles: ['admin', 'gestor'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2C9 2 6 4 6 7c0 2 1 3.5 2 5l1 8h6l1-8c1-1.5 2-3 2-5 0-3-3-5-6-5z"/></svg>,
  },
  {
    href: '/dashboard/fornecedores', label: 'Fornecedores', roles: ['admin', 'gestor', 'recepcao'] as Role[],
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
]

const IconHamburger = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

const IconClose = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
)

const IconSun = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)

const IconMoon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

function ThemeToggle({ light, onToggle }: { light: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="flex items-center gap-2 text-xs w-full px-3 py-2 rounded-lg text-left transition-colors"
      style={{ color: 'var(--text-2)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {light ? <IconMoon /> : <IconSun />}
      {light ? 'Modo escuro' : 'Modo claro'}
    </button>
  )
}

function SairBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-2 text-xs w-full px-3 py-2 rounded-lg text-left transition-colors"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--surface-muted)')}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <IconLogout /> Sair
    </button>
  )
}

export default function Sidebar({ session }: { session: SessionInfo }) {
  const pathname = usePathname()
  const router   = useRouter()
  const { role, username, dentistaId } = session

  const [light,  setLight]  = useState(false)
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light') { setLight(true); document.documentElement.classList.add('light') }
  }, [])

  useEffect(() => { setAberto(false) }, [pathname])

  function toggleTheme() {
    const next = !light
    setLight(next)
    if (next) { document.documentElement.classList.add('light'); localStorage.setItem('theme', 'light') }
    else       { document.documentElement.classList.remove('light'); localStorage.setItem('theme', 'dark') }
  }

  async function sair() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const navVisiveis       = navItems.filter(i => i.roles.includes(role))
  const cadastrosVisiveis = cadastrosItems.filter(i => i.roles.includes(role))

  const bottomMenu = (
    <div className="mt-auto px-5 pb-4 flex flex-col gap-1">
      <Link href="/dashboard/change-password" className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--text-2)' }}>
        Alterar senha
      </Link>
      <ThemeToggle light={light} onToggle={toggleTheme} />
      <SairBtn onClick={sair} />
    </div>
  )

  const sidebarContent = role === 'dentista' ? (
    <>
      <div className="sidebar-brand">
        <p className="sidebar-title">Bianchini Odontologia</p>
        <p className="sidebar-subtitle">{username}</p>
      </div>
      <nav className="sidebar-nav">
        {dentistaId && (
          <Link href={`/dashboard/financeiro/${dentistaId}`}
            className={`nav-link ${pathname.startsWith('/dashboard/financeiro') ? 'nav-link-active' : ''}`}>
            <span className={pathname.startsWith('/dashboard/financeiro') ? 'nav-icon-active' : 'nav-icon'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </span>
            Minha página
          </Link>
        )}
      </nav>
      {bottomMenu}
    </>
  ) : (
    <>
      <div className="sidebar-brand">
        <p className="sidebar-title">Bianchini Odontologia</p>
        <p className="sidebar-subtitle">{username}</p>
      </div>
      <nav className="sidebar-nav">
        {navVisiveis.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
              <span className={active ? 'nav-icon-active' : 'nav-icon'}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
        {cadastrosVisiveis.length > 0 && (
          <>
            <p className="text-xs uppercase tracking-widest mt-5 mb-1 px-2" style={{ color: 'var(--text-3)' }}>Cadastros</p>
            {cadastrosVisiveis.map(item => {
              const active = pathname === item.href
              return (
                <Link key={item.href} href={item.href} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
                  <span className={active ? 'nav-icon-active' : 'nav-icon'}>{item.icon}</span>
                  {item.label}
                </Link>
              )
            })}
          </>
        )}
        {role === 'admin' && (
          <>
            <p className="text-xs uppercase tracking-widest mt-5 mb-1 px-2" style={{ color: 'var(--text-3)' }}>Administração</p>
            <Link href="/dashboard/admin/usuarios"
              className={`nav-link ${pathname === '/dashboard/admin/usuarios' ? 'nav-link-active' : ''}`}>
              <span className={pathname === '/dashboard/admin/usuarios' ? 'nav-icon-active' : 'nav-icon'}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.74"/>
                </svg>
              </span>
              Usuários
            </Link>
          </>
        )}
      </nav>
      {bottomMenu}
    </>
  )

  return (
    <>
      {/* Mobile header */}
      <header className="mobile-header">
        <button onClick={() => setAberto(v => !v)} style={{ color: 'var(--text-2)' }}>
          {aberto ? <IconClose /> : <IconHamburger />}
        </button>
        <p className="sidebar-title text-xs">Bianchini Odontologia</p>
        <div style={{ width: 20 }} />
      </header>

      {/* Overlay mobile */}
      {aberto && <div className="sidebar-overlay" onClick={() => setAberto(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${aberto ? 'sidebar-open' : ''}`}>
        {sidebarContent}
      </aside>
    </>
  )
}
