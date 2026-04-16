import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, sendJson } from '../_lib/http.js'
import { requireUser } from '../_lib/auth.js'
import { smmApiKey, smmRequest } from '../_lib/smm.js'

// Per docs: key, action=add, service, link, quantity, comments (for custom comments)
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

    const parsed = addSchema.safeParse(req.body)
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

