import jwt from 'jsonwebtoken'
import type { JwtPayload, SignOptions } from 'jsonwebtoken'

export type JwtUser = {
  sub: string
  email: string
}

export function signAccessToken(user: JwtUser) {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is missing')
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn']
  const options: SignOptions = { subject: user.sub, expiresIn }
  return jwt.sign({ email: user.email }, secret, options)
}

export function verifyAccessToken(token: string): JwtUser {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is missing')
  const payload = jwt.verify(token, secret) as JwtPayload
  const sub = payload.sub
  const email = payload.email
  if (typeof sub !== 'string' || typeof email !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { sub, email }
}

