export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('auth_token')
  res.cookies.delete('session_info')
  return res
}
