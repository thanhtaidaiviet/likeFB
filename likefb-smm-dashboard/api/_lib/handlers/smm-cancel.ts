import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { smmApiKey, smmRequest } from '../smm.js'

const cancelSchema = z
  .object({
    orders: z.union([z.string().min(1), z.array(z.union([z.string(), z.number()])).min(1)]),
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

    const parsed = cancelSchema.safeParse(body)
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
