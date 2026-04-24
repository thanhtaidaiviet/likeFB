import type { VercelRequest, VercelResponse } from '@vercel/node'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { describeDbError } from '../db-error.js'
import {
  ordersActionSchema,
  handleQuote,
  handleCheckStatus,
  handlePlace,
} from '../orders.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  let rawBody: unknown
  try {
    rawBody = await readJsonBody(req)
  } catch {
    return sendJson(res, 400, { error: 'INVALID_INPUT' })
  }

  const parsed = ordersActionSchema.safeParse(rawBody)
  if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

  try {
    const jwt = requireUser(req)

    const body = parsed.data
    if (body.action === 'quote') {
      const out = await handleQuote({ userId: jwt.sub, service: body.service, quantity: body.quantity })
      return sendJson(res, out.status, out.body)
    }

    if (body.action === 'checkStatus') {
      const out = await handleCheckStatus({ userId: jwt.sub, orderId: body.orderId })
      return sendJson(res, out.status, out.body)
    }

    const out = await handlePlace({
      userId: jwt.sub,
      userEmail: jwt.email,
      service: body.service,
      link: body.link,
      quantity: body.quantity,
      comments: body.comments,
    })
    return sendJson(res, out.status, out.body)
  } catch (err: any) {
    const msg = String(err?.message || 'UNKNOWN')
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    if (msg.startsWith('SMM_') || msg.startsWith('SMM_ERROR:')) {
      return sendJson(res, 400, { error: 'SMM_REJECTED', detail: msg })
    }
    const hint = describeDbError(err)
    console.error(err)
    return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
  }
}

