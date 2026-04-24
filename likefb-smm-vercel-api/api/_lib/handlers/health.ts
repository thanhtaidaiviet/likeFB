import type { VercelRequest, VercelResponse } from '@vercel/node'
import { onlyMethods, sendJson } from '../http.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return
  sendJson(res, 200, { ok: true })
}

