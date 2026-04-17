import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, readJsonBody, sendJson } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { smmApiKey, smmRequest } from '../_lib/smm.js'

// Docs:
// - Create refill: key, action=refill, order
// - Create multiple refill: key, action=refill, orders (comma-separated)
const refillSchema = z
  .object({
    order: z.union([z.string(), z.number()]).optional(),
    orders: z
      .union([z.string().min(1), z.array(z.union([z.string(), z.number()])).min(1)])
      .optional(),
  })
  .strict()

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  try {
    requireUser(req)

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return sendJson(res, 400, { error: 'INVALID_INPUT' })
    }

    const parsed = refillSchema.safeParse(body)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })
    if (!parsed.data.order && !parsed.data.orders) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const orders =
      parsed.data.orders == null
        ? undefined
        : Array.isArray(parsed.data.orders)
          ? parsed.data.orders.map(String).join(',')
          : parsed.data.orders

    const data = await smmRequest({
      key: smmApiKey(),
      action: 'refill',
      ...(parsed.data.order != null ? { order: String(parsed.data.order) } : {}),
      ...(orders ? { orders } : {}),
    })
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}

