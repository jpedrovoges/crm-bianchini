import { SignJWT, jwtVerify } from 'jose'

// Sem fallback em produção: um segredo padrão conhecido (está no código)
// permitiria forjar o cookie de sessão de qualquer usuário, inclusive admin.
const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET não configurado')
    return new TextEncoder().encode('bianchini-dev-only-secret')
  }
  return new TextEncoder().encode(s)
}

export type Role = 'admin' | 'gestor' | 'recepcao' | 'dentista'

export type SessionPayload = {
  userId: string
  username: string
  role: Role
  dentistaId?: string | null
  forcePasswordChange: boolean
}

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}
