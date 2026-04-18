import type { VercelRequest } from '@vercel/node'
import { bearerToken } from './http.js'
import { verifyAccessToken, type JwtUser } from './jwt.js'

export function requireUser(req: VercelRequest): JwtUser {
  const token = bearerToken(req)
  if (!token) throw new Error('UNAUTHORIZED')
  return verifyAccessToken(token)
}

