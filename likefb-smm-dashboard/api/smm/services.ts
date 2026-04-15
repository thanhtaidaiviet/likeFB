import type { VercelRequest, VercelResponse } from '@vercel/node'
import { onlyMethods, sendJson } from '../_lib/http'
import { requireUser } from '../_lib/auth'
import { smmApiKey, smmRequest } from '../_lib/smm'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  try {
    requireUser(req)
    const data = await smmRequest({ key: smmApiKey(), action: 'services' })
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}

