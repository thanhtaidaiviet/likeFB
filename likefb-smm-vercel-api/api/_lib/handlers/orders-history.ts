import type { VercelRequest, VercelResponse } from '@vercel/node'
import { onlyMethods, sendJson } from '../http.js'
import { requireUser } from '../auth.js'
import { getPool } from '../pool.js'
import { describeDbError } from '../db-error.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!onlyMethods(req, res, ['GET'])) return

  try {
    const jwt = requireUser(req)

    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN
    const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : NaN
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, Math.trunc(limitRaw)), 50) : 10
    const offset = Number.isFinite(offsetRaw) ? Math.min(Math.max(0, Math.trunc(offsetRaw)), 1_000_000) : 0

    const fromRaw = typeof req.query.from === 'string' ? req.query.from.trim() : ''
    const toRaw = typeof req.query.to === 'string' ? req.query.to.trim() : ''

    function parseFrom(x: string) {
      if (!x) return null
      const d = new Date(x)
      if (!Number.isFinite(d.getTime())) return null
      return d.toISOString()
    }

    function parseToExclusive(x: string) {
      if (!x) return null
      if (/^\\d{4}-\\d{2}-\\d{2}$/.test(x)) {
        const d = new Date(`${x}T00:00:00.000Z`)
        if (!Number.isFinite(d.getTime())) return null
        d.setUTCDate(d.getUTCDate() + 1)
        return d.toISOString()
      }
      const d = new Date(x)
      if (!Number.isFinite(d.getTime())) return null
      return d.toISOString()
    }

    const fromIso = parseFrom(fromRaw)
    const toExclusiveIso = parseToExclusive(toRaw)

    const whereParts: string[] = ['user_id = $1']
    const args: any[] = [jwt.sub]
    if (fromIso) {
      args.push(fromIso)
      whereParts.push(`created_at >= $${args.length}`)
    }
    if (toExclusiveIso) {
      args.push(toExclusiveIso)
      whereParts.push(`created_at < $${args.length}`)
    }
    args.push(limit, offset)
    const limitArg = `$${args.length - 1}`
    const offsetArg = `$${args.length}`

    const r = await getPool().query(
      `
      select
        id,
        smm_service_id,
        link,
        quantity,
        sell_total_vnd,
        smm_order_id,
        smm_status,
        refunded_vnd,
        refunded_at,
        created_at,
        count(*) over()::int as total
      from orders
      where ${whereParts.join(' and ')}
      order by created_at desc
      limit ${limitArg}
      offset ${offsetArg}
      `,
      args,
    )

    const total = Number((r.rows?.[0] as any)?.total ?? 0) || 0
    const orders = (r.rows as any[]).map((row) => ({
      id: String(row.id),
      serviceId: String(row.smm_service_id),
      link: String(row.link),
      quantity: Number(row.quantity) || 0,
      totalVnd: Number(row.sell_total_vnd) || 0,
      smmOrderId: row.smm_order_id ? String(row.smm_order_id) : null,
      smmStatus: row.smm_status ? String(row.smm_status) : null,
      refundedVnd: Number(row.refunded_vnd) || 0,
      refundedAt: row.refunded_at ? new Date(row.refunded_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }))

    return sendJson(res, 200, { ok: true, orders, limit, offset, total })
  } catch (err: any) {
    const msg = String(err?.message || 'UNKNOWN')
    if (msg === 'UNAUTHORIZED') return sendJson(res, 401, { error: 'UNAUTHORIZED' })
    const hint = describeDbError(err)
    console.error(err)
    return sendJson(res, 500, { error: 'SERVER_ERROR', hint })
  }
}

