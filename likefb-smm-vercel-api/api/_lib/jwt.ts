import jwt from 'jsonwebtoken'
import type { JwtPayload, SignOptions } from 'jsonwebtoken'

export type JwtUser = {
  sub: string
  email: string
}

function pickJwtSecret(): string | null {
  const candidates = [
    process.env.JWT_SECRET,
    // Common alternatives on various platforms/frameworks
    process.env.LIKEFB_JWT_SECRET,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.SESSION_SECRET,
  ]
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

export function signAccessToken(user: JwtUser) {
  const secret = pickJwtSecret()
  if (!secret) throw new Error('CONFIG_ERROR: JWT_SECRET is missing')
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn']
  const options: SignOptions = { subject: user.sub, expiresIn }
  return jwt.sign({ email: user.email }, secret, options)
}

export function verifyAccessToken(token: string): JwtUser {
  const secret = pickJwtSecret()
  if (!secret) throw new Error('CONFIG_ERROR: JWT_SECRET is missing')
  const payload = jwt.verify(token, secret) as JwtPayload
  const sub = payload.sub
  const email = payload.email
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { sub, email }
}

