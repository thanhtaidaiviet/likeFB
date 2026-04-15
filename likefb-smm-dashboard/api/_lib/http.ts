import type { VercelRequest, VercelResponse } from '@vercel/node'

export function sendJson(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}

export function onlyMethods(req: VercelRequest, res: VercelResponse, methods: string[]) {
  if (req.method && methods.includes(req.method)) return true
  res.setHeader('allow', methods.join(', '))
  sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' })
  return false
}

export function bearerToken(req: VercelRequest) {
  const header = req.headers.authorization
  if (!header) return null
  const [kind, token] = header.split(' ')
  if (kind !== 'Bearer' || !token) return null
  return token
}

