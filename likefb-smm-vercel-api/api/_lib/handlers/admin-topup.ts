import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, readJsonBody, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { getPool } from '../pool.js'
import { describeDbError } from '../db-error.js'

const ADMIN_EMAIL = 'adminlike@gmail.com'

const schema = z.object({
  email: z.string().email(),
  amountVnd: z.number().finite(),
})

function normalizeAmountVnd(n: number) {
  const rounded = Math.round(n)
  if (!Number.isFinite(rounded)) return null
  if (rounded <= 0) return null
  if (rounded > 1_000_000_000_000) return null
  return rounded
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['POST'])) return

  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return sendJson(res, 400, { error: 'INVALID_INPUT' })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return sendJson(res, 400, { error: 'INVALID_INPUT' })

  try {
    const jwtUser = requireUser(req)
    const requesterId = jwtUser.sub

    const db = getPool()
    const requesterRes = await db.query('select email from users where id = $1', [requesterId])
    const requester = requesterRes.rows[0] as { email: string } | undefined
    const requesterEmail = requester?.email ? String(requester.email).toLowerCase() : ''

    if (requesterEmail !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'FORBIDDEN' })

    const targetEmail = String(parsed.data.email).toLowerCase()
    const amountVnd = normalizeAmountVnd(parsed.data.amountVnd)
    if (!amountVnd) return sendJson(res, 400, { error: 'INVALID_AMOUNT' })

    const updateRes = await db.query(
      `
      update users
      set balance_vnd = coalesce(balance_vnd, 0) + $1
      where email = $2
      returning id, email, coalesce(balance_vnd, 0) as balance_vnd
      `,
      [amountVnd, targetEmail],
    )

    const row = updateRes.rows[0] as { id: string; email: string; balance_vnd: number } | undefined
    if (!row) return sendJson(res, 404, { error: 'USER_NOT_FOUND' })

    return sendJson(res, 200, {
      ok: true,
      user: { id: row.id, email: row.email, balanceVnd: Number(row.balance_vnd) || 0 },
      amountVnd,
    })
  } catch (err: any) {
    const hint = describeDbError(err)
    console.error(err)
    if (typeof err?.message === 'string' && err.message === 'UNAUTHORIZED') {
      return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    }
    if (hint.kind === 'config') return sendJson(res, 500, { error: 'CONFIG_ERROR', hint })
    return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
  }
}

