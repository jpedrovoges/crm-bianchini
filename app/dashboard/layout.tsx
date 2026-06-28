import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyToken } from '@/lib/auth'
import Sidebar from './Sidebar'
import { SessionProvider } from './SessionProvider'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value

  if (!token) redirect('/login')

  const session = await verifyToken(token)
  if (!session) redirect('/login')

  const sessionInfo = {
    username: session.username,
    role: session.role,
    dentistaId: session.dentistaId ?? null,
  }

  return (
    <SessionProvider session={sessionInfo}>
      <div className="layout-wrapper">
        <Sidebar session={sessionInfo} />
        <main className="layout-main">{children}</main>
      </div>
    </SessionProvider>
  )
}
