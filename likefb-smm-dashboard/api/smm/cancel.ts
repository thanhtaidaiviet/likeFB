import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, sendJson } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { smmApiKey, smmRequest } from '../_lib/smm.js'

// Docs: key, action=cancel, orders (comma-separated, up to 100)
const cancelSchema = z
  .object({
    orders: z.union([z.string().min(1), z.array(z.union([z.string(), z.number()])).min(1)]),
  })
  .strict()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  try {
    requireUser(req)

    const parsed = cancelSchema.safeParse(req.body)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const orders = Array.isArray(parsed.data.orders)
      ? parsed.data.orders.map(String).join(',')
      : parsed.data.orders

    const data = await smmRequest({
      key: smmApiKey(),
      action: 'cancel',
      orders,
    })
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}

