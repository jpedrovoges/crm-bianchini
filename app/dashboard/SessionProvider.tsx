'use client'

import { createContext, useContext } from 'react'
import type { Role } from '@/lib/auth'

export type SessionInfo = {
  username: string
  role: Role
  dentistaId?: string | null
}

const SessionContext = createContext<SessionInfo | null>(null)

export function SessionProvider({ session, children }: { session: SessionInfo; children: React.ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): SessionInfo | null {
  return useContext(SessionContext)
}
