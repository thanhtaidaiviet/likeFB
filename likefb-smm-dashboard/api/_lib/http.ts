import type { VercelRequest, VercelResponse } from '@vercel/node'

export function sendJson(res: VercelResponse, status: number, body: any) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}

export async function readJsonBody(req: VercelRequest): Promise<unknown> {
  // In Vercel dev, accessing req.body can throw "Invalid JSON" from the runtime parser.
  // Prefer a safe fallback that reads the raw stream when needed.
  try {
    const b: any = (req as any).body
    if (b && typeof b === 'object') return b
    if (typeof b === 'string') {
      const t = b.trim()
      if (!t) return null
      return JSON.parse(t)
    }
  } catch {
    // ignore and fall back to reading stream
  }

  const chunks: Buffer[] = []
  for await (const chunk of req as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return null
  return JSON.parse(text)
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

