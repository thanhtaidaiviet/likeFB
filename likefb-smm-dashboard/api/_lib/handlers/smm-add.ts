import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { smmApiKey, smmRequest } from '../smm.js'

const addSchema = z
  .object({
    service: z.union([z.string(), z.number()]),
    link: z.string().min(1),
    quantity: z.union([z.string(), z.number()]),
    comments: z.string().min(1).max(10000).optional(),
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

    const parsed = addSchema.safeParse(body)
    if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

    const b = parsed.data
    const params: Record<string, string> = {
      key: smmApiKey(),
      action: 'add',
      service: String(b.service),
      link: String(b.link),
      quantity: String(b.quantity),
    }
    if (b.comments) params.comments = b.comments

    const data = await smmRequest(params)
    return sendJson(res, 200, data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN'
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    return sendJson(res, 502, { error: 'SMM_UPSTREAM_ERROR', detail: msg })
  }
}
