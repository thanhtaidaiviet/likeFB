import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('access-control-allow-origin', '*')
  res.status(200).json({ ok: true })
}

