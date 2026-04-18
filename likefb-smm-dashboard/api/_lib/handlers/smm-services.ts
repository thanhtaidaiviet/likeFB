import type { VercelRequest, VercelResponse } from '@vercel/node'
import { onlyMethods, sendJson } from '../http.js'
import { smmApiKey, smmRequest } from '../smm.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  try {
    const data = await smmRequest({ key: smmApiKey(), action: 'services' })
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}
