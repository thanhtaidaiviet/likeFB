import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(404).json({
    error: 'NOT_FOUND',
    detail: 'This is the API domain. Use /api/* endpoints.',
  })
}

