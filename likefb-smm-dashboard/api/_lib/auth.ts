import type { VercelRequest } from '@vercel/node'
import { bearerToken } from './http'
import { verifyAccessToken, type JwtUser } from './jwt'

export function requireUser(req: VercelRequest): JwtUser {
  const token = bearerToken(req)
  if (!token) throw new Error('UNAUTHORIZED')
  return verifyAccessToken(token)
}

