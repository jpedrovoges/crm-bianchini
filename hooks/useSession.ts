'use client'

import { useState, useEffect } from 'react'
import type { Role } from '@/lib/auth'

export type SessionInfo = {
  username: string
  role: Role
  dentistaId?: string | null
  forcePasswordChange: boolean
}

function lerCookie(): SessionInfo | null {
  if (typeof window === 'undefined') return null
  const raw = document.cookie
    .split('; ')
    .find(r => r.startsWith('session_info='))
    ?.split('=').slice(1).join('=')
  if (!raw) return null
  try { return JSON.parse(decodeURIComponent(raw)) } catch { return null }
}

export function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(lerCookie)

  useEffect(() => {
    setSession(lerCookie())
  }, [])

  return session
}
