import { SignJWT, jwtVerify } from 'jose'

const secret = () => new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'bianchini-fallback-secret-mude-em-producao'
)

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
