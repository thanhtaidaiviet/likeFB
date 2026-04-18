import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { onlyMethods, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { getPool } from '../pool.js'
import { describeDbError } from '../db-error.js'

const ADMIN_EMAIL = 'adminlike@gmail.com'

const querySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  const parsedQuery = querySchema.safeParse(req.query || {})
  if (!parsedQuery.success) return sendJson(res, 400, { error: 'INVALID_QUERY' })

  const q = String(parsedQuery.data.q ?? '').trim()
  const limit = parsedQuery.data.limit ?? 5
  const offset = parsedQuery.data.offset ?? 0

  try {
    const jwtUser = requireUser(req)
    const requesterId = jwtUser.sub

    const db = getPool()
    const requesterRes = await db.query('select email from users where id = $1', [requesterId])
    const requester = requesterRes.rows[0] as { email: string } | undefined
    const requesterEmail = requester?.email ? String(requester.email).toLowerCase() : ''

    if (requesterEmail !== ADMIN_EMAIL) return sendJson(res, 403, { error: 'FORBIDDEN' })

    const where = q ? 'where email ilike $1' : ''
    const args: any[] = []
    if (q) args.push(`%${q}%`)
    args.push(limit, offset)

    const sql = `
      select
        id,
        email,
        coalesce(balance_vnd, 0) as balance_vnd,
        count(*) over()::int as total
      from users
      ${where}
      order by email asc
      limit $${q ? 2 : 1}
      offset $${q ? 3 : 2}
    `

    const r = await db.query(sql, args)
    const total = Number((r.rows?.[0] as any)?.total ?? 0) || 0
    const users = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      email: String(row.email),
      balanceVnd: Number(row.balance_vnd) || 0,
    }))

    return sendJson(res, 200, { ok: true, users, q, limit, offset, total })
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
