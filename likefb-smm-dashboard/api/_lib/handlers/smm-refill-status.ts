import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { smmApiKey, smmRequest } from '../smm.js'

const querySchema = z.object({
  refill: z.string().min(1).optional(),
  refills: z.string().min(1).optional(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  try {
    requireUser(req)

    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })
    const { refill, refills } = parsed.data
    if (!refill && !refills) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const data = await smmRequest({
      key: smmApiKey(),
      action: 'refill_status',
      ...(refill ? { refill } : {}),
      ...(refills ? { refills } : {}),
    })
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}
